import { Shell } from "@/components/layout/Frame";
import { LoadingRows } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <Shell>
      <div className="band-dense">
        <p className="label-s">LOADING</p>
        <div className="mt-6 border border-rule">
          <LoadingRows rows={8} />
        </div>
      </div>
    </Shell>
  );
}
