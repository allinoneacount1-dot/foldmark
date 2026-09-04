import type { Entry } from "@/lib/intelligence/types";

/**
 * FOLDMARK Intelligence — the flows domain.
 *
 * Capital flow structure: what a flow is, what a directed edge carries, how
 * direction is read from a transfer, and what each name in the flow-class
 * vocabulary requires as evidence. One entry per class the classifier can
 * emit, one entry per reserved name it cannot, and the filter, URL and page
 * behaviour that sit on top of them.
 *
 * The rule this file holds: a flow is named from the registry identity of its
 * counterparty and from the direction value travelled. Nothing else may name
 * it, and UNCLASSIFIED is the correct answer whenever nothing else can.
 */
export const FLOWS_ENTRIES: Entry[] = [
  {
    id: "flows.what_is",
    domain: "flows",
    title: "What a flow is",
    patterns: [
      "what is a flow",
      "what is a capital flow",
      "define flow",
      "flow",
      "explain flows",
      "what does flow mean in foldmark",
      "what counts as a flow",
      "capital flow meaning",
      "what is a value edge",
    ],
    keywords: ["flow", "capital", "transfer", "edge", "movement", "value", "directed"],
    answer:
      "A flow is a directed movement of value between two addresses inside an observation window. FOLDMARK folds it from indexed ERC-20 Transfer logs: one address sent a quantity of one token, another address received it, and the log recorded that.\n\nA flow carries a source, a destination, one asset, an amount in that asset's own units, a count of the transfers folded into it, and a classification. Direction is part of the record. The same pair of addresses in the other order is a different flow.\n\nA transfer log says value moved. It does not say what the movement was for. That second question is what flow classification answers, and it is answered from the registry identity of the counterparty rather than from the size, the frequency or the shape of the transfer.",
    shortAnswer:
      "A flow is a directed movement of value between two addresses in a window, folded from indexed Transfer logs, carrying a source, a destination, one asset, an amount and a classification.",
    detail:
      "The record a flow carries is fixed. SOURCE is the address the value left. DESTINATION is the address it arrived at. ASSET is the token contract that moved, and one edge carries exactly one asset. AMOUNT is summed over the window in that asset's own units at that asset's own decimals. TRANSFERS is how many individual transfers folded into the edge. CLASSIFICATION is derived from the counterparty contract, or reads UNCLASSIFIED while its identity is unknown.\n\nEvery flow surface on the page is derived from that record. The page recomputes it at request time from the transfers held for the trailing window, so a flow is never a stored opinion about the market — it is the fold of the logs that were indexed for that period.\n\nA flow is not a trade, a swap, a deposit or a payment until something identifies the counterparty. Those are interpretations of a transfer, and FOLDMARK will not apply one without evidence.",
    followups: ["flows.direction", "flows.folded_edges", "flows.unclassified", "flows.flows_page"],
    actions: [{ label: "OPEN FLOWS", href: "/flows" }],
    entities: ["FLOW"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.directed_edge",
    domain: "flows",
    title: "Directed edges",
    patterns: [
      "what is a directed edge",
      "directed edge",
      "what is an edge",
      "edge meaning",
      "why are flows directed",
      "what does an edge carry",
      "what fields does an edge have",
    ],
    keywords: ["edge", "directed", "pair", "sender", "receiver", "record"],
    answer:
      "An edge is one direction between an ordered pair of addresses, for one asset. FOLDMARK stores the pair as ordered because a transfer has a sender and a receiver, and collapsing that into an undirected line would throw away the fact that decides what the flow means.\n\nEvery edge holds six things: source, destination, asset, amount in that asset's own units, the number of transfers folded into it, and a classification.\n\nOn Fabric the same edge is drawn as a curve with the arrowhead at the receiving end, and its stroke weight comes from transfer count rather than token amount.",
    shortAnswer:
      "An edge is one direction between an ordered pair of addresses for one asset, carrying source, destination, asset, amount, transfer count and classification.",
    followups: ["flows.what_is", "flows.direction", "fabric.edges"],
    entities: ["EDGE", "FLOW"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.source",
    domain: "flows",
    title: "Source",
    patterns: [
      "what is the source",
      "source column",
      "what does source mean",
      "who is the source of a flow",
      "what is the from address",
      "sender",
      "source meaning in flows",
    ],
    keywords: ["source", "from", "sender", "origin", "column"],
    answer:
      "The source is the address the value left. It is the sending side of the transfer, taken from the log itself.\n\nIt is always a real address on the chain, never a label. FOLDMARK does not substitute a name for it, and being a source establishes nothing about what the address is — an address that sends value is an address that sent value.\n\nWhen the registry identifies the source, that identity is what produces DEX_BUY, BORROW or BRIDGE_IN. When it does not, the source stays an unidentified address and the flow reads UNCLASSIFIED.",
    shortAnswer:
      "The source is the sending address of a transfer, taken from the log. It is an address, not a label, and sending value establishes nothing about what it is.",
    followups: ["flows.destination", "flows.counterparty", "wallets.unknown_address"],
    entities: ["SOURCE"],
    routes: ["/flows"],
  },

  {
    id: "flows.destination",
    domain: "flows",
    title: "Destination",
    patterns: [
      "what is the destination",
      "destination column",
      "what does destination mean",
      "what is the to address",
      "receiver",
      "recipient of a flow",
      "destination meaning in flows",
    ],
    keywords: ["destination", "to", "receiver", "recipient", "column"],
    answer:
      "The destination is the address the value arrived at. It is the receiving side of the transfer.\n\nThe receiving side carries more weight than the sending side in two places. In flow classification, a registered venue on the receiving side is tested first: into a DEX pool is DEX_SELL, into a lending market is REPAY, into a bridge is BRIDGE_OUT. In category assignment, when both ends are identified the receiving end wins, because that is the counterparty value went to.\n\nA destination that the registry has never seen stays an unidentified address. It is not called a wallet, a market or a protocol on the strength of having received something.",
    shortAnswer:
      "The destination is the receiving address of a transfer. It is tested first in classification, and it wins category assignment when both ends are identified.",
    followups: ["flows.direction", "flows.dex_category_vs_dex_buy", "wallets.address_vs_wallet"],
    entities: ["DESTINATION"],
    routes: ["/flows"],
  },

  {
    id: "flows.counterparty",
    domain: "flows",
    title: "Counterparty",
    patterns: [
      "what is a counterparty",
      "counterparty",
      "counterparty meaning",
      "what does counterparty derived mean",
      "why does the counterparty matter",
      "who is the counterparty in a flow",
    ],
    keywords: ["counterparty", "other side", "registry", "identity", "derived"],
    answer:
      "The counterparty is the other address in a transfer, seen from the side you are looking at. On the flows page it is whichever end of the edge is not the address in question.\n\nThe counterparty is what makes a flow mean something. The same amount of the same token moving between two ordinary addresses is a transfer; moving out of a DEX pool it is a purchase. The amount is identical in both cases, so the difference is entirely the counterparty's identity.\n\nThat identity comes from one place: the contracts registry. The registry maps an address to a counterparty kind — dex_pool, lending_market, bridge, oracle, infrastructure, or nothing at all. The classification panel on the flows page is headed COUNTERPARTY DERIVED for exactly this reason.",
    shortAnswer:
      "The counterparty is the other address in a transfer. Its registry identity is what turns a movement of value into a named flow.",
    followups: ["flows.classification_is_lookup", "protocols.registry", "flows.unclassified"],
    entities: ["COUNTERPARTY"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.direction",
    domain: "flows",
    title: "How direction is determined",
    patterns: [
      "how is direction determined",
      "how does foldmark know the direction",
      "what decides the direction of a flow",
      "direction",
      "which way did value go",
      "how do you know if it was a buy or a sell",
      "direction semantics",
      "explain flow direction",
    ],
    keywords: ["direction", "directed", "into", "out of", "sending", "receiving"],
    answer:
      "Direction comes from the transfer itself. One address sent, another received, and FOLDMARK keeps that orientation everywhere: the edge points from the sending address to the receiving address, and on Fabric the arrowhead sits at the receiving end.\n\nClassification then reads direction against the registry. A registered DEX pool on the receiving side is DEX_SELL, because value went into the pool. The same pool on the sending side is DEX_BUY, because value left the pool toward the receiver. A registered lending market on the receiving side is REPAY and on the sending side is BORROW. A registered bridge on the receiving side is BRIDGE_OUT and on the sending side is BRIDGE_IN.\n\nSo a label is a function of two things and nothing else: which side of the transfer the identified contract sits on, and what kind of contract the registry says it is. Neither the token, the amount, nor how often the two addresses transact enters the decision.",
    shortAnswer:
      "Direction is read from the transfer — sender to receiver — and the label follows from which side the identified contract sits on and what kind of contract it is.",
    detail:
      "The tests run in a fixed order, and the receiving side is tested before the sending side within each venue kind. Receiving side is a dex_pool gives DEX_SELL. Sending side is a dex_pool gives DEX_BUY. Receiving side is a lending_market gives REPAY, unless the sending side is also a lending_market, in which case the answer is UNCLASSIFIED. Sending side is a lending_market gives BORROW. Receiving side is a bridge gives BRIDGE_OUT. Sending side is a bridge gives BRIDGE_IN.\n\nIf neither side is one of those venue kinds, there are still two different answers. When the registry holds entries, the flow is WALLET_TRANSFER. When the registry is empty, the flow is UNCLASSIFIED, because an empty registry means nothing was consulted rather than that both sides were found to be ordinary.\n\nGetting direction backwards would invert every trade on the page, which is why the rule is stated once in the classifier and never re-derived at each call site.",
    followups: ["flows.buy_or_sell_same_pool", "flows.classification_order", "flows.dex_buy", "flows.dex_sell"],
    entities: ["FLOW", "DIRECTION"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.classes",
    domain: "flows",
    title: "The flow class vocabulary",
    patterns: [
      "what are the flow classes",
      "list the flow classes",
      "flow class vocabulary",
      "what classifications exist",
      "what labels can a flow have",
      "flow types",
      "how many flow classes are there",
      "what are the flow categories",
    ],
    keywords: ["classes", "vocabulary", "labels", "classification", "list", "types"],
    answer:
      "FOLDMARK declares eleven flow class names: DEX_BUY, DEX_SELL, LP_DEPOSIT, LP_WITHDRAW, LEND, BORROW, REPAY, BRIDGE_IN, BRIDGE_OUT, WALLET_TRANSFER and UNCLASSIFIED.\n\nThe current classifier can only ever return eight of them: DEX_SELL, DEX_BUY, REPAY, BORROW, BRIDGE_OUT, BRIDGE_IN, WALLET_TRANSFER and UNCLASSIFIED. LP_DEPOSIT, LP_WITHDRAW and LEND are reserved names that nothing is assigned to today, so their filter chips always count zero.\n\nThe vocabulary is deliberately small because each name carries a hard evidence requirement. There is no confidence score and no partial credit: a flow either meets the requirement for a label or it reads UNCLASSIFIED.",
    shortAnswer:
      "Eleven names are declared, eight can be assigned by the current classifier, and LP_DEPOSIT, LP_WITHDRAW and LEND are reserved names that are never assigned today.",
    followups: ["flows.reserved_classes", "flows.direction", "flows.unclassified"],
    actions: [{ label: "OPEN FLOWS", href: "/flows" }],
    entities: ["FLOW_CLASS"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.dex_buy",
    domain: "flows",
    title: "DEX_BUY",
    patterns: [
      "what is dex buy",
      "dex buy",
      "explain dex buy",
      "dex_buy meaning",
      "what does dex_buy mean",
      "when is a flow a dex buy",
      "how is a buy detected",
      "what makes something a buy",
    ],
    keywords: ["dex_buy", "buy", "purchase", "pool", "dex", "out"],
    answer:
      "DEX_BUY is assigned when the sending side of a transfer is an address the contracts registry holds as a dex_pool. Value left the pool and arrived at the receiver, which is what a purchase looks like from the pool's side.\n\nOnly that one fact produces the label. A token's name, the size of the amount, the number of transfers between the two addresses and any resemblance to trading activity are all irrelevant to it.\n\nThe registry is empty in this deployment, so no address is held as a dex_pool and no flow is assigned DEX_BUY. The DEX_BUY chip counts zero and those edges read UNCLASSIFIED instead. That is the rule working, not a gap in it.",
    shortAnswer:
      "DEX_BUY means the sending side of the transfer is a registered DEX pool — value left the pool toward the receiver. With an empty registry it is never assigned and its chip counts zero.",
    detail:
      "DEX_BUY is not the same thing as the DEX category. The flow class asks which side the pool was on; the category asks only whether an identified contract was touched, with the receiving end winning when both ends are identified. An edge can be classified DEX_BUY and still fall in a different category — if value left a registered pool and arrived at a registered lending market, the flow class is DEX_BUY while the category is LENDING.\n\nDEX_BUY is also tested before the lending and bridge branches. A pool on either side settles the classification before those branches are reached.\n\nWhat would change the count is one input: an address-to-protocol mapping for this chain, with each entry recorded deliberately. Classification then runs with no other change to the pipeline.",
    followups: ["flows.dex_sell", "flows.buy_or_sell_same_pool", "flows.dex_category_vs_dex_buy", "protocols.registry"],
    entities: ["DEX_BUY"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.dex_sell",
    domain: "flows",
    title: "DEX_SELL",
    patterns: [
      "what is dex sell",
      "dex sell",
      "explain dex sell",
      "dex_sell meaning",
      "what does dex_sell mean",
      "when is a flow a dex sell",
      "how is a sell detected",
      "what makes something a sell",
    ],
    keywords: ["dex_sell", "sell", "pool", "dex", "into", "sale"],
    answer:
      "DEX_SELL is assigned when the receiving side of a transfer is an address the contracts registry holds as a dex_pool. Value went into the pool, which is what a sale looks like from the pool's side.\n\nIt is the mirror of DEX_BUY and it is decided by the same single fact — which side the identified pool sits on. Amount, asset and frequency play no part.\n\nBecause the registry is empty in this deployment, no address is held as a dex_pool, nothing is assigned DEX_SELL, and the chip counts zero. Those edges read UNCLASSIFIED.",
    shortAnswer:
      "DEX_SELL means the receiving side of the transfer is a registered DEX pool — value went into the pool. With an empty registry it is never assigned and its chip counts zero.",
    detail:
      "The receiving side is tested before the sending side, so an edge running from one registered pool to another registered pool classifies as DEX_SELL rather than DEX_BUY. The rule is deterministic in that case rather than ambiguous.\n\nA DEX_SELL edge always falls in the DEX category, because the pool is its receiving end and the receiving end decides the category. A DEX_BUY edge falls there too unless its receiving end is itself identified as some other kind, in which case that kind takes the category. So filtering to the DEX category and filtering to DEX_SELL are different selections rather than the same one under two names.\n\nNothing about a sale is inferred from price movement. The label describes where the value went, not what it was worth: a venue price is a separate observation, recorded as DEX_SPOT with its own provenance.",
    followups: ["flows.dex_buy", "flows.buy_or_sell_same_pool", "flows.dex_category_vs_dex_buy", "pricing.dex_spot"],
    entities: ["DEX_SELL"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.borrow",
    domain: "flows",
    title: "BORROW",
    patterns: [
      "what is borrow",
      "borrow",
      "explain borrow flow",
      "borrow meaning",
      "what does the borrow class mean",
      "when is a flow a borrow",
      "how is borrowing classified",
    ],
    keywords: ["borrow", "lending", "market", "debt", "draw"],
    answer:
      "BORROW is assigned when the sending side of a transfer is an address the contracts registry holds as a lending_market, and the receiving side is not one. Value left the lending market toward the receiver.\n\nIt is the direction rule applied to a lending contract: out of the market is BORROW, into the market is REPAY.\n\nThe lending branch is only reached when neither side is a registered DEX pool, because the pool tests run first. With the registry empty, no address is held as a lending_market and nothing is assigned BORROW.",
    shortAnswer:
      "BORROW means the sending side of the transfer is a registered lending market — value left the market. Nothing is assigned it while the registry is empty.",
    followups: ["flows.repay", "flows.both_lending_markets", "flows.direction"],
    entities: ["BORROW"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.repay",
    domain: "flows",
    title: "REPAY",
    patterns: [
      "what is repay",
      "repay",
      "explain repay flow",
      "repay meaning",
      "what does the repay class mean",
      "when is a flow a repay",
      "how is repayment classified",
    ],
    keywords: ["repay", "lending", "market", "debt", "into"],
    answer:
      "REPAY is assigned when the receiving side of a transfer is an address the contracts registry holds as a lending_market and the sending side is not also one. Value went into the lending market.\n\nWhen both sides are lending markets the answer is UNCLASSIFIED rather than REPAY. Two identified markets moving value between themselves does not establish which of them was being repaid, so the classifier declines to name it.\n\nWith the registry empty, no address is held as a lending_market and nothing is assigned REPAY. The chip counts zero.",
    shortAnswer:
      "REPAY means the receiving side is a registered lending market and the sending side is not. Both sides being lending markets yields UNCLASSIFIED instead.",
    followups: ["flows.borrow", "flows.both_lending_markets", "flows.unclassified"],
    entities: ["REPAY"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.bridge_in",
    domain: "flows",
    title: "BRIDGE_IN",
    patterns: [
      "what is bridge in",
      "bridge in",
      "bridge_in meaning",
      "explain bridge in",
      "what does bridge_in mean",
      "when is a flow a bridge in",
      "how is a bridge crossing classified",
    ],
    keywords: ["bridge_in", "bridge", "inbound", "crossing", "entering"],
    answer:
      "BRIDGE_IN is assigned when the sending side of a transfer is an address the contracts registry holds as a bridge. Value came out of the bridge contract and into the receiving address.\n\nThe bridge branch is the last venue test the classifier runs. It is reached only when neither side is a registered DEX pool and neither side is a registered lending market.\n\nOn Fabric a bridge is drawn with the protocol shape, but the BRIDGE_IN and BRIDGE_OUT distinction survives in flow classification. The drawing simplifies; the flow label does not.",
    shortAnswer:
      "BRIDGE_IN means the sending side of the transfer is a registered bridge contract — value came out of the bridge.",
    followups: ["flows.bridge_out", "flows.direction", "fabric.nodes"],
    entities: ["BRIDGE_IN"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.bridge_out",
    domain: "flows",
    title: "BRIDGE_OUT",
    patterns: [
      "what is bridge out",
      "bridge out",
      "bridge_out meaning",
      "explain bridge out",
      "what does bridge_out mean",
      "when is a flow a bridge out",
      "how is value leaving the chain classified",
    ],
    keywords: ["bridge_out", "bridge", "outbound", "leaving", "crossing"],
    answer:
      "BRIDGE_OUT is assigned when the receiving side of a transfer is an address the contracts registry holds as a bridge. Value went into the bridge contract.\n\nAs with every other class, the receiving side is tested before the sending side, and the whole bridge branch is only reached when no DEX pool and no lending market was found on either end.\n\nWith the registry empty, no address is held as a bridge, so nothing is assigned BRIDGE_OUT and the chip counts zero.",
    shortAnswer:
      "BRIDGE_OUT means the receiving side of the transfer is a registered bridge contract — value went into the bridge.",
    followups: ["flows.bridge_in", "flows.classification_order", "protocols.categories"],
    entities: ["BRIDGE_OUT"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.wallet_transfer",
    domain: "flows",
    title: "WALLET_TRANSFER",
    patterns: [
      "what is wallet transfer",
      "wallet transfer",
      "wallet_transfer meaning",
      "explain wallet transfer",
      "what does wallet_transfer mean",
      "when is a flow a wallet transfer",
      "why is nothing a wallet transfer",
    ],
    keywords: ["wallet_transfer", "transfer", "ordinary", "neither", "narrow"],
    answer:
      "WALLET_TRANSFER is assigned when the registry was consulted, held entries, and neither side of the transfer is one of the venue kinds the classifier tests for. It is a statement that both ends were looked up and neither turned out to be a venue.\n\nThat makes it deliberately narrow. It is a claim about two addresses, not a fallback for everything the classifier could not name.\n\nWith an empty registry the lookup answers nothing about either side, so nothing is identified as ordinary either. The correct answer there is UNCLASSIFIED, never WALLET_TRANSFER. That distinction is the whole reason the two labels are separate.",
    shortAnswer:
      "WALLET_TRANSFER means the registry held entries and neither side is a venue. With an empty registry the answer is UNCLASSIFIED instead, because nothing was established about either address.",
    detail:
      "The classifier branches on three venue kinds only: dex_pool, lending_market and bridge. The registry can also hold a contract as oracle or infrastructure, and those kinds carry no flow-class branch, so an edge whose only identified side is an oracle or infrastructure contract falls through to the final test alongside genuinely unrecognised addresses.\n\nThe final test is a size check on the registry, not a claim about the two addresses individually. It asks whether the registry could answer at all. A non-empty registry means the lookup was meaningful and returned nothing, which is WALLET_TRANSFER. An empty registry means the lookup was not meaningful, which is UNCLASSIFIED.\n\nNote also that the name describes the class, not the participants. FOLDMARK does not call an unidentified address a wallet elsewhere in the product, and the presence of this label does not establish that either end is an externally owned account.",
    followups: ["flows.wallet_transfer_narrow", "flows.unclassified", "wallets.address_vs_wallet"],
    entities: ["WALLET_TRANSFER"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.unclassified",
    domain: "flows",
    title: "UNCLASSIFIED",
    patterns: [
      "what is unclassified",
      "unclassified",
      "explain unclassified",
      "what does unclassified mean",
      "why is everything unclassified",
      "why are all flows unclassified",
      "is unclassified an error",
      "is unclassified a bug",
      "why cant you classify this flow",
      "unclassified meaning",
    ],
    keywords: ["unclassified", "unknown", "unidentified", "default", "evidence"],
    answer:
      "UNCLASSIFIED means FOLDMARK observed a movement of value and does not have sufficient evidence to assign a semantic identity to it. It is a real classification, not an error and not a failure state.\n\nIt is not a synonym for anything else. Not identified is not the same claim as it is a wallet, it is a DEX, it is a protocol, or it is infrastructure. Each of those would be an assertion about the world; UNCLASSIFIED is an assertion about the evidence.\n\nThe registry is empty in this deployment, so every address stays unidentified and every observable flow classifies as UNCLASSIFIED. Every other chip counts zero, and the flow filter therefore selects nothing when it is set to any class other than UNCLASSIFIED. That is the correct outcome of the rules, not a bug in them.\n\nThe alternative is worse. A heuristic that called any busy address a DEX would fill every row with a confident label and be wrong often enough to make the whole dataset untrustworthy, including the rows it got right. A reader can act on a gap; they cannot act on a label that is right most of the time without knowing which times.",
    shortAnswer:
      "UNCLASSIFIED means something was observed but there is not enough evidence to name it. It is a real answer about an unknown counterparty, not a placeholder for a better one.",
    detail:
      "Nothing about a token's name, its symbol, an amount, a transfer count or a pattern of activity may promote a flow out of UNCLASSIFIED. Only an identified contract on one side of it can. That rule is held in one place so it cannot be relaxed piecemeal at a call site.\n\nThe classifier reaches UNCLASSIFIED from two situations, and it means the same thing in both: the registry is empty, so neither address could be looked up at all; or both sides are registered lending markets, so which of them was being repaid is not established. Where the registry holds entries and neither side is a venue, the answer is WALLET_TRANSFER rather than UNCLASSIFIED, because the lookup was able to answer.\n\nUNCLASSIFIED is also a category, not only a flow class. An edge between two unidentified addresses falls in the UNCLASSIFIED category, and a contract the registry holds with no recognised kind maps there too.\n\nCorrecting the registry corrects the labels. Because classification is a lookup against stored transfers rather than an interpretation baked in at write time, historical flows can be relabelled from the same rows once identities exist. Nothing has to be re-indexed for a label to become available.",
    followups: [
      "flows.wallet_transfer_narrow",
      "flows.registry_dependency",
      "methodology.unknown_stays_unknown",
      "flows.chip_counts",
    ],
    actions: [
      { label: "OPEN FLOWS", href: "/flows" },
      { label: "READ FLOW CLASSIFICATION", href: "/docs/flow-classification" },
    ],
    entities: ["UNCLASSIFIED"],
    routes: ["/flows", "/fabric", "/protocols"],
  },

  {
    id: "flows.lp_deposit",
    domain: "flows",
    title: "LP_DEPOSIT",
    patterns: [
      "what is lp deposit",
      "lp deposit",
      "lp_deposit meaning",
      "explain lp deposit",
      "what does lp_deposit mean",
      "why is lp deposit always zero",
      "why does lp deposit have no flows",
    ],
    keywords: ["lp_deposit", "liquidity", "deposit", "reserved", "zero"],
    answer:
      "LP_DEPOSIT is a name declared in the flow class vocabulary. The current classifier never assigns it. Nothing FOLDMARK can observe today produces this label, so its chip always counts zero.\n\nThe classifier branches on the registry kind of each side — dex_pool, lending_market or bridge — and on which side it sits. Distinguishing a liquidity deposit from an ordinary transfer into a pool needs evidence the classifier does not read.\n\nSo the honest description is that the name is reserved, not that deposits are being counted and none have happened. Those are different claims and the chip's zero means the first one.",
    shortAnswer:
      "LP_DEPOSIT is a reserved name in the vocabulary. The current classifier never assigns it, so its chip always counts zero.",
    followups: ["flows.reserved_classes", "flows.lp_withdraw", "flows.classes"],
    entities: ["LP_DEPOSIT"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.lp_withdraw",
    domain: "flows",
    title: "LP_WITHDRAW",
    patterns: [
      "what is lp withdraw",
      "lp withdraw",
      "lp_withdraw meaning",
      "explain lp withdraw",
      "what does lp_withdraw mean",
      "why is lp withdraw always zero",
      "why does lp withdraw never match anything",
    ],
    keywords: ["lp_withdraw", "liquidity", "withdraw", "reserved", "zero"],
    answer:
      "LP_WITHDRAW is a name declared in the flow class vocabulary that the current classifier never assigns. Its chip always counts zero.\n\nA withdrawal of liquidity and a purchase both look like value leaving a pool at the level of a Transfer log. Separating them requires evidence beyond the counterparty lookup the classifier performs, so FOLDMARK does not attempt the distinction.\n\nThe zero on this chip means the label is unassigned by construction. It does not mean liquidity removals were measured and none were found.",
    shortAnswer:
      "LP_WITHDRAW is a reserved name. The current classifier never assigns it, so its chip always counts zero.",
    followups: ["flows.reserved_classes", "flows.lp_deposit", "flows.dex_buy"],
    entities: ["LP_WITHDRAW"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.lend",
    domain: "flows",
    title: "LEND",
    patterns: [
      "what is lend",
      "lend",
      "lend flow class",
      "explain lend",
      "what does the lend class mean",
      "why is lend always zero",
      "difference between lend and borrow",
    ],
    keywords: ["lend", "lending", "supply", "reserved", "zero"],
    answer:
      "LEND is a name declared in the flow class vocabulary that the current classifier never assigns. Its chip always counts zero.\n\nThe lending branch the classifier does run produces only two labels: REPAY when the receiving side is a registered lending market, and BORROW when the sending side is. Supplying to a market and repaying a debt both move value into the same contract, and the classifier has no evidence that separates them, so it does not claim to.\n\nBORROW and REPAY are assignable names with a rule behind them. LEND is a reserved name with no rule behind it today.",
    shortAnswer:
      "LEND is a reserved name. The lending branch only ever produces BORROW or REPAY, so LEND is never assigned and its chip always counts zero.",
    followups: ["flows.reserved_classes", "flows.repay", "flows.borrow"],
    entities: ["LEND"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.reserved_classes",
    domain: "flows",
    title: "Reserved flow classes",
    patterns: [
      "which flow classes are never assigned",
      "reserved flow classes",
      "why do some chips always show zero",
      "which classes does the classifier not use",
      "are all eleven flow classes used",
      "what are lp deposit lp withdraw and lend",
      "why are some flow labels unused",
    ],
    keywords: ["reserved", "unused", "zero", "vocabulary", "declared", "unassigned"],
    answer:
      "Three of the eleven declared flow class names are reserved: LP_DEPOSIT, LP_WITHDRAW and LEND. They exist in the vocabulary, they appear as filter chips, and the current classifier never assigns any of them.\n\nThe classifier can return eight labels: DEX_SELL, DEX_BUY, REPAY, BORROW, BRIDGE_OUT, BRIDGE_IN, WALLET_TRANSFER and UNCLASSIFIED. Nothing routes to the other three, so their counts are zero by construction rather than by measurement.\n\nThat distinction matters when reading a chip. A zero next to DEX_BUY says no observed flow met the DEX_BUY requirement. A zero next to LEND says the label has no rule behind it yet. Both read zero and they are not the same statement.",
    shortAnswer:
      "LP_DEPOSIT, LP_WITHDRAW and LEND are declared in the vocabulary but never assigned by the current classifier, so their chips count zero by construction.",
    detail:
      "Separating the three cases a zero can represent is the point. A reserved class counts zero because nothing can ever be routed to it under the current rules. An assignable class counts zero because no observed edge met its requirement — with the registry empty, that is currently true of every assignable class except UNCLASSIFIED, which is where each observable edge lands instead. And a class would count zero on a filtered view simply because the active filter excluded everything else.\n\nThe names were kept in the vocabulary rather than deleted because adding an alias to that list changes what a flow means, and a later classifier that can read pool token mints and burns would assign LP_DEPOSIT and LP_WITHDRAW without the vocabulary having to move underneath existing data.\n\nUntil that exists, FOLDMARK states the position plainly rather than letting an empty chip imply a measurement.",
    followups: ["flows.lp_deposit", "flows.lp_withdraw", "flows.lend", "flows.chip_counts"],
    entities: ["LP_DEPOSIT", "LP_WITHDRAW", "LEND"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.wallet_transfer_narrow",
    domain: "flows",
    title: "Why an empty registry gives UNCLASSIFIED, not WALLET_TRANSFER",
    patterns: [
      "why is it unclassified instead of wallet transfer",
      "why not call it a wallet transfer",
      "why is wallet transfer narrow",
      "empty registry unclassified",
      "if neither side is a venue why isnt it a wallet transfer",
      "difference between unclassified and wallet transfer",
    ],
    keywords: ["narrow", "empty", "registry", "difference", "ordinary", "lookup"],
    answer:
      "WALLET_TRANSFER is claimed only when the registry was consulted and neither side came back as a known venue. That is a positive finding about two addresses: they were looked up, and they are not venues.\n\nAn empty registry cannot produce that finding. It answers nothing about either side, so neither address is identified as ordinary any more than it is identified as a pool. Claiming WALLET_TRANSFER there would convert we have not looked into we looked and found nothing special.\n\nUNCLASSIFIED is the honest answer in that case, and it is the answer FOLDMARK returns. The two labels are separate precisely so this difference survives into the data.",
    shortAnswer:
      "WALLET_TRANSFER asserts that both sides were checked and neither is a venue. An empty registry establishes nothing about either side, so the answer is UNCLASSIFIED.",
    followups: ["flows.wallet_transfer", "flows.unclassified", "data.empty_vs_indexing", "protocols.registry"],
    entities: ["WALLET_TRANSFER", "UNCLASSIFIED"],
    routes: ["/flows"],
  },

  {
    id: "flows.buy_or_sell_same_pool",
    domain: "flows",
    title: "The same pool can produce a buy or a sell",
    patterns: [
      "why is the same pool sometimes a buy and sometimes a sell",
      "how can the same address be a buy and a sell",
      "same pool different classification",
      "why did the same pair classify differently",
      "does the pool decide buy or sell",
      "what changes a buy into a sell",
    ],
    keywords: ["same", "pool", "buy", "sell", "invert", "orientation"],
    answer:
      "The same pool and the same counterparty address produce DEX_BUY or DEX_SELL depending only on which way value went. The identities are identical in both cases; the orientation of the transfer is the only difference.\n\nValue into the pool is DEX_SELL. Value out of the pool is DEX_BUY. Two edges between the same pair of addresses, running in opposite directions, therefore carry opposite labels and are two distinct flows.\n\nThis is why direction is stored rather than derived at display time. Reversing it would invert every trade label on the page at once.",
    shortAnswer:
      "Identity does not decide the label; direction does. Value into a registered pool is DEX_SELL, value out of the same pool is DEX_BUY.",
    followups: ["flows.direction", "flows.dex_buy", "flows.dex_sell"],
    entities: ["DEX_BUY", "DEX_SELL"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.classification_order",
    domain: "flows",
    title: "The order the classifier tests in",
    patterns: [
      "what order does classification run in",
      "which rule wins if both sides are registered",
      "classification precedence",
      "what if both ends are venues",
      "how are conflicts between rules resolved",
      "does dex beat lending",
    ],
    keywords: ["order", "precedence", "conflict", "branch", "wins", "first"],
    answer:
      "The tests run in a fixed order, so a transfer touching more than one kind of venue still gets exactly one label. DEX pool tests run first, then lending market tests, then bridge tests. Within each kind, the receiving side is tested before the sending side.\n\nSo a registered pool on either side settles the classification before the lending and bridge branches are reached, and an edge from one registered pool to another reads DEX_SELL because the receiving test comes first.\n\nThe order is a property of the classifier rather than a judgement about which venue matters more. It exists so the same edge always resolves to the same label.",
    shortAnswer:
      "DEX tests run first, then lending, then bridge, and the receiving side is tested before the sending side — so every edge resolves to exactly one label, deterministically.",
    followups: ["flows.direction", "flows.both_lending_markets", "flows.dex_category_vs_dex_buy"],
    entities: ["FLOW_CLASS"],
    routes: ["/flows"],
  },

  {
    id: "flows.both_lending_markets",
    domain: "flows",
    title: "Both sides a lending market",
    patterns: [
      "what if both sides are lending markets",
      "two lending markets transferring",
      "why is a lending to lending transfer unclassified",
      "both ends lending market",
      "lending market to lending market",
    ],
    keywords: ["both", "lending", "market", "unclassified", "ambiguous"],
    answer:
      "When the registry holds both sides of a transfer as lending markets, the classifier returns UNCLASSIFIED rather than REPAY.\n\nREPAY means value went into a lending market from something that was not one. If both ends are markets, which of them was being repaid is not established by the direction alone, and the classifier will not pick one.\n\nIt is the same principle as everywhere else in FOLDMARK: an ambiguous case resolves to unknown rather than to the more plausible of two guesses.",
    shortAnswer:
      "Two registered lending markets on either side of a transfer yields UNCLASSIFIED, because direction alone does not establish which market was repaid.",
    followups: ["flows.repay", "flows.unclassified", "methodology.unknown_stays_unknown"],
    entities: ["REPAY", "UNCLASSIFIED"],
    routes: ["/flows"],
  },

  {
    id: "flows.filters",
    domain: "flows",
    title: "The flow class filter",
    patterns: [
      "how do the flow filters work",
      "what do the flow chips do",
      "flow filter",
      "how do i filter flows",
      "what happens when i click a flow class",
      "why does the filter show nothing",
      "how do i clear the flow filter",
      "what are the chips on the flows page",
    ],
    keywords: ["filter", "chips", "flow", "select", "counts", "clear"],
    answer:
      "The classification panel on the flows page carries one chip per flow class, plus an ALL chip. Each chip shows how many folded edges in the current window fall in that class, and selecting one narrows the page to those edges.\n\nThe filter is a link, not local component state. Selecting a class navigates to the same page with the class in the query string; clicking the active chip again clears it back to ALL.\n\nSelecting a class narrows the surfaces built from folded edges: the ledger, the transfers-carried-on-edges tile, the asset ranking and the empty state all derive from the filtered set. The window totals beside them — transfers, directed edges, active addresses — count the whole window and do not move with the filter.",
    shortAnswer:
      "One chip per flow class, each showing its count in the current window. Selecting a chip narrows the surfaces built from folded edges; clicking the active chip clears it.",
    detail:
      "Fabric carries the same flow filter alongside an asset type filter and a category filter, and there the three compose: setting one keeps the others, so a narrowed view can be built up and shared.\n\nThe counts come from classifying every folded edge in the window and tallying the results, which is why a named class can show zero while ALL shows a larger number. With the registry empty, every edge tallies to UNCLASSIFIED and every other chip reads zero.\n\nSelecting a class that currently holds nothing produces an empty result, and the page says so with a state rather than presenting a blank table as a measurement.",
    followups: ["flows.url_state", "flows.stale_filter", "flows.chip_counts", "fabric.filters"],
    actions: [{ label: "OPEN FLOWS", href: "/flows" }],
    entities: ["FLOW_CLASS"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.url_state",
    domain: "flows",
    title: "Filter state lives in the URL",
    patterns: [
      "where does the filter state live",
      "why is the filter in the url",
      "can i share a filtered view",
      "does the filter survive a refresh",
      "what does the w parameter mean",
      "what does the flow query parameter do",
      "url state",
    ],
    keywords: ["url", "query", "shareable", "refresh", "state", "parameter"],
    answer:
      "Filter state is held in the query string rather than in component state. The window is w and the flow class is flow; on Fabric the asset type is type and the category is category.\n\nBecause the state is in the URL, a view survives a reload, back and forward work, the link can be sent to someone, and the server renders exactly the page the link describes.\n\nThat also means the page you are looking at is fully described by its address. There is no hidden selection that a shared link would drop.",
    shortAnswer:
      "Window and filter selections live in the query string, so a view is shareable, survives reload and renders the same on the server.",
    followups: ["flows.stale_filter", "flows.filters", "flows.windows"],
    entities: ["FILTER"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.stale_filter",
    domain: "flows",
    title: "An unrecognised filter value reads as ALL",
    patterns: [
      "what happens if the filter value is wrong",
      "why does my link show everything",
      "stale filter",
      "what if i type a bad flow value in the url",
      "unrecognised filter value",
      "why did my filter reset to all",
      "invalid query parameter",
    ],
    keywords: ["stale", "invalid", "unrecognised", "fallback", "all", "null"],
    answer:
      "A filter value that is not in the vocabulary parses to null, and null reads as ALL. A hand-typed or out-of-date query string therefore widens the view rather than narrowing it to nothing.\n\nThe reason is that an empty page is a claim. If a stale link produced a blank table, it would look like a measurement of nothing rather than a filter that no longer resolves, and a reader would draw a conclusion about the chain from a typo.\n\nThe same rule applies to the window parameter: an unrecognised window falls back to the default of 24H rather than rendering nothing.",
    shortAnswer:
      "An unrecognised filter value parses to null and reads as ALL, because a stale query string must never produce an empty page that looks like a measurement of nothing.",
    followups: ["flows.url_state", "flows.filters", "data.empty_vs_indexing"],
    entities: ["FILTER"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.chip_counts",
    domain: "flows",
    title: "Why every flow chip counts zero",
    patterns: [
      "why do all the flow chips show zero",
      "why does every count read 0",
      "why are the chips empty",
      "why does filtering select nothing",
      "why is every class zero",
      "are the counts broken",
    ],
    keywords: ["zero", "counts", "chips", "empty", "nothing", "selects"],
    answer:
      "A chip's count is the number of folded edges in the current window that classify into that class. With the contracts registry empty, no address on either side of any edge is identified, so every edge classifies as UNCLASSIFIED and every other class tallies zero.\n\nSelecting one of those other classes therefore selects nothing. The filter is working correctly — it is filtering for a label that nothing currently carries.\n\nThree of the zeros mean something different again: LP_DEPOSIT, LP_WITHDRAW and LEND are reserved names the classifier never assigns, so their counts would be zero even with a populated registry.",
    shortAnswer:
      "Counts come from classifying the window's edges. With the registry empty everything classifies as UNCLASSIFIED, so every other class reads zero and selecting one of them selects nothing.",
    followups: ["flows.unclassified", "flows.reserved_classes", "flows.registry_dependency", "protocols.registry"],
    entities: ["UNCLASSIFIED"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.dex_category_vs_dex_buy",
    domain: "flows",
    title: "The DEX category is not the DEX_BUY flow class",
    patterns: [
      "what is the difference between dex and dex buy",
      "is the dex category the same as dex_buy",
      "category versus flow class",
      "why are there two dex filters",
      "difference between category and classification",
      "dex category meaning",
      "why does filtering by dex give a different result",
    ],
    keywords: ["category", "class", "difference", "dex", "filter", "conflate"],
    answer:
      "They answer different questions and they are not interchangeable. The flow class asks what the movement was: DEX_BUY requires the sending side to be a registered pool, DEX_SELL requires the receiving side to be one. The category asks which kind of counterparty the edge touched at all.\n\nCategory assignment ignores direction in one specific way: when both ends are identified, the receiving end wins, because that is the counterparty value went to. When neither end is identified the category is UNCLASSIFIED.\n\nSo the DEX category holds both DEX_BUY and DEX_SELL edges, and the two can even come apart. An edge running out of a registered pool into a registered lending market classifies as DEX_BUY while its category is LENDING. Filtering by DEX and filtering by DEX_BUY are two different selections.",
    shortAnswer:
      "DEX is a counterparty category and DEX_BUY is a flow class. The category covers both trade directions, and an edge's class and category can differ when both of its ends are identified.",
    detail:
      "The two filters also live in different query parameters. The flow class is flow and the category is category. On Fabric both chip groups are present alongside the asset type filter, and they compose — setting one keeps the others. The flows page carries the flow class filter and the window.\n\nThe categories themselves come from the registry kind of a contract: dex_pool maps to DEX, lending_market to LENDING, bridge to BRIDGE, oracle to ORACLE, infrastructure to INFRASTRUCTURE, and anything with no recognised kind to UNCLASSIFIED.\n\nConflating the two would misread the data in a specific way: a reader filtering the DEX category and reading the result as purchases would be counting sales as well. The vocabularies are kept separate for that reason.",
    followups: ["protocols.categories", "flows.dex_buy", "flows.dex_sell", "fabric.filters"],
    entities: ["DEX", "DEX_BUY"],
    routes: ["/flows", "/fabric", "/protocols"],
  },

  {
    id: "flows.flows_page",
    domain: "flows",
    title: "What the flows page shows",
    patterns: [
      "what does the flows page show",
      "what is on the flows page",
      "what is the capital flow observatory",
      "what am i looking at on flows",
      "explain this page",
      "what is where capital moves",
      "what does the flow observatory do",
    ],
    keywords: ["page", "observatory", "flows", "shows", "layout", "surfaces"],
    answer:
      "The flows page is the capital flow observatory. It presents directed value edges between addresses, folded from indexed transfers over a trailing window, with the window selectable between 1H, 6H, 24H, 7D and 30D and 24H as the default.\n\nIts surfaces include a chain strip carrying the head and the endpoint read on the request, a row of window tiles, a data condition state, a transfer rate figure, a ledger of the strongest folded edges, rankings of the most active sources, destinations and assets, net flow by address, and the classification panel with the flow class chips.\n\nWhen nothing has been folded yet, the page names what each surface will hold rather than drawing empty boxes, and it shows the flow architecture figure and the classification pipeline in place of the measured chart.",
    shortAnswer:
      "It is the capital flow observatory: directed edges folded from indexed transfers over a selectable window, with rankings, net flow, and the flow class filter.",
    followups: ["flows.top_relationships", "flows.net_flow", "flows.architecture_figure", "flows.filters"],
    actions: [{ label: "OPEN FLOWS", href: "/flows" }],
    entities: ["FLOWS"],
    routes: ["/flows"],
  },

  {
    id: "flows.folded_edges",
    domain: "flows",
    title: "Why flows are folded into edges",
    patterns: [
      "why are flows folded",
      "what does folded mean",
      "why not show every transfer",
      "what is folding",
      "how are transfers grouped into edges",
      "folded edge meaning",
      "why is one row many transfers",
    ],
    keywords: ["fold", "folded", "group", "aggregate", "transfers", "edge"],
    answer:
      "Folding groups the individual transfers in a window into one edge per source, destination and asset. The amounts are summed in that asset's own units, the transfers are counted, and the most recent block is kept.\n\nThe reason is that a relationship is the unit a reader is looking for. Twenty transfers between the same two addresses in the same token are one relationship observed twenty times, and listing them separately would bury that under repetition.\n\nFolding also produces the one quantity that is comparable across assets. Amounts in different tokens cannot be added, but the transfer count of an edge can be compared with any other edge's, which is why counts carry the address and asset rankings and the stroke weight on Fabric.\n\nNothing is lost in the fold that classification needs. A label is derived from the source and the destination, and both are part of the key the fold groups on, so an edge classifies the same way each of its transfers would.",
    shortAnswer:
      "Folding collapses a window's transfers into one edge per source, destination and asset, summing the amount in that asset's units and counting the transfers.",
    detail:
      "The fold key is the triple of sending address, receiving address and asset. A transfer of a different asset between the same two addresses is a separate edge, because one edge carries exactly one asset and mixing them would produce an amount with no unit.\n\nThe folded edges are ordered by summed amount and the page caps how many it holds, then the ledger lists the strongest of them. An amount only means something beside its own symbol, which is why the ledger shows the asset in its own column next to every amount.\n\nOn Fabric the same folded edges are what the graph draws. Every edge there exists because value actually moved along it, and its stroke weight is derived from transfer count rather than token amount, because scaling a stroke by amount would let a stablecoin edge overwhelm an equity edge purely because of decimals.",
    followups: ["flows.counts_not_amounts", "flows.top_relationships", "fabric.edges"],
    entities: ["EDGE"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.top_relationships",
    domain: "flows",
    title: "Top relationships",
    patterns: [
      "what is the top relationships table",
      "what are the columns in the flow ledger",
      "top relationships",
      "what does the ledger show",
      "strongest edges",
      "what is in the flows table",
    ],
    keywords: ["ledger", "table", "relationships", "columns", "rows", "strongest"],
    answer:
      "The ledger under TOP RELATIONSHIPS lists the strongest folded edges in the selected window, ordered by the amount summed on each edge in its own asset. Its columns are SOURCE, DESTINATION, ASSET, AMOUNT, TRANSFERS and CLASSIFICATION.\n\nSOURCE and DESTINATION are addresses and link to their address views. ASSET is the token contract that moved. AMOUNT is summed over the window in that asset's own units. TRANSFERS is how many transfers folded into the row. CLASSIFICATION is derived from the counterparty contract, or UNCLASSIFIED while its identity is unknown.\n\nThe ledger reads the filtered set of folded edges, so a flow class chip narrows it along with the transfers-on-edges tile and the asset ranking.",
    shortAnswer:
      "A ledger of the strongest folded edges in the window, with source, destination, asset, amount in that asset's units, transfer count and classification.",
    followups: ["flows.folded_edges", "flows.filters", "wallets.address_vs_wallet"],
    actions: [{ label: "OPEN FLOWS", href: "/flows" }],
    entities: ["EDGE"],
    routes: ["/flows"],
  },

  {
    id: "flows.net_flow",
    domain: "flows",
    title: "Net flow by address",
    patterns: [
      "what is net flow",
      "net flow",
      "how is net flow calculated",
      "what does net flow by address mean",
      "net flow meaning",
      "why is net flow per asset",
      "what do the green and red bars mean",
    ],
    keywords: ["net", "inflow", "outflow", "balance", "address", "per asset"],
    answer:
      "Net flow is defined per address and per asset: received minus sent, in that asset's own units, over the window.\n\nIt is never summed across assets. One NVDA plus one USDG is not two of anything, so a single net number spanning several tokens would have no unit and would order addresses by whichever asset has the smallest denomination.\n\nIt is also not defined per token contract, where a transfer moves balance without changing supply. The figure is precomputed per address by the indexer after each run that commits new transfers, so it appears once the pipeline has produced it rather than being folded at request time.",
    shortAnswer:
      "Received minus sent, per address and per asset, in that asset's own units. It is never summed across assets and not defined per token contract.",
    followups: ["flows.counts_not_amounts", "flows.what_is", "data.states"],
    entities: ["NET_FLOW"],
    routes: ["/flows", "/wallets"],
  },

  {
    id: "flows.counts_not_amounts",
    domain: "flows",
    title: "Why counts rank a cross-asset view",
    patterns: [
      "why are rankings by transfer count",
      "why not rank by amount",
      "why are amounts not added up",
      "why is everything ranked by transfers",
      "can you add token amounts together",
      "why is there no total volume",
    ],
    keywords: ["counts", "amounts", "ranking", "comparable", "units", "volume"],
    answer:
      "The flows page looks across every asset at once, so nothing on it adds token amounts together and the rankings that compare addresses and assets to one another are by count. Adding one NVDA, one AAPL and one USDG produces a number with no unit, and sorting by it would order addresses by whichever asset happens to have the smallest denomination.\n\nCounts survive the comparison. How many transfers, how many counterparties, how many assets touched — those are comparable between any two addresses regardless of what moved. So counts are what rank a cross-asset view.\n\nAmounts still appear, always beside the symbol they belong to. An amount without its unit is not a fact, which is why the ledger carries the asset in its own column and the net flow rows carry the symbol on every line.",
    shortAnswer:
      "Token amounts in different assets are not comparable, so the address and asset rankings use counts. Amounts appear only beside their own symbol and are never added across assets.",
    followups: ["flows.net_flow", "flows.notional", "flows.folded_edges"],
    routes: ["/flows"],
  },

  {
    id: "flows.notional",
    domain: "flows",
    title: "Notional moved",
    patterns: [
      "what is notional",
      "notional moved",
      "how is notional calculated",
      "what does notional mean",
      "why is notional missing",
      "how do you value a flow in usd",
      "is there a usd total",
    ],
    keywords: ["notional", "usd", "value", "alignment", "price", "total"],
    answer:
      "Notional is the one figure on the flows page that legitimately spans assets, because it has a unit. It is a USD total computed only where every transfer in it aligns to a price observed at or before the transfer.\n\nThe alignment carries no look-ahead and a tolerance of fifteen minutes. A transfer with no price observation inside that window contributes no notional at all rather than borrowing a later price, so the total is a sum of valued transfers rather than an estimate stretched to cover the unvalued ones.\n\nThat is why notional can be absent while transfers are present. The page states which transfers were valued rather than presenting a total that quietly assumed prices it did not have.",
    shortAnswer:
      "A USD total computed only from transfers that align to a price observed at or before them, within a fifteen-minute tolerance and with no look-ahead.",
    followups: ["pricing.price_types", "flows.counts_not_amounts", "pricing.dex_spot"],
    entities: ["NOTIONAL"],
    routes: ["/flows"],
  },

  {
    id: "flows.windows",
    domain: "flows",
    title: "The observation window",
    patterns: [
      "what is the window",
      "what windows are available",
      "what does 24h mean",
      "how do i change the time window",
      "observation window",
      "what is the default window",
      "does the window change the classification",
    ],
    keywords: ["window", "24h", "trailing", "period", "1h", "30d"],
    answer:
      "A window is the trailing period a figure was computed over. FOLDMARK offers five: 1H, 6H, 24H, 7D and 30D. Flows and Fabric both default to 24H.\n\nThe window decides which transfers are folded, so it decides the edges, the counts, the rankings and the chip totals. It does not decide the labels: classification depends on the registry and on direction, not on how long a period was examined.\n\nThe selection lives in the URL as w, so a window is part of a shareable view and survives a reload.",
    shortAnswer:
      "The trailing period a figure covers — 1H, 6H, 24H, 7D or 30D, defaulting to 24H. It decides which transfers are folded, not how they are classified.",
    followups: ["flows.url_state", "flows.folded_edges", "data.freshness"],
    entities: ["WINDOW"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "flows.architecture_figure",
    domain: "flows",
    title: "The flow architecture figure",
    patterns: [
      "what is the diagram on the flows page",
      "what is the architecture figure",
      "are those real addresses in the diagram",
      "what does the flow diagram show",
      "why is there a diagram instead of a chart",
      "what does architecture mean on this page",
    ],
    keywords: ["architecture", "diagram", "figure", "structure", "placeholder", "preview"],
    answer:
      "When no transfers have been folded for the window, the flows page draws the flow architecture figure in place of the transfer rate chart. It shows the shape of a flow — source, asset, counterparty — and the fields an edge carries.\n\nIt is structure only. The figure carries an ARCHITECTURE marker and its provenance line states that it holds no observations. Its labels are category placeholders, not observed addresses, and nothing in it is denominated.\n\nBelow it the classification pipeline is shown in model mode, with no entity in view, so no stage is current. VERIFIED stays dark there because nothing on this chain reaches it.",
    shortAnswer:
      "A structure-only figure shown when nothing has been folded. It draws the shape of a flow and the fields an edge carries, and contains no observations.",
    followups: ["fabric.architecture_preview", "protocols.classification_pipeline", "flows.flows_page"],
    entities: ["ARCHITECTURE"],
    routes: ["/flows"],
  },

  {
    id: "flows.classification_is_lookup",
    domain: "flows",
    title: "Classification is a lookup, not an inference",
    patterns: [
      "how does flow classification work",
      "is classification a guess",
      "how do you classify a flow",
      "is there a model behind classification",
      "how are labels assigned",
      "does foldmark infer what a transfer was",
      "classification pipeline for flows",
    ],
    keywords: ["lookup", "inference", "classify", "registry", "deterministic", "rule"],
    answer:
      "Classification is a lookup against the contracts registry, followed by a direction test. It is not a score, a similarity measure or a probability.\n\nThe registry maps an address to one counterparty kind: dex_pool, lending_market, bridge, oracle, infrastructure, or nothing. The classifier reads that kind for each side of the edge, applies the direction rule, and returns one label. When the registry is empty, so neither address can be looked up at all, the answer is UNCLASSIFIED.\n\nBecause it is a lookup over stored transfers, a label is reproducible and auditable, and correcting a registry entry corrects every flow that entry produced — including historical ones, without re-indexing anything.",
    shortAnswer:
      "A registry lookup plus a direction test. No score, no similarity measure, and no label produced by anything other than an identified contract.",
    followups: ["flows.no_promotion_from_behaviour", "protocols.registry", "protocols.classification_pipeline"],
    actions: [{ label: "READ FLOW CLASSIFICATION", href: "/docs/flow-classification" }],
    routes: ["/flows", "/protocols"],
  },

  {
    id: "flows.no_promotion_from_behaviour",
    domain: "flows",
    title: "Nothing promotes a flow out of UNCLASSIFIED",
    patterns: [
      "can activity promote a flow to a label",
      "why not classify by behaviour",
      "if an address is very busy is it a dex",
      "can you infer a protocol from activity",
      "why not use heuristics",
      "does volume affect classification",
      "does the token name affect classification",
    ],
    keywords: ["behaviour", "heuristic", "promote", "infer", "volume", "naming"],
    answer:
      "Nothing about a token's name, its symbol, an amount, or a pattern of activity may move a flow out of UNCLASSIFIED. Only an identified contract on one side of it can.\n\nHigh counterparty counts are surfaced — the protocols page lists addresses with many distinct counterparties in a window — but they are labelled as unclassified counterparties and nothing more. A high count is a reason to look. It is not evidence of what a contract does.\n\nThe cheapest way to make a product look complete is to guess, and a guess that is usually right is the most damaging kind, because it gives no way to tell the right rows from the wrong ones. FOLDMARK prefers unknown to incorrect.",
    shortAnswer:
      "Only an identified contract can name a flow. Volume, naming, transaction shape and activity patterns never promote one out of UNCLASSIFIED.",
    followups: ["methodology.no_inference_from_behaviour", "flows.unclassified", "protocols.classification_pipeline"],
    actions: [{ label: "OPEN PROTOCOLS", href: "/protocols" }],
    routes: ["/flows", "/protocols"],
  },

  {
    id: "flows.registry_dependency",
    domain: "flows",
    title: "What would make flow labels appear",
    patterns: [
      "what would make classification work",
      "what is needed to classify flows",
      "when will flows be labelled",
      "how do i get real flow classes",
      "what enables the flow vocabulary",
      "what is missing for classification",
    ],
    keywords: ["registry", "enables", "needed", "mapping", "populate", "relabel"],
    answer:
      "One input changes it: an address-to-protocol mapping for this chain, with each entry recorded deliberately rather than derived from observation. That is what the contracts registry holds, and in this deployment it holds nothing — the registry is read from a database and none is connected, so the lookup returns no rows.\n\nOnce the registry has entries, classification runs with no other change to the pipeline. The classifier already reads it on every edge, and the filters, chips and counts are already wired to the result.\n\nBecause labels are derived from stored transfers at read time, historical flows can be relabelled from the same rows. Nothing has to be re-indexed for a label to appear, and a corrected registry entry corrects every flow it produced.",
    shortAnswer:
      "A deliberate address-to-protocol mapping for this chain. With the registry populated, classification runs unchanged and historical flows can be relabelled from the same stored transfers.",
    followups: ["protocols.registry", "flows.unclassified", "flows.chip_counts", "data.coverage"],
    actions: [{ label: "READ FLOW CLASSIFICATION", href: "/docs/flow-classification" }],
    routes: ["/flows", "/protocols"],
  },

  {
    id: "flows.flow_vs_trade",
    domain: "flows",
    title: "A flow is not a trade",
    patterns: [
      "is a flow a trade",
      "does a flow mean someone bought something",
      "is this a transaction",
      "difference between a flow and a trade",
      "does an edge mean a swap",
      "is a transfer a purchase",
    ],
    keywords: ["trade", "transaction", "swap", "purchase", "difference", "meaning"],
    answer:
      "A flow is a movement of value with a direction. A trade is an interpretation of one, and it requires knowing that one side was a market.\n\nUntil the counterparty is identified, the two cannot be told apart from the log. The same amount of the same token moving between two ordinary addresses and moving out of a DEX pool produce identical transfer records; only the counterparty's identity separates them.\n\nSo FOLDMARK reports the movement and, separately, whatever the evidence supports calling it. On this chain today that is UNCLASSIFIED for every flow, which is a statement about the counterparty rather than about the movement.",
    shortAnswer:
      "A flow is an observed movement of value. Calling it a trade is an interpretation that requires an identified market on one side of it.",
    followups: ["flows.what_is", "flows.unclassified", "methodology.evidence_ladder"],
    routes: ["/flows"],
  },
];
