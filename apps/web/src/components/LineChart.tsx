export interface Series {
  label: string;
  color: string;
  values: number[];
}

interface Props {
  series: Series[];
  labels: string[];
  height?: number;
}

/** Boring hand-rolled SVG line chart (no chart dep). */
export function LineChart({ series, labels, height = 160 }: Props) {
  const width = 560;
  const pad = 8;
  const all = series.flatMap((s) => s.values);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const n = Math.max(...series.map((s) => s.values.length), 1);

  const x = (i: number) =>
    series.length === 0 || n === 1 ? pad : pad + (i * (width - pad * 2)) / (n - 1);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

  const points = (values: number[]) => values.map((v, i) => `${x(i)},${y(v)}`).join(" ");

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
        {series.map((s) => (
          <polyline
            key={s.label}
            points={points(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
          />
        ))}
      </svg>
      <figcaption style={{ display: "flex", gap: 12, fontSize: 12 }}>
        {series.map((s) => (
          <span key={s.label}>
            <span
              style={{
                display: "inline-block",
                width: 12,
                height: 3,
                background: s.color,
                marginRight: 4,
                verticalAlign: "middle",
              }}
            />
            {s.label}
          </span>
        ))}
        {labels.length > 0 && (
          <span style={{ marginLeft: "auto", color: "#666" }}>
            {labels[0]} → {labels[labels.length - 1]}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
