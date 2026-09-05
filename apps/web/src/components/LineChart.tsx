export interface Series {
  label: string;
  color: string;
  values: (number | null)[];
}

interface Props {
  series: Series[];
  labels: string[];
  height?: number;
  formatTick?: (v: number) => string;
}

/** Hand-rolled SVG ledger chart: hairline grid, ink lines, accent endpoint. */
export function LineChart({ series, labels, height = 170, formatTick }: Props) {
  const width = 560;
  const padL = 8;
  const pad = 10;
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const min = all.length > 0 ? Math.min(...all) : 0;
  const max = all.length > 0 ? Math.max(...all) : 1;
  const span = max - min || 1;
  const n = Math.max(...series.map((s) => s.values.length), 1);

  const x = (i: number) => (n === 1 ? padL : padL + (i * (width - padL - pad)) / (n - 1));
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

  const points = (values: (number | null)[]) =>
    values
      .map((v, i) => ({ v, i }))
      .filter((p) => p.v !== null)
      .map((p) => `${x(p.i).toFixed(1)},${y(p.v as number).toFixed(1)}`)
      .join(" ");

  const gridVals = [0, 0.5, 1].map((t) => min + t * span);
  const fmt = formatTick ?? ((v: number) => String(Math.round(v)));

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={series.map((s) => s.label).join(" vs ")}
        data-testid="line-chart"
      >
        {gridVals.map((g, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={width - pad}
              y1={y(g)}
              y2={y(g)}
              stroke="#d9cdb4"
              strokeWidth={1}
              strokeDasharray={i === 0 || i === 2 ? "none" : "3 4"}
            />
            <text x={width - pad} y={y(g) - 3} textAnchor="end" fontSize={9} fill="#8a7f6f" fontFamily="IBM Plex Mono, monospace">
              {fmt(g)}
            </text>
          </g>
        ))}
        {series.map((s) => {
          const pts = points(s.values);
          if (!pts) return null;
          const lastIdx = s.values.map((v, i) => (v === null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
          const last = lastIdx >= 0 ? (s.values[lastIdx] as number) : null;
          return (
            <g key={s.label}>
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {last !== null && (
                <circle cx={x(lastIdx)} cy={y(last)} r={3.5} fill={s.color} stroke="#faf7ee" strokeWidth={1.5} />
              )}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend" aria-hidden="true">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ borderColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      {labels.length > 0 && (
        <div className="chart-cap">
          <span>{labels[0]}</span>
          <span>
            {labels.length} readings · {labels[labels.length - 1]}
          </span>
        </div>
      )}
    </figure>
  );
}
