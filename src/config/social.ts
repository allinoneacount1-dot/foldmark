/**
 * Canonical social destinations.
 *
 * Every social link in the product resolves from here. Nothing hardcodes a
 * social URL or a handle in a component — changing the account is a one-line
 * change in this file.
 */

export const SOCIAL_LINKS = {
  x: "https://x.com/foldmark_",
} as const;

/** The official handle, exactly as it must be written wherever it is shown. */
export const SOCIAL_HANDLES = {
  x: "@foldmark_",
} as const;

export const SOCIAL_LABELS = {
  x: "FOLDMARK on X",
} as const;
