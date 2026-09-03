import Image from "next/image";

/**
 * The only component in FOLDMARK that is allowed to render the logo.
 *
 * Every variant is a lossless extraction from the owner-supplied master
 * (brand-source/foldmark-master.jpg) with the black plate removed to straight alpha.
 * Geometry, proportions, silver gradient and lime accent are byte-faithful to
 * the source — nothing here is redrawn, traced, simplified or restyled.
 *
 * Rules enforced by construction:
 *   - height drives the size and width is derived from it, so the aspect ratio
 *     cannot be changed by a caller
 *   - no filter, glow, shadow, border, background box or blend mode
 *   - transparent background in every context
 *
 * To swap in a newer master, replace the files in public/brand/ at the same
 * paths and aspect ratios. No component needs to change.
 */

const ASSETS = {
  /** Mark above wordmark — the master lockup, for footers and wide hero space. */
  lockup: { src: "/brand/foldmark-logo.png", width: 831, height: 436, alt: "FOLDMARK" },
  /** Mark beside wordmark — for navigation bars, where a stacked lockup is illegible. */
  horizontal: { src: "/brand/foldmark-logo-horizontal.png", width: 1155, height: 292, alt: "FOLDMARK" },
  /** Symbol only — tight space and square contexts. */
  mark: { src: "/brand/foldmark-mark.png", width: 266, height: 292, alt: "FOLDMARK" },
  /** Wordmark only — never used beside the mark, only where the mark appears separately. */
  wordmark: { src: "/brand/foldmark-wordmark.png", width: 831, height: 80, alt: "FOLDMARK" },
} as const;

export type BrandLogoVariant = keyof typeof ASSETS;

export function BrandLogo({
  variant = "horizontal",
  height,
  className,
  priority,
  decorative,
}: {
  variant?: BrandLogoVariant;
  /** Rendered height in CSS pixels. Width follows the source aspect ratio. */
  height: number;
  className?: string;
  priority?: boolean;
  /** True when adjacent text already names the brand, so the image adds nothing. */
  decorative?: boolean;
}) {
  const asset = ASSETS[variant];
  const width = Math.round((asset.width / asset.height) * height);

  return (
    <Image
      src={asset.src}
      alt={decorative ? "" : asset.alt}
      aria-hidden={decorative || undefined}
      width={width}
      height={height}
      priority={priority}
      sizes={`${width}px`}
      className={className}
      // Both dimensions are stated and the width is derived from the height, so
      // the aspect ratio is fixed by construction. object-fit keeps it that way
      // if a narrow container ever clamps the width.
      style={{ height, width, maxWidth: "100%", objectFit: "contain" }}
    />
  );
}
