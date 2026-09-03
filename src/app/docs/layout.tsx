import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocsSidebar } from "@/components/docs/DocsSidebar";

export const metadata: Metadata = {
  title: { default: "Docs", template: "%s — FOLDMARK docs" },
  description:
    "How FOLDMARK turns raw Robinhood Chain activity into structured market intelligence: architecture, data sources, methodology and API.",
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <DocsSidebar />
        <div className="min-w-0 py-8 lg:py-12">{children}</div>
      </div>
    </div>
  );
}
