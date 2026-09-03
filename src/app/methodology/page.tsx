import { permanentRedirect } from "next/navigation";

/** Methodology lives inside the documentation set. */
export default function LegacyMethodologyRoute() {
  permanentRedirect("/docs/methodology");
}
