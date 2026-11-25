import React, { useMemo, useState } from 'react';
import type { ForecastPoint } from '../types/inventory';
import { formatINRCompact } from '../lib/currency';

export const Sparkline: React.FC<{
  values: number[];
  color?: string;
  height?: number;
}> = ({ values, color = '#805F69', height = 34 }) => {
  if (values.length < 2) return null;
  const w = 140;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = height - 4 - ((v - min) / span) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lineD = `M${pts.join(' L')}`;
  const areaD = `${lineD} L${w},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-auto overflow-visible" aria-hidden="true">
      <path d={areaD} fill={color} fillOpacity="0.1" />
      <path
        d={lineD}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const HealthGauge: React.FC<{
  score: number;
  size?: number;
}> = ({ score, size = 56 }) => {
  const clamped = Math.max(0, Math.min(100, score));
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const color = clamped >= 65 ? '#779384' : clamped >= 40 ? '#C3A16D' : '#BC7777';

  return (
    <svg
      width={size}
      height={size * 0.65}
      viewBox={`0 0 ${size} ${size * 0.65}`}
      aria-label={`Inventory health score ${clamped}%`}
      className="shrink-0 overflow-visible"
    >
      <path
        d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
        fill="none"
        stroke="#FBF8F7"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <path
        d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-300"
      />
    </svg>
  );
};

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
  const padTop = 20;
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
      .map((p, i) =>
        p.actual !== undefined
          ? `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.actual).toFixed(1)}`
          : null
      )
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
  const splitX = splitIdx > 0 ? xFor(splitIdx - 1) : null;

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="actualAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#B99AA0" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#E9DDE0" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* Distinct Forecast Region Background (Soft Blush) */}
        {splitX !== null && (
          <rect
            x={splitX}
            y={padTop}
            width={Math.max(0, width - padRight - splitX)}
            height={plotH}
            fill="#E9DDE0"
            fillOpacity="0.32"
          />
        )}

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
                stroke="#E8DFE1"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[#81777A] text-[11px] font-mono tabular-nums"
              >
                {t}
              </text>
            </g>
          );
        })}

        {/* Forecast start vertical divider */}
        {splitX !== null && (
          <g>
            <line
              x1={splitX}
              x2={splitX}
              y1={padTop}
              y2={padTop + plotH}
              stroke="#B99AA0"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            {!compact && (
              <text
                x={splitX + 7}
                y={padTop + 12}
                className="fill-[#805F69] text-[10px] font-semibold"
              >
                Forecast Horizon
              </text>
            )}
          </g>
        )}

        {actualAreaPath && <path d={actualAreaPath} fill="url(#actualAreaGrad)" />}
        {confidenceBandPath && (
          <path d={confidenceBandPath} fill="#E9DDE0" fillOpacity="0.65" />
        )}

        {actualPath && (
          <path
            d={actualPath}
            fill="none"
            stroke="#805F69"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {forecastPath && (
          <path
            d={forecastPath}
            fill="none"
            stroke="#B99AA0"
            strokeWidth="2.4"
            strokeDasharray="6 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {xLabelIndices.map((idx) => {
          const pt = points[idx];
          if (!pt) return null;
          return (
            <text
              key={idx}
              x={xFor(idx)}
              y={height - 6}
              textAnchor="middle"
              className="fill-[#81777A] text-[11px] font-mono tabular-nums"
            >
              {pt.date.slice(5)}
            </text>
          );
        })}

        {hoverIdx !== null && hovered && (
          <g>
            <line
              x1={xFor(hoverIdx)}
              x2={xFor(hoverIdx)}
              y1={padTop}
              y2={padTop + plotH}
              stroke="#805F69"
              strokeWidth="1"
              strokeOpacity="0.45"
            />
            {hovered.actual !== undefined && (
              <circle
                cx={xFor(hoverIdx)}
                cy={yFor(hovered.actual)}
                r="4.5"
                fill="#805F69"
                stroke="#FFFFFF"
                strokeWidth="2"
              />
            )}
            {hovered.predicted !== undefined && (
              <circle
                cx={xFor(hoverIdx)}
                cy={yFor(hovered.predicted)}
                r="4.5"
                fill="#B99AA0"
                stroke="#FFFFFF"
                strokeWidth="2"
              />
            )}
          </g>
        )}

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
        <div className="pointer-events-none absolute top-2 right-3 bg-[#49383D] text-white px-3 py-2 rounded-lg text-xs shadow-md border border-[#805F69]">
          <div className="font-mono text-[11px] text-[#E9DDE0] mb-1">{hovered.date}</div>
          {hovered.actual !== undefined && (
            <div className="flex items-center justify-between gap-4 tabular-nums">
              <span className="text-[#FBF8F7]">Actual Sales</span>
              <span className="font-semibold font-mono">{hovered.actual} units</span>
            </div>
          )}
          {hovered.predicted !== undefined && (
            <div className="flex items-center justify-between gap-4 tabular-nums">
              <span className="text-[#E9DDE0]">Predicted Demand</span>
              <span className="font-semibold font-mono">{hovered.predicted} units</span>
            </div>
          )}
          {hovered.lowerBound !== undefined && hovered.upperBound !== undefined && (
            <div className="flex items-center justify-between gap-4 tabular-nums text-[11px] text-[#E9DDE0]/85 mt-0.5">
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
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const totalCount = segments.reduce((s, x) => s + x.count, 0) || 1;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  const arcs = useMemo(() => {
    let cumulative = 0;
    return segments
      .filter((seg) => seg.count > 0)
      .map((seg) => {
        const fraction = seg.count / totalCount;
        const length = fraction * circumference;
        const dashOffset = -cumulative;
        cumulative += length;
        return { ...seg, length, dashOffset };
      });
  }, [segments, totalCount, circumference]);

  const activeSegment = segments.find((s) => s.label === hoveredLabel);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-5">
        {/* Donut Chart */}
        <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="#FBF8F7"
              strokeWidth="12"
            />
            {arcs.map((arc) => (
              <circle
                key={arc.label}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={hoveredLabel === arc.label ? '14' : '12'}
                strokeDasharray={`${arc.length} ${circumference}`}
                strokeDashoffset={arc.dashOffset}
                className="transition-all duration-200 cursor-pointer"
                onMouseEnter={() => setHoveredLabel(arc.label)}
                onMouseLeave={() => setHoveredLabel(null)}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="font-mono font-bold text-base text-[#49383D] tabular-nums">
              {activeSegment ? activeSegment.count : totalCount}
            </span>
            <span className="text-[10px] text-[#81777A]">
              {activeSegment ? activeSegment.label.split(' ')[0] : 'SKUs'}
            </span>
          </div>
        </div>

        {/* Stacked Horizontal Ratio Bar + Summary */}
        <div className="flex-1 space-y-2 min-w-0">
          <div className="h-2.5 w-full rounded-md overflow-hidden flex bg-[#FBF8F7]">
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
          <p className="text-[11px] text-[#81777A] leading-snug">
            Hover segments to inspect stock tier concentration across active SKUs.
          </p>
        </div>
      </div>

      <div className="divide-y divide-[#E8DFE1]">
        {segments.map((seg) => {
          const pct = ((seg.count / totalCount) * 100).toFixed(0);
          return (
            <div
              key={seg.label}
              onMouseEnter={() => setHoveredLabel(seg.label)}
              onMouseLeave={() => setHoveredLabel(null)}
              className={`py-2.5 px-1.5 -mx-1.5 rounded-md flex items-center justify-between text-xs transition-colors ${
                hoveredLabel === seg.label ? 'bg-[#E9DDE0]/45' : ''
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-[#3F3437] font-medium">{seg.label}</span>
              </div>
              <div className="flex items-center gap-4 tabular-nums font-mono">
                <span className="text-[#81777A]">{pct}%</span>
                <span className="text-[#49383D] font-semibold w-14 text-right">
                  {seg.count} SKUs
                </span>
                <span className="text-[#81777A] w-20 text-right">
                  {formatINRCompact(seg.value)}
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
      <div className="py-8 text-center text-xs text-[#81777A]">
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
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-[#3F3437] font-medium truncate">{item.name}</span>
              <div className="flex items-center gap-3 shrink-0 tabular-nums font-mono">
                <span className="text-[#81777A]">{item.unitsSold.toLocaleString('en-IN')} units</span>
                <span className="text-[#49383D] font-semibold">
                  {formatINRCompact(item.revenue)}
                </span>
              </div>
            </div>
            <div className="h-1.5 w-full bg-[#FBF8F7] rounded-sm overflow-hidden">
              <div
                className="h-full bg-[#49383D] rounded-sm transition-all duration-300"
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
      <div className="flex items-center justify-end gap-5 text-xs text-[#81777A]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#779384]" />
          Stock Received
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#805F69]" />
          Stock Sold
        </span>
      </div>

      <div className="grid grid-cols-6 gap-3 items-end h-40 pt-4 border-b border-[#E8DFE1] pb-2">
        {data.map((pt, idx) => {
          const recH = Math.max(4, (pt.received / maxVal) * 100);
          const soldH = Math.max(4, (pt.sold / maxVal) * 100);
          return (
            <div
              key={pt.weekLabel}
              className="relative flex flex-col items-center h-full justify-end"
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {hoverIdx === idx && (
                <div className="absolute -top-8 z-10 bg-[#49383D] text-white text-[11px] font-mono tabular-nums px-2 py-1 rounded whitespace-nowrap shadow-sm border border-[#805F69]">
                  In: {pt.received} · Out: {pt.sold}
                </div>
              )}
              <div className="w-full flex items-end justify-center gap-1.5 h-full">
                <div
                  className="w-3.5 bg-[#779384] rounded-t-xs transition-all duration-200"
                  style={{ height: `${recH}%` }}
                />
                <div
                  className="w-3.5 bg-[#805F69] rounded-t-xs transition-all duration-200"
                  style={{ height: `${soldH}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-6 gap-3 text-center">
        {data.map((pt) => (
          <span key={pt.weekLabel} className="text-[11px] font-mono text-[#81777A] tabular-nums">
            {pt.weekLabel}
          </span>
        ))}
      </div>
    </div>
  );
};

export interface ScenarioComparePoint {
  label: string;
  baseline: number;
  simulated: number;
  atRisk: boolean;
}

export const ScenarioComparisonChart: React.FC<{
  items: ScenarioComparePoint[];
}> = ({ items }) => {
  const maxVal = Math.max(10, ...items.flatMap((i) => [i.baseline, i.simulated]));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-5 text-xs text-[#81777A]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#8296A8]" />
          Baseline Demand
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#805F69]" />
          Simulated Demand
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#BC7777]" />
          Stockout Exposed
        </span>
      </div>

      <div className="space-y-3">
        {items.slice(0, 6).map((item) => {
          const baseW = Math.max(4, (item.baseline / maxVal) * 100);
          const simW = Math.max(4, (item.simulated / maxVal) * 100);
          return (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-[#3F3437] truncate">{item.label}</span>
                <span className="font-mono tabular-nums text-[#81777A] shrink-0">
                  {item.baseline} →{' '}
                  <strong className={item.atRisk ? 'text-[#A15E5E]' : 'text-[#49383D]'}>
                    {item.simulated} units
                  </strong>
                </span>
              </div>
              <div className="space-y-1">
                <div className="h-1.5 w-full bg-[#FBF8F7] rounded-xs overflow-hidden">
                  <div
                    className="h-full bg-[#8296A8] rounded-xs transition-all duration-200"
                    style={{ width: `${baseW}%` }}
                  />
                </div>
                <div className="h-1.5 w-full bg-[#FBF8F7] rounded-xs overflow-hidden">
                  <div
                    className={`h-full rounded-xs transition-all duration-200 ${
                      item.atRisk ? 'bg-[#BC7777]' : 'bg-[#805F69]'
                    }`}
                    style={{ width: `${simW}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
