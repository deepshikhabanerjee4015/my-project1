import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Calendar, Info, Layers, SlidersHorizontal } from 'lucide-react';
import { ForecastLineChart } from './Charts';
import { buildDailySeries, runDemandForecast } from '../lib/forecasting';
import type {
  AppView,
  ForecastModelType,
  Product,
  SalesRecord,
} from '../types/inventory';

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
  const [scopeType, setScopeType] = useState<'product' | 'category' | 'all'>(
    initialProductId ? 'product' : 'product'
  );
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
      simulatePromo ||
      (scopedProducts.length === 1 && scopedProducts[0].promoActive);
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
  }, [scopedProducts, sales, lookbackDays, horizonDays, modelType, simulatePromo, subjectLabel]);

  const totalCurrentStock = scopedProducts.reduce((s, p) => s + p.currentStock, 0);

  if (products.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
        <h3 className="font-display text-base font-bold text-[#101B2D]">
          No products available to forecast
        </h3>
        <p className="text-sm text-[#738096] max-w-md mx-auto">
          Add or import products in your Inventory catalog to generate demand projections and backtest accuracy metrics.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('inventory')}
          className="px-4 py-2 text-xs font-medium text-white bg-[#101B2D] hover:bg-[#263B55] rounded-lg cursor-pointer"
        >
          Go to Inventory & Products
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-[#F6F8FB] border border-slate-200 rounded-lg">
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
                    ? 'bg-white text-[#101B2D] shadow-xs'
                    : 'text-[#738096] hover:text-[#101B2D]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Horizon Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#738096] inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Horizon:
            </span>
            <div className="flex items-center gap-1 p-1 bg-[#F6F8FB] border border-slate-200 rounded-lg">
              {([7, 30, 60, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setHorizonDays(d)}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    horizonDays === d
                      ? 'bg-[#101B2D] text-white'
                      : 'text-[#738096] hover:text-[#101B2D]'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          {scopeType === 'product' && (
            <div className="md:col-span-2 space-y-1">
              <label className="block text-xs font-medium text-[#738096]">Select Product</label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-[#101B2D] focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
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
              <label className="block text-xs font-medium text-[#738096]">Select Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-[#101B2D] focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
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
            <div className="md:col-span-2 flex items-center gap-2 px-3 py-2 bg-[#F6F8FB] border border-slate-200 rounded-lg text-sm text-[#202B3C]">
              <Layers className="w-4 h-4 text-[#263B55]" />
              <span>Aggregated across all {products.length} active SKUs</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-medium text-[#738096]">Forecasting Model</label>
            <select
              value={modelType}
              onChange={(e) => setModelType(e.target.value as ForecastModelType)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-[#101B2D] focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
            >
              <option value="auto">Auto-Select (Lowest RMSE)</option>
              <option value="holt_winters">Holt-Winters Seasonal</option>
              <option value="weighted_ma">Weighted Moving Average</option>
              <option value="linear_trend">Damped Linear Regression</option>
              <option value="baseline_sma">Simple Moving Average</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-[#738096]">History Window</label>
            <select
              value={lookbackDays}
              onChange={(e) => setLookbackDays(Number(e.target.value) as 30 | 60 | 90)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-[#101B2D] focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
            >
              <option value={30}>Last 30 Days</option>
              <option value={60}>Last 60 Days</option>
              <option value={90}>Last 90 Days</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-xs">
          <div className="flex flex-wrap items-center gap-5">
            <label className="inline-flex items-center gap-2 cursor-pointer text-[#202B3C]">
              <input
                type="checkbox"
                checked={showConfidenceBand}
                onChange={(e) => setShowConfidenceBand(e.target.checked)}
                className="accent-[#16A36A]"
              />
              Show 90% forecast uncertainty band
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-[#202B3C]">
              <input
                type="checkbox"
                checked={simulatePromo}
                onChange={(e) => setSimulatePromo(e.target.checked)}
                className="accent-[#4C7FE8]"
              />
              Factor active promotional uplift (+15%)
            </label>
          </div>
          <span className="text-[#738096] font-mono tabular-nums">
            Observations: {forecast.dataPointsCount} daily points
          </span>
        </div>
      </div>

      {/* Forecast KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-[#738096]">Predicted Demand ({horizonDays}d)</div>
          <div className="font-mono font-bold text-2xl text-[#16A36A] tabular-nums">
            {forecast.predictedTotal.toLocaleString()}
          </div>
          <div className="text-xs text-[#738096]">Projected units</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-[#738096]">Historical Sales ({lookbackDays}d)</div>
          <div className="font-mono font-bold text-2xl text-[#101B2D] tabular-nums">
            {forecast.historicalTotal.toLocaleString()}
          </div>
          <div className="text-xs text-[#738096]">Recorded units</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-[#738096]">Avg Daily Sales</div>
          <div className="font-mono font-bold text-2xl text-[#101B2D] tabular-nums">
            {forecast.avgDailySales.toFixed(1)}
          </div>
          <div className="text-xs text-[#738096]">Units / day forecast</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-[#738096]">Demand Growth</div>
          <div
            className={`font-mono font-bold text-2xl tabular-nums ${
              forecast.demandGrowthPct >= 0 ? 'text-[#16A36A]' : 'text-[#E9A23B]'
            }`}
          >
            {forecast.demandGrowthPct >= 0 ? '+' : ''}
            {forecast.demandGrowthPct.toFixed(1)}%
          </div>
          <div className="text-xs text-[#738096]">Vs prior baseline</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-[#738096]">Stock Depletion</div>
          <div
            className={`font-mono font-bold text-2xl tabular-nums ${
              forecast.expectedDepletionDays !== null && forecast.expectedDepletionDays <= 7
                ? 'text-[#DC5555]'
                : 'text-[#101B2D]'
            }`}
          >
            {forecast.expectedDepletionDays !== null
              ? `${forecast.expectedDepletionDays}d`
              : '—'}
          </div>
          <div className="text-xs text-[#738096] font-mono tabular-nums">
            {forecast.expectedDepletionDate || `${totalCurrentStock} units on hand`}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-[#738096]">Backtest Accuracy</div>
          <div className="font-mono font-bold text-lg text-[#101B2D] tabular-nums pt-0.5">
            MAE {forecast.mae} · RMSE {forecast.rmse}
          </div>
          <div className="text-xs text-[#738096]">
            Confidence: <strong className="text-[#202B3C]">{forecast.confidenceLabel}</strong>
          </div>
        </div>
      </div>

      {/* Main Forecast Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-[#101B2D]">
              {subjectLabel} — Time-Series Demand Projection
            </h2>
            <p className="text-xs text-[#738096]">
              Active model: {forecast.modelLabel}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#738096]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-[#101B2D]" />
              Actual Sales
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 border-t-2 border-dashed border-[#16A36A]" />
              Predicted Demand
            </span>
            {showConfidenceBand && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-2.5 bg-[#16A36A]/20 rounded-xs" />
                90% Uncertainty Band
              </span>
            )}
          </div>
        </div>

        <ForecastLineChart
          points={forecast.points}
          height={330}
          showConfidenceBand={showConfidenceBand}
        />
      </div>

      {/* Forecast Explanation & Detected Patterns */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#101B2D]">
            <Info className="w-4 h-4 text-[#4C7FE8]" />
            Forecast Explanation
          </div>
          <p className="text-[15px] leading-relaxed text-[#202B3C]">{forecast.explanation}</p>
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[#738096] font-mono tabular-nums">
              On-hand: {totalCurrentStock} units · Holdout MAPE: {forecast.mape}%
            </span>
            <button
              type="button"
              onClick={() => onNavigate('recommendations')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#16A36A] hover:text-[#101B2D] cursor-pointer"
            >
              Review Reorder Recommendations
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#101B2D]">
            <SlidersHorizontal className="w-4 h-4 text-[#16A36A]" />
            Detected Demand Signals
          </div>
          <ul className="space-y-2.5 text-sm text-[#738096]">
            {forecast.patterns.map((pat, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="font-mono text-xs text-[#101B2D] mt-0.5">0{i + 1}.</span>
                <span className="text-[#202B3C]">{pat}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
