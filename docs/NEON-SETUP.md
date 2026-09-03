# Database setup

FOLDMARK needs Postgres. Not a hosting product — Postgres. Neon's free tier is
what it is built and tested against, but nothing here is Neon-specific: any
Postgres 15 or newer works, including one running on your laptop.

Roughly ten minutes, no payment details.

---

## 1. Create the database

1. Sign in at <https://neon.tech> and create a project.
2. Name the database `foldmark`.
3. Pick the region closest to your Vercel deployment. Every page render makes at
   least one round trip, so region choice is the single largest lever on how
   fast the site feels.
4. Stay on the **Free** plan. FOLDMARK is designed to run at zero cost and
   nothing in it requires a paid tier.

Copy the **pooled** connection string — Neon labels it *Pooled connection*, and
its host contains `-pooler`. It looks like:

```
postgresql://user:password@ep-something-pooler.region.aws.neon.tech/foldmark?sslmode=require
```

Use the pooled one for the application. A Vercel function is frozen between
requests, so a direct connection per invocation exhausts a free tier's
connection ceiling quickly; the pooler exists precisely to absorb that.

---

## 2. Point the code at it

Local development:

```bash
cp .env.example .env.local
# then paste the connection string into DATABASE_URL
```

`.env.local` is gitignored. `.env.example` is the template and holds no values.

---

## 3. Create the schema

```bash
npm run db:migrate
```

Applies every file in `db/migrations` in order and records each one, so a second
run is a no-op. Each file runs in its own transaction: a failure leaves the
database exactly as it was rather than half-migrated.

Check what is applied without changing anything:

```bash
npm run db:status
```

---

## 4. Prove it behaves

```bash
node scripts/db-selftest.mjs
```

This is worth running, not skipping. It asserts the guarantees FOLDMARK's
honesty actually rests on, against the real database rather than a mock:

- transactions roll back
- a second pairless price observation from the same fetch is **rejected by the
  database** — the nullable-column version of this constraint enforced nothing,
  and duplicate price history is indistinguishable from real market activity
- two genuine observations carrying the *same price* are still kept as two rows,
  because identity is the source and the moment, never the value
- a price observation for a non-existent asset is refused
- `verified = true` on a `CANDIDATE` asset is forced back to false by a trigger,
  so the boolean cannot drift from the verification status
- the provider lease is atomic: under contention exactly one caller acquires it

Every check runs inside a transaction that is rolled back, so it leaves no rows
behind and is safe against production.

---

## 5. Configure the deployment

In Vercel → Settings → Environment Variables, set for **both** Production and
Preview:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the pooled connection string |
| `NEXT_PUBLIC_ROBINHOOD_RPC` | `https://robinhood-rpc.publicnode.com` |
| `DEXSCREENER_ENABLED` | `false` |

`DATABASE_URL` is server-only. Never rename it to anything beginning
`NEXT_PUBLIC_` — that prefix compiles the value into the browser bundle, and the
browser has no business holding a database credential. It calls the FOLDMARK API
instead, and the API queries on its behalf.

---

## 6. Start the ingestion runner

The database is empty until something fills it, and FOLDMARK does not ship seed
data. There are no placeholder assets and no example prices, because a number on
screen that nobody measured is the one thing this product will not do.

```powershell
.\scripts\install-live-indexer.ps1 -BaseUrl https://your-deployment.vercel.app
```

The free public RPC retains roughly 52 blocks of logs — about five seconds at
this chain's block time — against roughly 860,000 blocks a day. A job that runs
every few minutes does not fall behind and catch up; it misses everything in
between, permanently. So ingestion follows the chain head continuously, and that
needs a process rather than a scheduled function.

The daily Vercel cron calls the same route and is a fallback, not the pipeline.
One pass a day cannot stay inside a five-second window, and it is far too sparse
to price transfers: notional valuation aligns each transfer to a price observed
within fifteen minutes of it, so without the runner most transfers are correctly
reported as unpriced rather than valued at a distant quote.

---

## Moving data from an older database

Optional, and often not worth it. The index rebuilds forward from live chain
data by design, so a fresh start costs history rather than correctness.

If you do import, one rule is not optional: **stock tokens whose only evidence
was a name heuristic must arrive as `CANDIDATE` with `verified = false`.** The
schema enforces this with a trigger, so a bad import is corrected rather than
accepted — but import them honestly anyway. `VERIFIED` means an authoritative
source confirmed that exact contract address on that exact chain. A contract
whose `name()` contains "Robinhood Token" proves nothing; anyone can deploy one.

Zero verified stock tokens is the correct state until such a source exists.
