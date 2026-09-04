import type { Entry } from "@/lib/intelligence/types";

/**
 * FOLDMARK Intelligence — the wallets domain.
 *
 * Everything the product says about addresses: the difference between an
 * address and a wallet and why the distinction is enforced, what the /wallets
 * surface and the per-address passport actually read, how counterparty, asset
 * and protocol relationships are folded from Transfer logs, what direction
 * means on both the ledger and the topology, and the four figures a wallet
 * page deliberately withholds.
 *
 * The load-bearing entry is wallets.address_vs_wallet. Almost every other
 * refusal in this domain — no clustering, no retail or whale labels, no
 * attribution — is that one distinction applied to a different surface.
 */
export const WALLETS_ENTRIES: Entry[] = [
  {
    id: "wallets.address_vs_wallet",
    domain: "wallets",
    title: "Address versus wallet",
    patterns: [
      "what is the difference between an address and a wallet",
      "address vs wallet",
      "why do you say address instead of wallet",
      "is an address the same thing as a wallet",
      "why is it called an address",
      "what does address mean in foldmark",
      "why not just call it a wallet",
      "address or wallet",
    ],
    keywords: ["address", "wallet", "terminology", "naming", "identity", "eoa"],
    answer:
      "An address is 0x followed by 40 hexadecimal characters that appeared as the sender or the recipient of an ERC-20 Transfer log. That is a fact about the chain. A wallet is a claim about what sits behind that address — that it is an externally owned account with a key someone controls.\n\nFOLDMARK indexes the first and does not assert the second. On the topology a node the contracts registry has no entry for is given the class address, drawn as a square, and labelled ADDRESS. It is never promoted to wallet, retail or any other category on the strength of how it behaved, because the shape a node is drawn in is read as a fact about it.\n\nThe word wallet does still appear in the product. The surface is /wallets and each address opens a page under /wallet. There it means an address seen in a transfer and nothing more. It does not imply a human owner.",
    shortAnswer:
      "An address is the hexadecimal string observed in a Transfer log. A wallet is a claim about who or what controls it. FOLDMARK records the first and declines to assert the second.",
    detail:
      "The rule lives in classifyNode. An asset is an asset. Otherwise the address is looked up in the contracts registry: dex_pool becomes venue, lending_market becomes protocol, bridge becomes protocol, oracle becomes oracle, infrastructure becomes infrastructure, and anything the registry has no entry for stays address.\n\nSo address is the honest default rather than a residual bucket. It is not a claim that the address is an ordinary wallet — only that nothing has identified it as anything else. The registry is the only thing entitled to make that claim, so an address it has no entry for stays an address on every surface that draws it.\n\nWhere the product does write wallet, it is a route name and a page title. FOLDMARK never links an address to a name, an entity or a person, and viewing a wallet page requires no connection and no signature, so reading one reveals nothing about the reader to the address being read.",
    followups: [
      "wallets.unknown_address",
      "wallets.no_labels",
      "methodology.unknown_stays_unknown",
      "fabric.nodes",
    ],
    actions: [{ label: "OPEN WALLETS", href: "/wallets" }],
    entities: ["ADDRESS", "WALLET"],
    routes: ["/wallets", "/wallet"],
  },

  {
    id: "wallets.unknown_address",
    domain: "wallets",
    title: "An unidentified 0x address",
    patterns: [
      "what does an unknown address mean",
      "what is this 0x address",
      "who owns this address",
      "can you identify this address",
      "why is this address unlabelled",
      "whose wallet is this",
      "unknown address",
      "what do you know about this address",
    ],
    keywords: ["unknown", "unidentified", "owner", "attribution", "label", "0x"],
    answer:
      "An address with no registry entry is one FOLDMARK has observed and has not identified. The transfers it was party to are real. The identity behind it is not established, and nothing in a Transfer log establishes it.\n\nWhat will not be claimed about it: that it is a wallet, a DEX, a protocol, a bridge, an oracle or infrastructure. None of those follows from having moved tokens. FOLDMARK prefers unknown over incorrect, and unknown is not an error state.\n\nWhat is still shown: which addresses it transacted with, which assets moved, in which direction, and how often. Each of those is folded from the same transfer logs, so each is a measurement rather than an inference.",
    shortAnswer:
      "It is an address FOLDMARK observed and has not identified. Its transfers are shown; its identity is not asserted, and it is not called a wallet, a venue or a protocol.",
    detail:
      "Identification has exactly one source: the contracts registry, which maps an address to a counterparty kind of dex_pool, lending_market, bridge, oracle, infrastructure, or null. An address absent from that registry resolves to null and stays unidentified everywhere it appears — node class, protocol category and flow class alike.\n\nThe consequences of an absent entry are consistent rather than partial: the address stays unidentified, flows across it classify as UNCLASSIFIED, it counts toward no category chip, and the category and flow filters do not select it. That is the correct outcome of the rules, not a fault in them.\n\nThe alternative — reading identity off volume, transaction shape, counterparty count or a name — would produce a labelled map that is wrong in ways a reader cannot audit. An unidentified address stays unidentified until evidence identifies it.",
    followups: [
      "wallets.address_vs_wallet",
      "methodology.unknown_stays_unknown",
      "flows.unclassified",
      "protocols.registry",
    ],
    entities: ["ADDRESS", "UNCLASSIFIED"],
    routes: ["/wallets", "/wallet", "/fabric"],
  },

  {
    id: "wallets.surface",
    domain: "wallets",
    title: "The wallets surface",
    patterns: [
      "what does the wallets page show",
      "what is on the wallets surface",
      "explain the wallets page",
      "wallets page",
      "wallet explorer",
      "what am i looking at on the wallets page",
      "most active addresses",
    ],
    keywords: ["wallets", "surface", "ledger", "active", "explorer", "ranking"],
    answer:
      "The wallets surface opens with a lookup field, because the primary action is reading an address rather than browsing a list. Directly under it sits a strip of values that are true with no index attached: the chain id, the current head, the RPC endpoint, the round trip and the time the head was read.\n\nBelow that, MOST ACTIVE ranks addresses over a 24-hour window by transfers observed, with columns for ADDRESS, TRANSFERS, ASSETS, COUNTERPARTIES and LARGEST FLOW. The table spans every asset, which is why it carries no received or sent column: a received figure summed over several different tokens has no unit and no meaning. What is comparable across assets is counted, so counts are what the ranking uses.\n\nThe right column carries RECENTLY SEEN, ordered by last activity, and WHAT IS WITHHELD, which names the figures this surface declines to produce and the input each one is waiting on. Until a transfer has been observed there is nothing to rank or to list, so the ledger holds one designed empty state and the RECENTLY SEEN slot holds the rule that governs it: how an address earns a row.",
    shortAnswer:
      "A lookup field for any public address, a live chain strip, a 24-hour ranking of addresses by transfers observed, a recently-seen list, and the list of figures the surface withholds.",
    followups: ["wallets.lookup", "wallets.enters_index", "wallets.withheld", "wallets.passport"],
    actions: [{ label: "OPEN WALLETS", href: "/wallets" }],
    routes: ["/wallets"],
  },

  {
    id: "wallets.passport",
    domain: "wallets",
    title: "The wallet passport page",
    patterns: [
      "what is the wallet page",
      "wallet passport",
      "what does a wallet page show",
      "explain the wallet page",
      "what is on an address page",
      "wallet detail page",
      "what can i see about one address",
    ],
    keywords: ["passport", "wallet", "page", "address", "detail", "window"],
    answer:
      "A wallet passport is one address read as a position. The header carries the full address, the window chips, and a link out to the chain explorer. The window defaults to 7D here and can be set to 1H, 6H, 24H, 7D or 30D.\n\nThe band under the header summarises the address across assets in counts rather than amounts: received and sent as transfer counts, total transfers, distinct counterparties, and assets touched. NET FLOW reads PER ASSET and PORTFOLIO VALUE reads NO ORACLE, because neither is a figure this page can honestly produce as a single number.\n\nBelow it: ASSET EXPOSURE with received against sent per asset, an activity timeline bucketed across the window, the counterparty ledger, a one-hop neighbourhood figure, top relationships by transfer count, and a data condition block stating how everything above was folded.",
    shortAnswer:
      "One address read as a position: counts across assets, exposure per asset, an activity timeline, a counterparty ledger, a one-hop neighbourhood and the methodology that produced them.",
    detail:
      "Every figure on the page is folded at request time from transfers where the address appears as sender or recipient inside the selected window. Nothing is precomputed into a wallet-level total, and nothing is carried over from outside the window.\n\nAny syntactically valid address opens the page — 0x followed by 40 hexadecimal characters, lowercased before use — whether or not the indexer has reached it. That is deliberate: the lookup field is a chain-level action, so the page must exist before the index does. Anything that is not an address is refused rather than rendered as an empty reading.\n\nWhen nothing has been folded, the band does not repeat one waiting label six times. It carries what is true anyway — the chain, the chain head, the time that head was read, the window in force, and the two figures the product declines to produce — plus exactly one cell for the thing genuinely being waited on, which is the indexer cursor. The panels below keep their place and state what a row of each would hold, which is what separates a surface that has not started from one that failed.",
    followups: ["wallets.asset_exposure", "wallets.counterparties", "wallets.neighbourhood", "data.states"],
    routes: ["/wallet"],
  },

  {
    id: "wallets.lookup",
    domain: "wallets",
    title: "Looking up an address",
    patterns: [
      "how do i look up an address",
      "can i search for a wallet",
      "how do i inspect an address",
      "do i need to connect my wallet",
      "does foldmark need a wallet connection",
      "address lookup",
      "why was my address rejected",
    ],
    keywords: ["lookup", "search", "inspect", "connect", "signature", "validation"],
    answer:
      "Paste a public address into the lookup field and it opens that address as a page. The field accepts 0x followed by 40 hexadecimal characters; anything else is refused inline with the reason, rather than silently doing nothing.\n\nNo connection and no signature are required, and none is offered as a path to more data. A wallet page is read from public chain data, so viewing one reveals nothing about the reader to the address being viewed.\n\nAny address on the chain opens, including one the indexer has not reached. In that case the page states which window is in force and where the indexer cursor currently sits, and links out to the chain explorer for the full history.",
    shortAnswer:
      "Paste any public 0x address into the lookup field. No connection and no signature are required, and an address the index has not reached still opens.",
    followups: ["wallets.passport", "wallets.enters_index", "data.empty_vs_indexing", "wallets.address_vs_wallet"],
    actions: [{ label: "OPEN WALLETS", href: "/wallets" }],
    routes: ["/wallets", "/wallet"],
  },

  {
    id: "wallets.counterparties",
    domain: "wallets",
    title: "Counterparty relationships",
    patterns: [
      "what is a counterparty",
      "counterparty ledger",
      "what does counterparties mean",
      "who did this address trade with",
      "how are counterparties ranked",
      "explain the counterparty list",
      "top relationships",
      "what does mostly mean on a counterparty row",
    ],
    keywords: ["counterparty", "peer", "relationship", "ledger", "ranked", "trade"],
    answer:
      "A counterparty is the other side of a transfer. For every transfer inside the window where this address is sender or recipient, the address at the far end is recorded and its relationship accumulated.\n\nThe ledger ranks those relationships by transfer count, not by amount, because transfers are the one quantity comparable between assets. Each row carries the counterparty address, the direction of the relationship, how many transfers it holds, how many distinct assets it spans, and a MOSTLY column naming the single asset the relationship is largely made of with the amount quoted in that asset's own units.\n\nA relationship is a record of value moving between two addresses in a window. It is not a claim about intent, about coordination, or about who controls either end.",
    shortAnswer:
      "The addresses this one exchanged transfers with inside the window, ranked by transfer count, each with its direction, asset span and the single asset it is mostly made of.",
    detail:
      "The fold is direct: a transfer is inbound when its recipient is this address, and the counterparty is whichever side is not this address. Each counterparty accumulates a transfer count, an inbound count, and a per-asset breakdown of received against sent.\n\nRanking by transfers rather than by amount is the same rule the rest of the product uses. Ordering relationships by summed token amounts would put a stablecoin relationship above an equity one purely because of decimals, which is a claim about the market that comes from denomination rather than from behaviour. The MOSTLY column exists so magnitude keeps a unit: it names one asset and quotes the amount in that asset, never a cross-asset total.\n\nThe ledger shows the leading relationships rather than all of them, and the top-relationships panel beside it draws the strongest few as bars scaled against the heaviest. Both are views of the same fold over the same window.",
    followups: ["wallets.direction", "wallets.protocol_touchpoints", "wallets.asset_exposure", "wallets.neighbourhood"],
    entities: ["COUNTERPARTY"],
    routes: ["/wallet"],
  },

  {
    id: "wallets.direction",
    domain: "wallets",
    title: "Incoming and outgoing",
    patterns: [
      "what does sent to us mean",
      "what does we sent mean",
      "what does both ways mean",
      "what does the direction column mean",
      "incoming and outgoing edges",
      "how is direction decided",
      "what do received and sent mean on a wallet",
      "which way did the value go",
    ],
    keywords: ["direction", "incoming", "outgoing", "inbound", "outbound", "received", "sent"],
    answer:
      "Direction is read straight off the transfer. A transfer is incoming when this address is the recipient and outgoing when it is the sender. There is no interpretation step between the log and the label.\n\nOn the counterparty ledger the DIRECTION column reads SENT TO US when every transfer in the relationship arrived, WE SENT when every transfer left, and BOTH WAYS when the relationship contains some of each. On the neighbourhood figure the arrowhead sits at the receiving end of every edge, so direction is legible without reading a label.\n\nThe RECEIVED and SENT cells in the band above are transfer counts, not amounts. That line summarises the address across every asset it touched, and a count is the only thing that stays meaningful when several different tokens are involved.",
    shortAnswer:
      "Incoming means this address was the recipient, outgoing means it was the sender. The direction column reads SENT TO US, WE SENT or BOTH WAYS, and the band's received and sent cells are transfer counts.",
    detail:
      "Direction survives every level of the page unchanged. Per relationship it produces the DIRECTION column. Per asset it produces the received and sent pair drawn around a shared centre line, so the balance of the two is readable at a glance. Per edge on the topology it places the arrowhead.\n\nDirection is also what carries semantics into flow classification: the same pool and the same address produce a DEX_BUY or a DEX_SELL depending only on which way value went. Value into a pool is a sell; value leaving a pool toward the receiver is a buy. Nothing about the address itself decides that.\n\nWhat direction does not carry is intent. An outgoing transfer is a transfer that left. It is not a sale, a withdrawal or a decision, unless a registered counterparty on the other end makes it one.",
    followups: ["flows.direction", "wallets.counterparties", "wallets.net_sender_receiver", "flows.dex_buy"],
    routes: ["/wallet", "/wallets"],
  },

  {
    id: "wallets.asset_exposure",
    domain: "wallets",
    title: "Asset exposure",
    patterns: [
      "what is asset exposure",
      "asset exposure",
      "what does net mean on a wallet",
      "why are amounts not added up",
      "explain the exposure panel",
      "what does the flow bar show",
      "net per asset",
      "which assets did this address touch",
    ],
    keywords: ["exposure", "asset", "net", "units", "decimals", "flowbar"],
    answer:
      "Asset exposure is received against sent for every asset the address touched inside the window, with the net shown in that asset's own units at that asset's own decimals. Each row names the asset, its type, the two directions drawn around a shared centre line, and the transfer count behind it.\n\nNothing here is added across assets. Adding an address's movement in one token to its movement in another produces a headline number describing nothing that happened, so the product does not produce one. Rows are ordered by transfers instead, which is the one quantity comparable between assets.\n\nNet is movement inside the window. It is not a balance and it is not a position: an address can show a large positive net and hold nothing, if the window began after it received and ended before it sent.",
    shortAnswer:
      "Received against sent for each asset the address touched in the window, in that asset's own units. Amounts are never summed across assets, and net is movement, not a balance.",
    detail:
      "Amounts are converted from base units using each asset's own decimals, so a row is denominated in the token it names. That is what makes the row readable and also what makes cross-asset arithmetic invalid — the units are simply different.\n\nThe ordering rule follows from the same fact. Sorting by summed amount would rank a stablecoin above an equity token because of denomination rather than activity, so the panel sorts by transfer count and lets each row carry its own magnitude in its own unit.\n\nThe same principle governs the surface above: the wallets ledger carries no received or sent column at all, because that table spans every asset. Where it does quote an amount, in LARGEST FLOW, it names exactly one asset and quotes in that asset's units.",
    followups: ["wallets.balances", "assets.identity", "wallets.counterparties", "wallets.withheld"],
    routes: ["/wallet"],
  },

  {
    id: "wallets.protocol_touchpoints",
    domain: "wallets",
    title: "Protocol touchpoints",
    patterns: [
      "what are protocol touchpoints",
      "protocol touchpoints",
      "did this wallet use a protocol",
      "which protocols did this address touch",
      "protocol exposure",
      "how do you know a counterparty is a protocol",
      "why is protocol exposure unavailable",
    ],
    keywords: ["protocol", "touchpoints", "registry", "venue", "exposure", "matched"],
    answer:
      "Protocol touchpoints are the counterparties of an address matched against the contracts registry: which of them are registered contracts, and which remain unclassified because nothing identifies them.\n\nThe match has one input. An address is a venue, a lending protocol, a bridge, an oracle or infrastructure because the registry says so, never because of how it behaved. High transfer counts, many counterparties and a suggestive name are all insufficient.\n\nA counterparty the registry has no entry for is matched to no protocol, and the wallet API reports protocol exposure as unavailable rather than as none. Unavailable and none are different claims: one says the source cannot answer, the other says the source answered and found nothing.",
    shortAnswer:
      "The counterparties of an address matched against the contracts registry. With the registry empty, nothing is matched, and the surface reports that as unavailable rather than as zero.",
    followups: ["protocols.registry", "protocols.verified", "flows.unclassified", "wallets.unknown_address"],
    entities: ["UNCLASSIFIED"],
    routes: ["/wallet", "/protocols"],
  },

  {
    id: "wallets.neighbourhood",
    domain: "wallets",
    title: "The wallet neighbourhood",
    patterns: [
      "what is the neighbourhood graph",
      "wallet neighbourhood",
      "what does the graph on a wallet page show",
      "what does one hop mean",
      "why is the wallet graph empty",
      "topology on the wallet page",
      "why does it say architecture preview on a wallet page",
    ],
    keywords: ["neighbourhood", "graph", "topology", "hop", "preview", "figure"],
    answer:
      "The neighbourhood figure draws this address together with the addresses and assets one hop away from it, built from the same window of transfers as the rest of the page. Every node is there because a transfer named it and every edge is there because value moved along it.\n\nIt is capped rather than exhaustive: a limited number of addresses per side and a limited number of assets, with any node left holding no drawn edge removed, because an isolated dot says nothing. The caption states how many nodes and relationships are actually drawn.\n\nWhen the window holds no observed relationship, the figure falls back to the architecture preview and says so in its provenance line. Preview geometry represents how FOLDMARK organises market structure. It is not an observation of this address, and its placeholders are categories rather than addresses.",
    shortAnswer:
      "This address with the addresses and assets one hop from it, folded from the same window. With nothing observed it falls back to an architecture preview, which is labelled as not an observation.",
    followups: ["fabric.architecture_preview", "fabric.measured_graph", "wallets.net_sender_receiver", "fabric.edges"],
    actions: [{ label: "OPEN FABRIC", href: "/fabric" }],
    entities: ["FABRIC"],
    routes: ["/wallet", "/fabric"],
  },

  {
    id: "wallets.net_sender_receiver",
    domain: "wallets",
    title: "Net sender and net receiver",
    patterns: [
      "what is a net sender",
      "what is a net receiver",
      "net sender meaning",
      "net receiver meaning",
      "why is this address on the left",
      "why is this address on the right",
      "what do the lanes mean",
      "net sender vs net receiver",
    ],
    keywords: ["net", "sender", "receiver", "lane", "role", "position"],
    answer:
      "NET SENDER and NET RECEIVER are roles the fold assigns to an address inside the selected window. They are labels carried by a node rather than positions on the map: the topology places a node by what it is, on concentric rings — assets inner, venues and protocols around them, addresses on the rim — and states the role in the readout when the node is selected.\n\nThe role comes from one comparison. An address whose outgoing value exceeds its incoming value is recorded as a net sender; otherwise it is a net receiver, so an address with equal sides falls on the receiving one. Senders are ranked by what left them and receivers by what reached them, and those two rankings decide which addresses a capped view draws.\n\nNET SENDER and NET RECEIVER describe observed movement in a window. They are not profiles, they carry no claim about intent, and they are not balances — the same address can change role when the window changes.",
    shortAnswer:
      "A role assigned from one window: an address that sent more value than it received is a net sender, otherwise a net receiver. It is a label on the node rather than a position, and it describes movement, not intent.",
    detail:
      "Layout is a pure function of the graph, which is why the same map draws identically on the server and in the browser and twice in a row. Nodes are placed on concentric rings by class rather than in left and right lanes, and a node's angle comes from the weighted direction of the neighbours already placed, so it ends up beside what it actually transacts with. There is no force simulation, no jitter and no random placement.\n\nNode radius comes from observed activity and edge stroke comes from transfer count, not from token amount. Scaling a stroke by amount would let a stablecoin edge overwhelm an equity edge purely because its denomination is smaller — a visual claim about the market produced by decimals. Each edge still carries its own amount, in its own units, for the inspector.\n\nThe same vocabulary appears as a per-counterparty label on an asset passport, where a counterparty that received at least as much as it sent reads NET RECEIVER. In every case the term is scoped to the window in force and says nothing about what the address holds.",
    followups: ["wallets.direction", "fabric.edges", "fabric.centrality", "methodology.no_inference_from_behaviour"],
    entities: ["NET_SENDER", "NET_RECEIVER"],
    routes: ["/fabric", "/wallet", "/dashboard"],
  },

  {
    id: "wallets.no_clustering",
    domain: "wallets",
    title: "Why there is no wallet clustering",
    patterns: [
      "do you cluster wallets",
      "is there wallet clustering",
      "can you group addresses by owner",
      "do you link addresses to the same entity",
      "wallet cluster",
      "why is there no clustering",
      "can you tell if two addresses are the same person",
    ],
    keywords: ["clustering", "cluster", "grouping", "common", "control", "linking"],
    answer:
      "There is no wallet clustering in FOLDMARK. Addresses are not grouped into owners, entities or cohorts, and no two addresses are asserted to share control.\n\nClustering is an identity claim inferred from behaviour. It says these addresses are the same actor because they moved in similar ways — which is exactly the inference this product refuses everywhere else. A cluster is also uncorrectable in practice: once addresses are merged in a reader's mind, the flows attributed to the merged entity carry the error forward.\n\nThe architecture preview on the topology labels its placeholder WALLET rather than WALLET CLUSTER for the same reason. Previewing a capability that does not exist would be previewing the wrong product.",
    shortAnswer:
      "None. Addresses are never grouped into shared owners, because clustering is an identity claim inferred from behaviour, and FOLDMARK does not infer identity from behaviour.",
    detail:
      "Common-control inference is the standard way this goes wrong. Two addresses transacting with the same set of counterparties, at similar times, in similar amounts, is a pattern; it is not evidence of one owner. Custodial infrastructure, routers and shared contracts all produce the same pattern without any shared control at all.\n\nFOLDMARK's identity ladder has no rung for it. An address is identified by an entry in the contracts registry, and a contract reaches the verified step only when an authoritative issuer source names the exact address on the exact chain. Behavioural similarity is not on that ladder at any level.\n\nWhat the product does offer instead is the relationship itself, unmerged: which addresses transacted with which, in which direction, in which assets, and how often. A reader can see the pattern and draw their own conclusion. The product does not draw it for them and present it as structure.",
    followups: [
      "wallets.no_labels",
      "methodology.no_inference_from_behaviour",
      "fabric.architecture_preview",
      "wallets.address_vs_wallet",
    ],
    routes: ["/wallets", "/fabric"],
  },

  {
    id: "wallets.no_labels",
    domain: "wallets",
    title: "Why addresses are not labelled",
    patterns: [
      "is this address a whale",
      "is this retail",
      "is this a market maker",
      "why dont you label wallets",
      "can you tell me what kind of wallet this is",
      "smart money",
      "wallet labels",
      "why is there no whale tag",
    ],
    keywords: ["whale", "retail", "label", "tag", "profile", "attribution", "classification"],
    answer:
      "FOLDMARK does not label an address retail, whale, smart money or market maker. Those are behavioural profiles, and every one of them would be derived from the same transfer logs that are already on the page.\n\nA label of that kind reads as a fact and is not one. Size, transfer frequency, counterparty count and asset mix are all consistent with several different actors, and once a tag is attached a reader stops looking at the movement that produced it. No semantic category may be inferred from visual behaviour, transaction shape, volume or naming alone.\n\nThe descriptions the product does use — NET SENDER, NET RECEIVER — describe observed movement inside a window and are scoped to that window. They are not profiles and carry no claim about intent. If labels are ever introduced they will come from an explicit, cited source, and the source will be shown next to the label.",
    shortAnswer:
      "It does not. Retail, whale and market maker are behavioural profiles inferred from the same logs already shown, and FOLDMARK does not infer identity from behaviour.",
    detail:
      "The refusal is deliberate rather than a missing feature, and it holds even where guessing would be easy. No address is linked to a name, an entity or a person, and that is not something the product intends to add quietly later.\n\nThe distinction to hold on to is the difference between a description and an attribution. NET SENDER describes what a window contained: more value left this address than entered it. Whale would attribute a nature to the address itself, and would persist in the reader's mind across every window afterwards.\n\nThe wallets surface names this alongside the other things it withholds: a wallet label requires an identity claim, and FOLDMARK names a counterparty only from a registered contract whose address an authoritative source has confirmed. Until such a source exists for an address, the honest rendering of it is the address.",
    followups: [
      "methodology.no_inference_from_behaviour",
      "wallets.unknown_address",
      "wallets.no_clustering",
      "methodology.evidence_ladder",
    ],
    actions: [{ label: "OPEN METHODOLOGY", href: "/methodology" }],
    routes: ["/wallet", "/wallets"],
  },

  {
    id: "wallets.balances",
    domain: "wallets",
    title: "Balances and why they are not shown",
    patterns: [
      "why is there no balance",
      "what is the balance of this address",
      "how much does this wallet hold",
      "can you show holdings",
      "wallet balance",
      "does foldmark show balances",
      "what would it take to show a balance",
      "is net the same as balance",
    ],
    keywords: ["balance", "holdings", "position", "reconstruction", "history", "net"],
    answer:
      "No balance is shown, and the net figure on a wallet page is not one. Net is received minus sent inside the selected window, in a single asset's own units. It describes movement over a period.\n\nA balance is a different quantity entirely. It requires the full transfer history for an address — every transfer that ever touched it, replayed in order — not a window of it. A window can show a large net for an address that holds nothing, and can show nothing for an address that holds a great deal.\n\nThe same requirement is why holder counts are absent elsewhere in the product: they need balance reconstruction over the complete history rather than over a window. Full-history replay is recorded as planned work, not as something being approximated in the meantime.",
    shortAnswer:
      "Net is movement inside a window, not a balance. A balance needs the full transfer history for the address replayed in order, which is recorded as planned work rather than approximated.",
    detail:
      "The window is the whole reason. Every wallet figure is folded at request time from transfers inside the selected window — 1H, 6H, 24H, 7D or 30D — and a period of movement cannot be turned into a stock without knowing everything that happened before it.\n\nApproximating one would be worse than omitting it. A balance derived from a partial history is wrong by an unknown amount, and would be displayed with the same weight as figures that were actually measured. The product's rule is that a number reaches the screen only when it was derived from indexed chain data; everything else resolves to a state rather than a plausible-looking value.\n\nSo the wallet page states the two things it does know — how much moved in, how much moved out, per asset, in that asset's units — and links out to the chain explorer for the full history, rather than inventing the third.",
    followups: ["wallets.withheld", "wallets.asset_exposure", "data.coverage", "data.states"],
    routes: ["/wallet", "/wallets"],
  },

  {
    id: "wallets.withheld",
    domain: "wallets",
    title: "What a wallet page withholds",
    patterns: [
      "what is withheld on a wallet page",
      "why is portfolio value empty",
      "what does no oracle mean",
      "why is there no pnl",
      "profit and loss",
      "what figures are missing",
      "withheld figures",
      "why is portfolio value not shown",
    ],
    keywords: ["withheld", "portfolio", "pnl", "oracle", "missing", "value"],
    answer:
      "Four figures are named and withheld rather than left blank. Portfolio value requires a price oracle for this chain, and none is wired, so no currency total is shown. Balance requires the full transfer history for an address rather than a window of it.\n\nProfit and loss requires both a cost basis and a price, and neither is observable from transfer logs alone. Wallet labels require an identity claim, and FOLDMARK names a counterparty only from a registered contract confirmed by an authoritative source.\n\nA withheld figure is a decision, not a gap. Each is stated with the input it is waiting on, and each returns the moment that input exists. The wallet band makes this visible: PORTFOLIO VALUE reads NO ORACLE and NET FLOW reads PER ASSET, rather than showing a dash that could be read as zero.",
    shortAnswer:
      "Portfolio value, balance, profit and loss, and wallet labels. Each is named with the input it needs, because a withheld figure is a decision rather than a gap.",
    followups: ["wallets.balances", "pricing.price_types", "wallets.no_labels", "data.states"],
    routes: ["/wallet", "/wallets"],
  },

  {
    id: "wallets.enters_index",
    domain: "wallets",
    title: "How an address enters the index",
    patterns: [
      "how does an address get into the index",
      "why is my address not listed",
      "how do addresses appear here",
      "when does an address show up",
      "is this address indexed",
      "how are addresses collected",
      "does visiting the site index my address",
    ],
    keywords: ["index", "indexer", "observed", "listed", "collected", "appear"],
    answer:
      "An address earns a row by being party to a transfer, in four steps. The indexer reads an ERC-20 Transfer log from a block. Both sides of that transfer are recorded as addresses, sender and recipient alike. The address carries the timestamp of the most recent transfer it was party to. It then appears in the observed list, and its own page opens on the activity that put it there.\n\nNo address is ever added by hand, and none is invented to fill a list. Addresses appear in the index only because they appeared in a public transfer log — never because someone visited the site or opened a page.\n\nAn address absent from the list is not a finding about that address. It may be inactive, it may transact in assets not tracked yet, or the indexer may not have reached its blocks. Those are different situations and the surface distinguishes them rather than collapsing them into one empty state.",
    shortAnswer:
      "By appearing as sender or recipient in an indexed Transfer log. No address is added by hand, and none is added because someone visited the site.",
    followups: ["data.empty_vs_indexing", "data.provenance", "data.states", "wallets.surface"],
    actions: [{ label: "OPEN WALLETS", href: "/wallets" }],
    routes: ["/wallets", "/wallet"],
  },
];
