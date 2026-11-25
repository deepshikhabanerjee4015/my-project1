import React, { useMemo, useState } from 'react';
import type { ForecastPoint } from '../types/inventory';

interface ForecastLineChartProps {
  points: ForecastPoint[];
  height?: number;
  showConfidenceBand?: boolean;
  compact?: boolean;
}

export const ForecastLineChart: React.FC<ForecastLineChartProps> = ({
  points,
  height = 290,
  showConfidenceBand = true,
  compact = false,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 760;
  const padLeft = compact ? 36 : 46;
  const padRight = 18;
  const padTop = 18;
  const padBottom = compact ? 26 : 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const { maxVal, yTicks, splitIdx } = useMemo(() => {
    let maxV = 10;
    let firstForecast = -1;
    points.forEach((p, idx) => {
      if (p.isForecast && firstForecast === -1) firstForecast = idx;
      if (p.actual !== undefined && p.actual > maxV) maxV = p.actual;
      if (p.predicted !== undefined && p.predicted > maxV) maxV = p.predicted;
      if (showConfidenceBand && p.upperBound !== undefined && p.upperBound > maxV) {
        maxV = p.upperBound;
      }
    });
    const niceMax = Math.ceil(maxV * 1.15);
    const step = Math.max(1, Math.ceil(niceMax / 4));
    const ticks = [0, step, step * 2, step * 3, step * 4];
    return { maxVal: ticks[4], yTicks: ticks, splitIdx: firstForecast };
  }, [points, showConfidenceBand]);

  const xFor = (i: number) =>
    points.length <= 1 ? padLeft : padLeft + (i / (points.length - 1)) * plotW;
  const yFor = (val: number) =>
    padTop + plotH - Math.min(1, Math.max(0, val / maxVal)) * plotH;

  const actualPath = useMemo(() => {
    const pts = points
      .map((p, i) => (p.actual !== undefined ? `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.actual).toFixed(1)}` : null))
      .filter(Boolean);
    return pts.join(' ');
  }, [points, maxVal]);

  const actualAreaPath = useMemo(() => {
    const valid = points
      .map((p, i) => (p.actual !== undefined ? { i, v: p.actual } : null))
      .filter((x): x is { i: number; v: number } => x !== null);
    if (valid.length === 0) return '';
    const line = valid
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${xFor(pt.i).toFixed(1)},${yFor(pt.v).toFixed(1)}`)
      .join(' ');
    const last = valid[valid.length - 1];
    const first = valid[0];
    return `${line} L${xFor(last.i).toFixed(1)},${(padTop + plotH).toFixed(1)} L${xFor(first.i).toFixed(1)},${(padTop + plotH).toFixed(1)} Z`;
  }, [points, maxVal]);

  const forecastPath = useMemo(() => {
    const valid = points
      .map((p, i) => (p.predicted !== undefined ? { i, v: p.predicted } : null))
      .filter((x): x is { i: number; v: number } => x !== null);
    if (valid.length === 0) return '';
    return valid
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${xFor(pt.i).toFixed(1)},${yFor(pt.v).toFixed(1)}`)
      .join(' ');
  }, [points, maxVal]);

  const confidenceBandPath = useMemo(() => {
    if (!showConfidenceBand) return '';
    const bandPts = points
      .map((p, i) =>
        p.upperBound !== undefined && p.lowerBound !== undefined
          ? { i, upper: p.upperBound, lower: p.lowerBound }
          : null
      )
      .filter((x): x is { i: number; upper: number; lower: number } => x !== null);
    if (bandPts.length < 2) return '';
    const top = bandPts
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${xFor(pt.i).toFixed(1)},${yFor(pt.upper).toFixed(1)}`)
      .join(' ');
    const bottom = [...bandPts]
      .reverse()
      .map((pt) => `L${xFor(pt.i).toFixed(1)},${yFor(pt.lower).toFixed(1)}`)
      .join(' ');
    return `${top} ${bottom} Z`;
  }, [points, maxVal, showConfidenceBand]);

  const xLabelIndices = useMemo(() => {
    if (points.length <= 6) return points.map((_, i) => i);
    const count = compact ? 4 : 6;
    const out: number[] = [];
    for (let k = 0; k < count; k++) {
      out.push(Math.round((k / (count - 1)) * (points.length - 1)));
    }
    return out;
  }, [points, compact]);

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4C7FE8" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#4C7FE8" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines */}
        {yTicks.map((t) => {
          const y = yFor(t);
          return (
            <g key={t}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="#E2E8F0"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[#738096] text-[11px] font-mono tabular-nums"
              >
                {t}
              </text>
            </g>
          );
        })}

        {/* Forecast start vertical divider */}
        {splitIdx > 0 && (
          <g>
            <line
              x1={xFor(splitIdx - 1)}
              x2={xFor(splitIdx - 1)}
              y1={padTop}
              y2={padTop + plotH}
              stroke="#94A3B8"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            {!compact && (
              <text
                x={xFor(splitIdx - 1) + 6}
                y={padTop + 11}
                className="fill-[#16A36A] text-[10px] font-medium"
              >
                Forecast Horizon
              </text>
            )}
          </g>
        )}

        {/* Shaded historical area & 90% confidence band */}
        {actualAreaPath && <path d={actualAreaPath} fill="url(#actualFill)" />}
        {confidenceBandPath && (
          <path d={confidenceBandPath} fill="#16A36A" fillOpacity="0.12" />
        )}

        {/* Actual sales solid line */}
        {actualPath && (
          <path
            d={actualPath}
            fill="none"
            stroke="#101B2D"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Predicted demand dashed line */}
        {forecastPath && (
          <path
            d={forecastPath}
            fill="none"
            stroke="#16A36A"
            strokeWidth="2.4"
            strokeDasharray="6 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* X-Axis date labels */}
        {xLabelIndices.map((idx) => {
          const pt = points[idx];
          if (!pt) return null;
          return (
            <text
              key={idx}
              x={xFor(idx)}
              y={height - 6}
              textAnchor="middle"
              className="fill-[#738096] text-[11px] font-mono tabular-nums"
            >
              {pt.date.slice(5)}
            </text>
          );
        })}

        {/* Hover crosshair */}
        {hoverIdx !== null && hovered && (
          <g>
            <line
              x1={xFor(hoverIdx)}
              x2={xFor(hoverIdx)}
              y1={padTop}
              y2={padTop + plotH}
              stroke="#263B55"
              strokeWidth="1"
              strokeOpacity="0.4"
            />
            {hovered.actual !== undefined && (
              <circle
                cx={xFor(hoverIdx)}
                cy={yFor(hovered.actual)}
                r="4.5"
                fill="#101B2D"
                stroke="#FFFFFF"
                strokeWidth="2"
              />
            )}
            {hovered.predicted !== undefined && (
              <circle
                cx={xFor(hoverIdx)}
                cy={yFor(hovered.predicted)}
                r="4.5"
                fill="#16A36A"
                stroke="#FFFFFF"
                strokeWidth="2"
              />
            )}
          </g>
        )}

        {/* Invisible hover columns for crisp snapping */}
        {points.map((_, idx) => {
          const colW = Math.max(4, plotW / Math.max(1, points.length));
          return (
            <rect
              key={idx}
              x={xFor(idx) - colW / 2}
              y={padTop}
              width={colW}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(idx)}
            />
          );
        })}
      </svg>

      {hoverIdx !== null && hovered && (
        <div
          className="pointer-events-none absolute top-2 right-3 bg-[#101B2D] text-white px-3 py-2 rounded-lg text-xs shadow-sm border border-[#263B55]"
        >
          <div className="font-mono text-[11px] text-slate-300 mb-1">{hovered.date}</div>
          {hovered.actual !== undefined && (
            <div className="flex items-center justify-between gap-4 tabular-nums">
              <span className="text-slate-200">Actual Sales</span>
              <span className="font-semibold font-mono">{hovered.actual} units</span>
            </div>
          )}
          {hovered.predicted !== undefined && (
            <div className="flex items-center justify-between gap-4 tabular-nums">
              <span className="text-emerald-300">Predicted Demand</span>
              <span className="font-semibold font-mono">{hovered.predicted} units</span>
            </div>
          )}
          {hovered.lowerBound !== undefined && hovered.upperBound !== undefined && (
            <div className="flex items-center justify-between gap-4 tabular-nums text-[11px] text-slate-300 mt-0.5">
              <span>90% Range</span>
              <span className="font-mono">
                {hovered.lowerBound} – {hovered.upperBound}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface DistributionSegment {
  label: string;
  count: number;
  value: number;
  color: string;
}

export const InventoryDistributionChart: React.FC<{
  segments: DistributionSegment[];
}> = ({ segments }) => {
  const totalCount = segments.reduce((s, x) => s + x.count, 0) || 1;
  return (
    <div className="space-y-4">
      <div className="h-3.5 w-full rounded-md overflow-hidden flex bg-slate-100">
        {segments.map((seg) =>
          seg.count > 0 ? (
            <div
              key={seg.label}
              style={{
                width: `${(seg.count / totalCount) * 100}%`,
                backgroundColor: seg.color,
              }}
              className="h-full transition-all duration-300"
              title={`${seg.label}: ${seg.count} SKUs`}
            />
          ) : null
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {segments.map((seg) => {
          const pct = ((seg.count / totalCount) * 100).toFixed(0);
          return (
            <div key={seg.label} className="py-2.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-[#202B3C] font-medium">{seg.label}</span>
              </div>
              <div className="flex items-center gap-5 tabular-nums font-mono text-xs">
                <span className="text-[#738096]">{pct}%</span>
                <span className="text-[#202B3C] font-semibold w-14 text-right">
                  {seg.count} SKUs
                </span>
                <span className="text-[#738096] w-20 text-right">
                  ${Math.round(seg.value).toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export interface TopProductMetric {
  id: string;
  name: string;
  unitsSold: number;
  revenue: number;
}

export const TopProductsBarChart: React.FC<{
  items: TopProductMetric[];
}> = ({ items }) => {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-[#738096]">
        No product sales recorded yet for this business.
      </div>
    );
  }
  const maxRev = Math.max(1, ...items.map((i) => i.revenue));
  return (
    <div className="space-y-3.5">
      {items.map((item) => {
        const widthPct = Math.max(6, (item.revenue / maxRev) * 100);
        return (
          <div key={item.id} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-[#202B3C] font-medium truncate">{item.name}</span>
              <div className="flex items-center gap-3 shrink-0 tabular-nums font-mono text-xs">
                <span className="text-[#738096]">{item.unitsSold.toLocaleString()} units</span>
                <span className="text-[#101B2D] font-semibold">
                  ${Math.round(item.revenue).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-sm overflow-hidden">
              <div
                className="h-full bg-[#263B55] rounded-sm transition-all duration-300"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export interface WeeklyMovementPoint {
  weekLabel: string;
  sold: number;
  received: number;
}

export const InventoryMovementChart: React.FC<{
  data: WeeklyMovementPoint[];
}> = ({ data }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const maxVal = Math.max(10, ...data.flatMap((d) => [d.sold, d.received]));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-5 text-xs text-[#738096]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#4C7FE8]" />
          Stock Received
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#101B2D]" />
          Stock Sold
        </span>
      </div>

      <div className="grid grid-cols-6 gap-3 items-end h-44 pt-4 border-b border-slate-200 pb-2">
        {data.map((pt, idx) => {
          const recH = Math.max(4, (pt.received / maxVal) * 100);
          const soldH = Math.max(4, (pt.sold / maxVal) * 100);
          return (
            <div
              key={pt.weekLabel}
              className="relative flex flex-col items-center h-full justify-end group"
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {hoverIdx === idx && (
                <div className="absolute -top-9 z-10 bg-[#101B2D] text-white text-[11px] font-mono tabular-nums px-2 py-1 rounded whitespace-nowrap shadow-sm">
                  In: {pt.received} · Out: {pt.sold}
                </div>
              )}
              <div className="w-full flex items-end justify-center gap-1.5 h-full">
                <div
                  className="w-4 bg-[#4C7FE8] rounded-t-sm transition-all duration-200"
                  style={{ height: `${recH}%` }}
                />
                <div
                  className="w-4 bg-[#101B2D] rounded-t-sm transition-all duration-200"
                  style={{ height: `${soldH}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-6 gap-3 text-center">
        {data.map((pt) => (
          <span key={pt.weekLabel} className="text-[11px] font-mono text-[#738096] tabular-nums">
            {pt.weekLabel}
          </span>
        ))}
      </div>
    </div>
  );
};
