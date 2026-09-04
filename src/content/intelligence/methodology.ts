import type { Entry } from "@/lib/intelligence/types";

/**
 * Methodology — the reasoning rules FOLDMARK holds itself to.
 *
 * Not a description of features. This domain covers how the product decides
 * that it knows something: why unknown stays unknown, why no semantic category
 * may be inferred from behaviour, volume, shape or naming, what each rung of
 * the evidence ladder actually costs, why layout and classification are pure
 * deterministic functions, why a price may never be borrowed from the future,
 * and where the line sits between preview geometry that may be drawn and
 * measurement that may be published. It also states plainly what the product
 * cannot do today and what it will not do at all.
 */
export const METHODOLOGY_ENTRIES: Entry[] = [
  {
    id: "methodology.unknown_stays_unknown",
    domain: "methodology",
    title: "Unknown stays unknown",
    patterns: [
      "why does it say unknown",
      "why is everything unclassified",
      "unknown stays unknown",
      "why not just guess",
      "why does foldmark leave things unidentified",
      "why is this not labelled",
      "what does unknown mean here",
      "why is nothing identified",
    ],
    keywords: ["unknown", "unclassified", "unidentified", "guess", "evidence", "honest"],
    answer:
      "UNCLASSIFIED and unidentified are answers, not gaps waiting to be filled. They record that FOLDMARK observed something and does not hold sufficient evidence to assign a semantic identity to it.\n\nNothing is promoted out of that state by resemblance. An address that moves value the way a pool moves value is still an unidentified address until the contracts registry holds an entry for it. \"We have not identified it\" is a different claim from \"it is a wallet\", \"it is a DEX\", or \"it is infrastructure\", and the product does not let one stand in for the other.\n\nThe contracts registry is currently empty in production, because no database is connected. Every address therefore stays unidentified, every observable flow classifies as UNCLASSIFIED, and every category chip counts zero. That is the rules working, not the rules failing.",
    shortAnswer:
      "Unidentified means FOLDMARK lacks the evidence to name something, and nothing is promoted out of that state by resemblance. With the registry empty, every address stays unidentified and every flow reads UNCLASSIFIED.",
    detail:
      "The consequence worth understanding is that an empty registry does not make everything ordinary either. WALLET_TRANSFER is claimed only when the registry was consulted and neither side is a known venue. With no rows to consult, nothing can be established as ordinary, so the answer is UNCLASSIFIED rather than WALLET_TRANSFER.\n\nThat asymmetry is deliberate. A default of \"probably just a wallet\" would fill the interface with confident-looking labels derived from an absence of information, and a reader would have no way to tell those apart from labels derived from a registry entry. Leaving the state unknown keeps the two distinguishable.\n\nThe same reasoning governs the centre of the Fabric map. When no asset is connected to strictly more counterparties than any other, and the fallback on observed transfer count also ties, nobody takes the centre and all assets sit on the inner ring. The map declines to nominate a hub the data did not nominate.",
    followups: [
      "methodology.no_inference_from_behaviour",
      "methodology.evidence_ladder",
      "flows.unclassified",
      "wallets.unknown_address",
    ],
    entities: ["UNCLASSIFIED"],
  },
  {
    id: "methodology.no_inference_from_behaviour",
    domain: "methodology",
    title: "No inference from behaviour",
    patterns: [
      "can you infer what this address is",
      "why not classify by behaviour",
      "it looks like a dex why is it not labelled",
      "no inference from behaviour",
      "why does volume not identify a protocol",
      "can shape tell you what something is",
      "why not guess from the name",
      "why is behaviour not evidence",
    ],
    keywords: ["inference", "behaviour", "volume", "shape", "naming", "heuristic", "pattern"],
    answer:
      "No semantic category may be inferred from visual behaviour, transaction shape, volume, or naming alone. A category is a claim about what a contract is, and the only thing entitled to make that claim is the contracts registry.\n\nNaming is the weakest of the four. Anyone able to deploy an ERC-20 chooses its symbol and its name, so a contract calling itself a well-known company establishes nothing about that company. Volume and shape look stronger and still are not evidence: a high-degree address receiving from many senders can be a pool, a treasury, a bridge endpoint or an exchange deposit address, and those four are not interchangeable.\n\nSo classification is a lookup, never an inference. If the registry has never seen an address, the flow it sits on is UNCLASSIFIED, and no amount of activity changes that.",
    shortAnswer:
      "Behaviour, transaction shape, volume and naming are not evidence of what a contract is. Only a contracts registry entry can assign a category, so an unregistered address stays unidentified however it behaves.",
    detail:
      "The Fabric map is governed by the same rule, because the shape a node is drawn in is read as a fact about it. classifyNode resolves an asset as an asset, then looks the address up in the registry: dex_pool draws as a venue circle, lending_market and bridge as a protocol hexagon, oracle as a triangle, infrastructure as a diamond, and anything unknown as an address square.\n\nNothing is promoted into a shape by how it behaved. If a heuristic were allowed to draw an unregistered address as a venue, the legend would become false the moment the heuristic was wrong, and a reader would have no way to know which nodes were registry facts and which were guesses.\n\nThis is also why a category and an identity are kept apart. On-chain behaviour and metadata can place a contract in a category. Confirming which specific contract it is takes an authoritative source naming the exact address on the exact chain.",
    followups: [
      "methodology.unknown_stays_unknown",
      "methodology.category_vs_identity",
      "methodology.classification_is_lookup",
      "protocols.classification_pipeline",
    ],
  },
  {
    id: "methodology.evidence_ladder",
    domain: "methodology",
    title: "The evidence ladder",
    patterns: [
      "what is the evidence ladder",
      "evidence ladder",
      "observed identified categorized verified",
      "how does a contract become classified",
      "what are the four stages",
      "explain the classification stages",
      "why is verified dark",
      "why is the last stage unlit",
    ],
    keywords: ["ladder", "stages", "observed", "identified", "categorized", "verified", "evidence"],
    answer:
      "FOLDMARK moves a contract through four stages, in order: OBSERVED, IDENTIFIED, CATEGORIZED, VERIFIED. Each stage needs strictly more evidence than the one before it, and the distance between them is the whole point.\n\nOBSERVED means a Transfer log named this contract, on the evidence of an ERC-20 Transfer event on chain. IDENTIFIED means the contract answered ERC-20 metadata, with symbol, name and decimals read from the contract itself. CATEGORIZED means its shape places it in a category, from on-chain behaviour and metadata, and a category is not an identity. VERIFIED means an authoritative source confirms the exact contract, on the evidence of an issuer-published address for this chain; a ticker or a name is not enough.\n\nObserved is not identified, identified is not categorized, and categorized is not verified. Collapsing any pair is how a product ends up asserting that a set of tokens was verified because their own metadata said so.",
    shortAnswer:
      "Four stages, each requiring strictly more evidence than the last: OBSERVED, IDENTIFIED, CATEGORIZED, VERIFIED. VERIFIED stays unlit because no authoritative issuer source is wired, so CATEGORIZED is the honest best state today.",
    detail:
      "VERIFIED renders dark in the interface because no authoritative issuer source is wired. The honest best state for any asset today is CATEGORIZED, and the component deliberately does not light the fourth card just because the reference design shows it lit. Lighting it by default would make the diagram a claim rather than a description, which is the exact failure the pipeline exists to prevent.\n\nThe schema models this with three values rather than a flag. The verification status column holds OBSERVED, CANDIDATE or VERIFIED and defaults to OBSERVED, because a boolean could not express a candidate. A convenience boolean exists alongside it but is only a mirror, kept in sync by a database trigger, so it cannot drift from the status column.\n\nThe ladder also explains why one rung cannot be bought with volume from another. A contract that trades heavily is still only OBSERVED and IDENTIFIED until something categorises it, and a contract that categorises cleanly is still not VERIFIED until an issuer publishes the address.",
    followups: [
      "protocols.classification_pipeline",
      "methodology.category_vs_identity",
      "methodology.unknown_stays_unknown",
      "assets.identity",
    ],
    entities: ["OBSERVED", "IDENTIFIED", "CATEGORIZED", "VERIFIED"],
  },
  {
    id: "methodology.unknown_over_incorrect",
    domain: "methodology",
    title: "Unknown over incorrect",
    patterns: [
      "why prefer unknown over incorrect",
      "unknown over incorrect",
      "why not fill in a plausible value",
      "why are there so many blanks",
      "why not estimate",
      "would a guess not be more useful",
      "why does foldmark refuse to approximate",
    ],
    keywords: ["unknown", "incorrect", "estimate", "approximate", "plausible", "blank", "guess"],
    answer:
      "FOLDMARK prefers unknown over incorrect. Where the evidence for a claim is absent, the product returns a state rather than a value that looks like a measurement.\n\nThe reasoning is asymmetric. An unknown is visibly unknown, and a reader can act on it: go elsewhere, wait for coverage, or ask what is missing. An estimate set in the same typography as a measurement is indistinguishable from one, so a single plausible-looking number quietly costs the reader the ability to trust any of the others.\n\nThat is why a number reaches the screen only when it was derived from indexed chain data. Everything else resolves to a data state rather than a figure.",
    shortAnswer:
      "Where evidence is absent the product shows a state, not a plausible value, because an estimate presented like a measurement makes every other number on the page unverifiable too.",
    followups: [
      "methodology.unknown_stays_unknown",
      "methodology.numbers_require_measurement",
      "data.states",
      "methodology.limitations",
    ],
  },
  {
    id: "methodology.refuses_to_infer",
    domain: "methodology",
    title: "What FOLDMARK refuses to infer",
    patterns: [
      "what will foldmark not infer",
      "what does foldmark refuse to infer",
      "can you tell me who owns this address",
      "do you identify wallet owners",
      "can you cluster wallets",
      "why is there no holder count",
      "can you tell if this is a whale",
    ],
    keywords: ["infer", "refuse", "owner", "cluster", "whale", "holders", "attribution"],
    answer:
      "Four things in particular are refused, each for a stated reason.\n\nReal-world identity. Addresses are never mapped to people, firms or institutions. FOLDMARK describes observed behaviour and nothing else.\n\nWallet clustering. There is no clustering in the product. A common-ownership heuristic asserts a link between two addresses that the chain did not record, so the product does not publish it. The architecture preview says WALLET rather than WALLET CLUSTER precisely because previewing a capability that does not exist would be previewing the wrong thing.\n\nCounterparty role, and lifetime history. A role comes from the registry or it is unknown. Lifetime figures such as holder counts are not derivable from a rolling index that holds what has been observed since ingestion started rather than the chain from genesis.",
    shortAnswer:
      "No real-world identity attribution, no wallet clustering, no counterparty role without a registry entry, and no lifetime figures from a rolling index.",
    followups: [
      "methodology.no_inference_from_behaviour",
      "methodology.no_identity_attribution",
      "wallets.address_vs_wallet",
      "fabric.architecture_preview",
    ],
  },
  {
    id: "methodology.determinism",
    domain: "methodology",
    title: "Determinism",
    patterns: [
      "why is foldmark deterministic",
      "determinism",
      "why does the same input always render the same output",
      "is the layout random",
      "will the map look different next time",
      "is anything randomised",
      "same input same output",
    ],
    keywords: ["deterministic", "determinism", "random", "reproducible", "stable", "seed"],
    answer:
      "The same input always renders the same output. Layout, classification and formatting take their inputs and return a result with no randomness, no physics simulation and no hidden clock, so a view drawn on the server and the same view drawn on the client agree.\n\nThis is a correctness property before it is an aesthetic one. If node positions moved between renders while the legend claimed position encoded role, the legend would be false. A map that rearranges itself cannot be cited, compared against an earlier look, or trusted to mean the same thing twice.\n\nIt also makes a view shareable. Filter state lives in the URL, so the query string plus the data fully determines the render, and a link reopens the same view rather than a similar one.",
    shortAnswer:
      "Layout, classification and formatting are computed without randomness or a hidden clock, so the same data always draws the same view on the server and the client, and a shared URL reopens exactly that view.",
    detail:
      "The radial layout has no force simulation and no jitter. Ring radii are fixed by role, and the angle of a node comes from the weighted circular mean of the angles of its already-placed neighbours; members of a ring are then sorted by that preference and spread evenly, which keeps a node near what it actually transacts with and guarantees no two nodes on a ring overlap.\n\nRelative timestamps are computed against an explicit now rather than reading the clock at render, so a server render and a client render of the same page produce the same string.\n\nThe preview module is held to the same standard by test. Its topology must be identical across calls, and its source is checked to contain no call to Math.random, no Date.now and no bare new Date, so it cannot drift between render passes.\n\nOne historical note the changelog keeps: graph node positions once came from Math.random while the legend claimed radius encoded activity. That is the failure determinism exists to prevent.",
    followups: [
      "methodology.pure_functions",
      "fabric.filters",
      "methodology.preview_may_be_drawn",
      "core.are_you_ai",
    ],
  },
  {
    id: "methodology.pure_functions",
    domain: "methodology",
    title: "Layout and classification as pure functions",
    patterns: [
      "why are layout and classification pure functions",
      "pure functions",
      "why is classification a pure function",
      "why keep layout out of the renderer",
      "how is the map positioned",
      "why is layout testable",
    ],
    keywords: ["pure", "function", "layout", "classification", "testable", "renderer"],
    answer:
      "Semantic class and spatial position are computed by pure functions kept deliberately out of the renderer, so they can be held by tests rather than by intention.\n\nOne function decides what a node is. Another decides where it sits. Neither reads a clock, neither draws anything, and both return the same result for the same graph. A rule that lives inside a canvas draw call can only be checked by looking at the picture; a rule that lives in a pure function can be asserted.\n\nPosition carries role, not importance: assets on the inner ring, venues and protocols around them, unidentified addresses on the rim, oracles and infrastructure outside that. Because that mapping is a function of the data, it can be stated in a legend and the legend stays true.",
    shortAnswer:
      "Node class and node position are pure functions of the graph, kept out of the renderer so the rules can be asserted by tests instead of inspected by eye.",
    followups: [
      "methodology.determinism",
      "fabric.measured_graph",
      "fabric.centrality",
      "methodology.import_graph_test",
    ],
    routes: ["/fabric"],
  },
  {
    id: "methodology.no_look_ahead",
    domain: "methodology",
    title: "The no-look-ahead rule",
    patterns: [
      "what is the no look ahead rule",
      "no look ahead",
      "why is my transfer unpriced",
      "how is notional calculated",
      "why not use the current price",
      "why does notional say partial",
      "how are transfers priced",
    ],
    keywords: ["lookahead", "notional", "alignment", "backtest", "historical", "unpriced", "price"],
    answer:
      "Notional value prices each movement at its own moment. The observation nearest that movement's timestamp is used, and by default only an observation at or before it may price it. Pricing a transfer with a quote from after it is look-ahead, which is information that did not exist yet.\n\nThe gap between the transfer and the price must fall within 15 minutes. A movement with no aligned price is excluded and counted. It is never interpolated, never carried forward, and never priced by a neighbour.\n\nSo a total can read PARTIAL alongside how many movements were priced against how many were observed. A partial total that says it is partial is a measurement; the same total presented as complete is not.",
    shortAnswer:
      "Each movement is priced by an observation at or before it, within 15 minutes. Movements with no aligned price are excluded and counted rather than valued at a later or distant quote.",
    detail:
      "The trap is subtler than refusing to add units. A 24H window holds transfers from every hour of that day, and multiplying all of them by the newest quote, however fresh that quote is relative to now, values a transfer from many hours ago at the current price. The result carries a plausible number and describes nothing that happened. A current price is not a historical price.\n\nFifteen minutes is the tolerance because it is long enough that a quiet asset with sparse quotes can still be valued, and short enough that the price and the transfer belong to the same market conditions. Beyond it the number stops being a measurement.\n\nCoverage therefore depends on how densely prices were ingested near the transfers in the window. Where observations are sparse, most transfers are correctly reported as unpriced rather than valued at a distant quote, and the reported total stays a lower bound with its own denominator attached.\n\nOne detail keeps the denominator honest: a transfer the indexer could not fully identify still arrives at the calculation and is counted. Dropping such transfers before the count would shrink the denominator and inflate coverage into \"of the transfers we could price, we priced all of them\", which measures nothing.",
    followups: [
      "pricing.price_types",
      "methodology.numbers_require_measurement",
      "data.coverage",
      "methodology.units_not_comparable",
    ],
  },
  {
    id: "methodology.preview_may_be_drawn",
    domain: "methodology",
    title: "Preview may be drawn, never counted",
    patterns: [
      "why can preview data be drawn",
      "is the architecture preview real data",
      "can preview data be counted",
      "does the preview affect the numbers",
      "preview may be drawn but never recorded",
      "is the preview served by the api",
      "does preview data reach the database",
    ],
    keywords: ["preview", "drawn", "counted", "priced", "served", "recorded", "architecture"],
    answer:
      "The architecture preview exists so the interface is not a grid of em dashes before a database is connected. It is safe only while it stays on one side of a single line: preview geometry may be drawn, and it may never be recorded, priced, served or counted.\n\nEverything past that line is where a number becomes a fact. An API response is a published measurement, the server layer writes history and prices assets, and the indexer decides what was observed. Preview content entering any of them would stop being a drawing and start being a claim.\n\nThe preview also carries nothing that could pass as a measurement. Its labels are exactly ASSET A, ASSET B, ASSET C, WALLET, MARKET, LIQUIDITY and PROTOCOL, and nothing in it is denominated: no amount, no count, no percentage, no address, no symbol. It carries an ARCHITECTURE PREVIEW badge, and its legend line reads \"Product architecture — not an observation\".",
    shortAnswer:
      "Preview geometry may be drawn on screen and may never be recorded, priced, served or counted. It uses generic category labels, carries no denominated value, and is badged as architecture rather than observation.",
    detail:
      "The preview represents how FOLDMARK organises market structure. It is not presented as observed Robinhood Chain activity, and if the question is whether those are real wallets, the answer is no: in preview mode they are category placeholders, not observed addresses.\n\nThe boundary is enforced rather than promised, by a test that walks the real import graph, and by assertions that the preview carries no denominated value to leak in the first place. An earlier version of this idea went further than it should have and generated deterministic candles to fill a chart; that was wrong and was removed. The surviving rule is narrower and holds: structure may be illustrated, values may not.\n\nThe measured graph is a different thing entirely. It is built only from observed transfers, every node exists because the indexer saw it, and every edge exists because value actually moved along it. A visible Fabric interface is not itself evidence that a measured graph exists.",
    followups: [
      "methodology.import_graph_test",
      "fabric.architecture_preview",
      "fabric.measured_graph",
      "methodology.numbers_require_measurement",
    ],
    actions: [{ label: "OPEN FABRIC", href: "/fabric" }],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },
  {
    id: "methodology.import_graph_test",
    domain: "methodology",
    title: "The import-graph test",
    patterns: [
      "what is the import graph test",
      "import graph test",
      "how is preview isolation enforced",
      "what stops preview data reaching the api",
      "how do you know preview data is isolated",
      "preview isolation test",
    ],
    keywords: ["import", "graph", "test", "isolation", "enforcement", "build", "preview"],
    answer:
      "The preview boundary cannot be held by intention. Someone reaches for a chart series in a route handler, or a topology in an aggregation, and the product starts publishing invented structure as measurement. So the line is held by a test that walks the real import graph and fails the build if preview geometry is ever imported where a number becomes a fact.\n\nTwo directories are forbidden outright: the API routes, because an API response is a published measurement, and the server layer, because it writes history and prices assets. Named files are forbidden individually with the reason attached: the read layer, the indexer, the notional calculation, the OHLC aggregation and the graph fold.\n\nThe same test asserts the mirror of the rule. The preview module must be imported by at least one component, or the isolation is meaningless because the module is dead code.",
    shortAnswer:
      "A test walks the actual import graph and fails the build if preview geometry is imported by the API routes, the server layer, the read layer, the indexer, notional, OHLC or the graph fold.",
    detail:
      "Beyond the import graph, the test checks that the preview carries nothing that could pass as a measurement even if it did leak. No node label may contain an address-shaped hex string or a real ticker. Every label must match the category set exactly. No node may carry a contract, address or symbol property, and no edge may carry an amount, value, USD or liquidity property.\n\nIt also pins determinism: the topology must be identical across calls, and the module source must contain no call to Math.random, no Date.now and no bare new Date, so the preview cannot drift between render passes.\n\nThe pattern generalises. A rule that is only written down is a rule someone will violate in good faith during a refactor. A rule expressed as a failing build is a rule that survives the refactor.",
    followups: [
      "methodology.preview_may_be_drawn",
      "methodology.determinism",
      "fabric.architecture_preview",
      "methodology.will_not_do",
    ],
  },
  {
    id: "methodology.limitations",
    domain: "methodology",
    title: "Limitations today",
    patterns: [
      "what are the limitations",
      "what can foldmark not measure",
      "limitations",
      "what is missing",
      "what does not work yet",
      "why is so much unavailable",
      "known limitations",
    ],
    keywords: ["limitations", "gaps", "missing", "constraints", "coverage", "roadmap"],
    answer:
      "Each known limitation produces a visible state in the product rather than a missing section. Reading DATA UNAVAILABLE or UNCLASSIFIED means one of them is the reason.\n\nThe registries are empty, so no counterparty is identified as a DEX, lending market or bridge, every flow returns UNCLASSIFIED, and protocol exposure is withheld rather than estimated. There is no issuer reference price and no verified oracle aggregator for this chain, so the two highest-authority price types are absent from the ranking and what remains is a DEX spot price, labelled as such.\n\nThe index is a rolling window holding what has been observed since ingestion started, not the chain from genesis, so lifetime figures such as holder counts are not derivable. Aggregation runs over a bounded row window, so a busy window can reach the cap and every count inside it becomes a lower bound reported as PARTIAL.\n\nThe limitation that shapes the architecture most is the log window. The documented free public endpoint serves logs for roughly 52 blocks and refuses older ranges as archive requests, against a chain producing on the order of hundreds of thousands of blocks a day. A scheduled job can therefore never catch up across a gap, which is why ingestion follows the head continuously and why an unreachable span is recorded as a gap rather than skipped silently.",
    shortAnswer:
      "Empty registries mean every flow reads UNCLASSIFIED and protocol exposure is withheld; there is no issuer or oracle price; the index is a rolling window, so lifetime figures are not derivable and busy windows report lower bounds.",
    followups: [
      "data.coverage",
      "methodology.will_not_do",
      "data.states",
      "methodology.unknown_over_incorrect",
    ],
    actions: [{ label: "READ LIMITATIONS", href: "/docs/limitations" }],
  },
  {
    id: "methodology.will_not_do",
    domain: "methodology",
    title: "What FOLDMARK will not do",
    patterns: [
      "what will foldmark not do",
      "what does foldmark refuse to do",
      "does foldmark give trading advice",
      "will foldmark ever guess",
      "what are the hard rules",
      "what is off limits",
    ],
    keywords: ["refuse", "never", "rules", "advice", "boundaries", "guarantee"],
    answer:
      "It will not put a number on screen that was not derived from indexed chain data. It will not fill an absence with a plausible value, and it will not present a state as though it were a measurement.\n\nIt will not assert a semantic category the registry does not hold, will not map an address to a real-world identity, and will not cluster addresses into common ownership. It will not call an unidentified address a wallet, a DEX, a protocol, a bridge or an oracle.\n\nIt will not call the reference chart a FOLDMARK price, and it will not average across price types. It will not present architecture preview content as observed activity. It will not mark an asset VERIFIED without an authoritative source confirming the exact contract on this chain, which is why nothing carries that status today.",
    shortAnswer:
      "No invented numbers, no inferred categories, no identity attribution or clustering, no reference price passed off as a FOLDMARK measurement, no preview content presented as observation, and no VERIFIED status without an authoritative source.",
    followups: [
      "methodology.refuses_to_infer",
      "methodology.unknown_over_incorrect",
      "pricing.reference_market",
      "core.what_foldmark_is_not",
    ],
  },
  {
    id: "methodology.how_to_read_a_claim",
    domain: "methodology",
    title: "How to read a FOLDMARK claim",
    patterns: [
      "how do i read a foldmark claim",
      "how should i read these numbers",
      "how do i know if this is measured",
      "what does this figure actually mean",
      "how to read a claim",
      "is this number real",
      "how do i interpret the states",
    ],
    keywords: ["read", "claim", "interpret", "measured", "state", "provenance", "window"],
    answer:
      "Read three things before the number: the state, the provenance and the window.\n\nThe state says what kind of claim it is. LIVE, PARTIAL DATA and STALE are measurements, differing in freshness and completeness. NO ACTIVITY is also a measurement, because the query succeeded and nothing was observed. INDEXING and DATA UNAVAILABLE are not measurements at all: the pipeline has not reached this entity, or the source is down or unconfigured.\n\nThe provenance says where the value came from and how it was computed. The window says what span it covers, and a windowed surface reports how far back the index actually reaches, so a 7D label drawn from a shorter stretch reads PARTIAL with its real reach.",
    shortAnswer:
      "Check the state, the provenance and the window before the figure. Three states are measurements of activity, one is a measurement of absence, and two are not measurements at all.",
    detail:
      "Internally a figure is a record carrying a state, a value, an observation time, a provenance and an optional note. A value renders as a number only in OK, PARTIAL and STALE; in the other three states it resolves to a state, because there is no value to show.\n\nOne presentation subtlety is worth knowing. A separate presentation vocabulary can render UNAVAILABLE to a reader as a pending state, which is a display choice about tone. The machine value stays UNAVAILABLE in the API and in every internal decision, so nothing downstream treats a softened label as a different fact.\n\nFreshness is a budget rather than an opinion. A measured value older than that budget is re-stated as STALE rather than kept as LIVE, so an old measurement is never presented with the confidence of a new one.",
    followups: [
      "data.states",
      "data.provenance",
      "data.freshness",
      "methodology.provenance_beats_confidence",
    ],
  },
  {
    id: "methodology.provenance_beats_confidence",
    domain: "methodology",
    title: "Provenance beats confidence",
    patterns: [
      "why does provenance beat confidence",
      "provenance beats confidence",
      "why is there no confidence score on numbers",
      "what is provenance",
      "why does the source matter more than a score",
      "is there a confidence rating",
    ],
    keywords: ["provenance", "confidence", "source", "method", "score", "trust"],
    answer:
      "A confidence score summarises a belief. A provenance record states where a value came from and how it was computed. Only the second can be checked.\n\nEvery measured value carries provenance with a source and, where it applies, a one-sentence method. A reader who disagrees with a figure can follow that to the thing that produced it. A reader who disagrees with a score has nowhere to go, and two systems using different scales produce scores that cannot be compared at all.\n\nSo confidence is used where it belongs, such as ranking candidate price observations, and never as a substitute for saying what the source was. Where provenance is absent, the answer is a state rather than a lower-confidence number.\n\nPrice ranking shows the shape of this. Sources are ranked by price type first, then by a confidence derived from pool depth and observation age, and the highest ranked observation is displayed. Prices are never averaged, because an average of a reference quote and a venue quote is a figure no market printed, and its provenance could name no source.",
    shortAnswer:
      "Provenance names a checkable source and method; a confidence score names only a belief. Values carry provenance, and an absent provenance produces a state rather than a hedged number.",
    followups: [
      "data.provenance",
      "pricing.price_types",
      "methodology.how_to_read_a_claim",
      "data.states",
    ],
  },
  {
    id: "methodology.category_vs_identity",
    domain: "methodology",
    title: "A category is not an identity",
    patterns: [
      "what is the difference between a category and an identity",
      "category vs identity",
      "is a category the same as verified",
      "does categorized mean identified",
      "why is a category not enough",
      "what does categorized actually claim",
    ],
    keywords: ["category", "identity", "categorized", "verified", "claim", "difference"],
    answer:
      "A category says what kind of thing something behaves like. An identity says which specific thing it is. FOLDMARK keeps them apart because the evidence for each is different in kind.\n\nCATEGORIZED comes from on-chain behaviour and metadata: a contract answered ERC-20 metadata and its shape places it in a category such as STOCK TOKEN, CRYPTO, STABLECOIN or OTHER. That is a real statement, and it is not an identity claim. Anyone able to deploy an ERC-20 can produce a contract that categorises the same way.\n\nIdentity requires an authoritative source confirming the exact contract address on the exact chain. A ticker, a symbol or a token name is never sufficient evidence. Contract address plus chain identity outranks a ticker alone, always.",
    shortAnswer:
      "A category describes behaviour and metadata; an identity names the specific contract. Only an authoritative source naming the exact address on the exact chain establishes identity, and a ticker never does.",
    detail:
      "The same distinction runs through the protocol side. The protocol categories are DEX, LENDING, BRIDGE, ORACLE, INFRASTRUCTURE and UNCLASSIFIED, mapped from what the registry says an address is. A category chip is therefore a statement about a registry entry, not a statement about who operates a contract.\n\nIt also explains the reference-market allowlist. The mapping from a token to a reference instrument is keyed on chain id and contract address and nothing else, never on a symbol or a name. If a ticker could be derived from token metadata, anyone able to deploy an ERC-20 could choose which financial instrument the product charts beside their contract, lending a real company's price history to an unrelated address.\n\nWhat a reference mapping does mean is narrow: someone recorded that this address is intended to track this instrument. It is not verification, it never writes to the verification status, and it never promotes a candidate.",
    followups: [
      "methodology.evidence_ladder",
      "assets.identity",
      "protocols.categories",
      "pricing.reference_market",
    ],
  },
  {
    id: "methodology.numbers_require_measurement",
    domain: "methodology",
    title: "A number requires a measurement",
    patterns: [
      "why are there no numbers",
      "why is this showing a state instead of a number",
      "when does a number appear",
      "why is the dashboard empty",
      "why no figures",
      "a number requires a measurement",
      "why is there a dash instead of a value",
    ],
    keywords: ["number", "measurement", "figure", "state", "indexed", "empty", "placeholder"],
    answer:
      "A number reaches the screen only when it was derived from indexed chain data. Everything else resolves to a state, never a plausible-looking value.\n\nThere are six states and they make different claims. OK is measured and fresh. PARTIAL is measured with the window not fully indexed. STALE is measured but older than the freshness budget. EMPTY means the query succeeded and nothing was observed. INDEXING means the pipeline has not reached this entity. UNAVAILABLE means the source is down or unconfigured.\n\nEMPTY and UNAVAILABLE must never be conflated. EMPTY is a measurement: the product looked, and there was nothing. INDEXING and UNAVAILABLE are not measurements, because nothing was looked at, or the look failed.",
    shortAnswer:
      "Figures come only from indexed chain data; everything else resolves to one of six states. EMPTY is a measurement of absence, while INDEXING and UNAVAILABLE mean no measurement was made at all.",
    followups: [
      "data.states",
      "data.empty_vs_indexing",
      "methodology.unknown_over_incorrect",
      "methodology.how_to_read_a_claim",
    ],
  },
  {
    id: "methodology.classification_is_lookup",
    domain: "methodology",
    title: "Classification is a lookup",
    patterns: [
      "how does flow classification work",
      "is classification a lookup",
      "classification is a lookup not an inference",
      "what decides a flow class",
      "why does direction change the class",
      "how is dex buy decided",
    ],
    keywords: ["classification", "lookup", "registry", "counterparty", "direction", "flow"],
    answer:
      "A transfer log says an amount moved between two addresses. It does not say whether that was a purchase, a deposit, a bridge crossing or someone paying a friend. The difference is the counterparty, and a counterparty is what the contracts registry says it is.\n\nSo the classifier reads the registry and nothing else. Value arriving at a dex_pool is DEX_SELL. Value leaving one toward the receiver is DEX_BUY. The same pool and the same address produce either class depending only on which way value went.\n\nIf the registry has never seen an address, the flow is UNCLASSIFIED. Nothing about a token's name, a symbol, an amount or a pattern of activity may promote a flow out of it.",
    shortAnswer:
      "Flow class comes from a registry lookup on the counterparty plus the direction value moved, never from an inference. An unregistered counterparty yields UNCLASSIFIED.",
    detail:
      "WALLET_TRANSFER is deliberately narrow. It is claimed only when the registry was consulted and neither side is a known venue, so with an empty registry nothing is established as ordinary either and the answer is UNCLASSIFIED rather than WALLET_TRANSFER.\n\nThree names in the vocabulary are reserved and are not assigned by the current classifier: LP_DEPOSIT, LP_WITHDRAW and LEND. Their filter chips therefore always count zero. The classifier can return only DEX_BUY, DEX_SELL, BORROW, REPAY, BRIDGE_IN, BRIDGE_OUT, WALLET_TRANSFER and UNCLASSIFIED.\n\nWhere both ends are identified and a single category must be chosen, the receiving end wins, because that is the counterparty value went to. Where neither end is identified, the category is UNCLASSIFIED.",
    followups: [
      "flows.direction",
      "flows.reserved_classes",
      "flows.unclassified",
      "methodology.no_inference_from_behaviour",
    ],
    actions: [{ label: "OPEN FLOWS", href: "/flows" }],
    entities: ["DEX_BUY", "DEX_SELL", "UNCLASSIFIED"],
  },
  {
    id: "methodology.units_not_comparable",
    domain: "methodology",
    title: "Units are not comparable across assets",
    patterns: [
      "why are amounts not added together",
      "why does foldmark rank by counts",
      "can you total the volume",
      "units are not comparable",
      "why is edge weight based on transfer count",
      "why is there no combined volume figure",
    ],
    keywords: ["units", "amounts", "sum", "counts", "comparable", "volume", "decimals"],
    answer:
      "One token of one asset plus one token of another is not two of anything. Token amounts are never added across assets, so a figure spanning several assets is either a count of transfers, counterparties or assets touched, or a notional conversion into a single currency.\n\nAmounts appear only beside their own symbol. Cross-asset rankings use counts, because counts are comparable and unit sums are not.\n\nThe Fabric map follows the same rule. Edge stroke weight comes from an intensity derived from transfer count, not from token amount. Scaling a stroke by amount would let a stablecoin edge overwhelm an equity edge purely because of decimals, and the picture would become a statement about decimal places rather than about activity.",
    shortAnswer:
      "Amounts in different assets do not sum, so cross-asset figures are counts or a notional conversion. Edge weight in Fabric is derived from transfer count for the same reason.",
    followups: [
      "methodology.no_look_ahead",
      "fabric.edges",
      "methodology.lower_bounds",
      "flows.what_is",
    ],
    routes: ["/fabric", "/flows"],
  },
  {
    id: "methodology.lower_bounds",
    domain: "methodology",
    title: "Lower bounds and partial windows",
    patterns: [
      "why is this a lower bound",
      "why does the window say partial",
      "is this the full count",
      "lower bounds",
      "why is a 7d panel partial",
      "what does partial data mean on a window",
    ],
    keywords: ["partial", "lower", "bound", "window", "cap", "count", "reach"],
    answer:
      "Two things turn a total into a lower bound, and both are reported rather than hidden.\n\nAggregation runs over a bounded row window rather than an unbounded scan. When a busy window reaches that cap, the result is marked PARTIAL and every count inside it is a lower bound rather than a total.\n\nA window can also be shorter than its label. A 7D panel drawn from a shorter stretch of index is not a 7D panel, so every windowed surface reads how far back the index reaches unbroken and reports PARTIAL with that actual reach. The figure is then a lower bound over the shorter span.",
    shortAnswer:
      "A row cap or an index shorter than the window label turns a count into a lower bound, and both cases are reported as PARTIAL with the real reach rather than presented as totals.",
    followups: [
      "data.coverage",
      "data.states",
      "methodology.limitations",
      "methodology.how_to_read_a_claim",
    ],
  },
  {
    id: "methodology.no_identity_attribution",
    domain: "methodology",
    title: "No identity attribution",
    patterns: [
      "do you identify who owns an address",
      "can you tell me whose wallet this is",
      "no identity attribution",
      "does foldmark deanonymise addresses",
      "will you name the person behind an address",
      "do you link addresses to people",
    ],
    keywords: ["identity", "attribution", "owner", "person", "privacy", "address", "clustering"],
    answer:
      "Addresses are never mapped to real-world identities. FOLDMARK describes observed behaviour and nothing else.\n\nAn address is called an address. It is not called a wallet, because calling it a wallet asserts that it is an externally owned account, which nothing has established. It is certainly not attached to a person, a firm or an institution.\n\nThere is no wallet clustering either, so no common-ownership link is published between two addresses. The chain did not record that link, and the product does not invent it.",
    shortAnswer:
      "No address is mapped to a real-world identity and no addresses are clustered into common ownership. An unidentified address is called an address, not a wallet.",
    followups: [
      "wallets.address_vs_wallet",
      "methodology.refuses_to_infer",
      "methodology.no_inference_from_behaviour",
      "wallets.unknown_address",
    ],
    routes: ["/wallets", "/wallet"],
  },
];
