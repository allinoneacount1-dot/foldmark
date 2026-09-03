import { hasValue, STATE_LABEL, type Measured } from "@/lib/data-state";

/**
 * A dense N×M readout on a hairline grid.
 *
 * Where MetricGrid gives four tiles, Matrix gives thirty cells — the register a
 * research terminal uses when a value has to be read across several windows at
 * once. Every cell is a Measured, so an absent number prints its state.
 */

export type MatrixRow = {
  label: string;
  /** One entry per column, in column order. */
  cells: Measured<number | string>[];
  format?: (value: number | string) => string;
  source?: string;
};

export function Matrix({
  columns,
  rows,
  caption,
}: {
  columns: string[];
  rows: MatrixRow[];
  caption: string;
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

        {rows.map((row) => (
          <div
            key={row.label}
            className="grid items-baseline gap-x-4 border-b border-rule-faint px-4 py-3 last:border-b-0"
            style={{ gridTemplateColumns: template }}
          >
            <div className="min-w-0">
              <p className="label-s truncate text-ink-muted">{row.label}</p>
              {row.source ? <p className="label-s truncate text-ink-faint">{row.source}</p> : null}
            </div>
            {row.cells.map((cell, i) => (
              <span
                key={columns[i] ?? i}
                className={`tabular truncate text-right font-mono text-data-s ${
                  hasValue(cell) ? "text-ink" : "uppercase tracking-[0.12em] text-ink-faint"
                }`}
                title={hasValue(cell) ? undefined : cell.provenance.source}
              >
                {hasValue(cell) ? (row.format ? row.format(cell.value) : String(cell.value)) : STATE_LABEL[cell.state]}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
