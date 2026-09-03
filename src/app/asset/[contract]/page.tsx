import { permanentRedirect } from "next/navigation";

/** The canonical passport route is /assets/[contract]; keep old links working. */
export default async function LegacyAssetRoute({ params }: { params: Promise<{ contract: string }> }) {
  const { contract } = await params;
  permanentRedirect(`/assets/${contract}`);
}
