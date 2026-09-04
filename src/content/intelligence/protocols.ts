import type { Entry } from "@/lib/intelligence/types";

/**
 * Protocols, the contracts registry, and verification.
 *
 * This domain owns the answer to "what is that address" and everything that
 * follows from it: what the registry holds, the six protocol categories, how a
 * category is assigned to an edge, and the OBSERVED to IDENTIFIED to
 * CATEGORIZED to VERIFIED ladder that governs how far a claim may travel.
 *
 * The rule underneath every entry here: a category is what a contract looks
 * like, verification is who it is, and the two are never collapsed. Nothing on
 * this chain has reached VERIFIED, because verification needs an authoritative
 * issuer source for the exact contract address and no such source is wired.
 */
export const PROTOCOLS_ENTRIES: Entry[] = [
  {
    id: "protocols.registry",
    domain: "protocols",
    title: "The contracts registry",
    patterns: [
      "what is the contracts registry",
      "contracts registry",
      "what is the protocol registry",
      "protocol registry",
      "how does foldmark know what an address is",
      "where do contract identities come from",
      "explain the registry",
      "what is in the registry",
      "registry meaning",
    ],
    keywords: ["registry", "contracts", "lookup", "identity", "counterparty", "index"],
    answer:
      "The contracts registry is FOLDMARK's record of which addresses have been identified, and as what. It is the input to every semantic claim the product makes about a counterparty.\n\nClassification is a lookup against that record, never an inference. Registry rows are read into a map from lowercased address to a counterparty kind, and both the flow classifier and the category function consult only that map. Nothing about a token name, an amount, or a pattern of activity can add an entry to it.\n\nAn address the registry has never seen is not probably a wallet and not probably a pool. It is unknown, and FOLDMARK reports it that way.\n\nThe registry is empty in production today because no database is connected. Everything that follows from that is the correct outcome of these rules, not a failure.",
    shortAnswer:
      "The contracts registry maps an identified address to a contract type. Classification is a lookup against it, and an address it has never seen stays unknown.",
    detail:
      "Two tables stand behind it. The contracts table is keyed on address and holds chain_id, an optional label, contract_type, an optional protocol_id, evidence, verified and created_at. The protocols table holds slug, name, category, description, website and its own verified flag; a contract is attributed to a protocol by carrying that protocol's id.\n\nThe index builder normalises contract_type through a short alias list. dex_pool, dex and pool all resolve to dex_pool. lending_market and lending resolve to lending_market. bridge, oracle and infrastructure resolve to themselves. Anything else resolves to null, and a row that resolves to null is not written into the index at all.\n\nThe registry is deliberately narrow. It records what someone established about a deployment, with an evidence column carrying why. It is never populated to make a page look occupied.",
    followups: [
      "protocols.contract_entry",
      "protocols.empty_registry",
      "protocols.classification_pipeline",
      "flows.unclassified",
    ],
    actions: [{ label: "OPEN PROTOCOLS", href: "/protocols" }],
    entities: ["REGISTRY"],
    routes: ["/protocols", "/protocol"],
  },

  {
    id: "protocols.contract_entry",
    domain: "protocols",
    title: "What a contract entry holds",
    patterns: [
      "what does a contract entry hold",
      "what fields does a registry row have",
      "contract row fields",
      "what is stored about a contract",
      "what does the contracts table store",
      "registry row",
      "what gets recorded when a contract is identified",
    ],
    keywords: ["contract", "row", "fields", "schema", "evidence", "untyped", "attribution"],
    answer:
      "A contracts row is keyed on the address itself. Alongside it the row carries chain_id, an optional label, contract_type, an optional protocol_id, an evidence string, a verified flag and the time the row was created.\n\ncontract_type is the field classification reads. It resolves to one of five counterparty kinds, or to nothing. Where a type has not been established the interface shows UNTYPED rather than choosing one.\n\nprotocol_id is what attributes a contract to a named protocol. A contract without it is still a registry entry; it simply belongs to no protocol yet, and the protocols API reports those as unattributed contracts.\n\nevidence is the column that makes an entry auditable. A row is meant to say not only what an address is but why anyone concluded it.",
    shortAnswer:
      "Address, chain id, label, contract type, an optional protocol id, evidence, a verified flag and a created timestamp. contract_type is the field classification actually reads.",
    followups: ["protocols.counterparty_kinds", "protocols.protocol_vs_contract", "protocols.registry"],
    entities: ["REGISTRY"],
    routes: ["/protocols"],
  },

  {
    id: "protocols.counterparty_kinds",
    domain: "protocols",
    title: "Counterparty kinds",
    patterns: [
      "what is a counterparty kind",
      "counterparty kinds",
      "what contract types can the registry hold",
      "what is dex_pool",
      "what is lending_market",
      "contract type values",
      "what kinds of contract does foldmark recognise",
    ],
    keywords: ["counterparty", "kind", "dex_pool", "lending_market", "bridge", "oracle", "infrastructure"],
    answer:
      "The registry describes an address with one of five kinds: dex_pool, lending_market, bridge, oracle or infrastructure. The sixth possibility is no kind at all, which is how an address that has not been established is represented.\n\nThose five kinds are the whole vocabulary. Both the flow classifier and the category function are written against them, so adding a kind would change what a flow means rather than merely adding a label.\n\nA few aliases are accepted when a row is read: dex and pool are treated as dex_pool, and lending as lending_market. Anything the alias list does not recognise resolves to nothing, and such a row contributes no identity at all.",
    shortAnswer:
      "Five kinds: dex_pool, lending_market, bridge, oracle, infrastructure. Anything else, including an unrecognised type string, resolves to no kind and leaves the address unidentified.",
    followups: ["protocols.categories", "protocols.unclassified_contract", "flows.direction"],
    entities: ["DEX", "LENDING", "BRIDGE", "ORACLE", "INFRASTRUCTURE"],
    routes: ["/protocols"],
  },

  {
    id: "protocols.categories",
    domain: "protocols",
    title: "The six protocol categories",
    patterns: [
      "what are the protocol categories",
      "protocol categories",
      "what categories are there",
      "what do the category chips mean",
      "list the categories",
      "what is the infrastructure category",
      "what does the oracle category mean",
      "category filter options",
    ],
    keywords: ["categories", "dex", "lending", "bridge", "oracle", "infrastructure", "unclassified", "chips"],
    answer:
      "FOLDMARK defines exactly six protocol categories: DEX, LENDING, BRIDGE, ORACLE, INFRASTRUCTURE and UNCLASSIFIED. They are the values the category filter offers.\n\nEach of the first five comes from one registry kind. dex_pool becomes DEX, lending_market becomes LENDING, bridge becomes BRIDGE, oracle becomes ORACLE and infrastructure becomes INFRASTRUCTURE. No kind at all becomes UNCLASSIFIED.\n\nUNCLASSIFIED is one of the six categories, not the absence of one. It is the correct and final answer for a real counterparty whose identity nothing on chain establishes.\n\nWith the registry empty, every category chip counts zero and selecting one selects nothing. That is the honest reading of an empty registry rather than a broken filter.",
    shortAnswer:
      "DEX, LENDING, BRIDGE, ORACLE, INFRASTRUCTURE and UNCLASSIFIED. The first five map one to one from registry kinds; UNCLASSIFIED is what an unidentified counterparty gets.",
    detail:
      "The category set is a constant in the flow-classification module, and the same constant drives the chips, the URL filter and the counts. A category value in the URL is parsed against that list, and anything unrecognised parses to null, which every surface reads as ALL. A stale query string therefore cannot produce an empty page that looks like a measurement of nothing.\n\nCategory is a property of a contract, and by extension of an edge that touches one. It is not a property of an asset: an asset is described by its asset type, which is a separate vocabulary.\n\nA protocol's category on the Protocols page is taken from what its contracts were identified as in the registry, never from its name.",
    followups: [
      "protocols.category_assignment",
      "protocols.counterparty_kinds",
      "protocols.empty_registry",
      "fabric.filters",
    ],
    actions: [{ label: "OPEN PROTOCOLS", href: "/protocols" }],
    entities: ["DEX", "LENDING", "BRIDGE", "ORACLE", "INFRASTRUCTURE", "UNCLASSIFIED"],
    routes: ["/protocols", "/fabric", "/flows"],
  },

  {
    id: "protocols.category_assignment",
    domain: "protocols",
    title: "How an edge gets a category",
    patterns: [
      "how is a category assigned",
      "how does an edge get a category",
      "which end decides the category",
      "why does the receiving end win",
      "edgecategory",
      "what category does a flow belong to",
      "how does the category filter decide",
    ],
    keywords: ["edgecategory", "receiving", "sending", "assignment", "filter", "edge"],
    answer:
      "An edge belongs to a category because one of its two ends is a contract the registry has identified. Never because of what the other end looks like.\n\nThe receiving address is checked first. If the registry names it, that address's category is the edge's category. Only if the receiving end is unidentified is the sending end consulted. If neither end is identified, the edge is UNCLASSIFIED.\n\nThe receiving end wins because it is the counterparty the value went to, and it is the one a reader filtering for LENDING is looking for. When both ends are identified, that rule decides.\n\nCategory answers a different question from flow class. Category asks which kind of counterparty the edge touched; flow class asks what the movement was, and that depends on direction.",
    shortAnswer:
      "The receiving end is checked first, then the sending end. Whichever the registry names supplies the category; if neither is named, the edge is UNCLASSIFIED.",
    detail:
      "Category assignment and flow classification read the same registry map but answer separately. An edge into an identified pool is category DEX and flow class DEX_SELL. An edge out of the same pool is also category DEX, because the pool is still the identified end, but flow class DEX_BUY, because value left the pool.\n\nThat asymmetry is intentional. Reversing the two ends changes the flow class and leaves the category alone, which is what lets a reader filter for everything touching lending without having to choose between borrowing and repayment first.",
    followups: ["protocols.categories", "flows.direction", "flows.unclassified", "fabric.edges"],
    entities: ["UNCLASSIFIED"],
    routes: ["/flows", "/fabric", "/protocols"],
  },

  {
    id: "protocols.classification_pipeline",
    domain: "protocols",
    title: "The classification pipeline",
    patterns: [
      "what is the classification pipeline",
      "classification pipeline",
      "what are the four stages",
      "observed identified categorized verified",
      "how does an address become a protocol",
      "explain the pipeline diagram",
      "what does the pipeline on the protocols page show",
      "stages of classification",
    ],
    keywords: ["pipeline", "stages", "observed", "identified", "categorized", "verified", "ladder"],
    answer:
      "Four stages, in order: OBSERVED, then IDENTIFIED, then CATEGORIZED, then VERIFIED. A contract enters at OBSERVED and moves only as far as its evidence carries it.\n\nEach step requires strictly more evidence than the one before, and the distance between them is the point. Observed is not identified. Identified is not categorized. Categorized is not verified. Collapsing any pair is how a product ends up asserting an identity nobody established.\n\nThe pipeline is product structure, not a measurement. It is true whether or not anything on this chain has reached a given stage, which is why the diagram on Protocols is labelled as architecture.\n\nNothing on this chain reaches VERIFIED today, so the fourth stage renders unlit.",
    shortAnswer:
      "OBSERVED, IDENTIFIED, CATEGORIZED, VERIFIED. Each stage needs strictly more evidence than the last, and nothing on this chain has reached the fourth.",
    detail:
      "The mechanism and evidence for each stage, as the component states them.\n\n01 OBSERVED. Mechanism: a Transfer log named this contract. Evidence: an ERC-20 Transfer event on chain.\n\n02 IDENTIFIED. Mechanism: the contract answered ERC-20 metadata. Evidence: symbol, name and decimals read from the contract itself.\n\n03 CATEGORIZED. Mechanism: its shape places it in a category. Evidence: on-chain behaviour and metadata, with the standing caveat that a category is not an identity.\n\n04 VERIFIED. Mechanism: an authoritative source confirms the exact contract. Evidence: an issuer-published address for this chain, since a ticker or a name is not enough.\n\nThe component runs in two modes. In model mode no entity is in view, so no stage is marked current and none is lit. In entity mode the furthest stage genuinely reached is passed in, and the diagram shows that position rather than an aspiration.",
    followups: [
      "protocols.stage_observed",
      "protocols.verified",
      "protocols.why_verified_dark",
      "methodology.evidence_ladder",
    ],
    actions: [{ label: "OPEN PROTOCOLS", href: "/protocols" }],
    entities: ["OBSERVED", "IDENTIFIED", "CATEGORIZED", "VERIFIED"],
    routes: ["/protocols", "/assets"],
  },

  {
    id: "protocols.stage_observed",
    domain: "protocols",
    title: "Stage 01 - OBSERVED",
    patterns: [
      "what does observed mean",
      "observed stage",
      "stage 01",
      "what is the first stage of the pipeline",
      "observed meaning foldmark",
      "what does it take to be observed",
    ],
    keywords: ["observed", "stage", "transfer", "log", "first", "entry"],
    answer:
      "OBSERVED is the entry stage. Its mechanism is that a Transfer log named this contract, and its evidence is an ERC-20 Transfer event on chain.\n\nThat is a claim about existence and nothing else. The contract emitted a transfer, so it is real and value moved through it. What it is remains open.\n\nOn the Protocols page the equivalent statement for an address is that it appears in transfer logs with meaningful counterparty breadth. Breadth is a reason to look closer, never a reason to name something.",
    shortAnswer:
      "A Transfer log named the contract. That establishes it exists and moved value, and nothing about what it is.",
    followups: ["protocols.stage_identified", "protocols.classification_pipeline", "protocols.candidate_counterparties"],
    entities: ["OBSERVED"],
    routes: ["/protocols"],
  },

  {
    id: "protocols.stage_identified",
    domain: "protocols",
    title: "Stage 02 - IDENTIFIED",
    patterns: [
      "what does identified mean",
      "identified stage",
      "stage 02",
      "second stage of the pipeline",
      "difference between observed and identified",
      "what makes a contract identified",
    ],
    keywords: ["identified", "metadata", "symbol", "decimals", "stage", "second"],
    answer:
      "IDENTIFIED means the contract answered ERC-20 metadata. The evidence is symbol, name and decimals read from the contract itself.\n\nThat is stronger than OBSERVED because the identity was read from the deployment rather than assumed from a list. It is still self-reported: the contract states what it calls itself, and a contract can call itself anything.\n\nSo IDENTIFIED settles what a thing answers to, not who issued it. The gap between that and VERIFIED is the entire reason the two stages are separate.",
    shortAnswer:
      "The contract answered ERC-20 metadata - symbol, name and decimals read from the deployment. That is self-reported identity, not confirmation of an issuer.",
    followups: ["protocols.stage_categorized", "protocols.ticker_not_evidence", "assets.identity"],
    entities: ["IDENTIFIED"],
    routes: ["/protocols", "/assets"],
  },

  {
    id: "protocols.stage_categorized",
    domain: "protocols",
    title: "Stage 03 - CATEGORIZED",
    patterns: [
      "what does categorized mean",
      "categorized stage",
      "stage 03",
      "third stage of the pipeline",
      "difference between categorized and verified",
      "what is the best state an asset can reach",
    ],
    keywords: ["categorized", "category", "shape", "behaviour", "stage", "third"],
    answer:
      "CATEGORIZED means the contract's shape places it in a category. The evidence is on-chain behaviour and metadata, carried with the caveat the stage itself states: a category is not an identity.\n\nA category says what something looks like. It groups a contract with others that behave the same way, which is enough to filter and to reason about structure.\n\nCATEGORIZED is the honest best state for any asset on this chain today, because the stage above it requires evidence FOLDMARK does not currently hold.",
    shortAnswer:
      "The contract's shape places it in a category, on the evidence of on-chain behaviour and metadata. It is the honest best state on this chain today.",
    followups: ["protocols.verified", "protocols.category_vs_identity", "protocols.classification_pipeline"],
    entities: ["CATEGORIZED"],
    routes: ["/protocols", "/assets"],
  },

  {
    id: "protocols.verified",
    domain: "protocols",
    title: "Stage 04 - VERIFIED",
    patterns: [
      "what does verified mean",
      "what is verification",
      "is anything verified",
      "which assets are verified",
      "verified stage",
      "stage 04",
      "how does something become verified",
    ],
    keywords: ["verified", "verification", "authoritative", "issuer", "confirm", "stage"],
    answer:
      "VERIFIED means an authoritative source confirms the exact contract. The evidence is an issuer-published address for this chain, and the stage states plainly that a ticker or a name is not enough.\n\nNo such source is wired for Robinhood Chain today. Nothing on this chain is presented as verified, and no asset should be read that way.\n\nThat is why the Protocols page describes an empty verified registry as the honest state of this chain rather than a rendering failure. FOLDMARK will not list a protocol name it cannot tie to a verified contract address.\n\nVERIFIED is also the gate for the strongest claims. A protocol appears in the registry when its contracts are identified and verified, and only then may a flow through it carry that protocol's name.",
    shortAnswer:
      "VERIFIED requires an authoritative issuer source confirming the exact contract address on this chain. No such source is wired, so nothing here is verified.",
    detail:
      "Verification lives in the data model, not in prose. An asset row carries verification_status, plus verification_source, verification_evidence and verified_at, so a verified claim is always accompanied by who said so and on what basis.\n\nThe protocols table carries its own verified flag under the rule the schema states: a protocol is verified when someone confirmed its contracts, not when it was typed into a registry. The column defaults to false so an unreviewed row asserts nothing, and a protocol page labels such an entry PENDING VERIFICATION.\n\nA reference market mapping is not verification. Mapping an address to an external instrument records an intention to track that instrument; it never writes verification_status, never sets verified, and never promotes a candidate.",
    followups: [
      "protocols.verification_evidence",
      "protocols.why_verified_dark",
      "protocols.verification_status",
      "protocols.candidate",
    ],
    actions: [{ label: "OPEN PROTOCOLS", href: "/protocols" }],
    entities: ["VERIFIED"],
    routes: ["/protocols", "/assets"],
  },

  {
    id: "protocols.why_verified_dark",
    domain: "protocols",
    title: "Why VERIFIED renders dark",
    patterns: [
      "why is verified dark",
      "why is the last stage greyed out",
      "why is verified not lit",
      "the fourth card is dark",
      "why does verified look inactive",
      "why is the last box unlit",
      "why is stage 04 dim",
    ],
    keywords: ["dark", "unlit", "greyed", "dim", "verified", "fourth", "stage"],
    answer:
      "The fourth stage is unlit because nothing has reached it. The diagram reports a position, and lighting a stage nothing occupies would turn a description into a claim.\n\nVERIFIED requires an authoritative source confirming this exact contract on this exact chain. None is wired, so the furthest any asset here honestly reaches is CATEGORIZED, and the card stops there.\n\nThe reference design shows VERIFIED lit. That is what the component looks like when something genuinely reaches it, and the stage actually reached is what decides. The component deliberately does not light it to match the reference.",
    shortAnswer:
      "Nothing has reached VERIFIED, so the stage renders unlit. The diagram shows the position actually reached rather than the one the reference design shows.",
    followups: ["protocols.verified", "protocols.verification_evidence", "protocols.classification_pipeline"],
    entities: ["VERIFIED"],
    routes: ["/protocols", "/assets"],
  },

  {
    id: "protocols.verification_evidence",
    domain: "protocols",
    title: "What verification requires",
    patterns: [
      "what evidence does verification require",
      "what counts as verification evidence",
      "what would it take to verify a contract",
      "how do you verify an address",
      "what is an authoritative source",
      "what proof is needed to verify",
    ],
    keywords: ["evidence", "authoritative", "issuer", "source", "proof", "address", "chain"],
    answer:
      "Verification requires an authoritative issuer source confirming the exact contract address on the exact chain. Both halves matter: the right issuer about the wrong address establishes nothing, and the right address on a different chain is a different contract.\n\nWhat does not count: a ticker, a symbol, a token name, a third-party market label, or the contract's own metadata. Those are the contract talking about itself, or someone else talking about a name.\n\nWhen a verification does happen, the row records verification_source and verification_evidence alongside verified_at, so the claim can be read back with its basis attached rather than as a bare flag.\n\nNo authoritative source is currently wired for this chain, which is why the status stops short of VERIFIED.",
    shortAnswer:
      "An authoritative issuer source confirming the exact contract address on the exact chain. Tickers, names, metadata and third-party labels are not evidence.",
    followups: [
      "protocols.ticker_not_evidence",
      "protocols.verification_status",
      "protocols.verified",
      "methodology.evidence_ladder",
    ],
    entities: ["VERIFIED"],
    routes: ["/protocols", "/assets", "/methodology"],
  },

  {
    id: "protocols.ticker_not_evidence",
    domain: "protocols",
    title: "Why a ticker or a name is not enough",
    patterns: [
      "why is a ticker not enough",
      "why is a name not proof",
      "can a token name prove identity",
      "why does foldmark not trust the symbol",
      "what stops a fake token",
      "why is the contract address the identity",
      "someone could deploy a fake token",
    ],
    keywords: ["ticker", "symbol", "name", "impersonation", "identity", "address", "metadata"],
    answer:
      "Anyone able to deploy an ERC-20 can choose its symbol and its name. A contract that calls itself an NVIDIA Robinhood Token has asserted a string, not an issuance.\n\nSo identity in FOLDMARK is the pair of chain id and contract address, never a ticker. The schema enforces that as the uniqueness constraint on an asset, and the discovery path records a metadata match as a candidate rather than a fact.\n\nThe same reasoning drives the reference market allowlist, which is keyed on address and nothing else. If a ticker could be derived from metadata, a deployer could choose which financial instrument the product charts beside their contract.\n\nThis is why IDENTIFIED and VERIFIED are separate stages. Reading metadata tells you what a contract answers to. Only an issuer source tells you whose it is.",
    shortAnswer:
      "Symbols and names are chosen by whoever deployed the contract. Identity is chain id plus contract address, which is the one thing a deployer cannot borrow.",
    detail:
      "The discovery routine registers a contract whose name contains the Robinhood Token marker, and records it with verification_source set to an on-chain metadata heuristic and an evidence string saying that string similarity is not proof of issuer. It stays a candidate until an authoritative contract list confirms the address.\n\nThat insert deliberately omits the verified column so the database derives it, and it takes no action on conflict so a rediscovery can never demote a row that had earned a higher status.\n\nThe reference market mapping applies the same principle from the presentation side. It takes an address, never a symbol or a name, so a deployer cannot cause a real company's price history to be rendered beside an unrelated contract.",
    followups: ["protocols.candidate", "protocols.verification_evidence", "assets.identity", "pricing.reference_market"],
    entities: ["CANDIDATE", "VERIFIED"],
    routes: ["/assets", "/protocols"],
  },

  {
    id: "protocols.verification_status",
    domain: "protocols",
    title: "verification_status and the verified mirror",
    patterns: [
      "what is verification_status",
      "verification status enum",
      "what are the verification states",
      "why is there both verified and verification_status",
      "what does the verified boolean do",
      "database trigger for verified",
      "can verified disagree with verification_status",
    ],
    keywords: ["verification_status", "enum", "boolean", "trigger", "mirror", "candidate", "column"],
    answer:
      "An asset row carries verification_status, constrained to exactly three values: OBSERVED, CANDIDATE or VERIFIED. The default is OBSERVED.\n\nThe column exists because a boolean could not express the difference between seeing a contract emit a Transfer and having an authoritative source confirm the exact address. Two of those three states are not verification, and they are not the same as each other.\n\nverified is kept only as a convenience mirror. A database trigger sets it before every insert and update, deriving it as the status being exactly VERIFIED, so the boolean cannot drift from the status it mirrors.\n\nThat trigger is the enforcement. Without it the boolean becomes a second source of truth, and a second source of truth disagreeing with the first is precisely how a product ends up asserting verification nobody performed.",
    shortAnswer:
      "verification_status is OBSERVED, CANDIDATE or VERIFIED, defaulting to OBSERVED. The verified boolean is a mirror a database trigger derives from it, so the two cannot disagree.",
    detail:
      "The trigger runs before insert or update on every row and assigns verified from the comparison of verification_status to VERIFIED. Application code that writes an asset therefore omits verified entirely and lets the database derive it.\n\nThe three statuses read as follows in the schema. OBSERVED: the contract emitted a Transfer and answered ERC-20 metadata. CANDIDATE: its metadata looks like a Robinhood Stock Token. VERIFIED: an authoritative source confirms this exact contract address.\n\nThe status column is indexed, because filtering assets by how well established they are is a first-class question rather than an afterthought. The protocols table carries a plain verified flag under the same rule, defaulting to false.",
    followups: ["protocols.candidate", "protocols.verified", "protocols.verification_evidence", "data.provenance"],
    entities: ["OBSERVED", "CANDIDATE", "VERIFIED"],
    routes: ["/assets", "/protocols"],
  },

  {
    id: "protocols.candidate",
    domain: "protocols",
    title: "Candidate versus verified",
    patterns: [
      "what is a candidate",
      "candidate vs verified",
      "difference between candidate and verified",
      "what does candidate mean",
      "why is something only a candidate",
      "how does a candidate become verified",
      "candidate status",
    ],
    keywords: ["candidate", "verified", "promotion", "heuristic", "status", "discovery"],
    answer:
      "CANDIDATE is what FOLDMARK records when a contract's own metadata looks like a Robinhood Stock Token. It is a statement about a resemblance, made by a heuristic, and it is written down as such.\n\nVERIFIED is what an authoritative issuer source confirms about the exact contract address. Nothing in the product promotes a candidate to verified on its own, and no wired source currently performs that promotion.\n\nThe recorded evidence for a candidate says why: string similarity is not proof of issuer, so the row stays a candidate until an authoritative contract list confirms the address.\n\nA rediscovery never rewrites an existing row, so an address that had earned a higher status cannot be demoted back to candidate by being seen again.",
    shortAnswer:
      "CANDIDATE means metadata resembles a Robinhood Stock Token. VERIFIED means an authoritative source confirmed the exact address. Nothing promotes the first to the second automatically.",
    followups: ["protocols.verification_status", "protocols.ticker_not_evidence", "protocols.verified", "assets.identity"],
    entities: ["CANDIDATE", "VERIFIED"],
    routes: ["/assets", "/protocols"],
  },

  {
    id: "protocols.category_vs_identity",
    domain: "protocols",
    title: "A category is not an identity",
    patterns: [
      "why is a category not an identity",
      "difference between a category and an identity",
      "does a category prove what something is",
      "category is not identity",
      "what does the pipeline caption mean",
      "difference between what it looks like and what it is",
    ],
    keywords: ["category", "identity", "shape", "behaviour", "claim", "distinction"],
    answer:
      "A category is what a contract looks like. Verification is who it is. The two answer different questions and are held apart everywhere in the product.\n\nA category can be assigned from shape: on-chain behaviour and metadata are enough to say a contract behaves like a pool or like a bridge. That supports grouping, filtering and structural reasoning.\n\nIt does not support naming. Behaving like a pool does not establish which pool, whose pool, or that anyone published it. That step needs an issuer source for the exact address.\n\nSo an address can be categorized and still unnamed, and FOLDMARK shows it that way rather than borrowing a name that fits the shape.",
    shortAnswer:
      "A category describes shape and supports filtering. An identity names a specific deployment and needs an authoritative source. Shape never supplies a name.",
    followups: ["protocols.stage_categorized", "protocols.verified", "methodology.no_inference_from_behaviour"],
    entities: ["CATEGORIZED"],
    routes: ["/protocols", "/fabric"],
  },

  {
    id: "protocols.unclassified_contract",
    domain: "protocols",
    title: "Why a contract stays unclassified",
    patterns: [
      "why is this contract unclassified",
      "why does an address stay unclassified",
      "why is nothing classified",
      "what does untyped mean",
      "why is a registry row still unclassified",
      "why can foldmark not classify this address",
    ],
    keywords: ["unclassified", "untyped", "unknown", "classification", "absent", "identity"],
    answer:
      "A contract stays UNCLASSIFIED whenever nothing has established what it is. Two paths lead there.\n\nThe common one is absence: the registry holds no row for the address. There is then no kind to read, so no category and no flow class can be claimed for edges that touch it.\n\nThe second is a row whose contract_type is empty or is not one of the recognised kinds. Such a row resolves to no kind and contributes no identity to the index, and the interface shows the type as UNTYPED rather than picking one.\n\nUNCLASSIFIED is not an error and not a placeholder for a better guess. It means something was observed and there is not sufficient evidence to assign a semantic identity, which is a real answer about a real address.",
    shortAnswer:
      "Either the registry holds no row for the address, or the row carries no recognised contract type. Both resolve to no identity, and UNCLASSIFIED is the correct answer rather than a failure.",
    followups: [
      "flows.unclassified",
      "wallets.unknown_address",
      "protocols.empty_registry",
      "methodology.unknown_stays_unknown",
    ],
    entities: ["UNCLASSIFIED"],
    routes: ["/protocols", "/flows", "/fabric"],
  },

  {
    id: "protocols.empty_registry",
    domain: "protocols",
    title: "What an empty registry means",
    patterns: [
      "why is the registry empty",
      "the protocols page is empty",
      "why are there no protocols listed",
      "why is everything unclassified",
      "why do all the category chips show zero",
      "empty registry consequences",
      "is the empty registry a bug",
    ],
    keywords: ["empty", "registry", "zero", "chips", "unclassified", "consequence"],
    answer:
      "The contracts registry is empty in production, because no database is connected. Four consequences follow directly, and all four are correct.\n\nEvery address stays unidentified. Every observable flow classifies as UNCLASSIFIED. Every category chip counts zero. The category and flow filters therefore select nothing.\n\nWALLET_TRANSFER is not claimed either. That class means the registry was consulted and neither side is a known venue, which is a statement about two addresses established as ordinary. With nothing in the registry, nothing is established as ordinary, so the answer is UNCLASSIFIED.\n\nAn empty registry is a statement about identification, not about the chain. The chain id, head block and RPC round trip on the Protocols page are read without a database, so the chain can be demonstrably live while the registry has answered nothing.",
    shortAnswer:
      "No database is connected, so the registry holds nothing. Every address stays unidentified, every flow reads UNCLASSIFIED, and every category chip counts zero. That is the rule working, not a bug.",
    detail:
      "The Protocols page is careful about which sentence it prints. A registry that has answered and holds nothing is EMPTY, a measurement. A registry that could not be reached is UNAVAILABLE, which is not a measurement. The empty-state copy differs between the two, because saying no protocol is verified on this chain is a claim that is only ours to make once the registry has actually answered.\n\nThe same distinction governs counts. A count of zero is printable only once the query that would have counted actually ran; before that a tile holds a rule and says what would be counted into it.\n\nThe protocols API returns the same position rather than an error: an empty list, a count, the state, and a methodology line saying protocol identity is not inferred from on-chain behaviour.",
    followups: ["protocols.when_populated", "flows.unclassified", "data.empty_vs_indexing", "data.states"],
    actions: [{ label: "OPEN PROTOCOLS", href: "/protocols" }],
    entities: ["UNCLASSIFIED", "REGISTRY"],
    routes: ["/protocols", "/flows", "/fabric"],
  },

  {
    id: "protocols.when_populated",
    domain: "protocols",
    title: "What changes when the registry is populated",
    patterns: [
      "what happens when the registry is populated",
      "what changes when contracts are registered",
      "what would classification look like with a registry",
      "what unlocks when the registry fills",
      "what happens after protocols are added",
      "will flows be classified later",
    ],
    keywords: ["populated", "future", "classification", "registry", "changes", "filters"],
    answer:
      "Each identified address changes the reading of every edge that touches it. An edge into a registered pool becomes DEX_SELL, an edge out of it becomes DEX_BUY, and both carry the category DEX.\n\nWALLET_TRANSFER becomes claimable for the first time. Once the registry can answer, a pair where neither side is a known venue is a statement about two addresses rather than an admission that nothing was consulted.\n\nCategory chips acquire counts, and the category and flow filters begin to select. On Fabric a registered address is drawn as a venue, protocol, oracle or infrastructure node instead of a plain address, since node class is read from the same registry.\n\nThree names would still count zero. LP_DEPOSIT, LP_WITHDRAW and LEND are declared in the vocabulary but are never assigned by the current classifier, so populating the registry does not begin to fill them.",
    shortAnswer:
      "Registered addresses give their edges a class and a category, WALLET_TRANSFER becomes claimable, chips acquire counts, and Fabric draws those addresses by class. LP_DEPOSIT, LP_WITHDRAW and LEND remain unassigned regardless.",
    followups: ["flows.reserved_classes", "protocols.empty_registry", "flows.dex_buy", "fabric.nodes"],
    actions: [{ label: "OPEN FABRIC", href: "/fabric" }],
    entities: ["REGISTRY", "WALLET_TRANSFER"],
    routes: ["/protocols", "/flows"],
  },

  {
    id: "protocols.candidate_counterparties",
    domain: "protocols",
    title: "Unclassified counterparties",
    patterns: [
      "what is the unclassified counterparties list",
      "what are candidates for classification",
      "why is this address listed as a candidate",
      "how does an address get on the candidate list",
      "what does counterparty breadth mean",
      "high degree addresses",
    ],
    keywords: ["candidates", "counterparties", "breadth", "degree", "unclassified", "list"],
    answer:
      "The Protocols page lists addresses with many distinct counterparties over a seven day window. They are candidates for classification, not classified protocols, and every row in that list is labelled UNCLASSIFIED.\n\nThe rule is stated openly. An address appears once at least three distinct counterparties transacted with it inside the window, and the list is ordered by distinct counterparties, then by transfers. Addresses already in the contracts registry are excluded, since they are no longer candidates.\n\nBreadth is the only signal used, and it is a signal that an address may be infrastructure. It is not proof, and it never promotes an address to a name.\n\nWith no database connected there is no folded activity to rank, so the region states the rule rather than listing rows.",
    shortAnswer:
      "Addresses that at least three distinct counterparties transacted with inside the window, ranked by breadth. They are candidates for classification, labelled UNCLASSIFIED and never named.",
    followups: [
      "protocols.unclassified_contract",
      "protocols.stage_observed",
      "methodology.no_inference_from_behaviour",
      "wallets.unknown_address",
    ],
    actions: [{ label: "OPEN PROTOCOLS", href: "/protocols" }],
    entities: ["UNCLASSIFIED"],
    routes: ["/protocols", "/wallets"],
  },

  {
    id: "protocols.protocol_vs_contract",
    domain: "protocols",
    title: "Protocol versus contract",
    patterns: [
      "what is the difference between a protocol and a contract",
      "protocol vs contract",
      "is a protocol an address",
      "how are contracts attributed to a protocol",
      "what makes something a protocol",
      "what is a protocol in foldmark",
    ],
    keywords: ["protocol", "contract", "attribution", "name", "address", "slug"],
    answer:
      "A contract is one address. A protocol is a name that owns a set of them.\n\nThe contracts registry holds addresses and what each was identified as. The protocols registry holds named entries with a slug, a category, a description and a website. A contract joins a protocol by carrying that protocol's id, and contracts without one are counted as unattributed.\n\nA protocol's category is derived from what its contracts were identified as, never from its own name. Its contract count is simply how many registry rows carry its id.\n\nNothing is promoted to a protocol by behaviour. A protocol enters the registry when its contracts are identified and verified, which is why an empty verified registry is the current state rather than a list assembled from activity.",
    shortAnswer:
      "A contract is an address in the contracts registry. A protocol is a named entry that contracts are attributed to by id, and its category comes from what those contracts were identified as.",
    followups: ["protocols.protocol_page", "protocols.contract_entry", "protocols.verified", "protocols.categories"],
    actions: [{ label: "OPEN PROTOCOLS", href: "/protocols" }],
    entities: ["REGISTRY"],
    routes: ["/protocols", "/protocol"],
  },

  {
    id: "protocols.protocol_page",
    domain: "protocols",
    title: "What a protocol page holds",
    patterns: [
      "what is on a protocol page",
      "what does the protocol inspector show",
      "what fields does a protocol have",
      "where do protocol page numbers come from",
      "why can i not open a protocol page",
      "protocol detail page",
    ],
    keywords: ["protocol", "page", "inspector", "fields", "sources", "pending"],
    answer:
      "A protocol page holds seven fields, and each reads from one source. Identity and category come from the protocols registry. Contracts come from the contracts registry. Transfers, counterparties and assets touched are folded from Transfer logs. Relationships come from the market graph built over registered addresses.\n\nNo field is inferred from another. A page opens only for an entry that exists in the registry, so it never renders a name FOLDMARK assembled itself.\n\nThe page header states verification directly: VERIFIED when the registry records it, PENDING VERIFICATION otherwise. Pending is the honest label for an entry whose contracts nobody has confirmed.\n\nThe four figures at the head follow the same discipline. A count of zero is printable only once the query behind it actually ran; before that the tile says what would be counted into it.",
    shortAnswer:
      "Identity and category from the protocols registry, contracts from the contracts registry, transfers and counterparties folded from Transfer logs, relationships from the market graph. A page opens only for a registry entry.",
    followups: ["protocols.protocol_vs_contract", "protocols.verified", "data.provenance", "data.states"],
    entities: ["REGISTRY"],
    routes: ["/protocol", "/protocols"],
  },
];
