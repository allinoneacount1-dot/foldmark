import type { Entry } from "@/lib/intelligence/types";

/**
 * Navigation, page context and actions.
 *
 * These entries are signposts. They answer where the reader is, what the
 * current surface is for, what the window and filter chips are doing to it,
 * and where to go next — each with a deterministic action to a route that
 * already exists.
 *
 * Two of them are written to be wrapped rather than read alone: the engine
 * prepends the live route and filter state as a context line, so the answers
 * here carry only the part that is true on every page.
 */
export const NAVIGATION_ENTRIES: Entry[] = [
  {
    id: "navigation.help",
    domain: "navigation",
    title: "What this guide can explain",
    patterns: [
      "help",
      "what can you help with",
      "what can i ask",
      "what can you explain",
      "what questions can i ask",
      "what commands are there",
      "list the slash commands",
      "how do i use this guide",
      "what do you know about",
      "what topics do you cover",
    ],
    keywords: ["help", "commands", "ask", "guide", "usage", "slash", "topics"],
    answer:
      "This guide explains FOLDMARK: what the product measures, how it classifies what it observes, and what each page and control does. It draws on FOLDMARK documentation, product semantics and the state of the page you are on.\n\nTopics it covers: the Fabric market map and what its shapes, colours and rings encode; flow classes and how direction is decided; assets and how identity is established; addresses, and why an unidentified one is not called a wallet; protocol categories and the four-stage classification pipeline; the four price types and the reference market panel; data states, provenance and freshness; and the methodology rules that keep unknown things unknown.\n\nSlash commands. /help lists this. /fabric, /flows, /assets and /protocols open those surfaces. /methodology and /docs open the written record. /status names the surface, window and filters the guide can read from the URL. /about describes what this guide is. /clear discards the session context, which is held only in this tab.\n\nIt does not give trading advice, does not predict prices, and does not answer questions outside FOLDMARK and Robinhood Chain.",
    shortAnswer:
      "Ask about Fabric, flows, assets, addresses, protocols, pricing, data states or methodology. Commands: /help, /fabric, /flows, /assets, /protocols, /methodology, /docs, /status, /about, /clear.",
    detail:
      "The commands are shortcuts, not a separate system. /fabric, /flows, /assets, /protocols, /methodology and /docs resolve to the same navigation entries you would reach by asking for those surfaces in words, and each one carries the action rather than only describing the route.\n\n/status differs from the Status page. The command reports what the guide itself can see: the surface you are on, the window and filter values set in the query string, and the fact that it reads the route and query string only. It does not query the chain and it does not report the data state of the panels in front of you — the state tag on each panel does that. The Status page under Docs reports the health of every dependency behind the product.\n\n/clear empties the session context. That context is small by design: the last intent, the last domain and the last entities referred to, which is enough to resolve a follow-up like the other direction without carrying a transcript. It is scoped to the tab and gone when the tab closes.\n\nQuestions this knowledge base does not cover return a low-confidence answer that says so. An answer is never assembled from partial matches to look more complete than the evidence behind it.",
    followups: [
      "navigation.what_am_i_looking_at",
      "navigation.routes_overview",
      "core.what_is_foldmark",
      "core.are_you_ai",
    ],
    actions: [
      { label: "OPEN DOCS", href: "/docs" },
      { label: "OPEN METHODOLOGY", href: "/docs/methodology" },
    ],
  },

  {
    id: "navigation.what_am_i_looking_at",
    domain: "navigation",
    title: "What this page shows",
    patterns: [
      "what am i looking at",
      "where am i",
      "what is this page",
      "what does this page show",
      "explain this page",
      "what am i seeing",
      "what is on this page",
      "what is this screen for",
      "help me read this page",
    ],
    keywords: ["page", "screen", "here", "looking", "current", "context", "surface"],
    answer:
      "Every FOLDMARK surface answers one question. Dashboard reads market state as a whole. Assets is the registry of assets the index has observed. Fabric draws the market as a graph. Flows ranks directed capital movement. Wallets reads a single public address as a position. Protocols separates identified infrastructure from the contracts capital moves through unidentified. Docs and Developers are the written and machine-readable record.\n\nThe reading order is the same on all of them. The header states what is being measured. Every panel carries a data state, and that state is part of the reading: LIVE means measured and fresh, NO ACTIVITY means the query succeeded and nothing was observed, INDEXING means the pipeline has not reached this entity, DATA UNAVAILABLE means the source is down or unconfigured.\n\nA number reaches the screen only when it was derived from indexed chain data. Everything else resolves to a state rather than a plausible-looking value, so a gap on the page is a claim about evidence, not a rendering failure.\n\nOn Fabric and Flows the view is also shaped by the selected window and the filter chips. Both live in the URL, so the address bar is an accurate description of what is on screen.",
    shortAnswer:
      "Each surface answers one question, and every panel carries a data state saying whether the figure was measured, not yet observed, or unavailable.",
    detail:
      "The surfaces map to routes directly. / is the overview. /dashboard reads market state as a whole. /assets is the registry and /assets/[contract] is the passport for one asset. /fabric is the market topology. /flows is the capital flow observatory. /wallets is the address explorer and /wallet/[address] reads one address. /protocols lists protocol infrastructure and /protocol/[id] opens one. /search queries assets, wallets, protocols and contracts. /developers and /docs are the machine and written layers.\n\nFilter state is carried in the query string: ?w= for the window, ?type= for asset type, ?category= for protocol category and ?flow= for flow class. Fabric reads all four; Flows reads the window and the flow class. An unrecognised value in type, category or flow parses to null and reads as ALL, and an unrecognised window falls back to the 24H default, because a stale link must never produce an empty page that looks like a measurement of nothing.\n\nOne caution specific to Fabric. If the map is showing the architecture preview, what is on screen is a representation of how FOLDMARK organises market structure, using generic placeholders. It carries an ARCHITECTURE PREVIEW badge and a legend line saying it is product architecture rather than an observation, and nothing in it is denominated.",
    followups: [
      "navigation.active_filters",
      "navigation.selected_window",
      "data.states",
      "navigation.routes_overview",
    ],
    actions: [
      { label: "OPEN DASHBOARD", href: "/dashboard" },
      { label: "OPEN DOCS", href: "/docs" },
    ],
  },

  {
    id: "navigation.active_filters",
    domain: "navigation",
    title: "Which filters are active",
    patterns: [
      "which filters are active",
      "what filters are applied",
      "what am i filtering by",
      "how do i clear the filters",
      "why is the list filtered",
      "reset the filters",
      "how do the filter chips work",
      "why does this chip show zero",
      "current filter",
    ],
    keywords: ["filter", "filters", "chips", "active", "reset", "clear", "url", "zero"],
    answer:
      "Filter state lives entirely in the URL. ?w= selects the window, ?type= the asset type, ?category= the protocol category and ?flow= the flow class. Fabric reads all four. Flows reads the window and the flow class.\n\nBecause the filters are in the query string, the address bar tells you exactly what is selected, and a filtered view is shareable and survives a reload. Selecting the chip that is already active drops its parameter and returns that dimension to ALL. An unrecognised value parses to null and also reads as ALL, so a stale link never produces a false empty.\n\nThe map, the counters and the rail all read the same filtered rows. A chip that redrew the canvas while the totals beside it stayed global would be worse than a dead chip: a working control reporting a number that does not describe what is on screen.\n\nCategory and flow chips are derived from the contracts registry. A transfer between addresses that registry has no entry for classifies as UNCLASSIFIED, so a chip naming a category with no registered contracts counts zero and selects nothing. That is the correct outcome of the classification rules, not a fault in the filter.",
    shortAnswer:
      "Filters live in the URL as ?w=, ?type=, ?category= and ?flow=. Clicking an active chip clears it, and an unrecognised value reads as ALL rather than emptying the page.",
    detail:
      "The asset type filter selects one of stock_token, crypto, stablecoin or other. The category filter selects one of DEX, LENDING, BRIDGE, ORACLE, INFRASTRUCTURE or UNCLASSIFIED. The flow filter selects one of the eleven declared flow classes.\n\nThree of those flow chips can never count anything today. LP_DEPOSIT, LP_WITHDRAW and LEND are declared in the vocabulary but are not assigned by the current classifier, so they are reserved names rather than live categories. Their counts are structurally zero, independently of the registry.\n\nFiltering narrows what is counted, never what exists. When a filter is applied the window totals are recomputed against the narrowed rows so the rail cannot contradict the tape, which means a filtered total is a smaller measurement rather than a share of a larger one.",
    followups: ["fabric.filters", "navigation.selected_window", "flows.unclassified", "protocols.registry"],
    actions: [
      { label: "OPEN FABRIC", href: "/fabric" },
      { label: "OPEN FLOWS", href: "/flows" },
    ],
    routes: ["/fabric", "/flows", "/assets"],
  },

  {
    id: "navigation.selected_window",
    domain: "navigation",
    title: "The selected window",
    patterns: [
      "what window is selected",
      "which time window is this",
      "how do i change the window",
      "what windows are available",
      "what does 24h mean here",
      "what time range is this",
      "why is 24h the default",
      "window meaning",
    ],
    keywords: ["window", "24h", "7d", "30d", "timeframe", "range", "period", "default"],
    answer:
      "FOLDMARK defines five observation windows: 1H, 6H, 24H, 7D and 30D. Fabric and Flows both default to 24H.\n\nThe window is carried in the URL as ?w=, so it is part of the shareable state of the view. Changing the chip changes the query string, and everything measured on the page is recomputed for that window. An unrecognised value falls back to the 24H default rather than emptying the page.\n\nA window bounds what is counted, not what exists. An asset absent from a 1H view has not disappeared; nothing was observed for it inside that hour. Widening the window is the correct way to tell a quiet period apart from an entity that is not in the index at all.\n\nThe window is also why NO ACTIVITY and INDEXING are different answers. NO ACTIVITY means the query for this window succeeded and found nothing. INDEXING means the pipeline has not reached the entity, so no window has been measured for it yet.",
    shortAnswer:
      "Five windows exist — 1H, 6H, 24H, 7D and 30D — carried in the URL as ?w=, defaulting to 24H on Fabric and Flows.",
    detail:
      "A window bounds the transfers a page counts, and every derived figure inherits that bound: edge intensity, node radius, ranked inflow and outflow, and the counters in the rail are all statements about the selected window and nothing wider.\n\nNotional is aligned separately. A price is matched to the time of the transfer with no look-ahead, within a tolerance of fifteen minutes. A transfer with no price inside that tolerance contributes no notional rather than borrowing a later price, so widening the window adds transfers but never retroactively prices the ones that were left unpriced.\n\nBecause the window is in the query string it renders identically on the server and in the browser, which is what makes a shared link reproduce the sender's view rather than the recipient's defaults.",
    followups: ["navigation.active_filters", "data.freshness", "data.empty_vs_indexing", "flows.what_is"],
    actions: [
      { label: "OPEN FLOWS", href: "/flows" },
      { label: "OPEN FABRIC", href: "/fabric" },
    ],
    routes: ["/fabric", "/flows"],
  },

  {
    id: "navigation.open_fabric",
    domain: "navigation",
    title: "Fabric — the market map",
    patterns: [
      "open fabric",
      "go to fabric",
      "show me the fabric",
      "take me to the market map",
      "where is the graph",
      "market topology page",
      "show the network graph",
      "view the topology",
    ],
    keywords: ["fabric", "graph", "topology", "map", "network", "open"],
    answer:
      "Fabric draws the Robinhood Chain market as a graph: sources, assets and destinations connected by observed capital movement. Shape carries the class — assets and protocols are hexagons, venues circles, oracles triangles, infrastructure diamonds, and an address that has not been identified is a square. The rings place assets innermost, venues and protocols around them, addresses on the rim, oracles and infrastructure outside that.\n\nThe measured graph is built only from observed transfers: every node exists because the indexer saw it and every edge exists because value actually moved along it. When there is no measured graph, Fabric draws the architecture preview instead, which is badged as such and uses generic placeholders rather than observed addresses.",
    shortAnswer:
      "Fabric is the market topology: assets, venues, protocols and addresses arranged in role-aware rings and connected by observed transfers.",
    detail:
      "The layout is deterministic, with no force simulation and no jitter, so it renders identically on the server and the client. A node's angle comes from the weighted circular mean of the angles of its already-placed neighbours, which keeps it near what it actually transacts with, and ring members are then spread evenly so no two overlap.\n\nEdge weight is derived from transfer count, not token amount. Amounts in different assets are not comparable, and scaling a stroke by them would let a stablecoin edge overwhelm an equity edge purely because of decimals.\n\nThe centre is a measurement or it is empty. One asset connected to strictly more counterparties than any other takes it; a tie falls back to observed transfer count, and if that ties too, nobody takes the centre. The map declines to nominate a hub the data did not nominate.\n\nInteraction never hides anything. Hover or select and the neighbourhood stays opaque while everything else dims; double-click isolates further. FIT or 0 returns to the fitted view, plus and minus zoom, the arrow keys step through nodes, Enter isolates and Escape clears. Reduced motion skips the arrival reveal, and that reveal only fades opacity — radius carries meaning, so it is never animated.",
    followups: ["fabric.what_is", "fabric.nodes", "fabric.architecture_preview", "navigation.active_filters"],
    actions: [{ label: "OPEN FABRIC", href: "/fabric" }],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "navigation.open_flows",
    domain: "navigation",
    title: "Flows — capital movement",
    patterns: [
      "open flows",
      "go to flows",
      "show me the flows",
      "where is capital flow",
      "flows page",
      "capital flow observatory",
      "show capital movement",
      "take me to flows",
    ],
    keywords: ["flows", "capital", "movement", "transfers", "direction", "open"],
    answer:
      "Flows ranks directed capital movement on Robinhood Chain for the selected window: flows between addresses, most active sources and destinations, most transferred assets, and net flow by address.\n\nEvery edge carries a flow class. Direction is what decides the class — the same pool and the same address produce DEX_BUY or DEX_SELL depending only on which way value went. Of the eleven declared classes the classifier can emit eight; LP_DEPOSIT, LP_WITHDRAW and LEND are reserved names it never assigns today.",
    shortAnswer:
      "Flows ranks directed movement for the selected window and labels each edge with a flow class derived from the counterparty on each side.",
    detail:
      "Classification reads the counterparty on each side from the contracts registry, which maps an address to a dex pool, a lending market, a bridge, an oracle, infrastructure, or nothing.\n\nThe rules are positional. Value arriving at a dex pool is DEX_SELL; value leaving one toward the receiver is DEX_BUY. Value arriving at a lending market is REPAY, and value leaving one is BORROW, while both sides being lending markets is UNCLASSIFIED. Value arriving at a bridge is BRIDGE_OUT and value leaving one is BRIDGE_IN.\n\nWALLET_TRANSFER is deliberately narrow. It is claimed only when the registry was consulted and neither side is a known venue. With an empty registry nothing has been established as ordinary either, so the honest answer is UNCLASSIFIED rather than WALLET_TRANSFER.\n\nSo a flow between addresses the registry has no entry for classifies as UNCLASSIFIED. That is the correct output of these rules, not a failure of them.",
    followups: ["flows.what_is", "flows.direction", "flows.reserved_classes", "navigation.selected_window"],
    actions: [{ label: "OPEN FLOWS", href: "/flows" }],
    entities: ["FLOWS"],
    routes: ["/flows"],
  },

  {
    id: "navigation.open_assets",
    domain: "navigation",
    title: "Assets — the registry",
    patterns: [
      "open assets",
      "go to assets",
      "show me the assets",
      "asset registry",
      "where are the tokens",
      "assets page",
      "show the asset list",
      "list the assets",
    ],
    keywords: ["assets", "registry", "tokens", "list", "passport", "open"],
    answer:
      "Assets is the registry of every asset the index has observed on Robinhood Chain, with its activity, counterparties and contract. Each row opens a passport at /assets/[contract].\n\nFOLDMARK defines four asset types — STOCK TOKEN, CRYPTO, STABLECOIN and OTHER — and identifies an asset by contract address plus chain, not by ticker. A symbol can be reused by anyone able to deploy a contract; an address on a chain cannot.",
    shortAnswer:
      "Assets lists every asset the index has observed, typed as STOCK TOKEN, CRYPTO, STABLECOIN or OTHER, each opening a per-contract passport.",
    followups: ["assets.what_is", "assets.identity", "assets.asset_types", "navigation.active_filters"],
    actions: [{ label: "OPEN ASSETS", href: "/assets" }],
    entities: ["ASSETS"],
    routes: ["/assets"],
  },

  {
    id: "navigation.open_protocols",
    domain: "navigation",
    title: "Protocols",
    patterns: [
      "open protocols",
      "go to protocols",
      "show me the protocols",
      "protocols page",
      "where are the protocols",
      "show protocol infrastructure",
      "list the protocols",
    ],
    keywords: ["protocols", "infrastructure", "dex", "lending", "bridge", "open"],
    answer:
      "Protocols separates identified protocol infrastructure from the contracts capital is moving through that remain unidentified. FOLDMARK defines six categories: DEX, LENDING, BRIDGE, ORACLE, INFRASTRUCTURE and UNCLASSIFIED.\n\nA contract appears as a protocol only when the contracts registry identifies it. Nothing is promoted on the basis of shape, volume or naming, so the page shows what is known alongside an honest count of what is not.",
    shortAnswer:
      "Protocols shows identified infrastructure in six categories and, beside it, the contracts capital moves through that are still unidentified.",
    followups: [
      "protocols.registry",
      "protocols.categories",
      "protocols.classification_pipeline",
      "methodology.unknown_stays_unknown",
    ],
    actions: [{ label: "OPEN PROTOCOLS", href: "/protocols" }],
    entities: ["PROTOCOLS"],
    routes: ["/protocols"],
  },

  {
    id: "navigation.open_wallets",
    domain: "navigation",
    title: "Wallets — the address explorer",
    patterns: [
      "open wallets",
      "go to wallets",
      "show me the wallets",
      "where do i look up an address",
      "wallet explorer",
      "look up an address",
      "wallets page",
      "check an address",
    ],
    keywords: ["wallets", "address", "explorer", "lookup", "counterparties", "open"],
    answer:
      "Wallets reads any public Robinhood Chain address as a position: exposure, counterparties, capital movement and activity. A single address opens at /wallet/[address].\n\nThe naming on this surface is deliberate. An address FOLDMARK has not identified is drawn as an address and called an address, not a wallet. Calling it a wallet would assert it is an externally owned account, which nothing has established.",
    shortAnswer:
      "Wallets reads any public address as a position — exposure, counterparties and movement — while an unidentified address is still only called an address.",
    followups: ["wallets.address_vs_wallet", "wallets.unknown_address", "methodology.unknown_stays_unknown"],
    actions: [{ label: "OPEN WALLETS", href: "/wallets" }],
    entities: ["WALLETS"],
    routes: ["/wallets", "/wallet"],
  },

  {
    id: "navigation.open_dashboard",
    domain: "navigation",
    title: "Dashboard",
    patterns: [
      "open the dashboard",
      "go to the dashboard",
      "show me the dashboard",
      "dashboard page",
      "take me to the dashboard",
      "where is the market overview",
    ],
    keywords: ["dashboard", "overview", "market", "state", "open"],
    answer:
      "Dashboard reads market state as a whole: reference market context, capital flow, network activity and market structure on one surface, each panel carrying its own data state.\n\nThe reference market panel is TradingView context shown beside an asset, not FOLDMARK's price. The panel keeps REFERENCE and ONCHAIN in separate tabs for that reason.",
    shortAnswer:
      "Dashboard reads market state as a whole — reference market, capital flow, network activity and structure — each panel with its own data state.",
    followups: ["pricing.reference_market", "pricing.tradingview", "data.states", "navigation.what_am_i_looking_at"],
    actions: [{ label: "OPEN DASHBOARD", href: "/dashboard" }],
    entities: ["DASHBOARD"],
    routes: ["/dashboard", "/"],
  },

  {
    id: "navigation.open_docs",
    domain: "navigation",
    title: "Documentation",
    patterns: [
      "open the docs",
      "where are the docs",
      "show me the documentation",
      "go to docs",
      "read the documentation",
      "docs page",
      "where do i read about this",
      "is there written documentation",
    ],
    keywords: ["docs", "documentation", "reference", "reading", "written", "guide"],
    answer:
      "Docs is the written record: an overview of what FOLDMARK is and is not, getting started, core concepts, stock tokens, data sources, methodology, flow classification, the API reference, agents, architecture, security, status, limitations and the changelog.\n\nTwo pages are worth knowing by name. Flow classification explains why UNCLASSIFIED is a feature rather than a gap. Limitations states what is missing and what is planned, rather than leaving either implied.",
    shortAnswer:
      "Docs holds the written record — concepts, data sources, methodology, flow classification, API reference, architecture, security, status and limitations.",
    followups: [
      "navigation.open_methodology",
      "navigation.api_reference",
      "core.what_is_foldmark",
      "core.what_foldmark_is_not",
    ],
    actions: [
      { label: "OPEN DOCS", href: "/docs" },
      { label: "OPEN GETTING STARTED", href: "/docs/getting-started" },
    ],
    routes: ["/docs"],
  },

  {
    id: "navigation.open_methodology",
    domain: "navigation",
    title: "Methodology",
    patterns: [
      "open the methodology",
      "where is the methodology",
      "how are the numbers computed",
      "show me the methodology",
      "methodology page",
      "how is this calculated",
      "read the methodology",
    ],
    keywords: ["methodology", "computed", "calculation", "limits", "definitions", "open"],
    answer:
      "Methodology states how every figure FOLDMARK publishes is computed and exactly where it stops being reliable: definitions, the six data states, observation windows, what the index currently holds, and the rule that FOLDMARK observes rather than predicts.\n\nIt lives inside the documentation set at /docs/methodology. The older /methodology route permanently redirects there.",
    shortAnswer:
      "Methodology gives the definitions, data states, windows and computation rules behind every published figure, at /docs/methodology.",
    followups: [
      "methodology.evidence_ladder",
      "methodology.unknown_stays_unknown",
      "methodology.no_inference_from_behaviour",
      "data.states",
    ],
    actions: [
      { label: "OPEN METHODOLOGY", href: "/docs/methodology" },
      { label: "OPEN FLOW CLASSIFICATION", href: "/docs/flow-classification" },
    ],
    routes: ["/docs", "/methodology"],
  },

  {
    id: "navigation.open_developers",
    domain: "navigation",
    title: "Developers — the machine layer",
    patterns: [
      "open developers",
      "go to the developers page",
      "is there an api",
      "can i get this as json",
      "developer page",
      "machine readable data",
      "how do i integrate foldmark",
      "show me the machine layer",
    ],
    keywords: ["developers", "api", "json", "machine", "integrate", "structured"],
    answer:
      "Developers is the machine layer: the same market context the interface shows, served as structured JSON with explicit data states. A response carries the state and the provenance alongside the value, so a consumer can tell a measured figure from an absent one without inferring it.\n\nThe endpoint-by-endpoint reference lives under Docs, and the agents guide covers consuming FOLDMARK as structured context rather than as a page to scrape.",
    shortAnswer:
      "Developers is the machine layer — the same context as the interface, as JSON with explicit data states and provenance.",
    followups: ["navigation.api_reference", "data.provenance", "data.states"],
    actions: [
      { label: "OPEN DEVELOPERS", href: "/developers" },
      { label: "OPEN API REFERENCE", href: "/docs/api" },
    ],
    routes: ["/developers"],
  },

  {
    id: "navigation.api_reference",
    domain: "navigation",
    title: "Where the API reference is",
    patterns: [
      "where is the api reference",
      "what endpoints are there",
      "list the api endpoints",
      "api documentation",
      "how do i call the api",
      "what does the api return",
      "where are the api docs",
    ],
    keywords: ["api", "endpoints", "reference", "curl", "v1", "docs"],
    answer:
      "The API reference is at /docs/api. It documents every route under /api/v1 with its parameters, responses, errors, freshness and a worked example.\n\nThe surfaces of the product each have an endpoint behind them: network, assets and a single asset, its candles and its flows, wallets, flows, fabric, protocols, events, search, market data for one contract, asset context, and provider status.\n\nEvery response reports a data state rather than substituting a plausible value, which is the same contract the interface follows. The agents guide at /docs/agents covers how an autonomous consumer should read those states and their provenance.",
    shortAnswer:
      "The endpoint reference is at /docs/api, covering every /api/v1 route with parameters, responses, errors and examples.",
    followups: ["navigation.open_developers", "data.provenance", "data.states", "navigation.open_docs"],
    actions: [
      { label: "OPEN API REFERENCE", href: "/docs/api" },
      { label: "OPEN AGENTS GUIDE", href: "/docs/agents" },
    ],
    routes: ["/developers", "/docs"],
  },

  {
    id: "navigation.search",
    domain: "navigation",
    title: "Searching the index",
    patterns: [
      "how do i search",
      "where is search",
      "search the index",
      "find an asset",
      "look up a contract",
      "search page",
      "how do i find a token",
    ],
    keywords: ["search", "find", "lookup", "query", "index", "contract"],
    answer:
      "Search queries indexed assets, observed wallets, protocols and contracts, returning each group separately with its own data state so an empty group is distinguishable from a group that has not been indexed.\n\nAn address is the precise query. Because identity is contract address plus chain rather than ticker, a symbol may match more than one contract, or none, and a name match is never treated as identification.",
    shortAnswer:
      "Search covers assets, wallets, protocols and contracts, each group carrying its own data state. An address is the precise query; a symbol is not identification.",
    followups: ["assets.identity", "navigation.open_assets", "wallets.address_vs_wallet"],
    actions: [{ label: "OPEN SEARCH", href: "/search" }],
    routes: ["/search"],
  },

  {
    id: "navigation.routes_overview",
    domain: "navigation",
    title: "The route map",
    patterns: [
      "what pages are there",
      "list the pages",
      "what routes exist",
      "show me all the sections",
      "site map",
      "where can i go",
      "what are the main surfaces",
      "how is the product organised",
    ],
    keywords: ["routes", "pages", "sections", "sitemap", "surfaces", "navigation"],
    answer:
      "Market surfaces: / is the overview, /dashboard reads market state as a whole, /fabric draws the topology, /flows ranks capital movement.\n\nEntity surfaces: /assets is the registry and /assets/[contract] a single asset, /wallets is the address explorer and /wallet/[address] a single address, /protocols lists protocol infrastructure and /protocol/[id] opens one. /search queries all four kinds at once.\n\nRecord surfaces: /docs is the written documentation, with methodology, flow classification, data sources, concepts, stock tokens, architecture, security, status, limitations, the changelog, the API reference and the agents guide beneath it. /developers is the machine layer.",
    shortAnswer:
      "Market surfaces are /, /dashboard, /fabric and /flows; entity surfaces are /assets, /wallets, /protocols and /search; the record lives under /docs and /developers.",
    detail:
      "The documentation set is grouped rather than flat. Start holds the overview and getting started. Concepts holds core concepts and stock tokens. Data holds data sources, methodology and flow classification. Build holds the API reference and the agents guide. System holds architecture, security and privacy, status, limitations and roadmap, and the changelog.\n\nTwo older paths are kept working as permanent redirects rather than dropped: /methodology resolves to /docs/methodology, where methodology lives inside the documentation set, and a single asset under /asset resolves to the canonical passport route under /assets.\n\nFabric and Flows are the two surfaces whose contents depend on query parameters, so their routes are only half the description of what is on screen. The window and filter chips complete it, and both are in the URL.",
    followups: ["navigation.what_am_i_looking_at", "navigation.help", "core.what_is_foldmark"],
    actions: [
      { label: "OPEN DASHBOARD", href: "/dashboard" },
      { label: "OPEN FABRIC", href: "/fabric" },
      { label: "OPEN FLOWS", href: "/flows" },
      { label: "OPEN DOCS", href: "/docs" },
    ],
  },

  {
    id: "navigation.share_a_view",
    domain: "navigation",
    title: "Sharing a view",
    patterns: [
      "how do i share this view",
      "can i link to this filter",
      "is this url shareable",
      "share this page",
      "bookmark this view",
      "will the filter survive a reload",
      "does the link keep my filters",
    ],
    keywords: ["share", "url", "link", "bookmark", "permalink", "reload"],
    answer:
      "Copying the address bar shares exactly what is on screen. Window and filter state are held in the query string rather than in client memory, so the link reproduces the sender's view rather than the recipient's defaults.\n\nThe same view survives a reload and renders identically on the server, which also means the filters work without JavaScript: the chips are links.\n\nIf a shared link carries a value the product no longer recognises, that dimension reads as ALL and the window falls back to 24H. A stale link degrades to a wider view, never to an empty one that could be mistaken for a measurement of nothing.",
    shortAnswer:
      "Window and filter state live in the URL, so copying the address bar shares the exact view; a stale value widens the view rather than emptying it.",
    followups: ["navigation.active_filters", "navigation.selected_window", "fabric.filters"],
    actions: [
      { label: "OPEN FABRIC", href: "/fabric" },
      { label: "OPEN FLOWS", href: "/flows" },
    ],
    routes: ["/fabric", "/flows"],
  },

  {
    id: "navigation.status_of_this_view",
    domain: "navigation",
    title: "Status and freshness",
    patterns: [
      "is the data live",
      "what does status show",
      "where do i check system status",
      "status page",
      "is anything down",
      "how fresh is this data",
      "why does it say indexing",
      "what does data unavailable mean here",
    ],
    keywords: ["status", "health", "dependencies", "live", "freshness", "stale", "indexing"],
    answer:
      "There are two different questions here, and FOLDMARK answers them in two places. The state tag on a panel is the local answer: LIVE, PARTIAL DATA, STALE, NO ACTIVITY, INDEXING or DATA UNAVAILABLE, describing that panel and that window. The Status page under Docs is the system answer: the health of every dependency behind the product.\n\nNO ACTIVITY is a measurement — the query succeeded and nothing was observed. INDEXING and DATA UNAVAILABLE are not measurements: the pipeline has not reached the entity, or the source is down or unconfigured. They must never be read as the same claim.\n\nA reader-facing label may render an unavailable source as a pending state, but the machine value stays UNAVAILABLE in the API and in every internal decision.",
    shortAnswer:
      "A panel's state tag answers for that panel and window; /docs/status answers for the dependencies behind the product.",
    detail:
      "The six states are exact. OK is measured and fresh. PARTIAL is measured, but the window is not fully indexed. STALE is measured, but older than the freshness budget. EMPTY is a successful query that observed nothing. INDEXING means the pipeline has not reached this entity. UNAVAILABLE means the source is down or unconfigured. Their display labels are LIVE, PARTIAL DATA, STALE, NO ACTIVITY, INDEXING and DATA UNAVAILABLE.\n\nA measured value travels with more than the number: the state, the observation time, and the provenance naming the source and method. That is what lets a panel be honest about a figure it is showing, and lets a consumer of the API make the same judgement without guessing.\n\nThe rule beneath all of it is that a number reaches the screen only when it was derived from indexed chain data. Everything else resolves to a state, never a plausible-looking value.",
    followups: ["data.states", "data.empty_vs_indexing", "data.freshness", "data.provenance"],
    actions: [
      { label: "OPEN STATUS", href: "/docs/status" },
      { label: "OPEN DATA SOURCES", href: "/docs/data-sources" },
    ],
  },

  {
    id: "navigation.clear_session",
    domain: "navigation",
    title: "Clearing the session",
    patterns: [
      "how do i clear this",
      "clear the session",
      "what does clear do",
      "reset the guide",
      "start over",
      "does it remember what i asked",
      "is my conversation stored",
    ],
    keywords: ["clear", "reset", "session", "memory", "history", "tab"],
    answer:
      "/clear discards the session context. That context is deliberately small: the last intent, the last domain and the last entities referred to. It exists so a follow-up like the other direction resolves against what you just asked, not so a transcript accumulates.\n\nIt is scoped to the tab and gone when the tab closes. Clearing it changes nothing about the page you are on — the window, the filters and the route are held in the URL, not in the session.",
    shortAnswer:
      "/clear discards the session context — the last intent, domain and entities. It is tab-scoped, gone when the tab closes, and does not change the page.",
    followups: ["navigation.help", "core.are_you_ai"],
    actions: [{ label: "OPEN DOCS", href: "/docs" }],
  },
];
