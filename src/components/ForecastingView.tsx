import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Calendar, Compass, Info, Layers, RefreshCw, ShieldAlert, TrendingUp } from 'lucide-react';
import { ForecastLineChart } from './Charts';
import { Button, EmptyStateCard, SectionHeader, StatusLabel, SurfaceCard } from './ui/DesignPrimitives';
import { buildDailySeries, runDemandForecast } from '../lib/forecasting';
import type { AppView, ForecastModelType, Product, SalesRecord } from '../types/inventory';

interface ForecastingViewProps {
  products: Product[];
  sales: SalesRecord[];
  initialProductId?: string;
  onNavigate: (view: AppView, productId?: string) => void;
}

export const ForecastingView: React.FC<ForecastingViewProps> = ({
  products,
  sales,
  initialProductId,
  onNavigate,
}) => {
  const [scopeType, setScopeType] = useState<'product' | 'category' | 'all'>('product');
  const [selectedProductId, setSelectedProductId] = useState<string>(
    initialProductId || products[0]?.id || ''
  );
  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))),
    [products]
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0] || '');
  const [horizonDays, setHorizonDays] = useState<7 | 30 | 60 | 90>(30);
  const [modelType, setModelType] = useState<ForecastModelType>('auto');
  const [simulatePromo, setSimulatePromo] = useState<boolean>(false);
  const [showConfidenceBand, setShowConfidenceBand] = useState<boolean>(true);
  const [lookbackDays, setLookbackDays] = useState<30 | 60 | 90>(90);
  const [recalcTick, setRecalcTick] = useState(0);

  useEffect(() => {
    if (initialProductId && products.some((p) => p.id === initialProductId)) {
      setScopeType('product');
      setSelectedProductId(initialProductId);
    } else if (!products.some((p) => p.id === selectedProductId) && products[0]) {
      setSelectedProductId(products[0].id);
    }
  }, [initialProductId, products, selectedProductId]);

  const { scopedProducts, subjectLabel } = useMemo(() => {
    if (scopeType === 'all') {
      return { scopedProducts: products, subjectLabel: 'All Catalog Products' };
    }
    if (scopeType === 'category') {
      const cat = selectedCategory || categories[0] || '';
      return {
        scopedProducts: products.filter((p) => p.category === cat),
        subjectLabel: `${cat} Category`,
      };
    }
    const prod = products.find((p) => p.id === selectedProductId) || products[0];
    return {
      scopedProducts: prod ? [prod] : [],
      subjectLabel: prod ? prod.name : 'Selected Product',
    };
  }, [scopeType, products, selectedCategory, categories, selectedProductId]);

  const forecast = useMemo(() => {
    const ids = scopedProducts.map((p) => p.id);
    const series = buildDailySeries(sales, ids, lookbackDays);
    const currentStock = scopedProducts.reduce((sum, p) => sum + p.currentStock, 0);
    const hasPromo =
      simulatePromo || (scopedProducts.length === 1 && scopedProducts[0].promoActive);
    const seasonalFactor =
      scopedProducts.length === 1 && scopedProducts[0].seasonalTag === 'Holiday Peak'
        ? 1.15
        : scopedProducts.length === 1 && scopedProducts[0].seasonalTag === 'Winter Seasonal'
        ? 1.1
        : 1.0;

    return runDemandForecast({
      series,
      horizonDays,
      currentStock,
      modelType,
      promoActive: hasPromo,
      seasonalFactor,
      subjectLabel,
    });
  }, [
    scopedProducts,
    sales,
    lookbackDays,
    horizonDays,
    modelType,
    simulatePromo,
    subjectLabel,
    recalcTick,
  ]);

  if (products.length === 0) {
    return (
      <EmptyStateCard
        icon={<TrendingUp className="w-5 h-5" />}
        title="No products available to forecast"
        description="Add or import products in Inventory to generate demand projections, depletion timelines, and error validation scores."
        action={
          <Button onClick={() => onNavigate('inventory')}>Go to Inventory</Button>
        }
      />
    );
  }

  const totalCurrentStock = scopedProducts.reduce((s, p) => s + p.currentStock, 0);
  const singleProduct = scopedProducts.length === 1 ? scopedProducts[0] : null;

  const seasonalObservation = singleProduct
    ? singleProduct.seasonalTag === 'Year-Round'
      ? `${singleProduct.name} exhibits steady year-round demand modulated primarily by weekend retail traffic.`
      : `${singleProduct.name} carries a "${singleProduct.seasonalTag}" profile, amplifying forward demand projections.`
    : `${scopedProducts.filter((p) => p.seasonalTag !== 'Year-Round').length} of ${scopedProducts.length} SKUs in this selection carry seasonal demand tags.`;

  const historicalSummary = `${forecast.historicalTotal.toLocaleString()} units sold across ${forecast.dataPointsCount} observed days (prior baseline: ${forecast.priorAvgDailySales.toFixed(1)} units/day).`;

  const modelLimitation =
    forecast.dataPointsCount < 14
      ? 'Limited historical window (<14 days). SmartStock automatically falls back to a Simple Moving Average baseline until more daily sales accumulate.'
      : `Validated on a holdout window with MAE ${forecast.mae} and RMSE ${forecast.rmse}. Sudden unscheduled promotions or supplier outages are not captured unless toggled in Scenario Lab.`;

  return (
    <div className="space-y-6 animate-view-enter">
      {/* Analytical Header & Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#49383D] tracking-tight">
            Demand Forecast
          </h2>
          <p className="text-sm text-[#81777A] mt-0.5">
            Time-series demand modeling, holdout error validation, and stock depletion outlook.
          </p>
        </div>

        <Button onClick={() => setRecalcTick((t) => t + 1)}>
          <RefreshCw className="w-3.5 h-3.5" />
          Generate Forecast
        </Button>
      </div>

      {/* Parameter Bar */}
      <SurfaceCard className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg">
            {(
              [
                { id: 'product', label: 'Individual Product' },
                { id: 'category', label: 'Category' },
                { id: 'all', label: 'All Products' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setScopeType(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  scopeType === tab.id
                    ? 'bg-[#E9DDE0] text-[#49383D] font-semibold'
                    : 'text-[#81777A] hover:text-[#49383D]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#81777A] inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Horizon:
            </span>
            <div className="flex items-center gap-1 p-1 bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg">
              {([7, 30, 60, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setHorizonDays(d)}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    horizonDays === d
                      ? 'bg-[#805F69] text-white'
                      : 'text-[#81777A] hover:text-[#49383D]'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-3 border-t border-[#E8DFE1]">
          {scopeType === 'product' && (
            <div className="md:col-span-2 space-y-1">
              <label className="block text-xs font-medium text-[#805F69]">Product Selector</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg text-[#49383D] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name} ({p.currentStock} in stock)
                  </option>
                ))}
              </select>
            </div>
          )}

          {scopeType === 'category' && (
            <div className="md:col-span-2 space-y-1">
              <label className="block text-xs font-medium text-[#805F69]">Category Selector</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg text-[#49383D] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scopeType === 'all' && (
            <div className="md:col-span-2 flex items-center gap-2 h-10 mt-5 px-3 bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg text-sm text-[#3F3437]">
              <Layers className="w-4 h-4 text-[#805F69]" />
              <span>Portfolio aggregate ({products.length} active SKUs)</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-medium text-[#805F69]">Algorithm</label>
            <select
              value={modelType}
              onChange={(e) => setModelType(e.target.value as ForecastModelType)}
              className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg text-[#49383D] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
            >
              <option value="auto">Auto-Select (Lowest RMSE)</option>
              <option value="holt_winters">Holt-Winters Seasonal</option>
              <option value="weighted_ma">Weighted Moving Average</option>
              <option value="linear_trend">Damped Linear Regression</option>
              <option value="baseline_sma">Simple Moving Average</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-[#805F69]">Training Window</label>
            <select
              value={lookbackDays}
              onChange={(e) => setLookbackDays(Number(e.target.value) as 30 | 60 | 90)}
              className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg text-[#49383D] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
            >
              <option value={30}>Last 30 Days</option>
              <option value={60}>Last 60 Days</option>
              <option value={90}>Last 90 Days</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs">
          <div className="flex flex-wrap items-center gap-5">
            <label className="inline-flex items-center gap-2 cursor-pointer text-[#3F3437]">
              <input
                type="checkbox"
                checked={showConfidenceBand}
                onChange={(e) => setShowConfidenceBand(e.target.checked)}
                className="accent-[#805F69]"
              />
              Show 90% prediction uncertainty band
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-[#3F3437]">
              <input
                type="checkbox"
                checked={simulatePromo}
                onChange={(e) => setSimulatePromo(e.target.checked)}
                className="accent-[#805F69]"
              />
              Include active promotional lift (+15%)
            </label>
          </div>
          <StatusLabel
            tone={
              forecast.confidenceLabel === 'High'
                ? 'healthy'
                : forecast.confidenceLabel === 'Moderate'
                ? 'info'
                : 'warning'
            }
            label={`Confidence: ${forecast.confidenceLabel}`}
          />
        </div>
      </SurfaceCard>

      {/* Main Forecast Chart + Supporting KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <SurfaceCard className="lg:col-span-9 p-6 space-y-4">
          <SectionHeader
            title={`${subjectLabel} — Demand Trajectory`}
            subtitle={`Selected model: ${forecast.modelLabel}`}
            action={
              <div className="flex items-center gap-4 text-xs text-[#81777A]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 bg-[#805F69]" />
                  Actual Sales
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 border-t-2 border-dashed border-[#B99AA0]" />
                  Predicted Demand
                </span>
              </div>
            }
          />
          <ForecastLineChart
            points={forecast.points}
            height={330}
            showConfidenceBand={showConfidenceBand}
          />
        </SurfaceCard>

        <div className="lg:col-span-3 space-y-3">
          <SurfaceCard className="p-4 space-y-1">
            <div className="text-xs text-[#81777A]">Expected Total Demand ({horizonDays}d)</div>
            <div className="font-mono font-bold text-2xl text-[#805F69] tabular-nums">
              {forecast.predictedTotal.toLocaleString()} units
            </div>
            <div className="text-xs text-[#81777A] font-mono tabular-nums">
              {forecast.avgDailySales.toFixed(1)} avg daily units
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-4 space-y-1">
            <div className="text-xs text-[#81777A]">Growth / Decline vs Baseline</div>
            <div
              className={`font-mono font-bold text-2xl tabular-nums ${
                forecast.demandGrowthPct >= 0 ? 'text-[#567062]' : 'text-[#9E7D4A]'
              }`}
            >
              {forecast.demandGrowthPct >= 0 ? '+' : ''}
              {forecast.demandGrowthPct.toFixed(1)}%
            </div>
            <div className="text-xs text-[#81777A]">Trailing 14d momentum shift</div>
          </SurfaceCard>

          <SurfaceCard className="p-4 space-y-1">
            <div className="text-xs text-[#81777A]">Estimated Depletion Date</div>
            <div
              className={`font-mono font-bold text-xl tabular-nums ${
                forecast.expectedDepletionDays !== null && forecast.expectedDepletionDays <= 7
                  ? 'text-[#A15E5E]'
                  : 'text-[#49383D]'
              }`}
            >
              {forecast.expectedDepletionDate || 'Covered'}
            </div>
            <div className="text-xs text-[#81777A] font-mono tabular-nums">
              {forecast.expectedDepletionDays !== null
                ? `${forecast.expectedDepletionDays} days of cover (${totalCurrentStock} units)`
                : `${totalCurrentStock} units on hand`}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-4 space-y-1">
            <div className="text-xs text-[#81777A]">Forecast Accuracy Metrics</div>
            <div className="font-mono font-bold text-base text-[#49383D] tabular-nums">
              MAE {forecast.mae} · RMSE {forecast.rmse}
            </div>
            <div className="text-xs text-[#81777A] font-mono tabular-nums">
              Holdout MAPE: {forecast.mape}%
            </div>
          </SurfaceCard>
        </div>
      </div>

      {/* Forecast Intelligence Editorial Panel */}
      <SurfaceCard className="p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E8DFE1]">
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 text-[#8296A8]" />
            <h3 className="font-display text-base font-bold text-[#49383D]">
              Forecast Intelligence
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('simulator')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#805F69] hover:text-[#49383D] cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
              Stress-test in Scenario Lab
            </button>
            <button
              type="button"
              onClick={() => onNavigate('recommendations')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#805F69] hover:text-[#49383D] cursor-pointer"
            >
              View Reorder Plan
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="text-[15px] leading-relaxed text-[#3F3437] max-w-4xl">
          {forecast.explanation}
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-4 space-y-1.5">
            <div className="text-xs font-semibold text-[#49383D]">Demand Patterns</div>
            <ul className="space-y-1 text-xs text-[#81777A]">
              {forecast.patterns.map((p, i) => (
                <li key={i}>• {p}</li>
              ))}
            </ul>
          </div>

          <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-4 space-y-1.5">
            <div className="text-xs font-semibold text-[#49383D]">Seasonal Observations</div>
            <p className="text-xs text-[#81777A] leading-relaxed">{seasonalObservation}</p>
          </div>

          <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-4 space-y-1.5">
            <div className="text-xs font-semibold text-[#49383D]">Historical Performance</div>
            <p className="text-xs text-[#81777A] leading-relaxed">{historicalSummary}</p>
          </div>

          <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-4 space-y-1.5">
            <div className="text-xs font-semibold text-[#49383D] inline-flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-[#C3A16D]" />
              Model Limitations
            </div>
            <p className="text-xs text-[#81777A] leading-relaxed">{modelLimitation}</p>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
};
