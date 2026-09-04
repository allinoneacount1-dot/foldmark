import type { Entry } from "@/lib/intelligence/types";

/**
 * Data states, provenance and coverage.
 *
 * This domain answers the questions a reader asks when a figure is not where
 * they expected one: what the six data states mean, why EMPTY is a measurement
 * and INDEXING is not, where a number came from and when it was observed, how
 * far back the index actually reaches, and why an em dash occupies a slot a
 * plausible-looking value could have filled. The rule that governs all of it
 * lives in src/lib/data-state.ts — a number reaches the screen only when it was
 * derived from indexed chain data, and everything else resolves to a state.
 */
export const DATA_ENTRIES: Entry[] = [
  {
    id: "data.states",
    domain: "data",
    title: "The six data states",
    patterns: [
      "what are the data states",
      "data states",
      "list the data states",
      "what does the state chip mean",
      "what do the labels next to the numbers mean",
      "what states can a value have",
      "state vocabulary",
      "why does everything show a state instead of a number",
    ],
    keywords: ["state", "states", "datastate", "chip", "label", "status", "vocabulary"],
    answer:
      "FOLDMARK defines exactly six data states. Every figure in the product resolves to one of them: OK, PARTIAL, STALE, EMPTY, INDEXING and UNAVAILABLE.\n\nEach has a display label. OK reads as LIVE, PARTIAL as PARTIAL DATA, STALE as STALE, EMPTY as NO ACTIVITY, INDEXING as INDEXING, and UNAVAILABLE as DATA UNAVAILABLE.\n\nThe meanings are not interchangeable. OK is measured and fresh. PARTIAL is measured, but the window is not fully indexed. STALE is measured, but older than the freshness budget. EMPTY means the query succeeded and nothing was observed. INDEXING means the pipeline has not reached this entity. UNAVAILABLE means the source is down or unconfigured.\n\nThree of the six describe a measurement that exists — OK, PARTIAL and STALE. The other three describe the absence of one, and they are absent for three different reasons.",
    shortAnswer:
      "Six states: OK (LIVE), PARTIAL (PARTIAL DATA), STALE, EMPTY (NO ACTIVITY), INDEXING and UNAVAILABLE (DATA UNAVAILABLE). Every figure resolves to one of them.",
    detail:
      "The state travels on the measurement itself, alongside the value, the observation time and the provenance. Renderability is decided in one place rather than at each call site: a value can be drawn as a number only when it is non-null and the state is OK, PARTIAL or STALE.\n\nINDEXING is the state a measurement takes when it is constructed with no value. That default is deliberate — a deployment that has observed nothing reports INDEXING rather than reporting zero.\n\nThe six are not a severity scale. UNAVAILABLE is a statement about FOLDMARK infrastructure, EMPTY is a statement about the chain, and PARTIAL is a statement about the window. Collapsing them into a single idea of missing would destroy the distinction the product exists to keep.",
    followups: ["data.empty_vs_indexing", "data.number_rule", "data.machine_vs_presentation", "data.coverage"],
    actions: [{ label: "OPEN DATA SOURCES", href: "/docs/data-sources" }],
    entities: ["OK", "PARTIAL", "STALE", "EMPTY", "INDEXING", "UNAVAILABLE"],
  },

  {
    id: "data.state_ok",
    domain: "data",
    title: "OK (LIVE)",
    patterns: [
      "what does live mean",
      "what does ok state mean",
      "ok state",
      "live chip",
      "why does it say live",
      "when is a value live",
      "data state ok",
    ],
    keywords: ["ok", "live", "fresh", "measured", "current"],
    answer:
      "OK is the state for a value that was measured and is fresh. Its display label is LIVE, and it is the only state that draws the small signal marker on the state chip.\n\nFresh means observed inside the freshness budget, which FOLDMARK sets at fifteen minutes. A value that was genuinely measured but has aged past that budget is reclassified as STALE rather than continuing to read LIVE.\n\nOK is never assumed. A measurement built without a value defaults to INDEXING, so nothing arrives at OK except by carrying a value that came from indexed chain data.",
    shortAnswer: "OK means measured and fresh. It displays as LIVE, and only a value observed inside the fifteen-minute freshness budget holds it.",
    followups: ["data.freshness", "data.state_stale", "data.states"],
    entities: ["OK"],
  },

  {
    id: "data.state_partial",
    domain: "data",
    title: "PARTIAL (PARTIAL DATA)",
    patterns: [
      "what does partial data mean",
      "partial state",
      "why does it say partial data",
      "partial data chip",
      "why is my window partial",
      "what does partial mean on a metric",
    ],
    keywords: ["partial", "lower bound", "window", "incomplete", "coverage"],
    answer:
      "PARTIAL means the figure is a real measurement, but the window it claims is not fully indexed. Its display label is PARTIAL DATA.\n\nA window is a claim. A 7D window asserts that the numbers under it describe seven days. If the index only reaches back two hours, that claim is false however correct the arithmetic over the stored rows is. PARTIAL is how the product declines to make the claim while still showing what it has.\n\nEvery figure inside a PARTIAL window is a lower bound over a shorter period than the label suggests, and that includes a count of zero.\n\nA window also becomes PARTIAL when the index reaches back far enough but skipped blocks inside the window. Reaching back is not the same as being whole.",
    shortAnswer:
      "PARTIAL means the numbers are real but the window is not fully indexed, so every figure inside it is a lower bound over a shorter period than the label claims.",
    followups: ["data.coverage", "data.coverage_gaps", "data.states"],
    entities: ["PARTIAL"],
    routes: ["/flows", "/fabric", "/dashboard"],
  },

  {
    id: "data.state_stale",
    domain: "data",
    title: "STALE",
    patterns: [
      "what does stale mean",
      "stale state",
      "why is this stale",
      "last observation label",
      "why does it say stale instead of live",
      "how old is a stale value",
    ],
    keywords: ["stale", "old", "age", "last observation", "freshness"],
    answer:
      "STALE means the value is a real measurement that is older than the freshness budget. The observation is not discarded and not replaced; it is shown with its age.\n\nThe budget is fifteen minutes. A measurement whose observation time is older than that moves from OK to STALE.\n\nSTALE is a qualified reading rather than an error. Showing the last real observation and saying how old it is preserves more information than blanking the slot would.\n\nWhere there is no value at all, STALE is not said over an empty slot. A label describing a last observation would assert something the reader cannot see, so the surface falls back to its pending wording instead.",
    shortAnswer: "STALE is a real measurement older than the fifteen-minute freshness budget. It is shown with its age rather than replaced or hidden.",
    followups: ["data.freshness", "data.observed_at", "data.em_dash"],
    entities: ["STALE"],
  },

  {
    id: "data.state_empty",
    domain: "data",
    title: "EMPTY (NO ACTIVITY)",
    patterns: [
      "what does no activity mean",
      "empty state",
      "no activity chip",
      "why does it say no activity",
      "empty data state",
      "does no activity mean broken",
    ],
    keywords: ["empty", "no activity", "nothing", "quiet", "finding"],
    answer:
      "EMPTY means the query succeeded and nothing was observed. Its display label is NO ACTIVITY.\n\nThat is a measurement. The lookup ran, it covered the period, and the answer was nothing. On a flow surface it reads as no flow observed in this window; on a topology surface, no relationships observed in this window.\n\nEMPTY is a finding rather than a fault, and it is the only absent state that says something about the chain. INDEXING and UNAVAILABLE both say something about FOLDMARK instead.\n\nEMPTY is only claimed where coverage supports it. When the index cannot prove it spans the requested window, a zero result reports INDEXING or PARTIAL, because a zero over an unknown period is unreadable.",
    shortAnswer:
      "EMPTY means the query worked and found nothing — a measurement about the chain, displayed as NO ACTIVITY, and only claimed where the index is known to cover the window.",
    detail:
      "The promotion rule is enforced where windows are evaluated. If the index has not recorded how far back it reaches, a base result of EMPTY becomes INDEXING and any other base becomes PARTIAL. Only when the index is known to span the full window unbroken does a zero result stay EMPTY.\n\nThat is the point at which zero genuinely means zero activity, and it is the only point at which the product will say so.\n\nEMPTY carries its own wording per surface precisely because it is a finding. The sentences say measurement happened — nothing moved between addresses inside the period covered by the index — which the pending sentences for INDEXING and UNAVAILABLE deliberately do not.",
    followups: ["data.empty_vs_indexing", "data.empty_vs_unavailable", "data.zero_means_what", "data.coverage"],
    entities: ["EMPTY"],
  },

  {
    id: "data.state_indexing",
    domain: "data",
    title: "INDEXING",
    patterns: [
      "what does indexing mean",
      "indexing state",
      "why does it say indexing",
      "what does structure initializing mean",
      "what does syncing mean",
      "why is everything indexing",
    ],
    keywords: ["indexing", "pipeline", "syncing", "initializing", "pending"],
    answer:
      "INDEXING means the pipeline has not reached this entity. Nothing has been measured here, so there is nothing to report about the chain.\n\nIt is the default state of a measurement built with no value. A deployment that has observed nothing therefore reports INDEXING rather than reporting zero.\n\nTo a reader, INDEXING is said per surface: INDEXING on an activity panel, SYNCING on a price panel, STRUCTURE INITIALIZING on a topology canvas, INDEXING REGISTRY on the asset registry. The machine state stays INDEXING in the API.\n\nINDEXING is not a measurement of the chain. It is a statement about how far FOLDMARK has got.",
    shortAnswer: "INDEXING means the pipeline has not reached this entity yet. Nothing was measured, so nothing follows about whether activity exists.",
    followups: ["data.empty_vs_indexing", "data.machine_vs_presentation", "data.indexer"],
    entities: ["INDEXING"],
  },

  {
    id: "data.state_unavailable",
    domain: "data",
    title: "UNAVAILABLE (DATA UNAVAILABLE)",
    patterns: [
      "what does data unavailable mean",
      "unavailable state",
      "why does it say data unavailable",
      "is something broken",
      "source is down",
      "what does unavailable mean on a metric",
    ],
    keywords: ["unavailable", "down", "unconfigured", "source", "fault"],
    answer:
      "UNAVAILABLE means the source is down or unconfigured. Its display label is DATA UNAVAILABLE, and the machine state behind that label stays UNAVAILABLE.\n\nThe usual causes are an unconfigured database and a read that failed. With no connection string configured, every read returns null and every dependent figure resolves to UNAVAILABLE. Nothing cached or approximate is served in its place.\n\nBecause UNAVAILABLE is a statement about FOLDMARK infrastructure rather than about a market, the interface says it in the reader's terms — SYNCING on a price panel, AWAITING OBSERVATIONS on a flow panel. The API keeps returning UNAVAILABLE and every internal decision keeps reading it.\n\nUNAVAILABLE is not EMPTY. Nothing was looked at, so nothing can be concluded about activity.",
    shortAnswer:
      "UNAVAILABLE means a source is down or unconfigured. It is a claim about FOLDMARK, never about the chain, and nothing is estimated in its place.",
    followups: ["data.empty_vs_unavailable", "data.no_database", "data.machine_vs_presentation"],
    entities: ["UNAVAILABLE"],
  },

  {
    id: "data.empty_vs_indexing",
    domain: "data",
    title: "EMPTY against INDEXING",
    patterns: [
      "difference between empty and indexing",
      "empty vs indexing",
      "no activity vs indexing",
      "why is this indexing and not empty",
      "is empty the same as indexing",
      "why is empty a measurement",
      "why is indexing not a measurement",
    ],
    keywords: ["empty", "indexing", "difference", "measurement", "distinction"],
    answer:
      "EMPTY and INDEXING both leave a slot without a number, and they are opposite claims.\n\nEMPTY is a measurement. The query ran, it covered the period, and there was nothing in it. That says something about the chain: nothing moved.\n\nINDEXING is not a measurement. The pipeline has not reached this entity, so no observation was attempted here. Nothing at all follows about whether activity exists.\n\nReading INDEXING as EMPTY would convert a gap in FOLDMARK's own coverage into a claim about the market. That is the error the split exists to prevent.",
    shortAnswer:
      "EMPTY is a measurement — we looked and there was nothing. INDEXING is not — the pipeline has not reached this entity, so nothing was looked at.",
    detail:
      "The distinction is enforced where windows are evaluated rather than left to each surface. When the index has not recorded how far back it reaches, a base result of EMPTY is promoted to INDEXING and any other base becomes PARTIAL. Zero rows over an unknown period could mean nothing happened or could mean nothing has been indexed; INDEXING says which of those is known, which is neither.\n\nOnly when the index is known to span the full window unbroken does a zero result remain EMPTY. That is the moment zero becomes readable.\n\nTo a person the two are shown differently as well. EMPTY gets a sentence saying measurement happened; INDEXING gets a sentence saying something is expected to arrive.",
    followups: ["data.state_empty", "data.state_indexing", "data.coverage", "data.zero_means_what"],
    entities: ["EMPTY", "INDEXING"],
  },

  {
    id: "data.empty_vs_unavailable",
    domain: "data",
    title: "EMPTY against UNAVAILABLE",
    patterns: [
      "difference between empty and unavailable",
      "empty vs unavailable",
      "no activity vs data unavailable",
      "does no activity mean the source is down",
      "is unavailable the same as nothing happening",
    ],
    keywords: ["empty", "unavailable", "difference", "source", "conflate"],
    answer:
      "EMPTY and UNAVAILABLE must never be conflated. EMPTY says FOLDMARK looked and there was nothing. UNAVAILABLE says FOLDMARK could not look.\n\nEMPTY is a claim about the chain. UNAVAILABLE is a claim about FOLDMARK — a source that is down, or one that was never configured in this deployment.\n\nPresenting UNAVAILABLE as EMPTY would report an infrastructure fault as market quiet. Presenting EMPTY as UNAVAILABLE would throw away a real finding.\n\nBoth leave the slot without a number. The reason is the entire difference.",
    shortAnswer: "EMPTY means we looked and found nothing. UNAVAILABLE means we could not look. One is about the chain, the other about FOLDMARK.",
    followups: ["data.empty_vs_indexing", "data.state_unavailable", "data.no_database"],
    entities: ["EMPTY", "UNAVAILABLE"],
  },

  {
    id: "data.provenance",
    domain: "data",
    title: "Provenance",
    patterns: [
      "what is provenance",
      "provenance",
      "where does this number come from",
      "what is the source line under a metric",
      "how do i know where a figure came from",
      "source and method",
      "does every value have a source",
    ],
    keywords: ["provenance", "source", "method", "origin", "traceable", "attribution"],
    answer:
      "Provenance is carried by the value, not attached to the page. Every measurement in FOLDMARK travels with its state, its value, the time it was observed, and a provenance record naming the source and, where it applies, the method that produced it.\n\nIn the interface that appears beneath the figure as a SOURCE line. In the API, an endpoint that returns a measurement names its source in the response body — the candles response carries a provenance block, and the asset context response lists the sources it was built from.\n\nSource is where the value came from: Robinhood Chain RPC, on-chain contract metadata, a DEX pool quote, the FOLDMARK index. Method is one sentence on how it was computed, which is what separates an observation from a fold over observations.\n\nBecause provenance is part of the value, a figure with no defensible source cannot be rendered as a number. There is nowhere for it to have come from.",
    shortAnswer:
      "Every measurement carries its source, its method where one applies, and its observation time. Provenance travels with the value rather than being attached to the page, and the interface prints it beneath the figure.",
    detail:
      "Provenance also records how strong a claim is. RAW is directly observed on chain — a Transfer log, a block timestamp, a contract's decimals. DERIVED is computed from observed data by a stated rule: gross volume, counterparty counts, net flow per address, market topology. INTERPRETED depends on a registry being populated, which is where flow classification and protocol exposure sit. A fourth kind marks what this deployment cannot measure at all, and it is withheld rather than estimated.\n\nThat separation matters because the strength of a claim is invisible in the number. Two figures rendered identically can rest on a log the indexer read and on an interpretation requiring a registry FOLDMARK does not have.\n\nStorage is not treated as a source. It holds what was measured with the time of measurement attached, which is why an old row reads STALE rather than quietly standing in for a fresh one.",
    followups: ["data.observation_path", "data.trust_levels", "data.observed_at", "methodology.evidence_ladder"],
    actions: [{ label: "OPEN DATA SOURCES", href: "/docs/data-sources" }],
    entities: ["PROVENANCE"],
  },

  {
    id: "data.observation_path",
    domain: "data",
    title: "How an observation reaches the screen",
    patterns: [
      "how does an observation reach the screen",
      "how does data get to the page",
      "what is the data pipeline",
      "path from chain to screen",
      "how is the site fed",
      "what happens between the chain and the ui",
    ],
    keywords: ["pipeline", "ingest", "path", "rpc", "postgres", "runner"],
    answer:
      "Every figure travels the same path, and each hop is a place a number can be lost — never a place one can be invented.\n\nThe chain is read over Robinhood Chain RPC, with a newHeads subscription over WebSocket for the head. A persistent runner follows that head and calls the deployment's ingest route, which reads logs and provider prices, normalises them, and writes them to Postgres as parameterised SQL keyed so a replay cannot double count.\n\nPages and API routes read that database through one server-side client. The browser never reaches storage or the RPC directly, and no database credential exists outside the deployment.\n\nStorage is not a source. It holds what was measured with the time of measurement attached, which is why an old row reads STALE instead of standing in for a fresh one.",
    shortAnswer:
      "Chain RPC to a head-following runner, into the ingest route, into Postgres, read server-side by the pages and the API. Each hop can lose a number; none can invent one.",
    followups: ["data.provenance", "data.indexer", "data.log_window", "data.freshness"],
    actions: [{ label: "OPEN ARCHITECTURE", href: "/docs/architecture" }],
  },

  {
    id: "data.observed_at",
    domain: "data",
    title: "Observation time",
    patterns: [
      "what is observedat",
      "when was this measured",
      "how old is this number",
      "what does read 4m ago mean",
      "observation time",
      "does a value say when it was taken",
    ],
    keywords: ["observedat", "timestamp", "age", "when", "measured", "read"],
    answer:
      "Every measurement carries an observation time: when the observation was made, not when the page was rendered.\n\nThat timestamp is what makes freshness decidable. Age is computed against it, and a value older than the freshness budget is reported as STALE rather than continuing to read LIVE.\n\nIt is also what makes an older row safe to show. A measurement with its observation time attached can be presented honestly as an older reading; the same row without it would be indistinguishable from a current one.\n\nWhere there is no value there is nothing to time, so the constructors for the pending states record a null observation time.",
    shortAnswer: "Each measurement records when it was observed, not when the page rendered. That timestamp is what freshness is judged against.",
    followups: ["data.freshness", "data.provenance", "data.state_stale"],
  },

  {
    id: "data.freshness",
    domain: "data",
    title: "Freshness and the freshness budget",
    patterns: [
      "what is the freshness budget",
      "freshness",
      "how fresh is the data",
      "when does a value go stale",
      "how long before data is stale",
      "how current are these numbers",
    ],
    keywords: ["freshness", "budget", "stale", "age", "fifteen minutes", "current"],
    answer:
      "Freshness is not a mood. FOLDMARK sets an explicit freshness budget of fifteen minutes, and a measurement older than that budget is reclassified from OK to STALE.\n\nThe check compares the current time against the measurement's own observation time. It applies only to a measurement that has a value and a recorded observation time — there is nothing to age otherwise.\n\nCrossing the budget does not delete the observation. It changes what the product claims about it: LIVE becomes a last observation, shown with its age.\n\nSources have different natural update rates, and the docs record each one separately. The budget is about what the product is willing to call current, not about how often a source refreshes.",
    shortAnswer: "The freshness budget is fifteen minutes. A measurement older than that is reported as STALE instead of LIVE, with its age shown.",
    detail:
      "The budget is a single constant held in the data-state module beside the states themselves, so there is one definition rather than one per surface. Applying it is a pure function of the measurement and an explicit current time, which is what lets a server render and a client render agree instead of drifting by the interval between them.\n\nA separate fifteen-minute tolerance exists in the notional calculation, where a transfer is priced by an observation aligned to the time of that transfer with no look-ahead. A transfer with no price inside the tolerance contributes no notional rather than borrowing a later price. The two intervals are the same length and are not the same rule.\n\nNeither rule ever carries a value forward to complete a figure. Where a stale quote would be needed to finish a sum, the asset is excluded by name and the state drops instead.",
    followups: ["data.state_stale", "data.observed_at", "data.states", "pricing.price_types"],
  },

  {
    id: "data.coverage",
    domain: "data",
    title: "Index coverage",
    patterns: [
      "what is coverage",
      "index coverage",
      "does the window cover the full period",
      "why is my 7d window partial",
      "what does covers window mean",
      "how far back does the index reach",
      "coverage and windows",
    ],
    keywords: ["coverage", "window", "reach", "indexed", "period", "lower bound"],
    answer:
      "Coverage is how far back the index actually reaches. A window is a claim about a period; coverage is what lets that claim be checked.\n\nAsk for 7D and the requested period is compared against the unbroken reach of the index. If the index reaches back less far, the window reports PARTIAL and states its actual reach, rather than presenting a confident total over a fraction of the period.\n\nCoverage is recorded rather than assumed: the earliest indexed block, the earliest indexed time, the point after which nothing is missing, and the count of blocks knowingly skipped.\n\nThe windowed flows and fabric responses carry an index coverage block, including a flag saying whether the index covers the window. A consumer reading a count for a 7D window can tell from that block whether the index reaches back seven days.",
    shortAnswer:
      "Coverage is the unbroken reach of the index. A window that asks for more history than the index holds reports PARTIAL and states how far it actually reaches.",
    detail:
      "Covering a window requires two separate things: reaching back at least as far as the window asks, and having no known hole inside it. Either one alone is not coverage.\n\nWhen the index has recorded nothing about its continuous reach, the window cannot prove anything about itself. A zero result becomes INDEXING and a non-zero result becomes PARTIAL — the rows are real, but the window still cannot claim its own period.\n\nThe note attached to a partial window is written to be actionable rather than decorative. Where the index is shorter than the window, the sentence states the actual reach, so a reader can judge the shortfall instead of being handed the word PARTIAL on its own.",
    followups: ["data.state_partial", "data.coverage_gaps", "data.zero_means_what", "data.api_states"],
    entities: ["PARTIAL", "COVERAGE"],
    routes: ["/flows", "/fabric", "/dashboard"],
  },

  {
    id: "data.coverage_gaps",
    domain: "data",
    title: "Gaps and skipped blocks",
    patterns: [
      "what is a gap",
      "gap blocks",
      "skipped blocks",
      "what happens when the indexer misses blocks",
      "why are these figures a lower bound",
      "gap inside window",
    ],
    keywords: ["gap", "skipped", "blocks", "hole", "lower bound", "missing"],
    answer:
      "A gap is a range of blocks the indexer could not read and knowingly skipped. It is recorded rather than passed over silently.\n\nGaps exist because the free public endpoint retains only a short window of logs. A range not read within seconds of being emitted cannot be recovered without an archive node, so the honest record is a gap with its block count.\n\nA gap inside the requested window makes that window PARTIAL, however far back the index reaches on either side of it. Figures inside it are a lower bound.\n\nWhen the index knows it skipped blocks but not when, the gap is treated as possibly inside the window. An unplaceable hole could be anywhere, and assuming otherwise would be the product guessing in its own favour.",
    shortAnswer:
      "A gap is a block range the indexer could not read and recorded as skipped. A gap inside a window makes it PARTIAL and its figures a lower bound.",
    followups: ["data.coverage", "data.log_window", "data.state_partial"],
    entities: ["PARTIAL"],
  },

  {
    id: "data.number_rule",
    domain: "data",
    title: "When a number is allowed on screen",
    patterns: [
      "why is there no number here",
      "why do you not estimate",
      "do you ever guess a value",
      "do you fabricate data",
      "the rule about numbers on screen",
      "why not show an approximate figure",
    ],
    keywords: ["rule", "estimate", "fabricate", "placeholder", "derived", "indexed"],
    answer:
      "The rule that governs this domain: a number reaches the screen only when it was derived from indexed chain data. Everything else resolves to a state, never a plausible-looking value.\n\nThat is why there are six states rather than a single missing flag. The alternative to a number is never a placeholder figure, an estimate, a carried-forward quote, or a zero standing in for silence.\n\nThe rule is enforced at the value, not at the surface. A measurement with no value cannot be drawn as a number whatever a component would prefer to show, and presentation may change the words around a missing value but may never supply the value.\n\nAn empty screen is an honest screen when nothing has been observed. A screen full of numbers that no observation produced would not be.",
    shortAnswer:
      "A number appears only when it was derived from indexed chain data. Everything else resolves to a state — never an estimate, a placeholder, or a stand-in zero.",
    detail:
      "The rule has a second half that is easy to miss: a state may not overclaim either. PARTIAL and STALE describe a measurement that exists, so saying them over an empty slot would assert that a value was obtained when none was. Where the slot is empty, those states fall back to the surface's pending wording. The state itself is unchanged and still drives the API and every internal decision.\n\nThat is the mirror image of fabricating a number — not a false value, but a false claim that a value was obtained.\n\nThe same discipline runs through the derived figures. Cross-asset totals exclude any asset without a price observed inside the alignment tolerance, and the state drops to PARTIAL, rather than a stale quote being carried forward to complete a sum.",
    followups: ["data.em_dash", "data.states", "methodology.unknown_stays_unknown", "data.is_this_live"],
  },

  {
    id: "data.em_dash",
    domain: "data",
    title: "The em dash in a value slot",
    patterns: [
      "why is there a dash instead of a number",
      "what does the dash mean",
      "why not show zero",
      "em dash",
      "why is the value blank",
      "why is there a line where the price should be",
    ],
    keywords: ["dash", "em dash", "blank", "zero", "placeholder", "slot"],
    answer:
      "An em dash occupies the slot where a figure would be, with the state said underneath it. The dash is presentation: it holds the space without asserting anything.\n\nA zero would be an assertion. Zero is a measurement meaning nothing moved, and writing it where nothing was measured would convert an absence of observation into an observation of absence.\n\nThe state under the dash says which kind of absence it is — a price not yet observed, a registry still filling, a window the index cannot span.\n\nWhere a figure was genuinely measured as zero and coverage supports the claim, the product shows zero and reports NO ACTIVITY. The dash and the zero are different answers.",
    shortAnswer:
      "The dash holds the slot without asserting anything. A zero would be a measurement, and writing one where nothing was measured would be a claim the product cannot support.",
    detail:
      "An earlier behaviour put the raw state word in the value slot, so a column of metrics read as a column of the word UNAVAILABLE. That told a reader about FOLDMARK infrastructure when they had asked about a market. The dash plus a surface-appropriate label says the same fact without turning every panel into a status report.\n\nThe dash is also what the formatting helpers return for any non-finite or missing input — an address that is not there, a time that cannot be parsed, a number that does not exist. There is one answer for absence and it is never a digit.",
    followups: ["data.number_rule", "data.state_empty", "data.zero_means_what"],
  },

  {
    id: "data.machine_vs_presentation",
    domain: "data",
    title: "Machine state against presentation label",
    patterns: [
      "why does it say syncing instead of unavailable",
      "machine state vs display label",
      "presentation vocabulary",
      "does the api say syncing",
      "what state does the api report",
      "why do the labels differ from the docs",
    ],
    keywords: ["presentation", "machine", "label", "syncing", "api", "vocabulary"],
    answer:
      "FOLDMARK keeps two vocabularies. The machine's is the data state: OK, PARTIAL, STALE, EMPTY, INDEXING, UNAVAILABLE. The presentation vocabulary is how one of those is said to a person on a particular surface.\n\nThe same UNAVAILABLE reads as SYNCING on a price panel, STRUCTURE INITIALIZING on a topology canvas, AWAITING OBSERVATIONS on a flow panel, and INDEXING REGISTRY on the asset registry. A reader looking at an asset did not ask about FOLDMARK infrastructure, and those sentences say the same fact in their terms.\n\nThe machine value does not change. The API keeps returning UNAVAILABLE, the docs keep documenting it, and every internal decision keeps reading it.\n\nThe line presentation does not cross: it may change the words around a missing value. It may never supply the value. A dash stays a dash, and a chart with no observations stays empty.",
    shortAnswer:
      "Presentation changes the wording per surface; the machine state never changes. The API always reports the underlying state, such as UNAVAILABLE, whatever the chip says.",
    detail:
      "INDEXING and UNAVAILABLE read identically to a person, because to a reader both mean the value has not been observed yet. The difference between the pipeline not having reached an entity and storage not being connected is an operational distinction, and it stays in the API where operators read it.\n\nEMPTY is treated differently, because it is a finding rather than a pending state. Its wording per surface says measurement happened: no flow observed in this window, no activity observed in this window, no relationships observed in this window.\n\nColour follows the same reasoning. A pending state is toned quietly rather than as an alarm, because waiting for a first observation is ordinary. The surfaces that genuinely report a fault are the API and the status page.",
    followups: ["data.states", "data.state_unavailable", "data.api_states"],
  },

  {
    id: "data.is_this_live",
    domain: "data",
    title: "Is this live data",
    patterns: [
      "is this live data",
      "is this real data",
      "are these real numbers",
      "is the site connected to the chain",
      "is this simulated",
      "is any of this fake",
      "is this demo data",
    ],
    keywords: ["live", "real", "simulated", "fake", "demo", "connected"],
    answer:
      "FOLDMARK reads Robinhood Chain directly. Chain head and block timing come over RPC, so those surfaces are live wherever an endpoint answers. Asset identity is read from contract metadata during ingestion and reaches a page through the index.\n\nMeasured market figures are a different question. They depend on the index, and this deployment has no database connected. Where that is the case the figures resolve to states rather than to values, which is what the chips and dashes on the page report.\n\nNothing is simulated to fill space. The one surface that shows arranged content rather than observations is the architecture preview, which carries its own badge and uses generic placeholder labels.\n\nSo: live where a source answers, a state where none does, and never a number that no observation produced.",
    shortAnswer:
      "Chain reads are live where a source answers. Measured figures depend on an index this deployment does not have connected, so they resolve to states rather than to invented values.",
    followups: ["data.no_database", "data.number_rule", "fabric.architecture_preview", "core.what_is_foldmark"],
  },

  {
    id: "data.no_database",
    domain: "data",
    title: "Structure with no database connected",
    patterns: [
      "why is the site empty",
      "why is there no data",
      "is the database connected",
      "why does everything say indexing",
      "why do i only see structure",
      "no database connected",
      "why are all the chips zero",
    ],
    keywords: ["database", "unconfigured", "empty", "structure", "registry", "deployment"],
    answer:
      "With no connection string configured there is no index to read. Absent configuration is treated as a state rather than a crash: every read returns null, and every dependent figure resolves to UNAVAILABLE.\n\nThe site still renders because the structure is not the data. Routes, panels, filters, states, provenance lines and the methodology are product definitions, and they are correct whether or not a row exists behind them.\n\nThe consequences are stated rather than hidden. With no registry to read, every address stays unidentified and every observable flow classifies as UNCLASSIFIED; category and flow filter chips count zero and therefore select nothing.\n\nThat is the correct outcome of the rules, not a bug. A deployment with no index that displayed populated dashboards would be showing something no observation produced.",
    shortAnswer:
      "With no database connected, dependent figures resolve to UNAVAILABLE. The structure — routes, states, filters, provenance — is product definition and renders correctly regardless.",
    detail:
      "The same behaviour is what lets a fresh clone build with no secrets at all. The database client has one entry point, and its absence is a defined branch through every query rather than an exception thrown somewhere inside a page.\n\nIt also constrains what any surface can claim. Because the unconfigured case flows through the ordinary state machinery, an unconnected deployment produces INDEXING and UNAVAILABLE where a populated one would produce OK — not blank sections, and not zeros that a reader would take for measurements.\n\nAn unreadable registry is the visible half of this. Filter chips that count zero are reporting the registry, not the chain: nothing has been identified, so nothing can be selected.",
    followups: ["data.when_database_connected", "data.state_unavailable", "flows.unclassified", "protocols.registry"],
    entities: ["UNAVAILABLE", "UNCLASSIFIED"],
  },

  {
    id: "data.indexer",
    domain: "data",
    title: "What the indexer does",
    patterns: [
      "what does the indexer do",
      "what is the indexer",
      "how are transfers indexed",
      "how does foldmark read the chain",
      "indexer cursor",
      "how does ingestion work",
    ],
    keywords: ["indexer", "ingest", "cursor", "transfer", "logs", "discovery"],
    answer:
      "The indexer reads ERC-20 Transfer logs from Robinhood Chain and writes normalised rows: transfers, assets, addresses, price observations and per-window flow aggregates, together with its own cursor.\n\nIt follows the chain head continuously rather than polling on a schedule, because the free public endpoint retains only a short window of logs and anything not taken within seconds of being emitted cannot be recovered.\n\nA dense block range is split until each sub-range comes back whole, never truncated. Either a sub-range is returned completely or it is not returned at all, and the cursor is placed at the last fully processed block — a cursor that has passed unprocessed data is worse than no cursor at all.\n\nA range that cannot be served is recorded as a gap with its block count. That record is what later lets a window report PARTIAL instead of a confident total.",
    shortAnswer:
      "It follows the chain head, reads Transfer logs, and writes normalised transfers, assets, addresses, prices and flow windows — recording gaps rather than skipping them silently.",
    detail:
      "Discovery happens in the same pass. A contract seen in a Transfer log is read for its own ERC-20 metadata, and a contract that does not answer name and symbol is never registered as an asset.\n\nA name carrying a Robinhood Token marker makes a contract a candidate and nothing more. Anyone can deploy an ERC-20 with any name, so metadata alone cannot establish identity — which is why verification status has three values rather than being a boolean.\n\nWrites are parameterised and keyed so that a replay cannot double count, and rows are inserted in chunks that keep the bound-parameter count well below the Postgres statement ceiling. Values from the chain travel as bound parameters, never as SQL text.",
    followups: ["data.log_window", "data.coverage_gaps", "data.observation_path", "assets.identity"],
    actions: [{ label: "OPEN ARCHITECTURE", href: "/docs/architecture" }],
  },

  {
    id: "data.when_database_connected",
    domain: "data",
    title: "What changes when an index is connected",
    patterns: [
      "what changes when a database is connected",
      "what happens when the index is populated",
      "what would turn on live data",
      "what would make the numbers appear",
      "when will there be data",
      "what would the site look like with data",
    ],
    keywords: ["connected", "populated", "unlock", "future", "index", "changes"],
    answer:
      "Connecting an index changes what the states resolve to, not what the product claims. The same surfaces, the same provenance lines and the same six states stay in place; figures that resolve to INDEXING or UNAVAILABLE today would resolve to OK, PARTIAL, STALE or EMPTY as observations arrive.\n\nWindows would begin to qualify themselves. Early on the index reaches back less far than a 7D window asks, so those windows read PARTIAL with their actual reach stated, and tighten to OK only as coverage grows.\n\nFabric would draw a measured graph rather than the architecture preview: every node present because a transfer named it, every edge present because value moved along it.\n\nTwo things an index alone would not change. Flow classification still needs a populated contracts registry, and no asset becomes VERIFIED without an authoritative issuer source confirming the exact contract on this chain.",
    shortAnswer:
      "The states would resolve to measurements instead of absences. Classification still needs a populated registry, and verification still needs an authoritative issuer source.",
    followups: ["data.no_database", "data.coverage", "fabric.measured_graph", "protocols.registry"],
  },

  {
    id: "data.measured_envelope",
    domain: "data",
    title: "The shape of a measurement",
    patterns: [
      "what is a measured value",
      "measured type",
      "what fields does a measurement have",
      "state value observedat provenance",
      "how is a measurement structured",
      "what does a value carry with it",
    ],
    keywords: ["measured", "envelope", "shape", "fields", "null", "renderable"],
    answer:
      "A measurement in FOLDMARK is an envelope, not a bare number. It carries the state, the value or null, the observation time or null, a provenance record, and an optional note.\n\nThat shape is why a missing value is never ambiguous. The absence and its reason travel together, so no call site has to guess what a null meant.\n\nThe envelope also decides renderability. A value can be drawn as a number only when it is non-null and the state is OK, PARTIAL or STALE. A measurement built with no value defaults to INDEXING.\n\nThe API is written from the same envelope. A response reports the state beside the value, and the observation time and source where the endpoint returns them, rather than a bare number with no way to judge it.",
    shortAnswer:
      "Every measurement carries state, value, observation time, provenance and an optional note. The absence of a value always travels with the reason for it.",
    followups: ["data.provenance", "data.states", "data.api_states"],
  },

  {
    id: "data.trust_levels",
    domain: "data",
    title: "Raw, derived and interpreted",
    patterns: [
      "what are trust levels",
      "raw vs derived",
      "what does interpreted mean",
      "how far can a value be trusted",
      "raw derived interpreted unavailable",
      "is this observed or computed",
    ],
    keywords: ["raw", "derived", "interpreted", "trust", "kind", "evidence"],
    answer:
      "FOLDMARK separates four kinds of claim so a reader can tell an observation from a computation from an interpretation.\n\nRAW is directly observed on chain — a Transfer log, a block timestamp, a contract's decimals. It is the strongest claim the product makes.\n\nDERIVED is computed from observed data by a rule stated in the methodology: gross volume, counterparty counts, net flow per address, market topology.\n\nINTERPRETED is rule-based context that depends on a registry being populated, which is where flow classification and protocol exposure sit. The fourth kind marks what this deployment cannot measure at all — issuer reference price, oracle price, holder counts — and it is withheld, never estimated.",
    shortAnswer:
      "RAW is observed on chain, DERIVED is computed from observations by a stated rule, INTERPRETED needs a registry, and the fourth kind is withheld rather than estimated.",
    followups: ["data.provenance", "methodology.evidence_ladder", "flows.unclassified"],
    actions: [{ label: "OPEN METHODOLOGY", href: "/docs/methodology" }],
  },

  {
    id: "data.sources",
    domain: "data",
    title: "Sources FOLDMARK reads",
    patterns: [
      "what sources do you read",
      "where does foldmark get its data",
      "what data sources are wired",
      "which apis are used",
      "what is planned versus live",
      "what happens when a source fails",
    ],
    keywords: ["sources", "rpc", "geckoterminal", "postgres", "blockscout", "planned", "disabled"],
    answer:
      "The docs list every source, what it is for, how fresh it is, and what happens when it fails. A source that is not wired is marked PLANNED; one that is implemented but switched off in this deployment is marked DISABLED. Neither is presented as live.\n\nWired today: Robinhood Chain RPC for the head, Transfer logs, block timestamps and contract metadata calls; on-chain ERC-20 metadata for asset identity; GeckoTerminal for DEX spot price and liquidity; the FOLDMARK index in Postgres; and the Blockscout explorer as an outbound link target, from which nothing is ingested.\n\nNot in use: DEX Screener is implemented but disabled pending a terms review, and CoinGecko is planned rather than called. An issuer reference quote and an oracle feed do not exist for this chain in this deployment, so every field depending on them reads a state.\n\nFailure is not silent. The RPC client fails over across an ordered endpoint list, and if none answers, chain figures read DATA UNAVAILABLE rather than serving a stale guess.",
    shortAnswer:
      "Chain RPC, on-chain contract metadata, GeckoTerminal, the FOLDMARK index and the Blockscout explorer are wired. Planned and disabled sources are labelled as such and never shown as live.",
    followups: ["data.provenance", "data.state_unavailable", "pricing.reference_market", "data.log_window"],
    actions: [{ label: "OPEN DATA SOURCES", href: "/docs/data-sources" }],
  },

  {
    id: "data.log_window",
    domain: "data",
    title: "The log window",
    patterns: [
      "what is the log window",
      "why does the indexer follow the head",
      "why cant you backfill",
      "why is history limited",
      "rpc log retention",
      "why is there no archive node",
    ],
    keywords: ["log window", "retention", "backfill", "archive", "head", "blocks"],
    answer:
      "The constraint that shapes ingestion is the log window. FOLDMARK's limitations page records that the free public endpoint serves roughly 52 blocks of logs — about five seconds at this chain's block time — against roughly 860,000 blocks a day.\n\nA scheduled job can therefore never catch up across a gap. By the time it runs, the logs it would need are no longer served. That is why chain ingestion follows the head continuously rather than polling.\n\nA daily fallback pass keeps prices and asset discovery moving, but it cannot hold a five-second log window, so a deployment running only that fallback reports gapped chain coverage rather than a smooth line.\n\nAn archive node is the only thing that can recover log history older than the window. It is the one constraint that cannot be solved on a free tier, so gaps are reported instead of quietly closed.",
    shortAnswer:
      "The free public endpoint serves only about 52 blocks of logs, so ingestion follows the chain head continuously and unreachable ranges are recorded as gaps rather than skipped.",
    followups: ["data.indexer", "data.coverage_gaps", "data.coverage"],
    actions: [{ label: "OPEN LIMITATIONS", href: "/docs/limitations" }],
  },

  {
    id: "data.api_states",
    domain: "data",
    title: "States in the API",
    patterns: [
      "does the api report states",
      "how do i read state in the api",
      "index coverage block",
      "what does the json return for missing data",
      "api data state",
      "can a machine tell the data is incomplete",
    ],
    keywords: ["api", "json", "state", "coverage", "response", "consumer"],
    answer:
      "The API reports the machine state, always. A windowed response carries the state alongside the payload, and every consumer sees the same vocabulary the internal code reads.\n\nThe flows and fabric responses also carry an index coverage block: whether the index covers the window, the window length, the earliest indexed block and time, the continuous reach, the count of skipped blocks, whether a gap falls inside this window specifically, and a sentence stating the shortfall where there is one.\n\nA consumer reading a count for a 7D window has no way to know the index reaches back two hours unless the response says so. That block is the response saying so, in a shape a machine can act on.\n\nPresentation labels never appear in the API. SYNCING and STRUCTURE INITIALIZING are interface copy; INDEXING and UNAVAILABLE are what a machine receives.",
    shortAnswer:
      "Responses carry the machine state, and the flows and fabric responses add an index coverage block, so a consumer can tell whether the numbers span the window they asked for.",
    followups: ["data.machine_vs_presentation", "data.coverage", "data.states"],
    actions: [{ label: "OPEN API DOCS", href: "/docs/api" }],
  },

  {
    id: "data.zero_means_what",
    domain: "data",
    title: "What a zero means",
    patterns: [
      "does zero mean nothing happened",
      "is a count of zero real",
      "what does a zero count mean",
      "can i trust a zero",
      "zero versus no data",
      "why does this chip say zero",
    ],
    keywords: ["zero", "count", "nothing", "trust", "chip", "registry"],
    answer:
      "A zero is only a measurement when coverage supports it. Zero means nothing moved in a period the index is known to cover.\n\nWhere the index cannot prove it spans the requested window, a zero result is not reported as zero. It becomes INDEXING when nothing at all is recorded about coverage, and PARTIAL when rows exist but the window cannot claim its own period.\n\nThe reason is that zero over an unknown period is unreadable. It could mean nothing happened, or it could mean nothing has been indexed, and those are opposite conclusions.\n\nA filter chip counting zero because the contracts registry is empty is a third case again. That zero describes the registry, not the chain: nothing has been identified, so nothing can be selected.",
    shortAnswer:
      "Zero is a measurement only where the index is known to cover the window. Otherwise the state is reported instead, because zero over an unknown period is unreadable.",
    followups: ["data.empty_vs_indexing", "data.coverage", "data.state_empty", "flows.unclassified"],
    entities: ["EMPTY", "UNCLASSIFIED"],
  },
];
