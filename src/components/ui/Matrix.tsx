import { hasValue, type Measured } from "@/lib/data-state";
import { presentMissing, type Surface } from "@/lib/presentation-state";

/**
 * A dense N×M readout on a hairline grid.
 *
 * Where MetricGrid gives four tiles, Matrix gives thirty cells — the register a
 * research terminal uses when a value has to be read across several windows at
 * once. Every cell is a Measured, so an absent number is never invented.
 *
 * An unobserved cell prints an em dash. What is being waited on is said once
 * per row, under the row label, rather than repeated across every column: at
 * this density a caption in each cell would either wrap the grid or truncate
 * the status word, and thirty repetitions of the same phrase is the noise this
 * change exists to remove. The dash is per cell, so which columns are missing
 * stays exact; a screen reader is told the state column by column.
 */

export type MatrixRow = {
  label: string;
  /** One entry per column, in column order. */
  cells: Measured<number | string>[];
  format?: (value: number | string) => string;
  source?: string;
  /** Overrides the matrix-level surface for this row — a price row is "price". */
  surface?: Surface;
};

export function Matrix({
  columns,
  rows,
  caption,
  surface = "generic",
}: {
  columns: string[];
  rows: MatrixRow[];
  caption: string;
  surface?: Surface;
}) {
  const template = `minmax(11rem, 1.4fr) repeat(${columns.length}, minmax(5.5rem, 1fr))`;

  return (
    <div className="w-full overflow-x-auto border border-rule">
      <div className="min-w-[640px]">
        <span className="sr-only">{caption}</span>
        <div
          className="grid items-center gap-x-4 border-b border-rule bg-surface px-4 py-2.5"
          style={{ gridTemplateColumns: template }}
        >
          <span className="label-s">METRIC</span>
          {columns.map((c) => (
            <span key={c} className="label-s text-right">
              {c}
            </span>
          ))}
        </div>

        {rows.map((row) => {
          const rowSurface = row.surface ?? surface;
          const pending = Array.from(
            new Set(row.cells.filter((cell) => !hasValue(cell)).map((cell) => presentMissing(cell.state, rowSurface).label)),
          );

          return (
            <div
              key={row.label}
              className="grid items-baseline gap-x-4 border-b border-rule-faint px-4 py-3 last:border-b-0"
              style={{ gridTemplateColumns: template }}
            >
              <div className="min-w-0">
                <p className="label-s truncate text-ink-muted">{row.label}</p>
                {row.source ? <p className="label-s truncate text-ink-faint">{row.source}</p> : null}
                {pending.length ? <p className="label-s truncate text-ink-faint">{pending.join(" · ")}</p> : null}
              </div>
              {row.cells.map((cell, i) =>
                hasValue(cell) ? (
                  <span
                    key={columns[i] ?? i}
                    className="tabular truncate text-right font-mono text-data-s text-ink"
                  >
                    {row.format ? row.format(cell.value) : String(cell.value)}
                  </span>
                ) : (
                  <span
                    key={columns[i] ?? i}
                    className="truncate text-right font-mono text-data-s text-ink-dim"
                    title={cell.provenance.source}
                  >
                    <span aria-hidden>&mdash;</span>
                    <span className="sr-only">{`${columns[i] ?? ""} ${presentMissing(cell.state, rowSurface).label}`}</span>
                  </span>
                ),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
