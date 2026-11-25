import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Download,
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
  HealthGauge,
  InventoryDistributionChart,
  InventoryMovementChart,
  Sparkline,
  TopProductsBarChart,
} from './Charts';
import { Button, SectionHeader, StatusLabel, SurfaceCard } from './ui/DesignPrimitives';
import { buildDailySeries, getReferenceDate, runDemandForecast } from '../lib/forecasting';
import { formatINRCompact } from '../lib/currency';
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
  const [windowDays, setWindowDays] = useState<14 | 30 | 60 | 90>(30);
  const [aiInsights, setAiInsights] = useState<AIInsight[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const refDate = useMemo(() => getReferenceDate(sales), [sales]);

  const aggregateForecast = useMemo(() => {
    const ids = products.map((p) => p.id);
    const series = buildDailySeries(sales, ids, Math.max(30, windowDays));
    const totalStock = products.reduce((s, p) => s + p.currentStock, 0);
    return runDemandForecast({
      series,
      horizonDays: windowDays,
      currentStock: totalStock,
      modelType: 'auto',
      subjectLabel: business.name,
    });
  }, [products, sales, windowDays, business.name]);

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
    const excessStock = products.filter((p) => p.currentStock > p.maxStockLevel);
    const healthyStock = products.filter(
      (p) => p.currentStock > p.minStockLevel && p.currentStock <= p.maxStockLevel
    );

    const allSeries = buildDailySeries(sales, products.map((p) => p.id), windowDays * 2);
    const recentSlice = allSeries.slice(-windowDays);
    const priorSlice = allSeries.slice(0, Math.max(0, allSeries.length - windowDays));

    const recentSalesTotal = recentSlice.reduce((sum, d) => sum + d.qty, 0);
    const priorSalesTotal = priorSlice.reduce((sum, d) => sum + d.qty, 0);
    const recentRevSpark = recentSlice.slice(-14).map((d) => d.revenue);
    const forecastSpark = aggregateForecast.points
      .filter((p) => p.isForecast && p.predicted !== undefined)
      .slice(0, 14)
      .map((p) => p.predicted || 0);

    const demandDeltaPct =
      recentSalesTotal > 0
        ? ((aggregateForecast.predictedTotal - recentSalesTotal) / recentSalesTotal) * 100
        : 0;
    const revenueDeltaPct =
      priorSalesTotal > 0
        ? ((recentSalesTotal - priorSalesTotal) / priorSalesTotal) * 100
        : 0;

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
      recentSalesTotal,
      demandDeltaPct,
      revenueDeltaPct,
      healthScore,
      recentRevSpark,
      forecastSpark,
    };
  }, [products, sales, windowDays, aggregateForecast]);

  const distributionSegments = useMemo(
    () => [
      {
        label: 'Healthy Stock',
        count: kpis.healthyStock.length,
        value: kpis.healthyStock.reduce((s, p) => s + p.currentStock * p.unitCost, 0),
        color: '#779384',
      },
      {
        label: 'Low Stock',
        count: kpis.lowStock.length,
        value: kpis.lowStock.reduce((s, p) => s + p.currentStock * p.unitCost, 0),
        color: '#C3A16D',
      },
      {
        label: 'Excess Stock',
        count: kpis.excessStock.length,
        value: kpis.excessStock.reduce((s, p) => s + p.currentStock * p.unitCost, 0),
        color: '#8296A8',
      },
      {
        label: 'Out of Stock',
        count: kpis.outOfStock.length,
        value: 0,
        color: '#BC7777',
      },
    ],
    [kpis]
  );

  const categoryDistribution = useMemo(() => {
    const map = new Map<string, { category: string; skuCount: number; units: number; value: number }>();
    for (const p of products) {
      const prev = map.get(p.category) || { category: p.category, skuCount: 0, units: 0, value: 0 };
      prev.skuCount += 1;
      prev.units += p.currentStock;
      prev.value += p.currentStock * p.unitPrice;
      map.set(p.category, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [products]);

  const topProducts = useMemo(() => {
    const cutoff = new Date(`${refDate}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
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
  }, [products, sales, refDate, windowDays]);

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

  const deterministicInsights: AIInsight[] = useMemo(() => {
    const list: AIInsight[] = [];
    const critical = recommendations.find((r) => r.urgency === 'critical');
    if (critical) {
      list.push({
        id: `ins-crit-${critical.productId}`,
        category: 'replenishment',
        title:
          critical.currentStock === 0
            ? `Immediate replenishment required: ${critical.productName}`
            : `Stockout risk detected: ${critical.productName}`,
        description: critical.reason,
        productId: critical.productId,
        productName: critical.productName,
        suggestedAction: `Order ${critical.recommendedOrderQty} units`,
        targetView: 'recommendations',
        impactMetric:
          critical.daysUntilStockout === 0 ? 'Critical · 0d' : `Critical · ${critical.daysUntilStockout}d`,
      });
    }

    const rising = recommendations
      .filter((r) => r.math.demandGrowthPct >= 10)
      .sort((a, b) => b.math.demandGrowthPct - a.math.demandGrowthPct)[0];
    if (rising) {
      list.push({
        id: `ins-rise-${rising.productId}`,
        category: 'demand_surge',
        title: `Demand acceleration detected in ${rising.category}`,
        description: `${rising.productName} is pacing +${rising.math.demandGrowthPct}% above prior period (${rising.predictedDemand30d} units projected).`,
        productId: rising.productId,
        productName: rising.productName,
        suggestedAction: 'Open Demand Forecast',
        targetView: 'forecasting',
        impactMetric: `Opportunity · +${rising.math.demandGrowthPct}%`,
      });
    }

    const excess = recommendations.find(
      (r) => r.type === 'excess_inventory' || r.type === 'slow_moving'
    );
    if (excess) {
      list.push({
        id: `ins-exc-${excess.productId}`,
        category: excess.type === 'excess_inventory' ? 'excess_capital' : 'slow_moving',
        title: `Slow-moving inventory requiring attention`,
        description: `${excess.productName}: ${excess.reason}`,
        productId: excess.productId,
        productName: excess.productName,
        suggestedAction: 'Inspect Inventory',
        targetView: 'inventory',
        impactMetric: `Watch · ${excess.math.daysOfSupply ?? '90+'}d cover`,
      });
    }

    const seasonalSkus = products.filter((p) => p.seasonalTag !== 'Year-Round');
    if (seasonalSkus.length > 0) {
      list.push({
        id: 'ins-seasonal',
        category: 'seasonal',
        title: `Upcoming seasonal demand shifts across ${seasonalSkus.length} SKUs`,
        description: `Products marked Holiday Peak or Winter Seasonal carry elevated multipliers in current projections.`,
        suggestedAction: 'Simulate in Scenario Lab',
        targetView: 'simulator',
        impactMetric: `Seasonal · ${seasonalSkus.length} SKUs`,
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
        inventoryValueINR: Math.round(kpis.totalRetailValue),
        predictedUnits: aggregateForecast.predictedTotal,
        horizonDays: windowDays,
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
      if (!res.ok) throw new Error(data.error || 'Failed to generate AI brief.');
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

  const handleExportSnapshot = () => {
    const rows = [
      'Metric,Value',
      `Business,"${business.name}"`,
      `WindowDays,${windowDays}`,
      `TotalProducts,${kpis.totalProducts}`,
      `RetailInventoryValue,${kpis.totalRetailValue.toFixed(2)}`,
      `CostInventoryValue,${kpis.totalCostValue.toFixed(2)}`,
      `LowStockSKUs,${kpis.lowStock.length}`,
      `OutOfStockSKUs,${kpis.outOfStock.length}`,
      `PredictedDemandUnits,${aggregateForecast.predictedTotal}`,
      `InventoryHealthPct,${kpis.healthScore}%`,
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartstock-overview-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getInsightIcon = (cat: AIInsight['category']) => {
    switch (cat) {
      case 'demand_surge':
        return <TrendingUp className="w-4 h-4 text-[#779384]" />;
      case 'replenishment':
        return <AlertTriangle className="w-4 h-4 text-[#BC7777]" />;
      case 'slow_moving':
      case 'excess_capital':
        return <TrendingDown className="w-4 h-4 text-[#C3A16D]" />;
      case 'seasonal':
        return <CalendarClock className="w-4 h-4 text-[#8296A8]" />;
    }
  };

  const getActivityIcon = (type: ActivityLog['type']) => {
    switch (type) {
      case 'product_added':
        return <PackagePlus className="w-4 h-4 text-[#8296A8]" />;
      case 'order_received':
        return <PackageCheck className="w-4 h-4 text-[#779384]" />;
      case 'low_stock_alert':
        return <AlertTriangle className="w-4 h-4 text-[#BC7777]" />;
      case 'po_created':
        return <ShoppingCart className="w-4 h-4 text-[#805F69]" />;
      case 'stock_sold':
        return <TrendingUp className="w-4 h-4 text-[#49383D]" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-[#81777A]" />;
    }
  };

  return (
    <div className="space-y-6 animate-view-enter">
      {/* Editorial Header + Date Window Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#49383D] tracking-tight">
            Business Overview
          </h2>
          <p className="text-sm text-[#81777A] mt-0.5">
            Your inventory performance, demand outlook and operational intelligence in one place.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg">
            <Calendar className="w-3.5 h-3.5 text-[#81777A] ml-2 mr-1" />
            {([14, 30, 60, 90] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setWindowDays(d)}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                  windowDays === d
                    ? 'bg-[#E9DDE0] text-[#49383D] font-semibold'
                    : 'text-[#81777A] hover:text-[#49383D]'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          <Button variant="secondary" size="sm" onClick={handleExportSnapshot}>
            <Download className="w-3.5 h-3.5" />
            Export Snapshot
          </Button>
        </div>
      </div>

      {/* Asymmetric KPI Composition */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Primary Anchor 1: Inventory Valuation */}
        <SurfaceCard className="lg:col-span-4 p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-[#81777A]">Inventory Valuation</div>
              <div className="font-mono font-bold text-3xl text-[#49383D] tabular-nums mt-1">
                {formatINRCompact(kpis.totalRetailValue)}
              </div>
              <div className="text-xs text-[#81777A] tabular-nums mt-1">
                Cost basis: <span className="font-mono text-[#3F3437]">{formatINRCompact(kpis.totalCostValue)}</span>
              </div>
            </div>
            <div className="w-28 pt-1">
              <Sparkline values={kpis.recentRevSpark} color="#805F69" />
              <div className="text-[10px] font-mono text-[#81777A] text-right mt-0.5 tabular-nums">
                {kpis.revenueDeltaPct >= 0 ? '+' : ''}
                {kpis.revenueDeltaPct.toFixed(1)}% vol
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-[#E8DFE1] flex items-center justify-between text-xs text-[#81777A]">
            <span>Trailing {windowDays}d sales: {kpis.recentSalesTotal.toLocaleString()} units</span>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="font-medium text-[#805F69] hover:text-[#49383D] cursor-pointer"
            >
              View Ledger →
            </button>
          </div>
        </SurfaceCard>

        {/* Primary Anchor 2: Predicted Demand */}
        <SurfaceCard className="lg:col-span-4 p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-[#81777A]">
                Predicted Demand ({windowDays}d)
              </div>
              <div className="font-mono font-bold text-3xl text-[#805F69] tabular-nums mt-1">
                {aggregateForecast.predictedTotal.toLocaleString()}
              </div>
              <div className="text-xs text-[#81777A] tabular-nums mt-1 inline-flex items-center gap-1">
                {kpis.demandDeltaPct >= 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#779384]" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5 text-[#C3A16D]" />
                )}
                <span className="font-mono font-semibold text-[#3F3437]">
                  {kpis.demandDeltaPct >= 0 ? '+' : ''}
                  {kpis.demandDeltaPct.toFixed(1)}%
                </span>{' '}
                vs trailing {windowDays}d
              </div>
            </div>
            <div className="w-28 pt-1">
              <Sparkline values={kpis.forecastSpark} color="#B99AA0" />
              <div className="text-[10px] font-mono text-[#81777A] text-right mt-0.5 tabular-nums">
                RMSE {aggregateForecast.rmse}
              </div>
            </div>
          </div>
          <div className="pt-3 border-t border-[#E8DFE1] flex items-center justify-between text-xs text-[#81777A]">
            <span>Avg {aggregateForecast.avgDailySales.toFixed(1)} units/day</span>
            <button
              type="button"
              onClick={() => onNavigate('forecasting')}
              className="font-medium text-[#805F69] hover:text-[#49383D] cursor-pointer"
            >
              Forecast Workspace →
            </button>
          </div>
        </SurfaceCard>

        {/* Operational Quad (4 Compact Tiles) */}
        <div className="lg:col-span-4 grid grid-cols-2 gap-3">
          <SurfaceCard className="p-4 flex flex-col justify-between">
            <div className="text-xs text-[#81777A]">Total Products</div>
            <div className="font-mono font-bold text-2xl text-[#49383D] tabular-nums">
              {kpis.totalProducts}
            </div>
            <div className="text-[11px] text-[#81777A]">{kpis.categoriesCount} categories</div>
          </SurfaceCard>

          <SurfaceCard className="p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#81777A]">
              <span>Inventory Health</span>
              <StatusLabel
                tone={
                  kpis.healthScore >= 65
                    ? 'healthy'
                    : kpis.healthScore >= 40
                    ? 'warning'
                    : 'critical'
                }
                label={
                  kpis.healthScore >= 65
                    ? 'Nominal'
                    : kpis.healthScore >= 40
                    ? 'Watch'
                    : 'Risk'
                }
              />
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="font-mono font-bold text-2xl text-[#49383D] tabular-nums">
                {kpis.healthScore}%
              </div>
              <HealthGauge score={kpis.healthScore} size={50} />
            </div>
            <div className="text-[11px] text-[#81777A] tabular-nums">
              {kpis.healthyStock.length}/{kpis.totalProducts} SKUs optimal
            </div>
          </SurfaceCard>

          <button
            type="button"
            onClick={() => onNavigate('recommendations')}
            className="text-left bg-white border border-[#E8DFE1] hover:border-[#C3A16D] rounded-xl p-4 flex flex-col justify-between transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-[#81777A]">
              <span>Low Stock</span>
              <StatusLabel tone="warning" label="Attention" />
            </div>
            <div className="font-mono font-bold text-2xl text-[#9E7D4A] tabular-nums">
              {kpis.lowStock.length}
            </div>
            <div className="text-[11px] text-[#81777A]">Below min threshold</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('recommendations')}
            className="text-left bg-white border border-[#E8DFE1] hover:border-[#BC7777] rounded-xl p-4 flex flex-col justify-between transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-[#81777A]">
              <span>Out of Stock</span>
              <StatusLabel tone="critical" label="Critical" />
            </div>
            <div className="font-mono font-bold text-2xl text-[#A15E5E] tabular-nums">
              {kpis.outOfStock.length}
            </div>
            <div className="text-[11px] text-[#81777A]">Immediate reorder</div>
          </button>
        </div>
      </div>

      {/* Primary Chart + Inventory Health Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <SurfaceCard className="lg:col-span-8 p-6 space-y-4">
          <SectionHeader
            title={`Actual Sales vs Predicted Demand (${windowDays}d Horizon)`}
            subtitle={`Active algorithm: ${aggregateForecast.modelLabel}`}
            action={
              <button
                type="button"
                onClick={() => onNavigate('forecasting')}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#805F69] hover:text-[#49383D] cursor-pointer"
              >
                Open Demand Forecast
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            }
          />

          <ForecastLineChart points={aggregateForecast.points} height={275} />

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#E8DFE1] text-xs text-[#81777A]">
            <div className="flex items-center gap-5">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#805F69]" />
                Historical Sales
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t-2 border-dashed border-[#B99AA0]" />
                Predicted Demand
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-2 bg-[#E9DDE0] rounded-xs" />
                90% Confidence Band
              </span>
            </div>
            <span className="font-mono tabular-nums">
              MAE {aggregateForecast.mae} · RMSE {aggregateForecast.rmse}
            </span>
          </div>
        </SurfaceCard>

        <SurfaceCard className="lg:col-span-4 p-6 flex flex-col justify-between space-y-5">
          <SectionHeader
            title="Inventory Health Distribution"
            subtitle="SKU count & cost valuation by stock tier"
          />
          <InventoryDistributionChart segments={distributionSegments} />
          <div className="pt-3 border-t border-[#E8DFE1] space-y-2">
            <div className="text-xs font-semibold text-[#49383D]">Stock Risk Overview</div>
            <p className="text-xs text-[#81777A]">
              {recommendations.filter((r) => r.urgency === 'critical' || r.urgency === 'high').length}{' '}
              SKUs require replenishment action inside their supplier lead-time window.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => onNavigate('recommendations')}
            >
              Review Smart Recommendations
            </Button>
          </div>
        </SurfaceCard>
      </div>

      {/* Intelligence Brief + Secondary Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <SurfaceCard className="lg:col-span-6 p-6 space-y-4">
          <SectionHeader
            title="Intelligence Brief"
            subtitle="Analyst synthesis of demand momentum, stockouts, and seasonal exposure"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={handleGenerateGeminiInsights}
                disabled={aiLoading}
              >
                {aiLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#805F69]" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-[#805F69]" />
                )}
                {aiLoading ? 'Synthesizing...' : 'Refresh with Gemini AI'}
              </Button>
            }
          />

          {aiError && (
            <div className="text-xs text-[#8E4F4F] bg-[#F9EFEF] border border-[#E6CECE] rounded-lg px-3 py-2">
              {aiError}
            </div>
          )}

          <div className="divide-y divide-[#E8DFE1]">
            {activeInsights.map((ins) => (
              <div key={ins.id} className="py-3.5 first:pt-1 last:pb-1 flex items-start gap-3.5">
                <div className="mt-0.5 p-2 rounded-lg bg-[#FBF8F7] border border-[#E8DFE1] shrink-0">
                  {getInsightIcon(ins.category)}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#49383D] truncate">
                      {ins.title}
                    </h3>
                    <span className="font-mono text-[11px] font-semibold text-[#805F69] tabular-nums shrink-0">
                      {ins.impactMetric}
                    </span>
                  </div>
                  <p className="text-xs text-[#81777A] leading-relaxed">{ins.description}</p>
                  <button
                    type="button"
                    onClick={() => onNavigate(ins.targetView, ins.productId)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#805F69] hover:text-[#49383D] pt-0.5 cursor-pointer"
                  >
                    {ins.suggestedAction}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <div className="lg:col-span-6 space-y-6">
          <SurfaceCard className="p-6 space-y-4">
            <SectionHeader
              title={`Top Performing Products (${windowDays}d)`}
              subtitle="Ranked by revenue contribution and unit volume"
              action={
                <button
                  type="button"
                  onClick={() => onNavigate('sales-analytics')}
                  className="text-xs font-medium text-[#805F69] hover:text-[#49383D] cursor-pointer"
                >
                  Sales Analytics →
                </button>
              }
            />
            <TopProductsBarChart items={topProducts} />
          </SurfaceCard>

          <SurfaceCard className="p-6 space-y-3">
            <SectionHeader
              title="Inventory Movement (6-Week Flow)"
              subtitle="Units checked in from suppliers vs units sold"
            />
            <InventoryMovementChart data={weeklyMovement} />
          </SurfaceCard>
        </div>
      </div>

      {/* Category Distribution & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <SurfaceCard className="lg:col-span-5 p-6 space-y-4">
          <SectionHeader
            title="Category Distribution"
            subtitle="SKU count, shelf stock, and INR valuation by supermarket aisle"
            action={
              <button
                type="button"
                onClick={() => onNavigate('catalogue')}
                className="text-xs font-medium text-[#805F69] hover:text-[#49383D] cursor-pointer"
              >
                Product Catalogue →
              </button>
            }
          />

          <div className="space-y-3.5 max-h-[350px] overflow-y-auto pr-1">
            {(() => {
              const maxVal = Math.max(1, ...categoryDistribution.map((c) => c.value));
              return categoryDistribution.map((cat) => (
                <div key={cat.category} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-[#3F3437] truncate">{cat.category}</span>
                    <span className="font-mono text-[#49383D] tabular-nums shrink-0">
                      {cat.skuCount} SKUs · {cat.units}u ·{' '}
                      <strong>{formatINRCompact(cat.value)}</strong>
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#FBF8F7] rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-[#805F69] rounded-sm transition-all duration-300"
                      style={{ width: `${Math.max(6, (cat.value / maxVal) * 100)}%` }}
                    />
                  </div>
                </div>
              ));
            })()}
          </div>
        </SurfaceCard>

        <SurfaceCard className="lg:col-span-7 p-6 space-y-4">
          <SectionHeader
            title="Recent Operational Activity"
            subtitle="Chronological ledger of stock updates, orders, sales, and alerts"
            action={
              <button
                type="button"
                onClick={() => onNavigate('notifications')}
                className="text-xs font-medium text-[#805F69] hover:text-[#49383D] cursor-pointer"
              >
                Open Notification Center →
              </button>
            }
          />

          <div className="divide-y divide-[#E8DFE1]">
            {activities.slice(0, 6).map((act) => (
              <div key={act.id} className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-[#FBF8F7] border border-[#E8DFE1] shrink-0">
                    {getActivityIcon(act.type)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#49383D] truncate">
                      {act.title}
                    </div>
                    <div className="text-xs text-[#81777A] truncate">{act.description}</div>
                  </div>
                </div>
                <span className="text-xs font-mono text-[#81777A] tabular-nums shrink-0">
                  {new Date(act.timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            ))}
          </div>
        </SurfaceCard>
      </div>
    </div>
  );
};
