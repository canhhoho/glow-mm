import { cn } from "@/lib/utils";

/**
 * Biểu đồ nhỏ cho dashboard (P3) — SVG dựng phía server, không thư viện. Màu theo token (đã kiểm bằng
 * validate_palette: hồng · xanh · cam, có nhãn trực tiếp nên không phụ thuộc màu). Hover: tooltip theo ngày (title).
 */

export type LineSeries = { key: string; label: string; color: string; values: number[] };

const niceMax = (n: number) => {
  if (n <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= n) ?? n;
};

export function LineChart({ labels, series, height = 220, ariaLabel }: { labels: string[]; series: LineSeries[]; height?: number; ariaLabel: string }) {
  const W = 640;
  const H = height;
  const pad = { l: 32, r: 96, t: 12, b: 26 };
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const x = (i: number) => pad.l + (labels.length <= 1 ? 0 : (i * (W - pad.l - pad.r)) / (labels.length - 1));
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const ticks = [0, max / 2, max];
  const step = Math.max(1, Math.ceil(labels.length / 7));
  // Nhãn trực tiếp ở cuối đường, đẩy xa nhau tối thiểu 12px để không chồng.
  const ends = series.map((s) => ({ s, y: y(s.values[s.values.length - 1] ?? 0) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
  // Không để nhãn rơi xuống dưới trục: dồn cả nhóm lên.
  const overflow = ends.length ? ends[ends.length - 1].y - (H - pad.b) : 0;
  if (overflow > 0) for (const e of ends) e.y -= overflow;
  return (
    <figure className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full overflow-visible">
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tk)} y2={y(tk)} className="stroke-border" strokeWidth={1} />
            <text x={pad.l - 6} y={y(tk)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-2xs tabular-nums">
              {Number.isInteger(tk) ? tk : tk.toFixed(1)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % step === 0 || i === labels.length - 1 ? (
            <text key={l} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-2xs tabular-nums">
              {l}
            </text>
          ) : null,
        )}
        {series.map((s) => (
          <g key={s.key}>
            <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color} className="stroke-card" strokeWidth={2} />
            ))}
          </g>
        ))}
        {ends.map(({ s, y: ly }) => (
          <text key={s.key} x={W - pad.r + 8} y={ly} dy="0.32em" className="fill-foreground text-2xs">
            {s.label} · {s.values[s.values.length - 1] ?? 0}
          </text>
        ))}
        {/* Vùng hover theo ngày: tooltip liệt kê cả ba số. */}
        {labels.map((l, i) => (
          <rect key={l} x={x(i) - (W - pad.l - pad.r) / Math.max(1, labels.length - 1) / 2} y={pad.t} width={(W - pad.l - pad.r) / Math.max(1, labels.length - 1)} height={H - pad.t - pad.b} fill="transparent" className="hover:fill-muted/40">
            <title>{[l, ...series.map((s) => `${s.label}: ${s.values[i] ?? 0}`)].join("\n")}</title>
          </rect>
        ))}
      </svg>
    </figure>
  );
}

export type DonutSlice = { key: string; label: string; value: number; color: string; href?: string };

export function Donut({ slices, total, centerLabel, ariaLabel }: { slices: DonutSlice[]; total: number; centerLabel: string; ariaLabel: string }) {
  const R = 42;
  const C = 2 * Math.PI * R;
  const sum = slices.reduce((s, x) => s + x.value, 0) || 1;
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 1.5 : 0; // khe 2px giữa các phần
  const arcs = slices.map((s, i) => ({ s, len: (s.value / sum) * C, start: slices.slice(0, i).reduce((a, x) => a + (x.value / sum) * C, 0) }));
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 120 120" role="img" aria-label={ariaLabel} className="size-36 shrink-0 -rotate-90">
        <circle cx={60} cy={60} r={R} fill="none" className="stroke-muted" strokeWidth={14} />
        {arcs.map(({ s, len, start }) =>
          s.value > 0 ? (
            <circle key={s.key} cx={60} cy={60} r={R} fill="none" stroke={s.color} strokeWidth={14} strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-start}>
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          ) : null,
        )}
        <text x={60} y={58} textAnchor="middle" className="rotate-90 fill-foreground text-[18px] font-semibold" style={{ transformOrigin: "60px 60px" }}>
          {total}
        </text>
        <text x={60} y={74} textAnchor="middle" className="rotate-90 fill-muted-foreground text-[9px]" style={{ transformOrigin: "60px 60px" }}>
          {centerLabel}
        </text>
      </svg>
      <ul className="min-w-40 flex-1 space-y-2 text-sm">
        {slices.map((s) => {
          const body = (
            <>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              <span className="flex-1">{s.label}</span>
              <span className="tabular-nums">
                {s.value} <span className="text-muted-foreground">({((s.value / sum) * 100).toFixed(1)}%)</span>
              </span>
            </>
          );
          return (
            <li key={s.key}>
              {s.href ? (
                <a href={s.href} className={cn("flex items-center gap-2 rounded hover:underline")}>{body}</a>
              ) : (
                <span className="flex items-center gap-2">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
