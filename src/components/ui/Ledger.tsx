import Link from "next/link";
import type { ReactNode } from "react";
import { type DataState } from "@/lib/data-state";
import { type Surface } from "@/lib/presentation-state";
import { EmptyState } from "@/components/ui/primitives";

/**
 * The ledger: FOLDMARK's table primitive.
 *
 * A real <table> so screen readers and keyboards get column semantics, wrapped
 * in its own horizontal scroll region so a wide data grid never makes the page
 * scroll sideways. Column widths are declared once and shared by header and
 * body via a CSS grid template on the <colgroup>-less table.
 */

export type LedgerColumn = {
  key: string;
  label: string;
  /** CSS grid-template width, e.g. "minmax(180px,1.4fr)" */
  width: string;
  align?: "left" | "right";
  /** Hide below the given breakpoint to keep mobile legible. */
  hideBelow?: "sm" | "md" | "lg";
};

const HIDE: Record<NonNullable<LedgerColumn["hideBelow"]>, string> = {
  sm: "hidden sm:block",
  md: "hidden md:block",
  lg: "hidden lg:block",
};

function template(cols: LedgerColumn[]): string {
  return cols.map((c) => c.width).join(" ");
}

export function Ledger({
  columns,
  children,
  caption,
  minWidth = 720,
}: {
  columns: LedgerColumn[];
  children: ReactNode;
  caption: string;
  minWidth?: number;
}) {
  return (
    <div className="w-full overflow-x-auto border border-rule">
      <div style={{ minWidth }}>
        <span className="sr-only">{caption}</span>
        <div
          role="row"
          className="grid items-center gap-4 border-b border-rule bg-surface px-4 py-2.5"
          style={{ gridTemplateColumns: template(columns) }}
        >
          {columns.map((c) => (
            <span
              key={c.key}
              role="columnheader"
              className={`label-s truncate ${c.align === "right" ? "text-right" : ""} ${
                c.hideBelow ? HIDE[c.hideBelow] : ""
              }`}
            >
              {c.label}
            </span>
          ))}
        </div>
        <div role="rowgroup">{children}</div>
      </div>
    </div>
  );
}

export function LedgerRow({
  columns,
  href,
  children,
}: {
  columns: LedgerColumn[];
  href?: string;
  children: ReactNode;
}) {
  const cls =
    "grid items-center gap-4 border-b border-rule-faint px-4 py-3.5 m-fast last:border-b-0";
  const style = { gridTemplateColumns: template(columns) };

  if (href) {
    return (
      <Link href={href} role="row" className={`${cls} hover:bg-raised`} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <div role="row" className={cls} style={style}>
      {children}
    </div>
  );
}

export function LedgerCell({
  column,
  children,
  className = "",
}: {
  column: LedgerColumn;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="cell"
      className={`min-w-0 ${column.align === "right" ? "text-right" : ""} ${
        column.hideBelow ? HIDE[column.hideBelow] : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * The designed empty row.
 *
 * A ledger with nothing in it keeps its headers and gets this: the table is
 * still a table, still says what its columns would hold, and says in the
 * reader's terms what is being waited on. `surface` picks that sentence — an
 * asset registry still filling and a flow ledger with nothing moving are one
 * state to the machine and two different facts to a person.
 *
 * `title` and `detail` are optional: with a surface, the honest line for this
 * state is already written. Pass them only where the page knows something more
 * specific than the surface does.
 */
export function LedgerEmpty({
  state,
  title,
  detail,
  action,
  surface = "generic",
}: {
  state: DataState;
  title?: string;
  detail?: ReactNode;
  action?: ReactNode;
  surface?: Surface;
}) {
  return (
    <div className="border-b border-rule-faint last:border-b-0">
      <EmptyState state={state} title={title} detail={detail} action={action} surface={surface} />
    </div>
  );
}
