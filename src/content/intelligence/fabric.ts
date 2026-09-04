import type { Entry } from "@/lib/intelligence/types";

/**
 * FABRIC — the market-topology surface.
 *
 * Everything a reader can ask about the map at /fabric: what a node class is
 * and what its shape and colour assert, what an edge and an arrowhead mean,
 * what position and radius encode, how the centre is chosen, the difference
 * between the architecture preview and a measured graph, what the filters do,
 * and how the instrument is driven with pointer and keyboard.
 *
 * Two rules run through every entry here. A drawing is read as a fact, so the
 * map never draws a claim the registry has not made — an unidentified address
 * is drawn as an address and called an address. And the preview draws product
 * structure, never a measurement, so nothing in it is denominated and nothing
 * in it is presented as observed chain activity.
 */
export const FABRIC_ENTRIES: Entry[] = [
  {
    id: "fabric.what_is",
    domain: "fabric",
    title: "Fabric",
    patterns: [
      "what is fabric",
      "fabric",
      "explain fabric",
      "what does fabric show",
      "what is the market topology",
      "what is the topology map",
      "what is the fabric page for",
      "what am i looking at on fabric",
    ],
    keywords: ["fabric", "topology", "map", "graph", "market", "structure"],
    answer:
      "Fabric is the market-topology surface. It draws the Robinhood Chain market as a graph: the assets that moved, the counterparties that moved them, and the direction value travelled between them.\n\nIt is an instrument rather than an article. On a wide screen the map takes the height of the viewport below the header and the page itself does not scroll; on a narrow one it is given a fixed height and the page scrolls past it. The control tape along the top narrows what the map draws.\n\nA measured map is built only from indexed ERC-20 Transfer logs. A node is there because a transfer named it; an edge is there because value actually moved along it. When there is no measured graph, the same canvas draws the ARCHITECTURE PREVIEW instead and labels itself as such.",
    shortAnswer:
      "Fabric is the market-topology surface: the Robinhood Chain market drawn as a graph of assets, counterparties and the direction value moved between them.",
    detail:
      "The surface has two modes and they are never mixed. With a measured graph, the canvas draws that graph and a legend underneath documents the encodings actually in force. With no measured graph, the canvas draws the architecture preview, carries an ARCHITECTURE PREVIEW badge, and its legend line reads that the source is product architecture rather than an observation.\n\nThe drawing itself is Canvas 2D, repainted on demand. The scene redraws when the data, the viewport, the view transform or the pointer changes, and is otherwise completely still. Nothing orbits, breathes or drifts, so a quiet market looks quiet.\n\nFilter state lives in the URL, which makes a view shareable and reproducible: the same query string renders the same map on the server and in the browser.",
    followups: ["fabric.nodes", "fabric.edges", "fabric.architecture_preview", "fabric.why_graph"],
    actions: [{ label: "OPEN FABRIC", href: "/fabric" }],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.topology_meaning",
    domain: "fabric",
    title: "What topology means here",
    patterns: [
      "what does topology mean",
      "topology",
      "what is market topology",
      "why is it called topology",
      "topology meaning",
      "what does the word topology mean in foldmark",
    ],
    keywords: ["topology", "shape", "structure", "relationships", "position"],
    answer:
      "Topology is the shape of the relationships, not a geography. Fabric is not a map of places; it is a map of who moved value with whom, in which asset, and in which direction.\n\nWhat that buys is a reading of market structure. A table can tell you an address sent a token. A topology tells you whether that address sits on the rim touching one asset, or between two assets everything else routes through.\n\nPosition on the map encodes role, not importance. Nodes sit on concentric rings by what class they belong to, and their angle comes from what they actually transacted with.",
    shortAnswer:
      "Topology means the shape of the relationships between market participants — who moved value with whom, in what, and which way — rather than any kind of geography.",
    followups: ["fabric.why_graph", "fabric.rings", "fabric.what_is"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.why_graph",
    domain: "fabric",
    title: "Why a graph rather than a table",
    patterns: [
      "why a graph and not a table",
      "why is this a graph",
      "why not just a table of transfers",
      "what does a graph give me that a list does not",
      "why draw the market as a graph",
      "why a network diagram",
    ],
    keywords: ["graph", "table", "list", "why", "structure", "relationships"],
    answer:
      "A transfer table answers questions about rows. A graph answers questions about structure: which asset the most counterparties touch, whether two venues share the same participants, whether an address is a leaf or a junction.\n\nThose are relational facts. They exist in the same transfer rows a table shows, but reading them out of a table means holding the whole join in your head.\n\nFabric does not replace the tabular views. Flows is the directional reading of the same transfers, and the asset and address pages hold the row-level detail. Fabric is the reading where position and connection carry the meaning.",
    shortAnswer:
      "A table answers questions about rows; a graph answers questions about structure — which asset most counterparties touch, and whether an address is a leaf or a junction.",
    followups: ["fabric.topology_meaning", "fabric.centrality", "flows.what_is"],
    actions: [{ label: "OPEN FLOWS", href: "/flows" }],
    routes: ["/fabric"],
  },

  {
    id: "fabric.nodes",
    domain: "fabric",
    title: "Node classes",
    patterns: [
      "what are the nodes",
      "what do the nodes mean",
      "node classes",
      "what kinds of nodes are there",
      "what are the different node types on fabric",
      "explain the node classes",
      "what do the different shapes mean",
      "shape key",
    ],
    keywords: ["node", "class", "shape", "asset", "venue", "protocol", "oracle", "address"],
    answer:
      "There are six node classes: asset, venue, protocol, oracle, infrastructure and address. Each is drawn in one shape and one colour, everywhere it appears — canvas, legend and inspector.\n\nShapes: an asset is a hexagon, a venue is a circle, a protocol is a hexagon, an oracle is a triangle, infrastructure is a diamond, and an address is a square. Shape is the primary carrier of class; colour reinforces it but never carries it alone, so the map stays readable to someone who cannot separate lime from violet.\n\nA class is a claim about an address, and the only thing entitled to make that claim is the contracts registry. An asset is an asset. Otherwise the address is looked up: a dex pool draws as a venue, a lending market or a bridge draws as a protocol, an oracle draws as an oracle, infrastructure draws as infrastructure.\n\nAnything the registry has no entry for draws as an address. That is the honest default, not a category of its own kind — it says only that nothing has identified it as anything else.",
    shortAnswer:
      "Six classes — asset, venue, protocol, oracle, infrastructure, address — each with its own shape and colour. Shape carries the class; colour only reinforces it.",
    detail:
      "The mapping from registry kind to visual class is fixed: dex_pool becomes venue, lending_market becomes protocol, bridge becomes protocol, oracle becomes oracle, infrastructure becomes infrastructure, and anything unknown becomes address.\n\nA bridge is drawn with the protocol shape rather than getting a shape of its own. It is a counterparty you send to and receive from, which is what the protocol shape already says. The distinction survives where it matters: flow classification still separates BRIDGE_IN from BRIDGE_OUT.\n\nWhere the registry has no entry for a node, it draws as an address on a measured map. That is the rule working, not a gap in the drawing.",
    followups: ["fabric.node_address", "fabric.node_colours", "fabric.node_venue", "protocols.registry"],
    entities: ["FABRIC", "ASSET", "VENUE", "PROTOCOL", "ORACLE", "INFRASTRUCTURE", "ADDRESS"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.node_colours",
    domain: "fabric",
    title: "The colour key",
    patterns: [
      "what do the colours mean",
      "colour key",
      "color key",
      "what does each colour mean on the map",
      "why are nodes different colours",
      "legend for the colours",
      "what is the colour coding",
    ],
    keywords: ["colour", "color", "legend", "lime", "blue", "violet", "amber"],
    answer:
      "Each class owns one hue wherever it appears. Asset is lime, venue is blue, protocol is violet, oracle is pink, infrastructure is a muted steel blue, and address is amber.\n\nColour never carries a class on its own. Two classes share the hexagon — asset and protocol — and the colour is what separates them, but the shape is what a reader is meant to read first. The map is designed to survive being seen without colour discrimination.\n\nLime has a second job. It is the emphasis colour: selection, the active path, and the measured centre of the map. So a lime edge is not a class of edge, it is a lit one.",
    shortAnswer:
      "Asset lime, venue blue, protocol violet, oracle pink, infrastructure steel blue, address amber. Lime doubles as the emphasis colour for selection and the active path.",
    followups: ["fabric.nodes", "fabric.signal_colour", "fabric.node_asset"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.node_asset",
    domain: "fabric",
    title: "Asset nodes",
    patterns: [
      "what do the lime hexagons mean",
      "what are the green hexagons",
      "what is an asset node",
      "what do the hexagons mean",
      "asset node",
      "why is a node a hexagon",
      "what does the lime shape represent",
    ],
    keywords: ["asset", "hexagon", "lime", "green", "token", "node"],
    answer:
      "A lime hexagon is an asset: an ERC-20 contract that transfers were observed in. Assets sit on the innermost ring, because the map is composed around what moved rather than around who moved it.\n\nThe hexagon is shared with the protocol class, so colour is what separates them. Lime hexagon, asset. Violet hexagon, protocol.\n\nAn asset node is labelled with its symbol. Its radius reflects observed activity, and its degree — shown in the inspector as COUNTERPARTIES — is the number of distinct addresses that moved it.",
    shortAnswer:
      "A lime hexagon is an asset: an ERC-20 contract transfers were observed in. Assets occupy the innermost ring. A violet hexagon is a protocol, not an asset.",
    followups: ["fabric.node_colours", "fabric.rings", "fabric.centrality", "assets.asset_types"],
    entities: ["ASSET"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.node_venue",
    domain: "fabric",
    title: "Venue nodes",
    patterns: [
      "what are the blue circles",
      "what is a venue node",
      "venue node",
      "what does a circle mean on the map",
      "what is a market venue",
      "what draws as a venue",
    ],
    keywords: ["venue", "circle", "blue", "dex", "pool", "market"],
    answer:
      "A blue circle is a market venue. A node draws as a venue only when the contracts registry records that address as a dex pool.\n\nVenues sit on the ring just outside the assets, alongside protocols, because that is where a trading counterparty sits in the composition: between the asset in the middle and the addresses on the rim.\n\nThis is the class that turns a transfer into a DEX_BUY or a DEX_SELL in flow classification. Which of the two depends only on which way value went relative to the pool.",
    shortAnswer:
      "A blue circle is a market venue — an address the contracts registry records as a dex pool. Nothing draws as a venue on shape or behaviour alone.",
    followups: ["fabric.nodes", "flows.dex_buy", "protocols.registry"],
    entities: ["VENUE"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.node_protocol",
    domain: "fabric",
    title: "Protocol nodes",
    patterns: [
      "what are the violet hexagons",
      "what are the purple hexagons",
      "what is a protocol node",
      "protocol node",
      "where do bridges appear on the map",
      "how is a bridge drawn",
      "why do protocols and assets share a shape",
    ],
    keywords: ["protocol", "violet", "purple", "hexagon", "bridge", "lending"],
    answer:
      "A violet hexagon is a protocol. Two registry kinds draw as one: a lending market and a bridge.\n\nA bridge does not get a shape of its own. It is a counterparty you send to and receive from, which is exactly what the protocol shape says. The bridge distinction is not lost — flow classification still separates BRIDGE_IN from BRIDGE_OUT on the same transfers.\n\nProtocols share the middle ring with venues. The hexagon is shared with assets, so read the colour to tell them apart: lime is an asset, violet is a protocol.",
    shortAnswer:
      "A violet hexagon is a protocol — a lending market or a bridge. A bridge draws with the protocol shape; BRIDGE_IN and BRIDGE_OUT still separate in flow classification.",
    followups: ["fabric.nodes", "fabric.node_asset", "protocols.categories"],
    entities: ["PROTOCOL"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.node_oracle",
    domain: "fabric",
    title: "Oracle nodes",
    patterns: [
      "what are the pink triangles",
      "what is an oracle node",
      "oracle node",
      "what does a triangle mean on the map",
      "why are oracles outside the ring",
      "where do oracles sit",
    ],
    keywords: ["oracle", "triangle", "pink", "outer", "ring"],
    answer:
      "A pink triangle is an oracle: an address the contracts registry records with the oracle kind.\n\nOracles sit on the outermost ring, outside the addresses, together with infrastructure. That position says what they are — not participants in the middle of the market, but things at its edge that the market reads from or reports to.\n\nAn oracle node on the map is a class, not a price. Whether an oracle observation exists for an asset is a separate question, answered by the price types rather than by the topology.",
    shortAnswer:
      "A pink triangle is an oracle, placed on the outermost ring with infrastructure. It is a class of counterparty on the map, not a price reading.",
    followups: ["fabric.rings", "fabric.nodes", "pricing.price_types"],
    entities: ["ORACLE"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.node_infrastructure",
    domain: "fabric",
    title: "Infrastructure nodes",
    patterns: [
      "what are the diamonds",
      "what is an infrastructure node",
      "infrastructure node",
      "what does a diamond mean on the map",
      "what counts as infrastructure",
    ],
    keywords: ["infrastructure", "diamond", "outer", "class", "node"],
    answer:
      "A diamond is infrastructure: an address the contracts registry records with the infrastructure kind, drawn in a muted steel blue.\n\nInfrastructure shares the outermost ring with oracles. Both are edge-of-market classes rather than trading counterparties, so both sit outside the address ring.\n\nAs with every non-asset class, nothing draws as infrastructure because of how it behaves. The registry entry is the only thing that produces the diamond.",
    shortAnswer:
      "A diamond is infrastructure, drawn in muted steel blue on the outermost ring beside oracles. Only a registry entry produces it.",
    followups: ["fabric.nodes", "fabric.rings", "protocols.classification_pipeline"],
    entities: ["INFRASTRUCTURE"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.node_address",
    domain: "fabric",
    title: "Address nodes",
    patterns: [
      "what are the amber squares",
      "what are the yellow squares",
      "what is an address node",
      "what does a square mean on the map",
      "why does it say address and not wallet",
      "is an address node a wallet",
      "why are most nodes squares",
    ],
    keywords: ["address", "square", "amber", "unidentified", "wallet", "unknown"],
    answer:
      "An amber square is an address: a participant the contracts registry has no entry for. It sits on the rim, the ring outside venues and protocols.\n\nIt is drawn as an address and called an address. It is not called a wallet. Calling it a wallet would assert that it is an externally owned account, and nothing has established that. It could be a contract nobody has identified yet.\n\nThe square is the honest default of the whole node vocabulary. It carries one claim only: value moved through this address, and no source has said what it is.\n\nWith the contracts registry empty, this is what every non-asset node on a measured map would be.",
    shortAnswer:
      "An amber square is an address the registry has no entry for. It is called an address rather than a wallet because nothing has established it is an externally owned account.",
    detail:
      "The node class is decided by classifyNode, which looks the lowercased address up in the contracts registry and falls through to address on anything unknown. There is no behavioural promotion path: volume, transaction shape, position in the graph and naming cannot turn a square into a circle.\n\nThat matters because the shape a node is drawn in is read as a fact about it. A square that became a circle on the strength of looking busy would be the product inventing an identity, which is the exact failure UNCLASSIFIED exists to prevent.\n\nThe measured inspector reports an address node with the fields it can support — value observed, transfers, assets touched — and offers links to the address page and to the same address on Blockscout. It does not offer a name, because it does not have one.",
    followups: ["wallets.address_vs_wallet", "wallets.unknown_address", "methodology.unknown_stays_unknown", "fabric.nodes"],
    entities: ["ADDRESS", "UNCLASSIFIED"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.edges",
    domain: "fabric",
    title: "Edges",
    patterns: [
      "what is an edge",
      "what do the lines mean",
      "what do the connections mean",
      "what does an edge represent",
      "why are two nodes connected",
      "what are the curved lines",
      "explain the edges on fabric",
    ],
    keywords: ["edge", "line", "connection", "relationship", "curve", "link"],
    answer:
      "An edge is an observed relationship: value moved between those two endpoints, in one asset, one or more times. On a measured map an edge exists because transfers were indexed along it, never because a relationship seemed likely.\n\nEdges are drawn as shallow arcs rather than straight lines, and trimmed so the stroke starts and stops at the node shapes instead of running underneath them. Which side an arc bows to comes from a hash of the edge id, so the two directions of a relationship separate into distinct lanes instead of overdrawing each other.\n\nLonger runs carry a small junction mark at their midpoint. It is a legibility aid for following a long curve across the field, not a quantity.\n\nThe arrowhead sits at the receiving end. Direction is the whole point of the drawing.",
    shortAnswer:
      "An edge is an observed relationship: value moved between those two endpoints in one asset. Arcs bow to opposite sides so the two directions of a pair stay legible.",
    detail:
      "An edge in the measured graph joins an address to an asset: a net sender connects into the asset, and the asset connects out to a net receiver. Edges are folded per address, per asset and per direction, then ranked by transfer count and capped, so a dense window still draws a readable field.\n\nEach edge carries two separate quantities, and they are used for different things. The amount is the sum of observed transfer amounts along that edge, in the units of its own asset — meaningful only against another edge in the same asset. The transfer count is comparable across assets, so it is what the stroke encodes.\n\nThe inspector shows both, along with the asset the edge belongs to, which is why an edge reads as a claim about one asset rather than about value in general.",
    followups: ["fabric.arrowheads", "fabric.edge_weight", "fabric.signal_colour", "fabric.inspector"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.arrowheads",
    domain: "fabric",
    title: "Arrowheads and direction",
    patterns: [
      "what does the arrow mean",
      "what do the arrowheads mean",
      "which way does the arrow point",
      "how do i read direction on the map",
      "what does the arrow direction tell me",
      "why is there an arrow on every line",
    ],
    keywords: ["arrow", "arrowhead", "direction", "receiving", "sender", "receiver"],
    answer:
      "The arrowhead marks the receiving end. It points at the endpoint value moved toward.\n\nEvery edge gets one. Saying which way value went is the map's job, and an undirected line would leave the most important fact about a relationship unstated.\n\nDirection is also what separates otherwise identical flows elsewhere in the product. The same pool and the same address produce DEX_BUY or DEX_SELL depending only on which way value moved, so the arrowhead is the visual form of the same distinction.",
    shortAnswer:
      "The arrowhead is at the receiving end — it points at whoever value moved toward. Every edge carries one.",
    followups: ["fabric.edges", "flows.direction", "flows.dex_buy"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.edge_weight",
    domain: "fabric",
    title: "Why stroke weight is transfer count",
    patterns: [
      "why are some lines thicker",
      "what does line thickness mean",
      "what does edge weight mean",
      "does a thick line mean more value",
      "why does stroke use transfer count and not amount",
      "why not scale edges by token amount",
      "what does stroke weight encode",
    ],
    keywords: ["stroke", "thickness", "weight", "intensity", "transfers", "amount"],
    answer:
      "Stroke weight comes from an edge intensity derived from transfer count, not from token amount.\n\nThe map puts edges in several different assets on one canvas, and a thick stroke is read as importance. Scaling that from amounts would let a stablecoin edge overwhelm an equity edge purely because its denomination is smaller — a visual claim about the market produced by decimals rather than by behaviour.\n\nTransfer counts are comparable between assets, so transfers are what the drawing encodes. Each edge still carries its own amount in its own units, and the inspector shows it there, where it can be read against the asset it belongs to.",
    shortAnswer:
      "Stroke weight encodes transfer count, because amounts in different assets are not comparable and scaling a stroke by them would turn decimals into apparent importance.",
    detail:
      "Intensity is the square root of an edge's transfer count relative to the heaviest edge drawn, clamped to 0..1. It drives both the line width and the opacity, so a low-count edge recedes rather than competing with the ones that carry the window.\n\nRanking uses the same quantity. Edges are sorted by transfer count, with amount only as a tiebreak, before the display cap is applied — so what survives truncation is what the window actually did most often, not what happened to be denominated largest.\n\nThe inspector states the rule in place, beside the amount it is showing, so the two numbers cannot be confused for each other.",
    followups: ["fabric.edges", "fabric.radius", "fabric.inspector"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.signal_colour",
    domain: "fabric",
    title: "The lime highlight",
    patterns: [
      "what do the green lines mean",
      "why are some lines green",
      "why did the lines turn green",
      "what does the lime highlight mean",
      "what is the bright green path",
      "what does the green colour mean on edges",
    ],
    keywords: ["lime", "green", "signal", "highlight", "selected", "active"],
    answer:
      "Lime is the emphasis colour, not a class. When a node is hovered or selected, every edge touching it is redrawn in lime and its neighbourhood stays fully opaque — that is the active path.\n\nOrdinary edges are drawn in a neutral bone stroke at low opacity. A lime edge means the map is currently pointing at it.\n\nThe same colour marks a selected node and the measured centre of the map, which is filled rather than outlined. Lime hexagons that are not selected are assets, since lime is also the asset class hue.",
    shortAnswer:
      "Lime marks emphasis: the hovered or selected node, the edges touching it, and the measured centre. Ordinary edges are a neutral bone stroke.",
    followups: ["fabric.hover_dim", "fabric.node_colours", "fabric.centrality", "fabric.selection"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.rings",
    domain: "fabric",
    title: "Rings and position",
    patterns: [
      "what does the position of a node mean",
      "why are nodes arranged in circles",
      "what are the rings",
      "why is a node on the outside",
      "what does the inner ring mean",
      "how is the layout decided",
      "why is that node further out",
    ],
    keywords: ["ring", "position", "layout", "radial", "inner", "rim", "angle"],
    answer:
      "Position encodes role, not importance. Nodes sit on concentric rings by class: assets on the inner ring, venues and protocols around them, unidentified addresses on the rim, and oracles and infrastructure outside that.\n\nThe ring radii are fixed ratios — asset 0.32, venue and protocol 0.62, address 0.94, oracle and infrastructure 1.1 — so the same class always lands at the same distance from the centre.\n\nAngle carries the other half of the meaning. A node is aimed at what it is actually connected to, so it sits near the asset it moved value with and edges run roughly radially instead of crossing the whole field.\n\nBeing further out does not mean smaller or less active. It means a different class.",
    shortAnswer:
      "Rings encode class: assets inner, venues and protocols around them, addresses on the rim, oracles and infrastructure outside. Angle points a node at what it transacted with.",
    detail:
      "Rings are laid out from the inside out, so an outer node can read the angles of the inner nodes already placed. A node's preferred angle is the circular mean of the angles of its already-placed neighbours, weighted by transfers along each edge.\n\nThe mean is taken over unit vectors rather than over the angles themselves. Averaging 350 degrees and 10 degrees arithmetically would send a node to 180 — the opposite of both of its neighbours.\n\nMembers of a ring are then sorted by that preference and spread evenly around the ring. The sort keeps a node beside its counterparty; the even spread guarantees no two nodes on a ring can overlap however lopsided the graph is. Ties break on id, so the result cannot depend on the order rows arrived in.",
    followups: ["fabric.layout_deterministic", "fabric.radius", "fabric.centrality", "fabric.nodes"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.radius",
    domain: "fabric",
    title: "Node radius",
    patterns: [
      "what does node size mean",
      "why is one node bigger",
      "what does the radius encode",
      "does a bigger node mean more value",
      "why do nodes have different sizes",
      "node size meaning",
    ],
    keywords: ["radius", "size", "bigger", "scale", "activity", "node"],
    answer:
      "Radius encodes observed activity. Each class has a base size, and that base is modulated by a scale derived from the value moved through the node relative to the largest node drawn, taken as a square root so one dominant participant does not flatten everything else.\n\nZoom scales nodes too, but sub-linearly and within bounds: zoomed out a node stays large enough to hit, zoomed in the field does not turn into overlapping blobs.\n\nBecause radius carries meaning, the arrival reveal animates opacity only and never size. A frame that turns out to be the last one must not leave a node misreporting itself.",
    shortAnswer:
      "Radius encodes observed activity — a class base size modulated by the square root of value moved relative to the largest node drawn.",
    followups: ["fabric.edge_weight", "fabric.reduced_motion", "fabric.rings"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.centrality",
    domain: "fabric",
    title: "Centrality and the centre of the map",
    patterns: [
      "why is one node in the middle",
      "what does the centre node mean",
      "how is the central node chosen",
      "what is centrality",
      "why is a node filled in",
      "why is nothing in the middle",
      "what happens on a tie for the centre",
      "how does foldmark pick the hub",
    ],
    keywords: ["centrality", "centre", "center", "hub", "dominant", "degree", "tie"],
    answer:
      "The centre is a measurement or it is empty. One asset connected to strictly more counterparties than any other takes the centre; that is a fact the graph already holds, and putting it in the middle reports it.\n\nStrictly more is the rule, and degree is the quantity — the number of distinct counterparties the asset moved with. If the leading asset only equals the next one, it has not led.\n\nA degree tie falls back to observed transfer count, which is still a measurement. If that ties as well, nobody takes the centre: every asset sits on the inner ring and the map declines to nominate a hub the data did not nominate.\n\nThe central node is the only one given a solid fill rather than an outline, and it is drawn slightly larger. A selected node takes a faint wash of its own colour, which is a different mark. The solid fill is reserved for a measured centre.",
    shortAnswer:
      "The asset with strictly more counterparties than any other takes the centre. A degree tie falls back to transfer count; if that ties too, nobody takes the centre.",
    detail:
      "The ordering sorts assets by degree descending, then by transfers descending, and inspects the top two. If the first has a greater degree than the second it takes the centre. If their degrees are equal and the first has more observed transfers, it takes the centre. Otherwise the function returns nothing.\n\nWith fewer than two assets there is no comparison to make, so the single asset — if there is one — occupies the centre by default.\n\nWhen nothing takes the centre, the inner ring is laid out with every asset on it and the middle of the field is simply empty. An empty middle on Fabric is a statement: no asset led outright in this window under this filter.\n\nNote what is not used. Volume in token units is not used, because amounts in different assets are not comparable. Nothing about naming, contract age or apparent prominence is used either.",
    followups: ["fabric.rings", "fabric.node_asset", "methodology.evidence_ladder", "fabric.measured_graph"],
    entities: ["FABRIC", "ASSET"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.layout_deterministic",
    domain: "fabric",
    title: "Deterministic layout",
    patterns: [
      "why does the layout never move",
      "is this a force directed graph",
      "why is there no physics simulation",
      "why do the nodes not float around",
      "is the layout random",
      "why does the map look the same every time",
      "why no force simulation",
    ],
    keywords: ["deterministic", "layout", "force", "simulation", "random", "stable"],
    answer:
      "The layout is a pure function of the graph. Ring by class, angle from connections, even spread within the ring, ties broken on id. There is no force simulation, no jitter and no randomness anywhere in it.\n\nThat means the same graph lays out identically on the server and in the browser, and identically twice in a row. Nothing shifts on hydration and nothing rearranges itself while you look at it.\n\nA force simulation would make position depend on where the solver happened to settle. Position here is meant to be readable as a fact — this class, near these counterparties — which requires that it not drift.\n\nThe map also does not animate at rest. It repaints when the data, the viewport, the view or the pointer changes, and is otherwise completely still.",
    shortAnswer:
      "Layout is a pure, deterministic function of the graph — no force simulation, no randomness — so the same data draws identically on server and client, and twice in a row.",
    followups: ["fabric.rings", "fabric.reduced_motion", "fabric.centrality"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.architecture_preview",
    domain: "fabric",
    title: "Architecture preview",
    patterns: [
      "what is the architecture preview",
      "why does it say architecture preview",
      "architecture preview",
      "is this real data",
      "what does the preview badge mean",
      "why does the map show asset a and asset b",
      "what are asset a asset b and asset c",
      "is the fabric map showing live activity",
    ],
    keywords: ["preview", "architecture", "placeholder", "structure", "badge", "generic"],
    answer:
      "When there is no measured graph, Fabric draws the architecture preview rather than an empty rectangle. It uses the same rings, the same shapes and the same edge grammar, populated with categories instead of entities.\n\nThe labels are exactly ASSET A, ASSET B, ASSET C, WALLET, MARKET, LIQUIDITY and PROTOCOL. Nothing in it is denominated: no amount, no count, no percentage, no address, no symbol.\n\nIt represents how FOLDMARK organises market structure. It is not presented as observed Robinhood Chain activity — it carries an ARCHITECTURE PREVIEW badge, and its legend line reads that the source is product architecture, not an observation.\n\nA topology is a picture of structure, and that structure is real whether or not a particular market has been indexed. The moment a measured graph exists, the preview is not consulted.",
    shortAnswer:
      "With no measured graph, Fabric draws generic product structure with category labels — ASSET A, WALLET, MARKET, LIQUIDITY, PROTOCOL — badged ARCHITECTURE PREVIEW. It is not observed activity.",
    detail:
      "The preview legend states four things and nothing else: POSITION, that assets are inner, venues around and wallets on the rim; SHAPE, the class of counterparty a node belongs to; ARROW, the direction value moves along a relationship; and SOURCE, product architecture rather than an observation.\n\nThe preview inspector is deliberately thinner than the measured one. It names the category, the ring it sits on and its role, and states MODE as ARCHITECTURE PREVIEW. It has no analytics section, no address, no balance, no transfer count and no explorer link, because there is nothing to link to.\n\nThe geometry is seeded and pure, so the server and the browser produce the same drawing and nothing shifts on hydration. A preview-isolation test walks the real import graph and fails the build if preview geometry is ever imported by an API route, the server layer, the indexer or the market-data engine. Preview data may be drawn; it may never be recorded, priced, served or counted.\n\nThere is deliberately no price data in the preview module. Illustrating a topology is not the same act as drawing a price, and a chart of invented movement would be a claim about a market however it was labelled.",
    followups: ["fabric.preview_addresses", "fabric.measured_graph", "fabric.no_wallet_clustering", "data.empty_vs_indexing"],
    actions: [{ label: "OPEN FABRIC", href: "/fabric" }],
    entities: ["FABRIC", "ARCHITECTURE_PREVIEW"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.preview_addresses",
    domain: "fabric",
    title: "Why the preview has no addresses",
    patterns: [
      "are these real wallets",
      "are those real addresses",
      "why does the preview not show addresses",
      "why does every node just say wallet",
      "can i click through to a wallet in the preview",
      "why are there no symbols in the preview",
      "is asset a a real token",
    ],
    keywords: ["preview", "wallet", "address", "placeholder", "real", "fake"],
    answer:
      "No. In preview mode every node is a category placeholder, not an observed address. ASSET A is not a token, and a node labelled WALLET is not somebody's account.\n\nA named node would be an assertion about something that exists. Putting a plausible-looking address on a drawing that came from a generator would be exactly the failure the product exists to avoid — an invented value wearing the appearance of a measurement.\n\nSo the preview names nothing and denominates nothing. There is no address to copy, no symbol to look up and no explorer link, because there is nothing on the far side of one.\n\nThe preview inspector says the same thing in words: a category, not an entity, and the node states where such a thing will sit once it has been indexed.",
    shortAnswer:
      "No. Preview nodes are category placeholders, not observed addresses. Nothing in the preview names or denominates anything, so there is no address and no explorer link.",
    followups: ["fabric.architecture_preview", "fabric.no_wallet_clustering", "methodology.unknown_stays_unknown"],
    entities: ["ARCHITECTURE_PREVIEW"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.no_wallet_clustering",
    domain: "fabric",
    title: "No wallet clustering",
    patterns: [
      "does foldmark cluster wallets",
      "is there wallet clustering",
      "do you group addresses into entities",
      "why does the preview say wallet and not wallet cluster",
      "can you tell if two addresses are the same owner",
      "do you do entity resolution",
    ],
    keywords: ["clustering", "cluster", "entity", "grouping", "heuristic", "owner"],
    answer:
      "There is no wallet clustering in FOLDMARK. Addresses are not grouped into inferred owners, and no heuristic links two addresses on the strength of how they behaved.\n\nThe preview says WALLET rather than WALLET CLUSTER for that reason. Previewing a capability that does not exist would be previewing the wrong thing, and a reader who saw a cluster in the preview would reasonably expect clusters in the measured map.\n\nClustering is inference from behaviour, which is the class of claim the product declines to make. Common-input and co-spend style heuristics produce a name for a group that no source ever confirmed.",
    shortAnswer:
      "FOLDMARK does not cluster wallets or group addresses into inferred owners. The preview says WALLET, not WALLET CLUSTER, because the capability does not exist.",
    followups: ["methodology.no_inference_from_behaviour", "wallets.address_vs_wallet", "fabric.architecture_preview"],
    entities: ["ARCHITECTURE_PREVIEW"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.measured_graph",
    domain: "fabric",
    title: "The measured graph",
    patterns: [
      "what is the measured graph",
      "where does the graph data come from",
      "how is the graph built",
      "is the map built from real transfers",
      "what makes a node appear on the map",
      "measured graph",
      "how do i know if this is measured data",
    ],
    keywords: ["measured", "observed", "transfers", "indexed", "built", "source"],
    answer:
      "The measured graph is built only from observed transfers. Every node exists because the indexer saw it, and every edge exists because value actually moved along it. There is no synthetic hub, no decorative node and no random placement.\n\nAn address is folded from its inflow, outflow, transfer count and the assets it touched. An asset is folded from its volume, transfer count and the distinct counterparties that moved it. Nodes that end up with no drawn edge are dropped, because an isolated dot says nothing.\n\nThe direction of the composition is fixed: a net sender connects into an asset, and the asset connects out to a net receiver. That relationship is what the arrowheads report. Where the two endpoints are drawn is decided separately, by the ring their class belongs to.\n\nA measured map being visible on screen is not the same as a measured graph existing. If the canvas is drawing the architecture preview, nothing on it was observed.",
    shortAnswer:
      "The measured graph is built only from indexed transfers: every node was seen by the indexer, every edge is value that actually moved. Nothing in it is synthetic.",
    detail:
      "Ranking decides what is drawn when a window holds more than the display cap. Assets are ranked by transfer count, then by volume. Addresses are split into net senders and net receivers and ranked by outflow and inflow respectively, per side. Edges are ranked by transfer count, then by amount.\n\nThe graph reports both totals and what is shown, and marks itself truncated when the two differ, so the legend can say how much of the window reached the canvas and on what basis.\n\nFreshness is per node and per edge: a node is marked fresh when it moved value in the most recent indexed block of the window, and the renderer draws that as one thin lime ring. No pulse, no glow.\n\nDo not read a measured graph as complete. It is what the indexer holds for the selected window under the current filters, capped for legibility, and the data state chip beside the counters says how well the window itself was observed.",
    followups: ["fabric.architecture_preview", "fabric.truncation", "fabric.fresh_ring", "data.provenance"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.preview_vs_measured",
    domain: "fabric",
    title: "Telling preview from measured",
    patterns: [
      "how do i know which mode the map is in",
      "is this the preview or real data",
      "how can i tell if the map is measured",
      "preview vs measured graph",
      "what is the difference between the preview and the real map",
      "which mode is fabric in",
    ],
    keywords: ["preview", "measured", "mode", "difference", "badge", "tell"],
    answer:
      "Three signals separate them, and they always agree.\n\nThe badge. A preview carries an ARCHITECTURE PREVIEW label in the corner of the canvas. A measured map does not.\n\nThe labels. A preview names categories — ASSET A, WALLET, MARKET, LIQUIDITY, PROTOCOL — and nothing in it is denominated. A measured map labels assets with their symbols and addresses with a shortened address, and its inspector shows transfer counts and amounts.\n\nThe legend. The preview legend ends with a SOURCE line reading that this is product architecture, not an observation. The measured legend appears only under a drawn map, and the rail foot credits indexed Transfer logs only when there is a measured graph to credit.",
    shortAnswer:
      "The preview carries an ARCHITECTURE PREVIEW badge, names only categories, and its legend says the source is product architecture. A measured map shows symbols, addresses and counts.",
    followups: ["fabric.architecture_preview", "fabric.measured_graph", "fabric.legend"],
    entities: ["FABRIC", "ARCHITECTURE_PREVIEW"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.filters",
    domain: "fabric",
    title: "Filters on Fabric",
    patterns: [
      "what do the filters do",
      "how do the filters work",
      "what are the chips at the top",
      "how do i filter the map",
      "what does the control tape do",
      "can i share a filtered view",
      "do the filters change the numbers too",
    ],
    keywords: ["filter", "chip", "control", "url", "narrow", "window"],
    answer:
      "Four controls narrow the map: asset type, category, flow class and window. They are links, not scripts, so a filtered view is shareable, survives a reload and renders the same on the server.\n\nFilters compose. Every control keeps the others, and clicking an active category or flow chip clears just that one; asset type is cleared through its own ALL chip, and the window always has one value selected. The state lives in the URL as w, type, category and flow.\n\nThe map, the counters and the rail all read the same filtered transfers. A chip that redrew the canvas while the totals beside it stayed global would be worse than a dead chip: a working control reporting a number that does not describe what is on screen.\n\nAn unrecognised filter value parses to nothing and reads as ALL. A stale query string must never produce an empty map that looks like a measurement of nothing.",
    shortAnswer:
      "Asset type, category, flow class and window narrow the map. They compose, live in the URL, and the map, counters and rail all read the same filtered rows.",
    detail:
      "Asset type filters on the asset rows first — stock token, crypto, stablecoin or other — and the window activity is then restricted to transfers in the surviving assets.\n\nCategory and flow filters are applied through the classifier against the contracts registry. Their chip counts are computed on the window rows the chips select from — the window after the asset type filter — so a count and the selection it offers describe the same set of transfers. The map, the counters and the rail are then all folded from the rows that survive, so none of them can describe a different window from the others.\n\nWhen a filter removes every row, the resulting state is EMPTY only if the base window was genuinely observed. If the window was never observed, the filtered view is just as unobserved, and calling it EMPTY would claim a measurement that was never taken.\n\nThe window control offers 1H, 6H, 24H, 7D and 30D, and Fabric defaults to 24H.",
    followups: ["fabric.categories_zero", "fabric.window", "flows.reserved_classes", "data.states"],
    actions: [{ label: "OPEN FABRIC", href: "/fabric" }],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.window",
    domain: "fabric",
    title: "The window control",
    patterns: [
      "what is the window filter",
      "what does 24h mean on fabric",
      "what time windows are available",
      "what is the default window",
      "how far back does the map look",
      "can i change the time range",
    ],
    keywords: ["window", "24h", "time", "range", "default", "period"],
    answer:
      "The window sets the span of transfers the map is folded from. The choices are 1H, 6H, 24H, 7D and 30D, and Fabric opens on 24H.\n\nChanging it rebuilds everything on the page from the new span: the graph, the counters on the tape and the three rail modules. All of them read the same window, so the map and the numbers beside it always describe the same rows.\n\nThe window is part of the shareable URL, so a link to Fabric carries the span it was read at.",
    shortAnswer:
      "The window sets the span of transfers the map is built from — 1H, 6H, 24H, 7D or 30D — and Fabric defaults to 24H.",
    followups: ["fabric.filters", "data.freshness", "fabric.measured_graph"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.categories_zero",
    domain: "fabric",
    title: "Why category chips count zero",
    patterns: [
      "why do the categories show zero",
      "why does every category chip say 0",
      "why does filtering by dex return nothing",
      "why do the flow filters select nothing",
      "why are the chips empty",
      "is the category filter broken",
      "why does clicking a category give me an empty map",
    ],
    keywords: ["zero", "categories", "chips", "empty", "registry", "unclassified"],
    answer:
      "Classification reads from the contracts registry and nothing else. A chip counts only addresses that registry identifies, so a category holding no registered contracts counts zero, and selecting it selects nothing.\n\nWhere the registry has no entry for an address, that address stays unidentified and its flows classify as UNCLASSIFIED. How many entries it holds is a reading, not a definition, and the protocols page reports it.\n\nThat is the correct outcome of the rules rather than a broken control. The alternative would be assigning categories on appearance, which would put a claim on screen that no source made.\n\nSeparately, three flow class names are reserved and never assigned by the current classifier at all: LP_DEPOSIT, LP_WITHDRAW and LEND. Their chips would count zero even with a populated registry.",
    shortAnswer:
      "A chip counts only what the contracts registry identifies. Addresses it has no entry for stay unidentified and their flows classify as UNCLASSIFIED, so those chips count zero — the honest outcome, not a bug.",
    followups: ["protocols.registry", "flows.unclassified", "flows.reserved_classes", "fabric.filters"],
    entities: ["UNCLASSIFIED", "FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.selection",
    domain: "fabric",
    title: "Selecting a node or an edge",
    patterns: [
      "what happens when i click a node",
      "what does selecting do",
      "how do i select something on the map",
      "why did clicking do nothing",
      "can i select an edge",
      "how do i clear a selection",
    ],
    keywords: ["select", "click", "selection", "node", "edge", "clear"],
    answer:
      "A click selects whatever is under the pointer: a node, or an edge if the pointer is close enough to its curve. The selection opens the inspector and lights the neighbourhood in lime.\n\nA drag moves the view instead. Only a click that did not move selects, so panning never changes what is open in the inspector.\n\nClicking empty canvas clears the selection and any isolation. Escape does the same from the keyboard, and the inspector has its own close control.\n\nNodes win ties over edges, and the nearest node within its hit radius wins over its neighbours, so a dense area still selects predictably.",
    shortAnswer:
      "A click selects a node, or an edge near its curve, and opens the inspector. A drag pans instead; clicking empty canvas or pressing Escape clears.",
    followups: ["fabric.inspector", "fabric.isolate", "fabric.keyboard", "fabric.hover_dim"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.inspector",
    domain: "fabric",
    title: "The inspector",
    patterns: [
      "what is the inspector",
      "what does the side panel show",
      "what is in the panel on the right",
      "what does the inspector tell me about a node",
      "what does the inspector show for an edge",
      "why is the inspector at the bottom on my phone",
    ],
    keywords: ["inspector", "panel", "readout", "detail", "sidebar", "sheet"],
    answer:
      "The inspector is the readout beside the map. It docks as a third column on wide screens and as a bottom sheet on narrow ones. Changing what is selected crossfades its contents rather than closing and reopening the panel.\n\nFor a node it shows the label, the value observed, the transfer count, and either counterparties for an asset or assets touched for an address, followed by links to that entity's page and to the same address on Blockscout.\n\nFor an edge it shows both endpoints, the asset, the amount summed along that edge in that asset's units, and the transfer count. A note beside them states that stroke weight encodes transfers rather than amount, so edges in different assets stay comparable.\n\nIn preview mode the inspector is thinner on purpose: category, ring, role, and MODE as ARCHITECTURE PREVIEW. No address, no counts, no explorer link.",
    shortAnswer:
      "The inspector is the readout beside the map: label, observed value, transfers and degree for a node; endpoints, asset, amount and transfers for an edge.",
    followups: ["fabric.selection", "fabric.edge_weight", "fabric.architecture_preview"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.hover_dim",
    domain: "fabric",
    title: "Why unrelated nodes dim",
    patterns: [
      "why does everything fade when i hover",
      "why do the other nodes go dark",
      "why did the map dim",
      "what does the dimming mean",
      "are the faded nodes hidden",
      "why do unrelated nodes fade out",
    ],
    keywords: ["dim", "fade", "hover", "opacity", "focus", "neighbourhood"],
    answer:
      "Hovering or selecting a node puts its neighbourhood in focus. That node and everything it shares an edge with stay fully opaque; everything else recedes to about a quarter opacity.\n\nNothing is ever hidden outright. A hidden node would change what the map appears to contain, and a reader would have no way to tell a filtered map from a smaller one. Receding keeps the whole field on screen while making one neighbourhood readable in it.\n\nThe edges touching the focused node are lit in lime at the same time, which is what makes a path traceable across a dense field.",
    shortAnswer:
      "Hover or selection lifts a node and its direct neighbours to full opacity and dims the rest. Nothing is hidden — dimming keeps the whole field visible.",
    followups: ["fabric.isolate", "fabric.signal_colour", "fabric.selection"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.isolate",
    domain: "fabric",
    title: "Isolate",
    patterns: [
      "what does isolate do",
      "what does double click do on the map",
      "how do i isolate a node",
      "what is the isolated badge",
      "how do i clear isolation",
      "difference between isolate and hover",
    ],
    keywords: ["isolate", "isolation", "double", "click", "neighbourhood", "clear"],
    answer:
      "Double-clicking a node isolates its neighbourhood. That node and its direct neighbours stay lit, and everything else drops much further back than a hover does — to roughly a seventh of full opacity.\n\nIsolation is sticky, where hover is not. It holds while you pan, zoom and read, so a neighbourhood can be examined without keeping the pointer on it.\n\nA badge reading ISOLATED with a clear control appears in the corner while it is active. Double-clicking the same node again, clicking empty canvas, pressing Enter on the focused node again, or pressing Escape all release it.\n\nAs with hover, nothing is removed from the drawing. Isolation changes emphasis, not membership.",
    shortAnswer:
      "Double-click isolates a node's neighbourhood: it stays lit while everything else drops much further back than on hover, and it holds until you clear it.",
    followups: ["fabric.hover_dim", "fabric.keyboard", "fabric.selection"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.zoom_pan",
    domain: "fabric",
    title: "Zoom, pan and fit",
    patterns: [
      "how do i zoom",
      "how do i pan the map",
      "what does fit do",
      "how do i reset the view",
      "can i drag the map",
      "how far can i zoom in",
      "the map moved and i want it back",
    ],
    keywords: ["zoom", "pan", "fit", "reset", "drag", "wheel", "view"],
    answer:
      "The wheel zooms about the cursor, so whatever is under the pointer stays under it. Dragging pans. The buttons in the corner do the same three things: minus, plus and FIT.\n\nFIT returns to the fitted view, which frames the whole graph with room for the labels that radiate outward from the outer ring. Zoom is bounded relative to that fitted scale, from roughly a third of it to four times it.\n\nThe fitted view is derived from the layout and the viewport rather than stored, so it survives a resize. Your own pan or zoom is held beside the layout it belongs to and is dropped when the map underneath it changes — a new window or filter starts from a fitted view of the new graph.\n\nOn a wide canvas the field is stretched into an ellipse so the graph is not a small circle marooned in the middle. Only positions stretch; node shapes keep their aspect, so a hexagon never becomes an ellipse.",
    shortAnswer:
      "Wheel zooms about the cursor, drag pans, FIT returns to the fitted view. Zoom is bounded relative to that fitted scale.",
    followups: ["fabric.keyboard", "fabric.grid", "fabric.rings"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.keyboard",
    domain: "fabric",
    title: "Keyboard controls",
    patterns: [
      "what are the keyboard shortcuts",
      "can i use the map with a keyboard",
      "keyboard controls for fabric",
      "what does pressing 0 do",
      "how do i step through nodes",
      "is the map accessible without a mouse",
      "what does escape do on the map",
    ],
    keywords: ["keyboard", "shortcut", "keys", "accessible", "arrow", "escape"],
    answer:
      "The canvas is focusable and driven from the keyboard. Arrow keys step through nodes and select each one as they go. Enter isolates the focused node, and pressing it again releases the isolation. Escape clears both selection and isolation.\n\nPlus and minus zoom. Zero returns to the fitted view, the same as the FIT button.\n\nThe canvas also carries a text equivalent for screen readers: a list of every drawn node with its class, its label, its transfer count, the units observed and its number of connections. The same data is reachable without seeing the drawing.\n\nIn preview mode the arrow keys, zoom keys and Escape behave the same way. There is no isolation there, because there is no measured neighbourhood to isolate.",
    shortAnswer:
      "Arrow keys step through nodes, Enter isolates, Escape clears, plus and minus zoom, 0 fits. A screen-reader list carries the same node data as the drawing.",
    followups: ["fabric.zoom_pan", "fabric.isolate", "fabric.selection"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.grid",
    domain: "fabric",
    title: "The background grid",
    patterns: [
      "what is the grid in the background",
      "what are the faint lines behind the map",
      "why is there a grid",
      "does the grid mean anything",
      "what do the background squares mean",
      "is the grid a scale",
    ],
    keywords: ["grid", "background", "lines", "field", "plotting", "surface"],
    answer:
      "The grid is the plotting surface. It carries no data: it is not a scale, not an axis and not a coordinate system a reader is meant to measure against.\n\nIt is locked to the pan offset, so the graph moves across a fixed field rather than dragging the field along with it. That is what makes panning read as movement rather than as the whole scene sliding.\n\nIt is drawn faintly, with a slightly heavier mark every fifth line, so it reads as paper under the instrument rather than as content on it.",
    shortAnswer:
      "The grid is the plotting surface, not data. It stays locked to the pan offset so the graph moves across a fixed field.",
    followups: ["fabric.zoom_pan", "fabric.what_is"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.fresh_ring",
    domain: "fabric",
    title: "The thin ring around a node",
    patterns: [
      "what is the thin ring around a node",
      "why does a node have a ring around it",
      "what does the outline around a node mean",
      "what does fresh mean on the map",
      "what does the ring in the legend mean",
      "which nodes are marked as new",
    ],
    keywords: ["ring", "fresh", "newest", "block", "outline", "recent"],
    answer:
      "One thin lime ring around a node means it moved value in the newest indexed block of the window.\n\nIt is drawn as a single stroke. No pulse, no glow and no animation, because a repeating effect would keep drawing attention to a fact that stops being true at the next block.\n\nThe measured legend reports how many nodes carry it, or states plainly that no node was active in the newest block. That line only appears over a drawn map, since there is no newest indexed block to speak of in the preview.",
    shortAnswer:
      "A thin lime ring marks a node that moved value in the newest indexed block of the window. It is a static stroke, not an animation.",
    followups: ["fabric.measured_graph", "fabric.legend", "data.freshness"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.legend",
    domain: "fabric",
    title: "The legend",
    patterns: [
      "what is the legend",
      "what does the legend under the map say",
      "why is there no legend",
      "where is the key for the map",
      "what does the legend describe",
    ],
    keywords: ["legend", "key", "caption", "encoding", "under", "map"],
    answer:
      "The legend is generated from the graph it describes, so it cannot document an encoding the renderer does not implement. It names position, radius, edge weight, the newest-block ring and the window the map was read at, and adds a line about truncation when the map is showing a ranked subset.\n\nIt appears only over a drawn map. Every line either counts what is on screen or names an encoding actually in force, and both require a measured graph to be true.\n\nThe preview carries its own legend instead, with four lines: POSITION, SHAPE, ARROW and a SOURCE line stating that this is product architecture, not an observation.",
    shortAnswer:
      "The measured legend is generated from the graph it describes and appears only over a drawn map. The preview carries its own legend ending in a SOURCE line.",
    followups: ["fabric.preview_vs_measured", "fabric.fresh_ring", "fabric.truncation"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.truncation",
    domain: "fabric",
    title: "Why not every node is drawn",
    patterns: [
      "why are only some nodes shown",
      "is the map showing everything",
      "what does shown mean in the legend",
      "why does it say shown of total",
      "how many nodes does fabric draw",
      "why is my address not on the map",
      "is the graph truncated",
    ],
    keywords: ["truncated", "shown", "cap", "ranked", "limit", "subset"],
    answer:
      "The map draws a ranked subset when a window holds more than it can show legibly. Assets are ranked by transfer count, addresses by the value they moved, and edges by transfer count.\n\nWhen the drawn set is smaller than what the window holds, the graph marks itself truncated and the legend says how many nodes are shown out of the total, and on what basis they were chosen.\n\nNodes that end up with no drawn edge are dropped as well. An isolated dot with no relationship on screen says nothing a reader can use.\n\nSo an address missing from the map is not a claim that it was inactive. Narrowing the window or the filters is the way to bring a smaller set fully into view.",
    shortAnswer:
      "Fabric draws a ranked subset when the window holds more than it can show legibly, and the legend says how much is shown. A missing node is not a claim of inactivity.",
    followups: ["fabric.measured_graph", "fabric.filters", "data.coverage"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.counters",
    domain: "fabric",
    title: "The node and edge counters",
    patterns: [
      "what are the numbers on the top right",
      "what does nodes edges tx mean",
      "why is there no node count",
      "why does the counter disappear",
      "what do the counters on the tape mean",
      "why does it not say 0 nodes",
    ],
    keywords: ["counter", "count", "nodes", "edges", "tx", "tape"],
    answer:
      "The tape can carry a count of the nodes drawn, the edges drawn and the transfers in the window they were folded from.\n\nA count is a measurement, so it appears only where one was taken. An index that was never queried cannot say zero nodes, because zero would claim that the chain was looked at and found empty. In that case the slot is left out entirely rather than filled with a plausible zero.\n\nA state chip appears beside the counters when a measured map is drawn and something about the window is worth qualifying. No chip is shown over the preview: the canvas already carries its own ARCHITECTURE PREVIEW badge, and a second label about initialization would contradict the structure already on screen.",
    shortAnswer:
      "The counters report the nodes and edges drawn and the transfers in the window behind them. They appear only where a measurement was taken — an unobserved window gets no counter rather than a zero.",
    followups: ["data.empty_vs_indexing", "data.states", "fabric.measured_graph"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.reduced_motion",
    domain: "fabric",
    title: "Reduced motion",
    patterns: [
      "does fabric respect reduced motion",
      "how do i turn off the animation",
      "what animation does the map have",
      "is there motion on the map",
      "prefers reduced motion",
      "does the map animate",
    ],
    keywords: ["motion", "animation", "reduced", "accessibility", "reveal", "still"],
    answer:
      "There is exactly one animation: a bounded arrival reveal when a map first appears or the graph underneath it changes. Nothing loops, orbits, breathes or drifts afterwards.\n\nA viewer who has asked for reduced motion never enters it at all. The map is painted in its final state immediately.\n\nThe reveal fades opacity and never scales radius. Radius carries meaning — observed activity on the measured map, a structural weight on the preview — so a frame that turned out to be the last one would otherwise leave every node misreporting its own size.\n\nA timer closes the reveal window even in a background tab, so a map loaded out of view is never left half-faded.",
    shortAnswer:
      "One bounded arrival reveal, skipped entirely under reduced motion. It fades opacity only and never scales radius, because radius carries meaning.",
    followups: ["fabric.radius", "fabric.layout_deterministic", "fabric.keyboard"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.rail",
    domain: "fabric",
    title: "The rail beside the map",
    patterns: [
      "what is the column next to the map",
      "what does the rail show",
      "what is capital flow in the sidebar",
      "why does the rail show capabilities instead of numbers",
      "what are the three modules beside the map",
      "what is network activity on fabric",
    ],
    keywords: ["rail", "column", "modules", "capital", "network", "sidebar"],
    answer:
      "The rail is the column beside the map. It answers three questions about the same window the map is drawn from: how much moved and how fast, how many addresses, assets and pairs were involved, and which directed relationships were strongest.\n\nAll three read the same filtered rows the canvas does, so the rail can never contradict what is on screen.\n\nWith nothing measured, three modules each announcing that they are waiting would read as three failures rather than as one system without a database, so a single capability rail says it once instead.\n\nThe foot of the rail states where its reading comes from. It credits indexed Transfer logs only when a measured map is drawn; over the preview it says the source is the product architecture preview and that no observed transfer data was used.",
    shortAnswer:
      "The rail answers three questions about the same window as the map — capital flow, network activity and top flows — and reads exactly the same filtered rows.",
    followups: ["fabric.filters", "fabric.measured_graph", "data.provenance"],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },

  {
    id: "fabric.open",
    domain: "fabric",
    title: "Opening Fabric",
    patterns: [
      "open fabric",
      "take me to the map",
      "where is the topology map",
      "how do i get to fabric",
      "show me the market topology",
      "go to fabric",
    ],
    keywords: ["open", "navigate", "go", "route", "fabric", "map"],
    answer:
      "Fabric is at /fabric. It opens on a 24H window with no asset type, category or flow filter applied.\n\nThe view you land on is either the measured graph for that window or the architecture preview, and the canvas says which.\n\nFilters are part of the URL, so a link you were given may already carry a window and a set of filters with it.",
    shortAnswer: "Fabric is at /fabric, opening on a 24H window with no filters applied.",
    followups: ["fabric.what_is", "fabric.filters", "navigation.open_fabric"],
    actions: [{ label: "OPEN FABRIC", href: "/fabric" }],
    entities: ["FABRIC"],
    routes: ["/fabric"],
  },
];
