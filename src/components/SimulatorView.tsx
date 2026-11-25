import React, { useMemo, useState } from 'react';
import { Compass, Download, RefreshCw, Sparkles } from 'lucide-react';
import { ScenarioComparisonChart } from './Charts';
import { Button, EmptyStateCard, SectionHeader, StatusLabel, SurfaceCard } from './ui/DesignPrimitives';
import { buildDailySeries, runDemandForecast } from '../lib/forecasting';
import { formatINRCompact } from '../lib/currency';
import type { BusinessProfile, Product, SalesRecord } from '../types/inventory';

interface SimulatorViewProps {
  business: BusinessProfile;
  products: Product[];
  sales: SalesRecord[];
}

export const SimulatorView: React.FC<SimulatorViewProps> = ({
  business,
  products,
  sales,
}) => {
  const [demandShiftPct, setDemandShiftPct] = useState(20);
  const [leadTimeDelayDays, setLeadTimeDelayDays] = useState(3);
  const [safetyBufferPct, setSafetyBufferPct] = useState(15);
  const [horizonDays, setHorizonDays] = useState(30);

  const [aiBrief, setAiBrief] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const simulationRows = useMemo(() => {
    const demandMultiplier = Math.max(0.2, 1 + demandShiftPct / 100);
    const safetyMultiplier = Math.max(0.5, 1 + safetyBufferPct / 100);

    return products.map((p) => {
      const series = buildDailySeries(sales, [p.id], 60);
      const baseForecast = runDemandForecast({
        series,
        horizonDays,
        currentStock: p.currentStock,
        modelType: 'auto',
        subjectLabel: p.name,
      });

      const baseDaily = baseForecast.avgDailySales;
      const simDaily = Math.max(0, baseDaily * demandMultiplier);
      const simDemandTotal = Math.round(simDaily * horizonDays);
      const simLeadTime = p.leadTimeDays + leadTimeDelayDays;
      const simDepletionDays =
        p.currentStock === 0
          ? 0
          : simDaily > 0.05
          ? Math.round(p.currentStock / simDaily)
          : null;

      const atRisk =
        p.currentStock === 0 ||
        (simDepletionDays !== null && simDepletionDays <= simLeadTime);

      const baseTarget = Math.ceil(baseForecast.predictedTotal + baseDaily * 4);
      const baseReorderQty = Math.max(
        0,
        baseTarget - (p.currentStock + p.incomingStock)
      );

      const simSafety = Math.ceil(simDaily * 4 * safetyMultiplier);
      const simTarget = simDemandTotal + simSafety;
      const simReorderQty = Math.max(
        0,
        simTarget - (p.currentStock + p.incomingStock)
      );

      const projectedEndingStock = p.currentStock + p.incomingStock - simDemandTotal;

      return {
        product: p,
        baseDemand: baseForecast.predictedTotal,
        simDemand: simDemandTotal,
        baseLeadTime: p.leadTimeDays,
        simLeadTime,
        simDepletionDays,
        projectedEndingStock,
        atRisk,
        baseReorderQty,
        simReorderQty,
        financialDelta: (simReorderQty - baseReorderQty) * p.unitCost,
        totalCapital: simReorderQty * p.unitCost,
      };
    });
  }, [products, sales, demandShiftPct, leadTimeDelayDays, safetyBufferPct, horizonDays]);

  const summary = useMemo(() => {
    const baseUnits = simulationRows.reduce((s, r) => s + r.baseDemand, 0);
    const simUnits = simulationRows.reduce((s, r) => s + r.simDemand, 0);
    const totalStock = products.reduce((s, p) => s + p.currentStock, 0);
    const baseEnding = totalStock - baseUnits;
    const simEnding = totalStock - simUnits;
    const atRiskSkus = simulationRows.filter((r) => r.atRisk);
    const totalReorderUnits = simulationRows.reduce((s, r) => s + r.simReorderQty, 0);
    const capitalRequired = simulationRows.reduce((s, r) => s + r.totalCapital, 0);
    const financialImpact = simulationRows.reduce((s, r) => s + r.financialDelta, 0);

    return {
      totalStock,
      baseUnits,
      simUnits,
      baseEnding,
      simEnding,
      atRiskSkus,
      totalReorderUnits,
      capitalRequired,
      financialImpact,
    };
  }, [simulationRows, products]);

  const explanationText = useMemo(() => {
    const dir = demandShiftPct >= 0 ? `a +${demandShiftPct}% demand surge` : `a ${demandShiftPct}% demand contraction`;
    const delayPhrase =
      leadTimeDelayDays > 0
        ? `combined with +${leadTimeDelayDays} extra days of supplier lead time`
        : 'with standard supplier delivery timelines';
    const safetyPhrase =
      safetyBufferPct !== 0
        ? ` and a ${safetyBufferPct > 0 ? '+' : ''}${safetyBufferPct}% safety stock adjustment`
        : '';

    return `Under ${dir} ${delayPhrase}${safetyPhrase}, ${horizonDays}-day portfolio demand shifts from ${summary.baseUnits.toLocaleString()} to ${summary.simUnits.toLocaleString()} units. ${summary.atRiskSkus.length} SKUs face stockout exposure inside their delayed replenishment window, requiring ${summary.totalReorderUnits.toLocaleString()} total reorder units (${formatINRCompact(summary.capitalRequired)} procurement commitment).`;
  }, [demandShiftPct, leadTimeDelayDays, safetyBufferPct, horizonDays, summary]);

  const handleRunAiBrief = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: business.name,
          scenarioParams: {
            demandShiftPct,
            leadTimeDelayDays,
            safetyBufferPct,
            horizonDays,
          },
          simulationResults: {
            baselineDemandUnits: summary.baseUnits,
            simulatedDemandUnits: summary.simUnits,
            atRiskSkuCount: summary.atRiskSkus.length,
            estimatedReplenishmentCapitalINR: Math.round(summary.capitalRequired),
            highestRiskProducts: summary.atRiskSkus.slice(0, 5).map((r) => ({
              name: r.product.name,
              currentStock: r.product.currentStock,
              simDepletionDays: r.simDepletionDays,
              simLeadTime: r.simLeadTime,
              extraUnitsNeeded: r.simReorderQty,
            })),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate AI scenario brief.');
      setAiBrief(data.narrative);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Unable to reach Gemini scenario service.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleDownloadReport = () => {
    const header =
      'SKU,Product,Category,CurrentStock,BaseForecast,SimulatedForecast,SimLeadTimeDays,SimDepletionDays,AtRisk,ReorderQty,EstimatedCost';
    const rows = simulationRows.map((r) =>
      [
        r.product.sku,
        `"${r.product.name.replace(/"/g, '""')}"`,
        `"${r.product.category}"`,
        r.product.currentStock,
        r.baseDemand,
        r.simDemand,
        r.simLeadTime,
        r.simDepletionDays ?? 'Covered',
        r.atRisk ? 'Yes' : 'No',
        r.simReorderQty,
        r.totalCapital.toFixed(2),
      ].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartstock-scenario-lab-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (products.length === 0) {
    return (
      <EmptyStateCard
        icon={<Compass className="w-5 h-5" />}
        title="No products available for Scenario Lab"
        description="Add products in Inventory to simulate demand shifts, supplier lead-time delays, and buffer adjustments."
      />
    );
  }

  return (
    <div className="space-y-6 animate-view-enter">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#49383D] tracking-tight">
            Scenario Lab
          </h2>
          <p className="text-sm text-[#81777A] mt-0.5">
            Explore possible demand changes and understand their impact before making purchasing decisions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleDownloadReport}>
            <Download className="w-3.5 h-3.5" />
            Export Scenario CSV
          </Button>
          <Button size="sm" onClick={handleRunAiBrief} disabled={aiLoading}>
            {aiLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-[#B99AA0]" />
            )}
            {aiLoading ? 'Synthesizing...' : 'Generate AI Scenario Brief'}
          </Button>
        </div>
      </div>

      {/* Left Config Panel + Right Live Simulation Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Panel: Scenario Configuration */}
        <SurfaceCard className="lg:col-span-4 p-6 space-y-6">
          <SectionHeader
            title="Scenario Configuration"
            subtitle="Adjust operational variables to recalculate live impact"
          />

          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'Holiday Surge', demand: 35, delay: 2, safety: 25 },
              { label: 'Supply Delay', demand: 0, delay: 7, safety: 30 },
              { label: 'Slowdown', demand: -20, delay: 0, safety: -10 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setDemandShiftPct(preset.demand);
                  setLeadTimeDelayDays(preset.delay);
                  setSafetyBufferPct(preset.safety);
                }}
                className="px-2.5 py-1 text-[11px] font-medium bg-[#FBF8F7] hover:bg-[#E9DDE0] text-[#49383D] border border-[#E8DFE1] rounded-md transition-colors cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="space-y-5 pt-2 border-t border-[#E8DFE1]">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-[#3F3437]">Demand Variation</label>
                <input
                  type="number"
                  min={-40}
                  max={80}
                  value={demandShiftPct}
                  onChange={(e) => setDemandShiftPct(Number(e.target.value))}
                  className="w-16 px-2 py-1 text-right font-mono font-semibold text-xs bg-white text-[#49383D] border border-[#E8DFE1] rounded-md focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
              <input
                type="range"
                min={-40}
                max={80}
                step={5}
                value={demandShiftPct}
                onChange={(e) => setDemandShiftPct(Number(e.target.value))}
                className="w-full accent-[#49383D]"
              />
              <div className="flex justify-between text-[11px] text-[#81777A] font-mono">
                <span>-40%</span>
                <span>0%</span>
                <span>+80%</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-[#3F3437]">Supplier Delivery Delay (Days)</label>
                <input
                  type="number"
                  min={0}
                  max={14}
                  value={leadTimeDelayDays}
                  onChange={(e) => setLeadTimeDelayDays(Number(e.target.value))}
                  className="w-16 px-2 py-1 text-right font-mono font-semibold text-xs bg-white text-[#49383D] border border-[#E8DFE1] rounded-md focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
              <input
                type="range"
                min={0}
                max={14}
                step={1}
                value={leadTimeDelayDays}
                onChange={(e) => setLeadTimeDelayDays(Number(e.target.value))}
                className="w-full accent-[#C3A16D]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-medium text-[#3F3437]">Safety Stock Adjustment</label>
                <span className="font-mono font-semibold text-[#779384] tabular-nums">
                  {safetyBufferPct >= 0 ? '+' : ''}
                  {safetyBufferPct}%
                </span>
              </div>
              <input
                type="range"
                min={-30}
                max={60}
                step={5}
                value={safetyBufferPct}
                onChange={(e) => setSafetyBufferPct(Number(e.target.value))}
                className="w-full accent-[#805F69]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#3F3437]">
                Forecasting Horizon
              </label>
              <select
                value={horizonDays}
                onChange={(e) => setHorizonDays(Number(e.target.value))}
                className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg text-[#49383D] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
              >
                <option value={14}>14 Days</option>
                <option value={30}>30 Days</option>
                <option value={60}>60 Days</option>
                <option value={90}>90 Days</option>
              </select>
            </div>
          </div>
        </SurfaceCard>

        {/* Right Panel: Live Simulation Results */}
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SurfaceCard className="p-4 space-y-1">
              <div className="text-xs text-[#81777A]">Baseline vs Simulated</div>
              <div className="font-mono font-bold text-lg text-[#49383D] tabular-nums">
                {summary.baseUnits.toLocaleString()} → {summary.simUnits.toLocaleString()}
              </div>
              <div className="text-[11px] text-[#81777A]">Projected {horizonDays}d demand</div>
            </SurfaceCard>

            <SurfaceCard className="p-4 space-y-1">
              <div className="text-xs text-[#81777A]">Simulated Net Balance</div>
              <div
                className={`font-mono font-bold text-lg tabular-nums ${
                  summary.simEnding < 0 ? 'text-[#A15E5E]' : 'text-[#779384]'
                }`}
              >
                {summary.simEnding.toLocaleString()} units
              </div>
              <div className="text-[11px] text-[#81777A] font-mono tabular-nums">
                Baseline: {summary.baseEnding.toLocaleString()} units
              </div>
            </SurfaceCard>

            <SurfaceCard className="p-4 space-y-1">
              <div className="text-xs text-[#81777A]">Expected Stockout Risk</div>
              <div className="font-mono font-bold text-lg text-[#A15E5E] tabular-nums">
                {summary.atRiskSkus.length} SKUs
              </div>
              <div className="text-[11px] text-[#81777A]">Deplete inside lead time</div>
            </SurfaceCard>

            <SurfaceCard className="p-4 space-y-1">
              <div className="text-xs text-[#81777A]">Financial Impact</div>
              <div className="font-mono font-bold text-lg text-[#49383D] tabular-nums">
                {formatINRCompact(summary.capitalRequired)}
              </div>
              <div className="text-[11px] text-[#81777A] font-mono tabular-nums">
                Delta: {summary.financialImpact >= 0 ? '+' : '-'}
                {formatINRCompact(Math.abs(summary.financialImpact))}
              </div>
            </SurfaceCard>
          </div>

          <SurfaceCard className="p-6 space-y-4">
            <SectionHeader
              title="Baseline vs Simulated Outcome by Top SKUs"
              subtitle="Comparison of expected demand volume and lead-time stockout exposure"
            />
            <ScenarioComparisonChart
              items={simulationRows
                .slice()
                .sort((a, b) => b.simDemand - a.simDemand)
                .map((r) => ({
                  label: r.product.name,
                  baseline: r.baseDemand,
                  simulated: r.simDemand,
                  atRisk: r.atRisk,
                }))}
            />
            <div className="pt-3 border-t border-[#E8DFE1] text-xs text-[#805F69] leading-relaxed">
              <strong className="text-[#49383D]">What changed & why: </strong>
              {explanationText}
            </div>
          </SurfaceCard>

          {aiError && (
            <div className="text-xs text-[#8E4F4F] bg-[#F9EFEF] border border-[#E6CECE] rounded-xl p-4">
              {aiError}
            </div>
          )}

          {aiBrief && (
            <SurfaceCard className="p-6 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#49383D]">
                <Sparkles className="w-4 h-4 text-[#805F69]" />
                Gemini Operational Scenario Brief
              </div>
              <div className="text-sm text-[#3F3437] whitespace-pre-line leading-relaxed">
                {aiBrief}
              </div>
            </SurfaceCard>
          )}
        </div>
      </div>

      {/* Detailed SKU Simulation Table */}
      <SurfaceCard className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#FBF8F7] border-b border-[#E8DFE1] text-[11px] font-semibold text-[#81777A]">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4 text-right">On-Hand</th>
                <th className="py-3 px-4 text-right">Base ({horizonDays}d)</th>
                <th className="py-3 px-4 text-right">Simulated ({horizonDays}d)</th>
                <th className="py-3 px-4 text-right">Sim. Lead</th>
                <th className="py-3 px-4 text-right">Depletion</th>
                <th className="py-3 px-4">Exposure</th>
                <th className="py-3 px-4 text-right">Reorder Qty</th>
                <th className="py-3 px-4 text-right">Est. Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8DFE1] text-sm">
              {simulationRows.map((r) => (
                <tr key={r.product.id} className="hover:bg-[#FBF8F7]/60">
                  <td className="py-3 px-4 font-medium text-[#49383D]">
                    {r.product.name}
                    <span className="ml-2 font-mono text-xs text-[#81777A]">
                      {r.product.sku}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {r.product.currentStock}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[#81777A] tabular-nums">
                    {r.baseDemand}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-[#49383D] tabular-nums">
                    {r.simDemand}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs text-[#81777A] tabular-nums">
                    {r.simLeadTime}d
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                    {r.simDepletionDays !== null ? `${r.simDepletionDays}d` : 'Covered'}
                  </td>
                  <td className="py-3 px-4">
                    <StatusLabel
                      tone={r.atRisk ? 'critical' : 'healthy'}
                      label={r.atRisk ? 'Stockout Risk' : 'Protected'}
                    />
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                    {r.simReorderQty > 0 ? `${r.simReorderQty}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                    {r.totalCapital > 0 ? formatINRCompact(r.totalCapital) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>
    </div>
  );
};
