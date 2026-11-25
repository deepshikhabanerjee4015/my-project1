import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  PackageCheck,
  PackagePlus,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  ForecastLineChart,
  InventoryDistributionChart,
  InventoryMovementChart,
  TopProductsBarChart,
} from './Charts';
import { buildDailySeries, getReferenceDate, runDemandForecast } from '../lib/forecasting';
import type {
  ActivityLog,
  AIInsight,
  AppView,
  BusinessProfile,
  Product,
  SalesRecord,
  SmartRecommendation,
} from '../types/inventory';

interface DashboardViewProps {
  business: BusinessProfile;
  products: Product[];
  sales: SalesRecord[];
  recommendations: SmartRecommendation[];
  activities: ActivityLog[];
  onNavigate: (view: AppView, productId?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  business,
  products,
  sales,
  recommendations,
  activities,
  onNavigate,
}) => {
  const [aiInsights, setAiInsights] = useState<AIInsight[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const refDate = useMemo(() => getReferenceDate(sales), [sales]);

  // Compute aggregate 60d historical + 30d predicted demand series
  const aggregateForecast = useMemo(() => {
    const ids = products.map((p) => p.id);
    const series = buildDailySeries(sales, ids, 60);
    const totalStock = products.reduce((s, p) => s + p.currentStock, 0);
    return runDemandForecast({
      series,
      horizonDays: 30,
      currentStock: totalStock,
      modelType: 'auto',
      subjectLabel: business.name,
    });
  }, [products, sales, business.name]);

  // Compute exact KPI metrics from actual data
  const kpis = useMemo(() => {
    const totalProducts = products.length;
    const categoriesCount = new Set(products.map((p) => p.category)).size;
    const totalRetailValue = products.reduce(
      (sum, p) => sum + p.currentStock * p.unitPrice,
      0
    );
    const totalCostValue = products.reduce(
      (sum, p) => sum + p.currentStock * p.unitCost,
      0
    );

    const outOfStock = products.filter((p) => p.currentStock === 0);
    const lowStock = products.filter(
      (p) => p.currentStock > 0 && p.currentStock <= p.minStockLevel
    );
    const excessStock = products.filter(
      (p) => p.currentStock > p.maxStockLevel
    );
    const healthyStock = products.filter(
      (p) =>
        p.currentStock > p.minStockLevel && p.currentStock <= p.maxStockLevel
    );

    // Compare last 30 days actual vs prior 30 days actual
    const allSeries = buildDailySeries(sales, products.map((p) => p.id), 60);
    const last30Actual = allSeries
      .slice(-30)
      .reduce((sum, d) => sum + d.qty, 0);
    const prior30Actual = allSeries
      .slice(0, Math.max(0, allSeries.length - 30))
      .reduce((sum, d) => sum + d.qty, 0);

    const demandVsLast30Pct =
      last30Actual > 0
        ? ((aggregateForecast.predictedTotal - last30Actual) / last30Actual) * 100
        : 0;

    const salesMomentumPct =
      prior30Actual > 0 ? ((last30Actual - prior30Actual) / prior30Actual) * 100 : 0;

    const healthScore =
      totalProducts > 0
        ? Math.round((healthyStock.length / totalProducts) * 100)
        : 100;

    return {
      totalProducts,
      categoriesCount,
      totalRetailValue,
      totalCostValue,
      outOfStock,
      lowStock,
      excessStock,
      healthyStock,
      last30Actual,
      demandVsLast30Pct,
      salesMomentumPct,
      healthScore,
    };
  }, [products, sales, aggregateForecast.predictedTotal]);

  const distributionSegments = useMemo(
    () => [
      {
        label: 'Healthy Stock',
        count: kpis.healthyStock.length,
        value: kpis.healthyStock.reduce((s, p) => s + p.currentStock * p.unitCost, 0),
        color: '#16A36A',
      },
      {
        label: 'Low Stock',
        count: kpis.lowStock.length,
        value: kpis.lowStock.reduce((s, p) => s + p.currentStock * p.unitCost, 0),
        color: '#E9A23B',
      },
      {
        label: 'Excess Stock',
        count: kpis.excessStock.length,
        value: kpis.excessStock.reduce((s, p) => s + p.currentStock * p.unitCost, 0),
        color: '#4C7FE8',
      },
      {
        label: 'Out of Stock',
        count: kpis.outOfStock.length,
        value: 0,
        color: '#DC5555',
      },
    ],
    [kpis]
  );

  // Top performing products by 30-day revenue
  const topProducts = useMemo(() => {
    const cutoff = new Date(`${refDate}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const byProd = new Map<string, { units: number; rev: number }>();
    for (const s of sales) {
      if (s.date >= cutoffStr) {
        const prev = byProd.get(s.productId) || { units: 0, rev: 0 };
        prev.units += s.quantitySold;
        prev.rev += s.revenue;
        byProd.set(s.productId, prev);
      }
    }

    return products
      .map((p) => {
        const agg = byProd.get(p.id) || { units: 0, rev: 0 };
        return {
          id: p.id,
          name: p.name,
          unitsSold: agg.units,
          revenue: agg.rev,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [products, sales, refDate]);

  // Weekly inventory movement (last 6 weeks)
  const weeklyMovement = useMemo(() => {
    const series = buildDailySeries(sales, products.map((p) => p.id), 42);
    const weeks: Array<{ weekLabel: string; sold: number; received: number }> = [];
    for (let i = 0; i < 6; i++) {
      const slice = series.slice(i * 7, (i + 1) * 7);
      if (slice.length === 0) continue;
      weeks.push({
        weekLabel: slice[0].date.slice(5),
        sold: slice.reduce((a, b) => a + b.qty, 0),
        received: slice.reduce((a, b) => a + b.received, 0),
      });
    }
    return weeks;
  }, [sales, products]);

  // Deterministic SmartStock Intelligence insights grounded in live data
  const deterministicInsights: AIInsight[] = useMemo(() => {
    const list: AIInsight[] = [];
    const critical = recommendations.find((r) => r.urgency === 'critical');
    if (critical) {
      list.push({
        id: `ins-crit-${critical.productId}`,
        category: 'replenishment',
        title:
          critical.currentStock === 0
            ? `${critical.productName} is out of stock`
            : `${critical.productName} requires immediate replenishment`,
        description: critical.reason,
        productId: critical.productId,
        productName: critical.productName,
        suggestedAction: `Order ${critical.recommendedOrderQty} units`,
        targetView: 'recommendations',
        impactMetric:
          critical.daysUntilStockout === 0
            ? '0 days cover'
            : `${critical.daysUntilStockout}d left`,
      });
    }

    const rising = recommendations
      .filter((r) => r.math.demandGrowthPct >= 10)
      .sort((a, b) => b.math.demandGrowthPct - a.math.demandGrowthPct)[0];
    if (rising) {
      list.push({
        id: `ins-rise-${rising.productId}`,
        category: 'demand_surge',
        title: `Demand for ${rising.productName} is accelerating`,
        description: `Forecast projects +${rising.math.demandGrowthPct}% growth (${rising.predictedDemand30d} units over 30 days) vs prior baseline.`,
        productId: rising.productId,
        productName: rising.productName,
        suggestedAction: 'Inspect demand curve',
        targetView: 'forecasting',
        impactMetric: `+${rising.math.demandGrowthPct}%`,
      });
    }

    const excess = recommendations.find(
      (r) => r.type === 'excess_inventory' || r.type === 'slow_moving'
    );
    if (excess) {
      list.push({
        id: `ins-exc-${excess.productId}`,
        category: excess.type === 'excess_inventory' ? 'excess_capital' : 'slow_moving',
        title: `${excess.productName} has slower turnover`,
        description: excess.reason,
        productId: excess.productId,
        productName: excess.productName,
        suggestedAction: 'Review stock targets',
        targetView: 'inventory',
        impactMetric: `${excess.math.daysOfSupply ?? '90+'}d supply`,
      });
    }

    const seasonalSkus = products.filter((p) => p.seasonalTag !== 'Year-Round');
    if (seasonalSkus.length > 0) {
      list.push({
        id: 'ins-seasonal',
        category: 'seasonal',
        title: `Seasonal demand affects ${seasonalSkus.length} active SKUs`,
        description: `Products tagged Holiday Peak or Winter Seasonal carry elevated demand multipliers in current projections.`,
        suggestedAction: 'Run scenario stress test',
        targetView: 'simulator',
        impactMetric: `${seasonalSkus.length} SKUs`,
      });
    }

    return list.slice(0, 4);
  }, [recommendations, products]);

  const activeInsights = aiInsights || deterministicInsights;

  const handleGenerateGeminiInsights = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const summaryPayload = {
        totalProducts: kpis.totalProducts,
        inventoryValueUSD: Math.round(kpis.totalRetailValue),
        predicted30DayUnits: aggregateForecast.predictedTotal,
        topUrgentRecommendations: recommendations.slice(0, 5).map((r) => ({
          productName: r.productName,
          currentStock: r.currentStock,
          predictedDemand30d: r.predictedDemand30d,
          growthPct: r.math.demandGrowthPct,
          daysUntilStockout: r.daysUntilStockout,
          recommendedOrderQty: r.recommendedOrderQty,
          type: r.type,
        })),
        seasonalProductsCount: products.filter((p) => p.seasonalTag !== 'Year-Round').length,
      };

      const res = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: business.name,
          businessCategory: business.category,
          summaryPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate AI insights.');
      }

      if (Array.isArray(data.insights) && data.insights.length > 0) {
        setAiInsights(
          data.insights.map((ins: Omit<AIInsight, 'id'>, idx: number) => ({
            ...ins,
            id: `gemini-ins-${idx}`,
          }))
        );
      }
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Unable to reach Gemini AI service.');
    } finally {
      setAiLoading(false);
    }
  };

  const getInsightIcon = (cat: AIInsight['category']) => {
    switch (cat) {
      case 'demand_surge':
        return <TrendingUp className="w-4 h-4 text-[#16A36A]" />;
      case 'replenishment':
        return <AlertTriangle className="w-4 h-4 text-[#DC5555]" />;
      case 'slow_moving':
      case 'excess_capital':
        return <TrendingDown className="w-4 h-4 text-[#E9A23B]" />;
      case 'seasonal':
        return <CalendarClock className="w-4 h-4 text-[#4C7FE8]" />;
    }
  };

  const getActivityIcon = (type: ActivityLog['type']) => {
    switch (type) {
      case 'product_added':
        return <PackagePlus className="w-4 h-4 text-[#4C7FE8]" />;
      case 'order_received':
        return <PackageCheck className="w-4 h-4 text-[#16A36A]" />;
      case 'low_stock_alert':
        return <AlertTriangle className="w-4 h-4 text-[#DC5555]" />;
      case 'po_created':
        return <ShoppingCart className="w-4 h-4 text-[#263B55]" />;
      case 'stock_sold':
        return <TrendingUp className="w-4 h-4 text-[#101B2D]" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-[#738096]" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* 6 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#738096]">
            <span>Total Products</span>
            <Boxes className="w-4 h-4 text-[#263B55]" />
          </div>
          <div className="font-mono font-bold text-2xl text-[#101B2D] tabular-nums">
            {kpis.totalProducts}
          </div>
          <div className="text-xs text-[#738096]">
            Across {kpis.categoriesCount} active categories
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#738096]">
            <span>Inventory Value</span>
            <span className="font-mono text-[11px] text-[#738096]">Retail</span>
          </div>
          <div className="font-mono font-bold text-2xl text-[#101B2D] tabular-nums">
            ${Math.round(kpis.totalRetailValue).toLocaleString()}
          </div>
          <div className="text-xs text-[#738096] tabular-nums">
            Cost basis: ${Math.round(kpis.totalCostValue).toLocaleString()}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('recommendations')}
          className="text-left bg-white border border-slate-200 hover:border-[#E9A23B] rounded-xl p-4 space-y-2 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#738096]">
            <span>Low Stock Items</span>
            <span className="text-[11px] font-medium text-[#E9A23B]">Warning</span>
          </div>
          <div className="font-mono font-bold text-2xl text-[#E9A23B] tabular-nums">
            {kpis.lowStock.length}
          </div>
          <div className="text-xs text-[#738096]">Below min safety threshold</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('recommendations')}
          className="text-left bg-white border border-slate-200 hover:border-[#DC5555] rounded-xl p-4 space-y-2 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#738096]">
            <span>Out-of-Stock</span>
            <span className="text-[11px] font-medium text-[#DC5555]">Critical</span>
          </div>
          <div className="font-mono font-bold text-2xl text-[#DC5555] tabular-nums">
            {kpis.outOfStock.length}
          </div>
          <div className="text-xs text-[#738096]">Immediate reorder needed</div>
        </button>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#738096]">
            <span>Est. 30d Demand</span>
            {kpis.demandVsLast30Pct >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-[#16A36A]" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-[#E9A23B]" />
            )}
          </div>
          <div className="font-mono font-bold text-2xl text-[#101B2D] tabular-nums">
            {aggregateForecast.predictedTotal.toLocaleString()}
          </div>
          <div className="text-xs text-[#738096] tabular-nums">
            <span
              className={
                kpis.demandVsLast30Pct >= 0 ? 'text-[#16A36A] font-medium' : 'text-[#E9A23B] font-medium'
              }
            >
              {kpis.demandVsLast30Pct >= 0 ? '+' : ''}
              {kpis.demandVsLast30Pct.toFixed(1)}%
            </span>{' '}
            vs prior 30d ({kpis.last30Actual.toLocaleString()})
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#738096]">
            <span>Inventory Health</span>
            <span
              className={`text-[11px] font-medium ${
                kpis.healthScore >= 65
                  ? 'text-[#16A36A]'
                  : kpis.healthScore >= 40
                  ? 'text-[#E9A23B]'
                  : 'text-[#DC5555]'
              }`}
            >
              {kpis.healthScore >= 65 ? 'Healthy' : kpis.healthScore >= 40 ? 'Moderate' : 'At Risk'}
            </span>
          </div>
          <div className="font-mono font-bold text-2xl text-[#101B2D] tabular-nums">
            {kpis.healthScore}%
          </div>
          <div className="text-xs text-[#738096] tabular-nums">
            {kpis.healthyStock.length} of {kpis.totalProducts} SKUs optimal
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chart 1: Sales & Demand Trends */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-[#101B2D]">
                Sales & Demand Trends (60d Actual + 30d Forecast)
              </h2>
              <p className="text-xs text-[#738096]">
                Aggregate unit velocity across all active products · Model:{' '}
                {aggregateForecast.modelLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('forecasting')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4C7FE8] hover:text-[#101B2D] cursor-pointer whitespace-nowrap shrink-0"
            >
              Open Forecasting Engine
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <ForecastLineChart points={aggregateForecast.points} height={270} />

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100 text-xs text-[#738096]">
            <div className="flex items-center gap-5">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#101B2D]" />
                Historical Sales
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t-2 border-dashed border-[#16A36A]" />
                Predicted Demand
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-2 bg-[#16A36A]/20 rounded-xs" />
                90% Uncertainty Band
              </span>
            </div>
            <span className="font-mono tabular-nums">
              Backtest MAE: {aggregateForecast.mae} · RMSE: {aggregateForecast.rmse}
            </span>
          </div>
        </div>

        {/* Chart 2: Inventory Distribution */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#101B2D]">
              Inventory Distribution
            </h2>
            <p className="text-xs text-[#738096]">
              Stock health segmentation by SKU count & cost value
            </p>
          </div>
          <InventoryDistributionChart segments={distributionSegments} />
          <button
            type="button"
            onClick={() => onNavigate('inventory')}
            className="w-full py-2 text-xs font-medium text-[#101B2D] bg-[#F6F8FB] hover:bg-slate-200/70 border border-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Manage Product Catalog
          </button>
        </div>
      </div>

      {/* SmartStock Intelligence Panel + Secondary Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SmartStock Intelligence */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-[#101B2D]">
                SmartStock Intelligence
              </h2>
              <p className="text-xs text-[#738096]">
                Prioritized actions derived from forecast curves and stock thresholds
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateGeminiInsights}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#101B2D] bg-[#F6F8FB] hover:bg-slate-200/70 border border-slate-200 rounded-lg transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap shrink-0"
            >
              {aiLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#4C7FE8]" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-[#16A36A]" />
              )}
              {aiLoading ? 'Synthesizing...' : 'Generate AI Brief'}
            </button>
          </div>

          {aiError && (
            <div className="text-xs text-[#DC5555] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {aiError}
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {activeInsights.map((ins) => (
              <div key={ins.id} className="py-3.5 first:pt-1 last:pb-1 flex items-start gap-3">
                <div className="mt-0.5 p-2 rounded-lg bg-[#F6F8FB] border border-slate-200 shrink-0">
                  {getInsightIcon(ins.category)}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#101B2D] truncate">
                      {ins.title}
                    </h3>
                    <span className="font-mono text-xs font-medium text-[#263B55] tabular-nums shrink-0">
                      {ins.impactMetric}
                    </span>
                  </div>
                  <p className="text-xs text-[#738096] leading-relaxed">{ins.description}</p>
                  <button
                    type="button"
                    onClick={() => onNavigate(ins.targetView, ins.productId)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#16A36A] hover:text-[#101B2D] pt-0.5 cursor-pointer"
                  >
                    {ins.suggestedAction}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 3 & 4 stacked / split */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-[#101B2D]">
                  Top Performing Products (30d)
                </h2>
                <p className="text-xs text-[#738096]">
                  Ranked by trailing 30-day revenue contribution
                </p>
              </div>
              <span className="text-xs font-mono text-[#738096]">Revenue · Units</span>
            </div>
            <TopProductsBarChart items={topProducts} />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div>
              <h2 className="font-display text-base font-semibold text-[#101B2D]">
                Inventory Movement (6-Week Flow)
              </h2>
              <p className="text-xs text-[#738096]">
                Weekly units received from suppliers vs units sold
              </p>
            </div>
            <InventoryMovementChart data={weeklyMovement} />
          </div>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-[#101B2D]">
              Recent Activity
            </h2>
            <p className="text-xs text-[#738096]">
              Chronological log of inventory updates, orders, sales, and forecast events
            </p>
          </div>
          <span className="text-xs font-mono text-[#738096] tabular-nums">
            {activities.length} logged events
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {activities.slice(0, 8).map((act) => (
            <div key={act.id} className="py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-[#F6F8FB] border border-slate-200 shrink-0">
                  {getActivityIcon(act.type)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[#101B2D] truncate">
                    {act.title}
                  </div>
                  <div className="text-xs text-[#738096] truncate">{act.description}</div>
                </div>
              </div>
              <span className="text-xs font-mono text-[#738096] tabular-nums shrink-0">
                {new Date(act.timestamp).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
