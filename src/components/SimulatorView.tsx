import React, { useMemo, useState } from 'react';
import { Download, RefreshCw, Sparkles } from 'lucide-react';
import { buildDailySeries, runDemandForecast } from '../lib/forecasting';
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
  const [promoLiftPct, setPromoLiftPct] = useState(0);
  const [horizonDays, setHorizonDays] = useState(30);

  const [aiBrief, setAiBrief] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const simulationRows = useMemo(() => {
    const demandMultiplier = 1 + (demandShiftPct + promoLiftPct) / 100;

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

      const extraUnitsNeeded = Math.max(
        0,
        Math.ceil(simDemandTotal + simDaily * 4 - (p.currentStock + p.incomingStock))
      );

      return {
        product: p,
        baseDemand: baseForecast.predictedTotal,
        simDemand: simDemandTotal,
        baseLeadTime: p.leadTimeDays,
        simLeadTime,
        simDepletionDays,
        atRisk,
        extraUnitsNeeded,
        extraCapital: extraUnitsNeeded * p.unitCost,
      };
    });
  }, [products, sales, demandShiftPct, leadTimeDelayDays, promoLiftPct, horizonDays]);

  const summary = useMemo(() => {
    const baseUnits = simulationRows.reduce((s, r) => s + r.baseDemand, 0);
    const simUnits = simulationRows.reduce((s, r) => s + r.simDemand, 0);
    const atRiskSkus = simulationRows.filter((r) => r.atRisk);
    const capitalRequired = simulationRows.reduce((s, r) => s + r.extraCapital, 0);
    return { baseUnits, simUnits, atRiskSkus, capitalRequired };
  }, [simulationRows]);

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
            promoLiftPct,
            horizonDays,
          },
          simulationResults: {
            baselineDemandUnits: summary.baseUnits,
            simulatedDemandUnits: summary.simUnits,
            atRiskSkuCount: summary.atRiskSkus.length,
            estimatedReplenishmentCapitalUSD: Math.round(summary.capitalRequired),
            highestRiskProducts: summary.atRiskSkus.slice(0, 5).map((r) => ({
              name: r.product.name,
              currentStock: r.product.currentStock,
              simDepletionDays: r.simDepletionDays,
              simLeadTime: r.simLeadTime,
              extraUnitsNeeded: r.extraUnitsNeeded,
            })),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate AI scenario brief.');
      setAiBrief(data.narrative);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Unable to run Gemini scenario analysis.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleDownloadReport = () => {
    const header =
      'SKU,Product,Category,CurrentStock,BaseForecast,SimulatedForecast,SimLeadTimeDays,SimDepletionDays,AtRisk,SuggestedOrderQty,EstimatedOrderCost';
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
        r.extraUnitsNeeded,
        r.extraCapital.toFixed(2),
      ].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartstock-scenario-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (products.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
        <h3 className="font-display text-base font-bold text-[#101B2D]">
          No products available for simulation
        </h3>
        <p className="text-sm text-[#738096]">
          Add products in Inventory & Products to run demand and lead-time stress tests.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Parameters Panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-bold text-[#101B2D]">
              What-If Supply Chain Scenario Parameters
            </h2>
            <p className="text-xs text-[#738096]">
              Stress-test stockout exposure and working capital before market shifts hit
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadReport}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#202B3C] bg-[#F6F8FB] hover:bg-slate-200/70 border border-slate-200 rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download BI Report (CSV)
            </button>
            <button
              type="button"
              onClick={handleRunAiBrief}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#101B2D] hover:bg-[#263B55] rounded-lg disabled:opacity-60 cursor-pointer"
            >
              {aiLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-[#16A36A]" />
              )}
              {aiLoading ? 'Analyzing Scenario...' : 'Generate AI Scenario Brief'}
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-2">
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-[#202B3C]">Market Demand Shift</span>
              <span className="font-mono font-bold text-[#101B2D] tabular-nums">
                {demandShiftPct >= 0 ? '+' : ''}
                {demandShiftPct}%
              </span>
            </div>
            <input
              type="range"
              min={-30}
              max={60}
              step={5}
              value={demandShiftPct}
              onChange={(e) => setDemandShiftPct(Number(e.target.value))}
              className="w-full accent-[#101B2D]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-[#202B3C]">Supplier Lead Time Delay</span>
              <span className="font-mono font-bold text-[#E9A23B] tabular-nums">
                +{leadTimeDelayDays} days
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={leadTimeDelayDays}
              onChange={(e) => setLeadTimeDelayDays(Number(e.target.value))}
              className="w-full accent-[#E9A23B]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-[#202B3C]">Promotional Lift</span>
              <span className="font-mono font-bold text-[#16A36A] tabular-nums">
                +{promoLiftPct}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              step={5}
              value={promoLiftPct}
              onChange={(e) => setPromoLiftPct(Number(e.target.value))}
              className="w-full accent-[#16A36A]"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-[#202B3C]">
              Simulation Window
            </label>
            <select
              value={horizonDays}
              onChange={(e) => setHorizonDays(Number(e.target.value))}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white"
            >
              <option value={14}>14 Days</option>
              <option value={30}>30 Days</option>
              <option value={60}>60 Days</option>
              <option value={90}>90 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Impact Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-[#738096]">Baseline Forecast ({horizonDays}d)</div>
          <div className="font-mono font-bold text-2xl text-[#101B2D] tabular-nums">
            {summary.baseUnits.toLocaleString()}
          </div>
          <div className="text-xs text-[#738096]">Expected baseline units</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-[#738096]">Simulated Demand ({horizonDays}d)</div>
          <div className="font-mono font-bold text-2xl text-[#4C7FE8] tabular-nums">
            {summary.simUnits.toLocaleString()}
          </div>
          <div className="text-xs text-[#738096]">
            {summary.simUnits - summary.baseUnits >= 0 ? '+' : ''}
            {(summary.simUnits - summary.baseUnits).toLocaleString()} unit delta
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-[#738096]">SKUs Exposed to Stockout</div>
          <div className="font-mono font-bold text-2xl text-[#DC5555] tabular-nums">
            {summary.atRiskSkus.length}
          </div>
          <div className="text-xs text-[#738096]">Deplete inside delayed lead time</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-[#738096]">Required Buffer Capital</div>
          <div className="font-mono font-bold text-2xl text-[#101B2D] tabular-nums">
            ${Math.round(summary.capitalRequired).toLocaleString()}
          </div>
          <div className="text-xs text-[#738096]">Estimated replenishment cost</div>
        </div>
      </div>

      {/* Gemini AI Scenario Brief */}
      {aiError && (
        <div className="text-xs text-[#DC5555] bg-red-50 border border-red-200 rounded-xl p-4">
          {aiError}
        </div>
      )}
      {aiBrief && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#101B2D]">
            <Sparkles className="w-4 h-4 text-[#16A36A]" />
            SmartStock AI Scenario Brief
          </div>
          <div className="text-sm text-[#202B3C] whitespace-pre-line leading-relaxed">
            {aiBrief}
          </div>
        </div>
      )}

      {/* SKU-by-SKU Stress Test Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F6F8FB] border-b border-slate-200 text-[11px] font-semibold text-[#738096]">
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4 text-right">On-Hand</th>
                <th className="py-3 px-4 text-right">Base ({horizonDays}d)</th>
                <th className="py-3 px-4 text-right">Simulated ({horizonDays}d)</th>
                <th className="py-3 px-4 text-right">Sim. Lead Time</th>
                <th className="py-3 px-4 text-right">Depletion</th>
                <th className="py-3 px-4">Exposure</th>
                <th className="py-3 px-4 text-right">Extra Order Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {simulationRows.map((r) => (
                <tr key={r.product.id} className="hover:bg-[#F6F8FB]/60">
                  <td className="py-3 px-4 font-medium text-[#101B2D]">
                    {r.product.name}
                    <span className="ml-2 font-mono text-xs text-[#738096]">
                      {r.product.sku}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {r.product.currentStock}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[#738096] tabular-nums">
                    {r.baseDemand}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-[#101B2D] tabular-nums">
                    {r.simDemand}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs text-[#738096] tabular-nums">
                    {r.simLeadTime}d
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                    {r.simDepletionDays !== null ? `${r.simDepletionDays}d` : 'Covered'}
                  </td>
                  <td
                    className={`py-3 px-4 text-xs font-semibold ${
                      r.atRisk ? 'text-[#DC5555]' : 'text-[#16A36A]'
                    }`}
                  >
                    {r.atRisk ? 'Stockout Risk' : 'Protected'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                    {r.extraUnitsNeeded > 0 ? `${r.extraUnitsNeeded} units` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
