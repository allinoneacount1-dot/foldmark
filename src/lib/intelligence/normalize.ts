/**
 * Text normalisation for the intelligence matcher.
 *
 * Everything the matcher compares — questions, patterns, keywords, entity
 * aliases — passes through `normalize` first, so `DEX_BUY`, `dex-buy`,
 * `DEX BUY` and `dex buy?` are one string by the time anything is scored. The
 * product's own vocabulary is SCREAMING_SNAKE and readers type it every way
 * imaginable; collapsing that here means no downstream code has to think about
 * it.
 *
 * Pure and cheap. Knowledge-base fields are normalised once when the index is
 * built, never per keystroke.
 */

/**
 * Lowercase, unpunctuated, single-spaced.
 *
 * Underscores and hyphens become spaces rather than being deleted, so
 * `dex_buy` reads as two tokens and can match the phrase "dex buy". Deleting
 * them would produce `dexbuy`, which matches nothing a person types.
 */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    // strip combining marks so an accented paste still matches
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_\-‐-―]+/g, " ")
    // keep alphanumerics, spaces and the 0x of an address; drop the rest
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Words too common to carry signal. Deliberately short — this is a domain search, not English NLP. */
const STOP = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "am",
  "do", "does", "did", "can", "could", "would", "should",
  "i", "me", "my", "you", "your", "it", "its", "this", "that", "these", "those",
  "of", "in", "on", "at", "to", "for", "with", "by", "from", "about",
  "and", "or", "but", "if", "then", "so",
  "please", "tell", "show", "give", "explain", "mean", "means", "meaning",
  "what", "whats", "why", "how", "when", "where", "which", "who",
  "there", "here", "some", "any", "much", "many",
]);

export function isStopWord(token: string): boolean {
  return STOP.has(token);
}

/** Normalised tokens, stop words retained — callers decide whether to drop them. */
export function tokenize(input: string): string[] {
  const n = normalize(input);
  return n ? n.split(" ") : [];
}

/** Tokens that carry meaning: stop words and single characters removed. */
export function contentTokens(input: string): string[] {
  return tokenize(input).filter((t) => t.length > 1 && !STOP.has(t));
}

/**
 * Crude singular form.
 *
 * "nodes" and "node", "edges" and "edge", "flows" and "flow" must not be
 * different tokens. This handles the endings the product vocabulary actually
 * produces and deliberately does nothing clever — a real stemmer would collapse
 * terms that mean different things here (notably "verified" and "verify",
 * which are a state and an action).
 */
export function singular(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ses") || token.endsWith("xes") || token.endsWith("zes")) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss") && !token.endsWith("us")) return token.slice(0, -1);
  return token;
}

/**
 * Levenshtein distance, capped.
 *
 * The cap lets the common case exit early: once every cell in a row exceeds the
 * budget no completion can come back under it, so a comparison against a wildly
 * different word costs a fraction of the full matrix. Typo tolerance never needs
 * a distance above 2, so the cap is always small.
 */
export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    let best = curr[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j += 1) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < best) best = curr[j];
    }
    if (best > max) return max + 1;
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[n];
}

/**
 * How many edits a word of this length may differ by and still be "the same
 * word typed badly".
 *
 * Short words get no tolerance at all: at three letters, one edit reaches a
 * completely different term, and "lend" matching "land" or "send" would let the
 * matcher answer confidently about something the reader did not ask.
 */
export function typoBudget(length: number): number {
  if (length <= 4) return 0;
  if (length <= 7) return 1;
  return 2;
}

/** True when `candidate` is `target` typed badly. Order matters: target is the known word. */
export function isTypoOf(candidate: string, target: string): boolean {
  const budget = typoBudget(target.length);
  if (budget === 0) return candidate === target;
  return levenshtein(candidate, target, budget) <= budget;
}

/** 0..1 similarity, used for ranking rather than for gating. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  const d = levenshtein(a, b, longest);
  return Math.max(0, 1 - d / longest);
}
