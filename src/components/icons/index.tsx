/**
 * FOLDMARK icon system.
 *
 * One geometry for the whole product: 16-unit grid, 1.25 stroke, miter joins,
 * butt caps, 45-degree diagonals only. Angular and technical so the icons read
 * as part of the same drawing as the folded F in the logo. No rounded pills, no
 * filled blobs, no emoji anywhere in the product.
 *
 * Icons are decorative by default (aria-hidden). Pass a `title` when an icon is
 * the only label an interactive element has.
 */

import type { SVGProps } from "react";

export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number;
  title?: string;
};

function Icon({ size = 16, title, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      shapeRendering="geometricPrecision"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------- entities */

/** Stock Token — a fold plus a ledger tick, echoing the mark. */
export const IconStockToken = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 13.5V2.5h11l-2.5 3H5v3h6l-2.5 3H5v2z" />
    <path d="M2.5 13.5h11" opacity={0.45} />
  </Icon>
);

/** Crypto — an angular token disc. */
export const IconCrypto = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 1.75 13.5 5v6L8 14.25 2.5 11V5z" />
    <path d="M8 5.25 10.75 6.8v3.1L8 11.45 5.25 9.9V6.8z" opacity={0.45} />
  </Icon>
);

/** Stablecoin — a token with a level line: value that does not move. */
export const IconStablecoin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 1.75 13.5 5v6L8 14.25 2.5 11V5z" />
    <path d="M5 8h6" />
  </Icon>
);

/** Wallet — a folded sleeve. */
export const IconWallet = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.75 4.25h10.5v9.5H1.75z" />
    <path d="M1.75 4.25 10 2.25v2" opacity={0.5} />
    <path d="M9.5 8.25h4.75v2.5H9.5z" />
  </Icon>
);

/** Protocol — a contract stack with a bound edge. */
export const IconProtocol = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.25 1.75h9.5v12.5h-9.5z" />
    <path d="M5.75 5h4.5M5.75 8h4.5M5.75 11h2.5" opacity={0.6} />
  </Icon>
);

/** Market — bid/ask depth. */
export const IconMarket = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.75 14.25V9.5h3v4.75zM6.5 14.25V4.75h3v9.5zM11.25 14.25v-7h3v7z" />
  </Icon>
);

/** DEX — two routes crossing at a venue. */
export const IconDex = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.75 4.75h5L9.5 8l2.75-3.25h2" />
    <path d="M1.75 11.25h5L9.5 8" opacity={0.55} />
    <path d="m12.25 2.75 2 2-2 2" />
  </Icon>
);

/** Lending — principal out, claim back. */
export const IconLending = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.75 5.25h12.5v5.5H1.75z" />
    <path d="M1.75 8h3.5M10.75 8h3.5" opacity={0.55} />
    <path d="M6.75 8h2.5" />
  </Icon>
);

/** Bridge — a span between two chains. */
export const IconBridge = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.75 10.25h12.5" />
    <path d="M1.75 10.25V6.5M14.25 10.25V6.5" />
    <path d="M4.75 10.25V13M8 10.25V13M11.25 10.25V13" opacity={0.5} />
    <path d="M1.75 6.5h12.5" opacity={0.5} />
  </Icon>
);

/* -------------------------------------------------------------- metrics */

/** Capital flow — direction with magnitude. */
export const IconFlow = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.75 5.25h8.5M1.75 10.75h5.5" />
    <path d="m10.25 2.5 3.5 2.75-3.5 2.75" />
    <path d="m7.25 8 3.5 2.75-3.5 2.75" opacity={0.55} />
  </Icon>
);

/** Liquidity — stacked depth in a vessel. */
export const IconLiquidity = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.75 1.75h10.5v12.5H2.75z" />
    <path d="M2.75 9.25h10.5" />
    <path d="M2.75 11.75h10.5" opacity={0.55} />
  </Icon>
);

/** Holders — distinct addresses holding. */
export const IconHolders = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.25 14v-2l2.5-1.5h3L10.25 12v2z" />
    <path d="M4.5 4.25h3.5v3.5H4.5z" />
    <path d="M11 14v-1.75l2.75-1.25" opacity={0.5} />
    <path d="M10.75 4.75h2.75v2.75h-2.75z" opacity={0.5} />
  </Icon>
);

/** Counterparties — a directed relationship between two entities. */
export const IconCounterparties = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.75 3.25h3.5v3.5h-3.5zM10.75 9.25h3.5v3.5h-3.5z" />
    <path d="M5.25 5h4.25v6h1.25" />
    <path d="m8.5 3.5 2.5 1.5-2.5 1.5" opacity={0.55} />
  </Icon>
);

