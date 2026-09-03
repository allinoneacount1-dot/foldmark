# FOLDMARK — brand assets

The logo is the one part of this product that is not open to interpretation.
Read this before touching anything in `public/brand/`.

## Source of truth

`brand-source/foldmark-master.jpg` — the Owner's master artwork. It is **not**
inside `public/`, so it is never served to a browser; it exists so the served
assets can be regenerated from the original at any time.

Every file in `public/brand/` is a **lossless alpha extraction** from that
master: the black plate was un-multiplied to straight alpha, nothing was
redrawn. Measured fidelity against the source is a mean per-pixel difference of
**0.42** — the level of JPEG encoding noise.

> **MASTER RASTER = SOURCE OF TRUTH**, until an official vector is produced from
> the correct source.

## Never

- redraw, trace or re-vectorise by interpretation
- regenerate, simplify or modernise
- recolour, or alter any geometry or internal proportion
- stretch, squash, skew, rotate or crop
- add a glow, shadow, gradient, border or background box

A hand-authored SVG approximation of the mark shipped in this repository until
2026-09-04. It was a different letterform — an orthogonal block F with the bars
floating in the counter, where the real mark is a folded F with the bars inside
its diagonal leg. It has been deleted. Do not recreate it.

## The three lockups

There is one master and two derivations. Nothing else is a FOLDMARK logo.

### 1. Canonical master — `foldmark-master.png`

Mark above wordmark, exactly as the Owner composed it. 831 × 436.

Use it wherever the layout gives it room: the footer, a hero, any brand
presentation. This is the composition the brand is defined by.

```tsx
<BrandLogo variant="master" height={72} />
```

### 2. Secondary horizontal lockup — `foldmark-lockup-horizontal.png`

Mark beside wordmark. 1155 × 292.

**This is not a new master.** The mark keeps its geometry, the wordmark keeps
its geometry, both keep their colour and internal proportion; only the spatial
relationship between the two elements changes. It exists for one reason: a
stacked lockup rendered at the 30–40px height a navigation bar allows leaves the
wordmark around 8px tall and illegible.

Use it in the desktop navigation bar, and nowhere the master would fit.

```tsx
<BrandLogo variant="horizontal" height={30} />
```

### 3. Mark only — `foldmark-mark.png`

The symbol alone. 266 × 292.

Use it in narrow navigation, square contexts, and as the source for icons.
`foldmark-mark-512.png` is the 512 × 512 square derivative that
`src/app/icon.png`, `src/app/apple-icon.png` and `src/app/favicon.ico`
(16/32/48/64) are all cut from — so every icon surface traces to the same
symbol.

```tsx
<BrandLogo variant="mark" height={26} />
```

A `wordmark` variant also exists for the rare case where the mark already
appears separately. It is never placed next to the mark by hand — that is what
the horizontal lockup is for.

## How it is rendered

`src/components/brand/BrandLogo.tsx` is the **only** component permitted to
render the logo. Grep for `/brand/` and it should be the sole hit outside this
document.

It enforces the rules by construction:

- `height` drives the size and `width` is derived from it, so a caller cannot
  change the aspect ratio
- there is no prop for a filter, glow, shadow or background
- the background is transparent in every context

## Replacing the master

Drop new files into `public/brand/` at the same paths and aspect ratios. No
component changes. If the aspect ratios change, update the dimensions in
`ASSETS` inside `BrandLogo.tsx` and nowhere else.
