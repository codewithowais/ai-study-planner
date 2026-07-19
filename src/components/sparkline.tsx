/**
 * A tiny inline score-trend sparkline (0–100 scale). Pure SVG, no client JS —
 * safe to render from a server component. Green line if the latest value is at
 * or above the first, amber if it dropped. Hover shows the full sequence.
 */
export function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length < 2) return null;
  const w = 56;
  const h = 16;
  const pad = 2;
  const step = (w - pad * 2) / (values.length - 1);
  const y = (v: number) =>
    pad + (h - pad * 2) * (1 - Math.max(0, Math.min(100, v)) / 100);
  const points = values.map((v, i) => `${(pad + i * step).toFixed(1)},${y(v).toFixed(1)}`);
  const up = values[values.length - 1] >= values[0];

  return (
    <span
      className={up ? "text-success" : "text-warning"}
      title={values.map((v) => `${v}%`).join(" → ")}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="inline-block align-middle"
        aria-hidden="true"
      >
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={pad + (values.length - 1) * step}
          cy={y(values[values.length - 1])}
          r="1.8"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
