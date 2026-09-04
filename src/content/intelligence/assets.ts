import type { Entry } from "@/lib/intelligence/types";

/**
 * FOLDMARK Intelligence — the assets domain.
 *
 * Everything a reader can ask about an asset: what makes a token contract an
 * asset here, why identity is the contract address rather than the ticker, the
 * four asset types and their canonical labels, what the asset passport reports
 * and what it deliberately withholds, and how the registry, the activity
 * matrix, the counterparty ledger and the asset graph should be read.
 *
 * Every answer below states what FOLDMARK defines or what a page renders. None
 * of them reports an observation: no database is connected in this deployment,
 * so no figure in this domain is quoted as measured, and nothing is described
 * as verified.
 */
export const ASSETS_ENTRIES: Entry[] = [
  {
    id: "assets.what_is",
    domain: "assets",
    title: "What an asset is in FOLDMARK",
    patterns: [
      "what is an asset",
      "what counts as an asset in foldmark",
      "asset definition",
      "how does a token become an asset",
      "when does an asset enter the registry",
      "are assets seeded or discovered",
      "asset",
      "explain assets",
    ],
    keywords: ["asset", "token", "contract", "erc20", "transfer", "registry", "indexed"],
    answer:
      "An asset is a token contract the indexer has registered after observing an ERC-20 Transfer log for it on Robinhood Chain. Observation is the first condition but not the only one: the contract must also answer symbol() and name() when it is read on chain, and the single discovery rule wired today registers a contract only when its own name() carries the Robinhood Token marker.\n\nNo asset is seeded. There is no starting list, no import and no manual entry. A contract that has never emitted a Transfer the indexer reached is simply absent from the registry, and its absence is a statement about the index rather than about the contract.\n\nOnce a contract is registered, FOLDMARK reads its identity from the contract itself — symbol, name and decimals — and records where that identity came from. Everything else on an asset page is folded from the transfer rows the indexer wrote.",
    shortAnswer:
      "An asset is a token contract the indexer registered after observing an ERC-20 Transfer for it on Robinhood Chain. Nothing is seeded, and the only discovery rule wired today registers a contract whose own name() carries the Robinhood Token marker.",
    detail:
      "The assets table keys identity on chain id plus contract address and carries symbol, name, asset type, decimals, a verification status and a provenance string. Registration happens during an indexer pass: an untracked contract seen in a Transfer log is read directly on chain, a contract that does not answer symbol() and name() is not registered, and among those that do answer, only a name carrying the Robinhood Token marker is registered today.\n\nThis is why the registry can hold no rows while the chain head keeps advancing. An empty registry means the pipeline has not written rows, not that the chain holds no tokens. FOLDMARK reports that as a state rather than filling the table with plausible rows.",
    followups: ["assets.identity", "assets.asset_types", "assets.index", "data.empty_vs_indexing"],
    actions: [{ label: "OPEN ASSETS", href: "/assets" }],
    entities: ["ASSET"],
    routes: ["/assets"],
  },

  {
    id: "assets.identity",
    domain: "assets",
    title: "Contract identity outranks the ticker",
    patterns: [
      "what identifies an asset",
      "is the ticker the identity",
      "why does foldmark use the contract address",
      "contract address vs symbol",
      "asset identity",
      "how are assets keyed",
      "why address instead of ticker",
      "identity of an asset",
    ],
    keywords: ["identity", "address", "contract", "ticker", "symbol", "chain", "key"],
    answer:
      "Identity is the pair of chain and contract address. A symbol is a label the contract chose to return and carries no identity claim.\n\nThe database enforces this: the assets table has a unique constraint on chain id plus contract address, so the same address on the same chain is one asset and nothing else can be. Two contracts returning the same ticker are two assets, correctly.\n\nSymbols still appear throughout the interface, because a reader needs something to read. They are shown for legibility and accepted as a convenience lookup in search. They are never the key.",
    shortAnswer:
      "An asset is identified by its contract address on a chain, never by its ticker. The symbol is a display label and a search convenience.",
    detail:
      "The asset passport route resolves an address. A path segment that is not a well-formed address does not resolve to a passport at all, rather than falling back to a symbol match and rendering whichever contract happened to claim that ticker first.\n\nThe same principle governs the reference market allowlist, which is keyed on chain id and contract address and takes no symbol as input. If a ticker could select a reference instrument, anyone able to deploy an ERC-20 could choose which financial instrument FOLDMARK charts beside their contract.",
    followups: ["assets.symbol_collision", "assets.what_is", "pricing.reference_market", "methodology.evidence_ladder"],
    entities: ["ASSET", "CONTRACT_ADDRESS"],
    routes: ["/assets"],
  },

  {
    id: "assets.asset_types",
    domain: "assets",
    title: "The four asset types",
    patterns: [
      "what are the asset types",
      "asset type",
      "what types of asset are there",
      "stock token crypto stablecoin other",
      "what does the type column mean",
      "asset_type values",
      "explain asset types",
      "what are the type chips on the assets page",
    ],
    keywords: ["type", "types", "stock_token", "crypto", "stablecoin", "other", "label"],
    answer:
      "FOLDMARK defines exactly four asset types: stock_token, crypto, stablecoin and other. Their display labels are STOCK TOKEN, CRYPTO, STABLECOIN and OTHER.\n\nThe type filter chips on the asset registry are these four values plus ALL. A type is a classification of the contract, not a claim about who issued it and not a verification.\n\nThe canonical label for stock_token is STOCK TOKEN. FOLDMARK does not use the phrases tokenized stock or tokenized equity anywhere — not in the interface, not in API responses, not in documentation.",
    shortAnswer:
      "Four types: stock_token, crypto, stablecoin, other — labelled STOCK TOKEN, CRYPTO, STABLECOIN, OTHER. The canonical label for stock_token is STOCK TOKEN, and no paraphrase of it is used.",
    detail:
      "The type set is a closed enumeration in the configuration and is mirrored by a check constraint on the assets table, so a row cannot carry a type outside it. The column default is other, which is the honest resting place for a contract registered without matching a narrower rule.\n\nThree of the four are vocabulary rather than assignments today. The only registration path wired writes stock_token, so crypto, stablecoin and other are declared and filterable but currently unwritten, and their chips select nothing until something registers a row under them.\n\nA type chip carries a count only when the registry query actually answered. An empty list because the index holds nothing is a real zero; an empty list because the query could not run is not, and both arrive at the page as zero rows. Rather than print a zero in the second case, the chip carries no count until the registry is readable.",
    followups: ["assets.stock_token", "assets.index", "assets.filters", "data.states"],
    actions: [{ label: "OPEN ASSETS", href: "/assets" }],
    entities: ["ASSET_TYPE", "STOCK_TOKEN", "STABLECOIN"],
    routes: ["/assets"],
  },

  {
    id: "assets.stock_token",
    domain: "assets",
    title: "What a Stock Token is",
    patterns: [
      "what is a stock token",
      "stock token",
      "how is a stock token identified",
      "are these tokenized stocks",
      "why not call them tokenized equities",
      "how do you know a contract is a stock token",
      "robinhood stock token",
      "explain stock tokens",
    ],
    keywords: ["stock", "token", "stock_token", "robinhood", "name", "marker", "tokenized"],
    answer:
      "A Stock Token is an asset whose canonical on-chain name identifies it as a Robinhood Stock Token. The classification comes from the contract's own name(), read directly on chain during indexing.\n\nThe symbol is never the trigger. A contract is registered as a Stock Token only when its name contains the canonical Robinhood Token marker; a matching ticker on its own does nothing.\n\nSTOCK TOKEN is the canonical label, and no paraphrase of it is used in the interface, in API responses or in documentation. That is a naming rule rather than a legal opinion — FOLDMARK is an independent analytics application and is not affiliated with, endorsed by or operated by Robinhood Markets, Inc.",
    shortAnswer:
      "A Stock Token is an asset whose own on-chain name carries the canonical Robinhood Token marker. It is never identified from a symbol, and the canonical label is never paraphrased.",
    detail:
      "During a pass, an untracked contract seen in a Transfer log is read on chain for symbol() and name(). A contract that does not answer both is not registered at all, and a contract that answers but whose name lacks the marker is not registered either — the Stock Token rule is the only discovery rule wired. decimals() is read after the marker matches, and falls back to the schema default of eighteen when the call does not answer.\n\nA contract that does match is inserted with a verification status of CANDIDATE, a verification source recorded as an on-chain metadata heuristic, and evidence stating plainly that string similarity is not proof of issuer. It is never inserted as VERIFIED. Rediscovery of an already-registered address does nothing rather than updating the row, so a later pass can never demote an asset that had earned a stronger status.\n\nCorporate-action handling — splits, multipliers, dividends — is not implemented, so no field on a Stock Token claims to account for it.",
    followups: [
      "assets.symbol_collision",
      "assets.verification_status",
      "assets.asset_types",
      "pricing.reference_market",
    ],
    actions: [{ label: "OPEN STOCK TOKENS", href: "/docs/stock-tokens" }],
    entities: ["STOCK_TOKEN"],
    routes: ["/assets", "/docs/stock-tokens"],
  },

  {
    id: "assets.symbol_collision",
    domain: "assets",
    title: "Why symbol collisions are dangerous",
    patterns: [
      "why is a symbol not enough",
      "why are tickers dangerous",
      "symbol collision",
      "can two contracts have the same ticker",
      "what stops a fake token from being matched",
      "why not match on ticker",
      "lookalike contract",
      "why does the symbol not identify an asset",
    ],
    keywords: ["symbol", "ticker", "collision", "lookalike", "spoof", "impersonation", "identity"],
    answer:
      "A ticker is not a unique key on a public chain. Anyone can deploy a contract whose symbol() returns a well-known ticker, and nothing prevents two unrelated contracts from returning the same one.\n\nThat makes a symbol attacker-controlled. A lookalike contract is trivially deployable, symbols carry no issuer information, and a collision is indistinguishable from a legitimate match if the symbol is all you compare.\n\nSo FOLDMARK addresses every asset by its contract address throughout the product and the API. A symbol is displayed for readability and accepted as a convenience lookup; it never establishes that a contract is canonical.",
    shortAnswer:
      "Tickers are attacker-controlled, collide freely and carry no issuer information, so a symbol match can never establish identity. The contract address is the only durable key.",
    detail:
      "The consequence is visible in the reference market design. The mapping from a contract to a charted instrument is an allowlist keyed on chain id and contract address and nothing else. Were a ticker enough, deploying a contract named after a real company would render that company's price history beside an unrelated address, lending it a market it has no relationship to.\n\nThe same reasoning shapes the verification ladder. A ticker or a name is never sufficient evidence for VERIFIED; only an authoritative source confirming the exact contract address on the exact chain would be.",
    followups: ["assets.identity", "assets.nothing_verified", "pricing.reference_market", "methodology.evidence_ladder"],
    entities: ["SYMBOL", "CONTRACT_ADDRESS"],
    routes: ["/assets"],
  },

  {
    id: "assets.passport",
    domain: "assets",
    title: "The asset passport",
    patterns: [
      "what is the asset passport",
      "asset passport",
      "what is on an asset page",
      "what does the asset detail page show",
      "explain the asset passport",
      "what am i looking at on this asset page",
      "what does a passport contain",
      "asset page sections",
    ],
    keywords: ["passport", "asset", "page", "detail", "sections", "matrix", "tape"],
    answer:
      "The asset passport is the page for one contract. It opens with the symbol, the name, the asset type and a verification tag, followed by a single mode line saying whether anything has been observed for this contract at all.\n\nBelow that a status tape carries price, then transfers, gross volume and counterparties over 24H, the chain head, how far the index has reached, the token's decimals and when the index was last updated. Then a matrix reports transfers, gross volume and counterparties across all five windows, with a panel naming the metrics withheld from it and why.\n\nThe lower half holds the asset graph over 7D, the counterparty ledger over 7D, the full contract address with an explorer link, and a data sources panel naming where each figure would come from.",
    shortAnswer:
      "The passport is the page for a single contract: identity and mode, a status tape, an activity matrix across windows, the asset graph, the counterparty ledger, the contract and its data sources.",
    detail:
      "Two design rules govern the whole page. The first is that state is said once: the mode line at the top states whether the page is reporting observations, reporting a measured absence, or waiting on the index, and individual cells then hold an em dash rather than each repeating the same caption.\n\nThe second is that an em dash never means zero. A dash is a slot with no measurement in it. Where the index answered and genuinely recorded nothing, the page says so in words rather than printing a zero that would read as a measurement of an idle market.\n\nThe figure caption under the asset graph follows the same rule: it counts nodes, relationships and transfers only when there are nodes to count, because a caption reading zero nodes from zero transfers asserts an empty market rather than an empty index.",
    followups: ["assets.activity", "assets.graph", "assets.withheld", "navigation.what_am_i_looking_at"],
    actions: [{ label: "OPEN ASSETS", href: "/assets" }],
    entities: ["ASSET_PASSPORT"],
    routes: ["/assets"],
  },

  {
    id: "assets.index",
    domain: "assets",
    title: "What the asset registry lists",
    patterns: [
      "what does the assets page list",
      "what is the asset registry",
      "what is on the assets index",
      "assets page",
      "what are the columns on the assets table",
      "why is the assets table empty",
      "asset registry",
      "what does the assets list show",
    ],
    keywords: ["registry", "index", "list", "table", "columns", "assets", "ledger"],
    answer:
      "The registry lists every asset the index has observed, one row per contract. Its columns are ASSET, TYPE, PRICE, TRANSFERS, GROSS VOLUME, COUNTERPARTIES, LAST SEEN and CONTRACT, with the three activity columns computed over the selected window.\n\nAbove the table sit a search across symbol, name and contract address, the type chips, a sort control and the window chips. The state tag beside the title reports whether the registry query answered.\n\nWhen the registry holds no rows, the table keeps its search, filters and headers and replaces the body with a description of what a row carries once a contract is observed — price, flow, liquidity, relationships and markets. Nothing in that body is an asset: no symbol, no address, no figure, because a placeholder row would be an invented asset however it were styled.",
    shortAnswer:
      "The registry lists every observed contract with its type, price, activity over the selected window and its address. With no rows it keeps its controls and explains what a row carries, rather than inventing one.",
    detail:
      "Two lines at the foot of the empty registry are real regardless of the database: the source line stating that no asset is listed until a transfer is observed, and the chain head, which is read over RPC on the request and owes nothing to the index. That is the difference between a product that is listening and one that is broken.\n\nWhen the registry has rows but the activity window has not been measured, a single band above the table says so once, and the three activity columns hold an em dash for every row instead of stamping a status caption into each cell.",
    followups: ["assets.reading_a_row", "assets.filters", "assets.activity", "data.empty_vs_indexing"],
    actions: [{ label: "OPEN ASSETS", href: "/assets" }],
    entities: ["ASSET_REGISTRY"],
    routes: ["/assets"],
  },

  {
    id: "assets.reading_a_row",
    domain: "assets",
    title: "How to read an asset row",
    patterns: [
      "how do i read an asset row",
      "what do the columns mean",
      "what does no feed mean",
      "what does the dash in the table mean",
      "why does a row say none",
      "what is the difference between none and a dash",
      "how to read the assets table",
      "what does last seen mean",
    ],
    keywords: ["row", "column", "dash", "none", "feed", "read", "sparkline"],
    answer:
      "The left cell carries the symbol above the contract's name, and the row links to that asset's passport. TYPE is one of the four asset types. PRICE is the most recent stored price observation, and reads NO FEED where none exists.\n\nTRANSFERS counts Transfer logs for the contract inside the window, with a sparkline of the transfer rate beside it when there is activity to draw. GROSS VOLUME sums transfer amounts in token units — it is not a net flow and not a dollar value. COUNTERPARTIES counts distinct addresses appearing as sender or recipient, which is not a holder count.\n\nTwo absences mean different things. NONE is a measurement: the window was queried and held nothing. An em dash is a value that was not observed. The two are never interchanged, and neither is a zero.",
    shortAnswer:
      "Symbol and name link to the passport; type, price and three window-scoped activity figures follow. NONE means the window was queried and held nothing; an em dash means nothing was measured.",
    detail:
      "LAST SEEN is the time of the most recent observed transfer for that contract, rendered relative to the request time so the server and the client agree. CONTRACT is the address shortened for the row; the full address is on the passport with an explorer link.\n\nGROSS VOLUME deserves care because it is the figure most easily misread. It is a sum of amounts in one asset's own units. It is never added across assets, because one unit of one token plus one unit of another is not two of anything, and it is not converted to currency in this column.",
    followups: ["assets.gross_volume", "assets.activity", "assets.index", "data.states"],
    entities: ["ASSET_ROW", "GROSS_VOLUME"],
    routes: ["/assets"],
  },

  {
    id: "assets.filters",
    domain: "assets",
    title: "Filtering and sorting the registry",
    patterns: [
      "how do i filter assets",
      "what do the type chips do",
      "how do i sort the assets table",
      "what does the window chip change",
      "can i search by contract address",
      "asset filters",
      "why does my filter show nothing",
      "sort assets by volume",
    ],
    keywords: ["filter", "sort", "search", "window", "chips", "url", "query"],
    answer:
      "The registry takes four controls: a search over symbol, name and contract address; a type chip selecting one of the four asset types; a sort over ACTIVITY, VOLUME, COUNTERPARTIES or SYMBOL; and a window chip over 1H, 6H, 24H, 7D or 30D.\n\nThe window governs only the three activity columns. Changing it does not change which assets are listed — an asset is in the registry because it was observed at some point, not because it moved inside the selected window.\n\nFilter state lives in the URL, so a filtered view is shareable, survives a reload and renders the same on the server. A value the product does not recognise parses to nothing and reads as ALL, so a stale query string cannot produce an empty page that looks like a measurement of nothing.",
    shortAnswer:
      "Search, type, sort and window are the four controls, and all of them live in the URL. The window affects the activity columns, not which assets are listed.",
    followups: ["assets.index", "assets.asset_types", "assets.activity", "data.coverage"],
    actions: [{ label: "OPEN ASSETS", href: "/assets" }],
    entities: ["FILTER", "WINDOW"],
    routes: ["/assets"],
  },

  {
    id: "assets.activity",
    domain: "assets",
    title: "Asset activity",
    patterns: [
      "what is asset activity",
      "what does the activity matrix show",
      "observed across windows",
      "what is measured per window",
      "what activity does foldmark track for an asset",
      "asset activity",
      "what are the windows on the asset page",
      "explain the window matrix",
    ],
    keywords: ["activity", "matrix", "window", "transfers", "counterparties", "volume"],
    answer:
      "Activity for an asset is three figures: transfers, gross volume and counterparties, each computed over a trailing window. The passport reports all three across 1H, 6H, 24H, 7D and 30D in one matrix.\n\nEach column is an independent query over that window, folded at request time from indexed Transfer logs. Nothing is carried forward from a longer window into a shorter one.\n\nIn this matrix a column reads PARTIAL when the per-window row cap was hit, which makes every count in it a lower bound rather than a total. That is reported rather than smoothed away.",
    shortAnswer:
      "Transfers, gross volume and counterparties, computed independently over 1H, 6H, 24H, 7D and 30D from indexed Transfer logs at request time.",
    detail:
      "Transfers is a count of ERC-20 Transfer logs for the contract inside the window. Counterparties counts distinct addresses appearing as sender or recipient; it is not a holder count, which would require reconstructing balances over the full history rather than a window.\n\nA window can also be shorter than its label. The index holds what it has observed since it started following the chain, not the chain from genesis, so where FOLDMARK reports index coverage it marks a window whose unbroken reach is shorter than its label as PARTIAL and states the reach it actually has. A figure over a shorter span is a lower bound, not a total.",
    followups: ["assets.gross_volume", "assets.counterparties", "assets.passport", "data.coverage"],
    entities: ["ACTIVITY", "WINDOW"],
    routes: ["/assets"],
  },

  {
    id: "assets.gross_volume",
    domain: "assets",
    title: "Gross volume",
    patterns: [
      "what is gross volume",
      "gross volume",
      "is gross volume a dollar figure",
      "why is volume not in usd",
      "is volume net or gross",
      "what units is volume in",
      "explain gross volume",
      "why can i not compare volume across assets",
    ],
    keywords: ["volume", "gross", "units", "net", "usd", "notional", "amount"],
    answer:
      "Gross volume is the sum of transfer amounts for one asset inside a window, expressed in that token's own units. It is not a net figure and not a currency figure.\n\nIt is gross because both directions count. A transfer moves balance between holders; adding sends and receives together measures how much moved, not how much accumulated anywhere.\n\nIt is never added across assets. One unit of one token plus one unit of another is not two of anything, so any figure spanning several assets in FOLDMARK is a count — transfers, counterparties, assets touched — or a notional conversion done explicitly.",
    shortAnswer:
      "The sum of transfer amounts for one asset inside a window, in that token's own units. Not net, not a dollar value, and never summed across assets.",
    detail:
      "Converting to currency is a separate operation with its own rule. A notional total values every transfer at a price observed at or before that transfer and within fifteen minutes of it, never at the current quote. A transfer with no price inside that window contributes no notional rather than borrowing a later price, and the total is then reported as PARTIAL with the number of transfers priced against the number observed.\n\nNet flow is not published per asset at all. It is defined per address, because a transfer moves balance between holders without changing supply, so a net flow for a token contract would describe nothing.",
    followups: ["assets.activity", "assets.decimals", "assets.withheld", "pricing.price_types"],
    entities: ["GROSS_VOLUME", "NOTIONAL"],
    routes: ["/assets"],
  },

  {
    id: "assets.counterparties",
    domain: "assets",
    title: "Counterparties of an asset",
    patterns: [
      "what are counterparties",
      "what is the counterparty ledger",
      "what does counterparties count",
      "is counterparties the holder count",
      "what does net receiver mean",
      "counterparties of an asset",
      "who moved this asset",
      "explain the counterparty ledger",
    ],
    keywords: ["counterparty", "counterparties", "ledger", "addresses", "holders", "peers"],
    answer:
      "A counterparty of an asset is an address that appeared as the sender or the recipient of one of its transfers inside the window. The count is of distinct addresses, and it is not a holder count.\n\nThe passport's counterparty ledger lists those addresses over 7D with a direction, a transfer count, the amount received, the amount sent and how many peers each one traded with. Direction reads NET RECEIVER when inbound is at least outbound, NET SENDER otherwise.\n\nThese rows are addresses and are labelled as addresses. An address appearing in a ledger has not been established as an externally owned account, a venue or a protocol; being active says nothing about what it is.",
    shortAnswer:
      "Distinct addresses that sent or received the asset inside the window. It is not a holder count, and an address in the ledger carries no identity claim.",
    detail:
      "A holder count would require reconstructing balances across the full transfer history rather than a window, which this index does not hold, so it is withheld rather than approximated by a counterparty count.\n\nAn amount with no asset attached contributes no flow at all: a number without a unit cannot be added to one that has a unit. The received and sent columns are therefore folded only from transfers whose asset is known, while the transfer and peer counts include every row.\n\nEach ledger row links to that address's own page, where the same address is described from its side of the relationship.",
    followups: [
      "wallets.address_vs_wallet",
      "wallets.unknown_address",
      "assets.graph",
      "methodology.unknown_stays_unknown",
    ],
    entities: ["COUNTERPARTY"],
    routes: ["/assets"],
  },

  {
    id: "assets.graph",
    domain: "assets",
    title: "The asset graph",
    patterns: [
      "what is the asset graph",
      "asset graph",
      "what does the graph on the asset page show",
      "how is the asset graph built",
      "why is the asset in the middle",
      "what do the nodes on the asset page mean",
      "why is the asset graph empty",
      "explain the asset topology",
    ],
    keywords: ["graph", "topology", "nodes", "edges", "source", "destination", "relationships"],
    answer:
      "The asset graph on the passport is that one contract's transfers over 7D drawn as a network. It reads left to right: net senders on the left, the asset in the centre, net receivers on the right, so position itself carries meaning.\n\nEvery node exists because the indexer observed the address, and every edge exists because value actually moved along it. There is no synthetic hub, no decorative node and no random placement — the layout is a pure function of the ranked data, so it renders identically on the server and the client.\n\nThe view is capped rather than exhaustive: a limited number of addresses per side are drawn, and the figure reports what was drawn against what the window held. With no transfer of the asset observed in seven days there is no relationship to draw, and the figure says that rather than filling itself.",
    shortAnswer:
      "One contract's observed transfers over 7D, drawn as net senders to the left, the asset in the centre and net receivers to the right. Every node and edge comes from an observed transfer.",
    detail:
      "Edge weight is the amount moved along that edge in the asset's own units, and it is never comparable to an edge naming a different asset. Stroke intensity is derived from transfer count instead, because scaling a stroke by amount would let a token's decimals decide how loud its edges look.\n\nThis is the single-asset view. The Fabric surface draws the whole market instead, with its own role-aware layout, its own node classes and its own centrality rule.",
    followups: ["fabric.what_is", "fabric.nodes", "assets.counterparties", "fabric.measured_graph"],
    actions: [{ label: "OPEN FABRIC", href: "/fabric" }],
    entities: ["ASSET_GRAPH"],
    routes: ["/assets", "/fabric"],
  },

  {
    id: "assets.decimals",
    domain: "assets",
    title: "Decimals and base units",
    patterns: [
      "what are decimals",
      "why does the asset page show decimals",
      "what are base units",
      "how are token amounts converted",
      "decimals",
      "what does decimals mean for an asset",
      "why do decimals matter",
      "how is an amount scaled",
    ],
    keywords: ["decimals", "base", "units", "precision", "amount", "scaling", "conversion"],
    answer:
      "A token records amounts as integers in base units. Decimals is the exponent that turns a base-unit integer into the human-readable quantity, and it is read from the contract's own decimals() call at registration.\n\nTransfer amounts are stored as base-unit integers in an exact numeric column and are only scaled at the point of display or aggregation, using that asset's own decimals. Putting the raw amount through a floating-point number first would be exactly the precision loss the exact column exists to avoid.\n\nThe passport prints decimals in its status tape because it is a property of the contract, true regardless of how much has been observed.",
    shortAnswer:
      "Decimals is the contract's own scaling exponent, read from decimals(). Amounts are stored as exact base-unit integers and converted at that asset's precision.",
    detail:
      "Decimals differ between assets, and that is why two things in FOLDMARK are deliberately count-based rather than amount-based. Cross-asset rankings use counts, because amounts in different units cannot be ordered against each other. Graph stroke weight uses transfer count, because a stablecoin edge would otherwise overwhelm an equity edge purely because of how many decimal places each contract chose.\n\nWhere a contract does not answer decimals(), the schema default of eighteen applies. That default is a storage convention, not a measurement of the contract.",
    followups: ["assets.gross_volume", "assets.what_is", "fabric.edges", "methodology.evidence_ladder"],
    entities: ["DECIMALS", "BASE_UNITS"],
    routes: ["/assets"],
  },

  {
    id: "assets.verification_status",
    domain: "assets",
    title: "Asset verification status",
    patterns: [
      "what is verification status",
      "what does candidate mean",
      "observed candidate verified",
      "what are the verification states for an asset",
      "why is there a status and a boolean",
      "verification status",
      "what does unverified mean on an asset",
      "how does an asset get verified",
    ],
    keywords: ["verification", "status", "observed", "candidate", "verified", "unverified", "trigger"],
    answer:
      "An asset carries a verification status of exactly one of OBSERVED, CANDIDATE or VERIFIED, defaulting to OBSERVED. A boolean could not express these three states, which is why the column exists.\n\nOBSERVED means the contract emitted a Transfer and answered ERC-20 metadata. CANDIDATE means its metadata looks like a Robinhood Stock Token. VERIFIED would mean an authoritative source confirms this exact contract address on this chain.\n\nThere is also a verified boolean, but it is a mirror rather than a second opinion. A database trigger sets it from the status on every insert and update, so the two cannot drift and the claim has one source of truth.",
    shortAnswer:
      "OBSERVED, CANDIDATE or VERIFIED, defaulting to OBSERVED. The verified boolean is a trigger-maintained mirror of that status, never an independent claim.",
    detail:
      "Discovery writes CANDIDATE and stops there, recording the evidence as an on-chain metadata heuristic and stating that string similarity is not proof of issuer. It never writes VERIFIED and never sets the boolean directly.\n\nRediscovery of an already-registered address does nothing rather than overwriting the row. Without that, a later indexer pass would demote an asset that had earned a stronger status back to CANDIDATE — the kind of drift the trigger exists to prevent on the other side.",
    followups: [
      "assets.nothing_verified",
      "protocols.classification_pipeline",
      "assets.stock_token",
      "methodology.evidence_ladder",
    ],
    entities: ["VERIFICATION_STATUS", "CANDIDATE", "OBSERVED"],
    routes: ["/assets"],
  },

  {
    id: "assets.nothing_verified",
    domain: "assets",
    title: "Why no asset is verified today",
    patterns: [
      "is this asset verified",
      "why is nothing verified",
      "why does every asset say unverified",
      "why is the verified step dark",
      "what would verification require",
      "are any assets verified",
      "no verified assets",
      "why is verified unlit",
    ],
    keywords: ["verified", "unverified", "authoritative", "issuer", "dark", "unlit", "evidence"],
    answer:
      "No asset in FOLDMARK is verified. Verification requires an authoritative issuer source confirming the exact contract address on the exact chain, and no such source is wired to this deployment.\n\nThat is why the VERIFIED stage of the classification pipeline renders dark rather than lit, and why an asset's tag reads UNVERIFIED. The honest best state available today is CATEGORIZED.\n\nA ticker, a symbol, a token name or a plausible-looking metadata match is never sufficient evidence. Lighting the stage anyway would assert a confirmation nobody performed, which is the specific failure the status column was introduced to prevent.",
    shortAnswer:
      "Nothing is verified. No authoritative issuer source is wired, so the VERIFIED stage stays dark and assets read UNVERIFIED — which is the accurate state, not a defect.",
    detail:
      "A reference market mapping is sometimes mistaken for verification. It is not. A mapping records that someone noted this address is intended to track this instrument and that the reference chart is worth showing beside it. It never writes to the verification status, never sets the boolean and never promotes a candidate.\n\nThe evidence ladder behind this is explicit: observed, identified, categorized and verified are four different claims, and each step requires strictly more evidence than the one before. FOLDMARK stops at the step its evidence supports.",
    followups: ["assets.verification_status", "protocols.verified", "pricing.reference_market", "methodology.evidence_ladder"],
    actions: [{ label: "OPEN METHODOLOGY", href: "/methodology" }],
    entities: ["VERIFIED"],
    routes: ["/assets"],
  },

  {
    id: "assets.data_sources",
    domain: "assets",
    title: "Where asset data comes from",
    patterns: [
      "where does asset data come from",
      "what are the data sources for an asset",
      "how is asset data collected",
      "what feeds the asset page",
      "asset data sources",
      "where do the transfers come from",
      "is any of this from a third party",
      "what is the provenance of asset data",
    ],
    keywords: ["source", "sources", "provenance", "rpc", "logs", "indexer", "explorer"],
    answer:
      "Identity comes from the contract's own metadata, read on chain at registration, and the row records that provenance. Transfers come from Robinhood Chain RPC through the Transfer log topic. Block time comes from the block header, resolved per block.\n\nThe chain head is read over RPC on the request and is independent of the index, which is why it stays true on a page where every other figure is waiting. The explorer link points at Blockscout for the chain.\n\nThe reference chart is TradingView data for the underlying instrument. It is served by TradingView, is not on-chain, and never fills a canonical price, DEX spot, market state, notional or liquidity figure. The passport's data sources panel records that no oracle is wired to this chain, and where FOLDMARK holds no price for a contract the price cell holds an em dash rather than a number borrowed from somewhere else.",
    shortAnswer:
      "Identity from on-chain contract metadata, transfers from RPC Transfer logs, timestamps from block headers, chain head read live over RPC. TradingView supplies reference context only.",
    detail:
      "Every measured figure in FOLDMARK travels with its provenance — a source and, where it matters, the method — so a number can always be traced to how it was obtained. The passport's data sources panel is the reader-facing version of that record.\n\nThe indexing constraint worth knowing is that the free public endpoint serves logs for only a short trailing range of blocks and refuses older ranges as archive requests. A cursor that falls behind that range cannot be caught up, so the abandoned span is recorded as an explicit gap rather than the cursor advancing as though it had been read.",
    followups: ["data.provenance", "data.coverage", "pricing.tradingview", "assets.passport"],
    actions: [{ label: "OPEN DATA SOURCES", href: "/docs/data-sources" }],
    entities: ["PROVENANCE", "RPC"],
    routes: ["/assets"],
  },

  {
    id: "assets.liquidity_exposure",
    domain: "assets",
    title: "Liquidity exposure",
    patterns: [
      "what is liquidity exposure",
      "how much liquidity does this asset have",
      "why is liquidity blank",
      "what does pair reserve mean",
      "total reserve vs pair reserve",
      "liquidity",
      "is liquidity measured",
      "explain liquidity for an asset",
    ],
    keywords: ["liquidity", "reserve", "depth", "pool", "pair", "basis"],
    answer:
      "Liquidity in FOLDMARK means depth read from the pool itself, never inferred from activity. It is withheld on the asset passport because no DEX pool has been identified for the contract, so there is nothing to read it from.\n\nWhere a liquidity figure does exist, the basis travels with it and the interface never calls it simply liquidity. PAIR RESERVE is the reserve of the single pair that produced a quote. TOTAL RESERVE is the token's reserve summed across every pool a provider knows about — an upper bound on what could be traded, not the depth behind one quote.\n\nCollapsing those two into one number would label a whole-token figure as pool depth, which is why the basis is carried as a field rather than assumed.",
    shortAnswer:
      "Depth read from the pool that produced a quote. It is withheld here because no DEX pool is identified for the contract, and where it exists its basis — pair reserve or total reserve — is always stated.",
    detail:
      "Identifying a pool is a registry question, not an observation about volume. Until a contract is registered as a venue, an address that transacts heavily with an asset is still an unidentified address, and calling it a pool because it looks like one would be inferring identity from behaviour.\n\nThat is also why liquidity is a named line in the registry's not-yet-observed panel and in the passport's withheld panel, rather than a column or a matrix row of empty cells. A metric that cannot be measured for any window is a metric the product is withholding, not a row with missing values.",
    followups: ["assets.withheld", "protocols.registry", "pricing.dex_spot", "methodology.no_inference_from_behaviour"],
    entities: ["LIQUIDITY", "PAIR_RESERVE"],
    routes: ["/assets"],
  },

  {
    id: "assets.protocol_exposure",
    domain: "assets",
    title: "Protocol exposure",
    patterns: [
      "what is protocol exposure",
      "which protocols does this asset touch",
      "why is protocol exposure empty",
      "protocol exposure",
      "does this asset interact with any protocol",
      "why are no protocols shown for this asset",
      "explain protocol exposure",
      "asset protocol breakdown",
    ],
    keywords: ["protocol", "exposure", "registry", "classification", "venue", "withheld"],
    answer:
      "Protocol exposure would describe which registered protocols an asset moves through. It requires contract classification, and the protocols registry is empty, so it is withheld rather than estimated.\n\nNothing is promoted to a protocol by behaviour alone. An address that receives a great deal of an asset is an address that receives a great deal of an asset; volume is not evidence of what a contract is.\n\nWith no protocol identified, an asset's counterparties remain addresses and its flows remain unclassified. That is the correct outcome of the rules rather than a gap in the page.",
    shortAnswer:
      "Which registered protocols an asset moves through. The protocols registry is empty, so the metric is withheld rather than inferred from transaction shape or volume.",
    followups: ["protocols.registry", "protocols.categories", "flows.unclassified", "methodology.no_inference_from_behaviour"],
    actions: [{ label: "OPEN PROTOCOLS", href: "/protocols" }],
    entities: ["PROTOCOL_EXPOSURE"],
    routes: ["/assets", "/protocols"],
  },

  {
    id: "assets.withheld",
    domain: "assets",
    title: "What an asset page withholds",
    patterns: [
      "why is there no holder count",
      "what is missing from the asset page",
      "why are some metrics withheld",
      "what is not yet observed",
      "why no price on the asset page",
      "why is net flow not shown per asset",
      "withheld metrics",
      "what can foldmark not measure for an asset",
    ],
    keywords: ["withheld", "holders", "price", "markets", "net", "flow", "missing"],
    answer:
      "Five metrics are named and withheld rather than shown empty. Holders requires reconstructing balances from the full transfer history, not a window. Liquidity requires DEX pool contracts to be identified on this chain. Markets requires a venue registry, and none is verified here.\n\nProtocol exposure requires contract classification, and the protocols registry is empty. Net flow is not withheld for want of data at all — it is defined per address, because a transfer moves balance between holders without changing supply, so a net flow per token contract would describe nothing.\n\nPrice follows the same principle. No oracle is wired to this chain, so the registry's price column reads NO FEED rather than borrowing a number from somewhere adjacent.",
    shortAnswer:
      "Holders, liquidity, markets and protocol exposure are named and withheld until the evidence exists. Net flow is undefined per contract by design, and price has no oracle on this chain.",
    detail:
      "The design rule underneath is that FOLDMARK does not display a metric it cannot measure. A row of empty cells reads as a broken table; a named metric with a stated reason reads as a product that knows what it does not know.\n\nThis is also why the passport lifts price and liquidity out of its window matrix entirely. A metric that cannot be measured for any window is not a row with missing cells — drawing it as five em dashes would say the query ran and found nothing five times.",
    followups: [
      "assets.liquidity_exposure",
      "assets.protocol_exposure",
      "data.empty_vs_indexing",
      "methodology.unknown_stays_unknown",
    ],
    entities: ["WITHHELD", "HOLDERS"],
    routes: ["/assets"],
  },

  {
    id: "assets.not_indexed",
    domain: "assets",
    title: "A contract that is not in the index",
    patterns: [
      "why does this contract say not in the index",
      "this contract has not been observed",
      "why is my token missing",
      "asset not found",
      "why is this address not listed",
      "not in the index",
      "how do i get a contract indexed",
      "why is there no passport for this address",
    ],
    keywords: ["missing", "unobserved", "absent", "indexing", "notfound", "contract"],
    answer:
      "A contract is absent from the registry until it emits an ERC-20 Transfer that the indexer reaches. Its absence is a statement about the index, not about the contract.\n\nOpening a passport for such an address gives an INDEXING state, the address in full, an explanation of the entry condition and a link to inspect it on the chain explorer, along with the chain, the chain id and the current head block — which are true whether or not anything has been indexed.\n\nA reference chart appears there only if that exact address is in the reference market allowlist. An unmapped address gets no chart, because an arbitrary benchmark beside an unknown contract would invite precisely the association the allowlist exists to prevent.",
    shortAnswer:
      "The contract has not emitted a Transfer the indexer reached. That is a fact about the index rather than about the contract, and the page says so instead of returning nothing.",
    followups: ["assets.what_is", "data.empty_vs_indexing", "data.coverage", "pricing.reference_market"],
    entities: ["INDEXING"],
    routes: ["/assets"],
  },
];
