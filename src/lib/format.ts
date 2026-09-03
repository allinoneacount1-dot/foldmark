/** Display formatting. Every numeric string here is meant to be set in tabular numerals. */

export function shortAddress(addr: string, head = 6, tail = 4): string {
  if (!addr) return "—";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function isTxHash(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value.trim());
}

const COMPACT = [
  { limit: 1e12, suffix: "T" },
  { limit: 1e9, suffix: "B" },
  { limit: 1e6, suffix: "M" },
  { limit: 1e3, suffix: "K" },
];

/** 1_234_567 -> "1.23M". Used for token amounts and counts, never for money we do not have. */
export function compact(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  for (const { limit, suffix } of COMPACT) {
    if (abs >= limit) {
      const v = n / limit;
      return `${trimZeros(v.toFixed(digits))}${suffix}`;
    }
  }
  if (abs > 0 && abs < 0.01) return n.toExponential(1);
  return trimZeros(n.toFixed(abs < 1 ? 4 : 2));
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export function integer(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

export function signed(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  const body = compact(Math.abs(n), digits);
  return n > 0 ? `+${body}` : n < 0 ? `−${body}` : body;
}

/** Token base units -> human units, without float overflow on 18-decimal values. */
export function fromBaseUnits(amount: string | number | bigint, decimals: number): number {
  try {
    const raw = typeof amount === "bigint" ? amount : BigInt(String(amount).split(".")[0] || "0");
    const div = BigInt(10) ** BigInt(decimals);
    const whole = raw / div;
    const frac = raw % div;
    return Number(whole) + Number(frac) / Number(div);
  } catch {
    const n = Number(amount);
    return Number.isFinite(n) ? n / Math.pow(10, decimals) : 0;
  }
}

const UNITS: [number, string][] = [
  [86400, "d"],
  [3600, "h"],
  [60, "m"],
  [1, "s"],
];

/** "4m ago" — deterministic, computed against an explicit `now` so SSR and client agree. */
export function relativeTime(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  let secs = Math.max(0, Math.round((now - t) / 1000));
  if (secs < 5) return "just now";
  for (const [size, label] of UNITS) {
    if (secs >= size) {
      const v = Math.floor(secs / size);
      secs = v;
      return `${v}${label} ago`;
    }
  }
  return "just now";
}

export function utcClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(
    d.getUTCSeconds(),
  ).padStart(2, "0")} UTC`;
}

export function blockLabel(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? `#${integer(n)}` : "—";
}