/** Topology — the market graph. */
export const IconTopology = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.25 13.25 6v6.25H2.75V6z" opacity={0.35} />
    <path d="M8 5.5 4.5 9.75M8 5.5l3.5 4.25M4.5 9.75h7" />
    <circle cx="8" cy="5.5" r="1.5" />
    <circle cx="4.5" cy="9.75" r="1.15" />
    <circle cx="11.5" cy="9.75" r="1.15" />
  </Icon>
);

/** Block / ledger height. */
export const IconBlock = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 1.75 14 5v6l-6 3.25L2 11V5z" />
    <path d="M2 5l6 3.25L14 5M8 8.25v6" opacity={0.55} />
  </Icon>
);

/* ------------------------------------------------------------ interface */

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.75 2.75h8v8h-8z" />
    <path d="m10.75 10.75 3 3" />
  </Icon>
);

export const IconCommand = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6h4v4H6z" />
    <path d="M6 6V4.25a2 2 0 1 0-2 2H6M10 6V4.25a2 2 0 1 1 2 2H10M6 10v1.75a2 2 0 1 1-2-2H6M10 10v1.75a2 2 0 1 0 2-2H10" />
  </Icon>
);

export const IconFilter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.75 3.25h12.5L9.5 8.5v4.25l-3 1.5V8.5z" />
  </Icon>
);

export const IconSort = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.25 2.75v10.5M4.25 13.25 1.75 10.5M4.25 13.25l2.5-2.75" />
    <path d="M11.75 13.25V2.75M11.75 2.75 9.25 5.5M11.75 2.75l2.5 2.75" opacity={0.55} />
  </Icon>
);

export const IconExternal = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 2.75H2.75v10.5h10.5V9" />
    <path d="M9.5 2.75h3.75V6.5M13.25 2.75 7.75 8.25" />
  </Icon>
);

export const IconCopy = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.25 5.25h8v8h-8z" />
    <path d="M10.75 5.25V2.75h-8v8h2.5" opacity={0.6} />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m2.75 8.25 3.5 3.5 7-7" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />
  </Icon>
);

export const IconMenu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 4.25h12M2 8h12M2 11.75h12" />
  </Icon>
);

export const IconChevron = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4.5 6 3.5 3.5L11.5 6" />
  </Icon>
);

export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 8h11.25" />
    <path d="m9.75 4.5 3.5 3.5-3.5 3.5" />
  </Icon>
);

export const IconExpand = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.75 6.25v-3.5h3.5M13.25 9.75v3.5h-3.5" />
    <path d="M2.75 2.75 6.75 6.75M13.25 13.25 9.25 9.25" opacity={0.6} />
  </Icon>
);

export const IconCollapse = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 2.75v3.75H2.75M9.5 13.25V9.5h3.75" />
    <path d="M6.5 6.5 2.75 2.75M9.5 9.5l3.75 3.75" opacity={0.6} />
  </Icon>
);

/** Data source / provenance. */
export const IconSource = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.75 4c0-1.24 2.35-2.25 5.25-2.25S13.25 2.76 13.25 4v8c0 1.24-2.35 2.25-5.25 2.25S2.75 13.24 2.75 12z" />
    <path d="M2.75 4c0 1.24 2.35 2.25 5.25 2.25S13.25 5.24 13.25 4" opacity={0.6} />
    <path d="M2.75 8c0 1.24 2.35 2.25 5.25 2.25S13.25 9.24 13.25 8" opacity={0.35} />
  </Icon>
);

/** Live status — a square, never a pulsing dot. */
export const IconStatus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 5h6v6H5z" />
    <path d="M2.25 2.25h3M13.75 2.25h-3M2.25 13.75h3M13.75 13.75h-3" opacity={0.5} />
  </Icon>
);

export const IconWarning = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 1.75 14.75 13.5H1.25z" />
    <path d="M8 6v3.75" />
    <path d="M8 11.25v.75" />
  </Icon>
);

/* ---------------------------------------------------------------- social */

/** X. Solid glyph — the only filled icon in the set, because the mark requires it. */
export const IconX = ({ size = 16, title, ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="currentColor"
    role={title ? "img" : undefined}
    aria-hidden={title ? undefined : true}
    aria-label={title}
    {...rest}
  >
    {title ? <title>{title}</title> : null}
    <path d="M9.29 6.93 14.4 1h-1.21L8.75 6.15 5.2 1H1.11l5.36 7.79L1.11 15h1.21l4.69-5.44L10.76 15h4.09zM7.53 8.86l-.54-.78L2.76 1.91h1.86l3.49 5 .54.77 4.54 6.49h-1.86z" />
  </svg>
);

export const ASSET_TYPE_ICON = {
  stock_token: IconStockToken,
  crypto: IconCrypto,
  stablecoin: IconStablecoin,
  other: IconBlock,
} as const;
