# FOLDMARK — north star

> MARKETS HAVE STRUCTURE.
> FOLDMARK MAKES IT VISIBLE.

This document outranks every other decision in the repository. UI, UX, data,
dashboard, chart, graph, copy, motion, architecture and feature choices are all
subordinate to it.

## The central idea

**Every asset has more than a price.** It has holders, liquidity,
counterparties, markets, protocol exposure and capital flows. FOLDMARK connects
those signals into an asset graph so markets can be understood as networks
instead of isolated tickers.

## What FOLDMARK is

A **financial context layer** for Robinhood Chain.

```
raw chain data                    structured financial context
transactions                      assets
addresses          ──FOLDMARK──▶  actors
logs                              relationships
contracts                         flows · markets · protocol exposure
balances                          liquidity · activity
```

It is not an exchange, a wallet, a block explorer, a portfolio tracker, a
TradingView clone or a chatbot.

| Surface           | Question it answers                                  |
| ----------------- | ---------------------------------------------------- |
| Block explorer    | What happened?                                       |
| Trading chart     | What did price do?                                   |
| Portfolio tracker | What do I own?                                       |
| DEX               | What can I trade?                                    |
| **FOLDMARK**      | **How is this market structured, and where is capital moving?** |

## Information hierarchy

1. **What is happening?** — network pulse, active assets, capital movement.
2. **Where is it happening?** — assets, markets, protocols, wallets.
3. **Why does the structure look like this?** — flows, liquidity, relationships,
   counterparties, protocol exposure.
4. **Show me the evidence.** — transactions, contracts, source, methodology,
   timestamp.

Every screen should sit somewhere on this ladder, and should let the reader step
down it toward evidence.

## Non-negotiable rules

**Data over decoration.** An empty truthful state beats a beautiful fake one.
Missing data resolves to `INDEXING`, `PARTIAL DATA`, `DATA UNAVAILABLE` or
`UNCLASSIFIED` — never to a plausible number.

**No mystery intelligence.** Any index or score must publish its inputs, its
window, its computation and its update time. No black-box cosmetic scoring.

**No prediction.** FOLDMARK observes, contextualises and structures. It never
claims certainty about the future. "Flow accelerating", "liquidity expanding",
"large activity observed" describe observable state and are allowed. "Buy now",
"100x signal", "guaranteed alpha", "AI prediction" are not.

**The graph is not decoration.** Every node is a real entity and every edge a
proven relationship. If a relationship cannot be evidenced, it is not drawn.

**Cinematic means observation**, not glow: scale, silence, contrast, pacing,
depth, focus, movement with meaning. When the market is idle the interface is
quiet. Motion follows data; data never follows motion.

## Visual language

Near-black ground, warm off-white ink, restrained signal green, thin structural
lines, precise typography, real data density, deliberate negative space,
editorial scale. Green means attention, activity, live, selected, signal — never
decoration.

The brand should read as quietly intelligent. Not loud, not trying hard, not
shouting "Web3", "AI" or "finance".

## Copy

Short, precise, observational, technical when it needs to be, confident without
hype.

Core lines:

- `EVERY ASSET HAS MORE THAN A PRICE.`
- `MARKETS HAVE STRUCTURE. FOLDMARK MAKES IT VISIBLE.`
- `FOLLOW THE STRUCTURE. READ THE FLOW.`
- `SEE THE MARKET BEHIND THE PRICE.`

## Two interfaces, one intelligence layer

Humans receive context visually; machines receive it structurally. The API is a
natural extension of the UI, not a side channel — same measurements, same
states, same provenance.

## The moat

Not the UI. The moat accumulates as normalised history, asset relationships,
wallet relationships, protocol relationships, capital-flow classification,
market structure, provenance and machine-readable context. More activity →
more observations → more relationships → a better graph → better context → more
human and machine usage.

## Decision filter

Before building anything, ask:

1. Does this expose real market structure?
2. Does it connect information that was previously fragmented?
3. Does it help someone understand an asset beyond its price?
4. Is the data real and explainable?
5. Does it belong in a market intelligence layer?
6. Does it make FOLDMARK more useful to humans or machines?

If most answers are no, do not build it.

## The test

The reader should move from *"I see the price"* to *"I understand the market
around it."* That is the project. Everything else is implementation detail.
