import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Compass,
  Layers,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { ForecastLineChart } from './Charts';
import { buildDailySeries, generateRecommendations, runDemandForecast } from '../lib/forecasting';
import { formatINRCompact } from '../lib/currency';
import type { BusinessProfile, Product, SalesRecord } from '../types/inventory';

interface LandingPageProps {
  demoBusiness?: BusinessProfile;
  demoProducts: Product[];
  demoSales: SalesRecord[];
  signedInUser?: { name: string; email: string } | null;
  onExploreDemo: () => void;
  onOpenAuth: (initialTab: 'signin' | 'onboard') => void;
  onOpenProfile?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  demoBusiness,
  demoProducts,
  demoSales,
  signedInUser = null,
  onExploreDemo,
  onOpenAuth,
  onOpenProfile,
}) => {
  const [previewProductId, setPreviewProductId] = useState<string>(
    demoProducts[0]?.id || ''
  );
  const [activeCapability, setActiveCapability] = useState<
    'forecasting' | 'optimisation' | 'scenario'
  >('forecasting');
  const [imgError, setImgError] = useState(false);

  const selectedProduct = useMemo(
    () => demoProducts.find((p) => p.id === previewProductId) || demoProducts[0],
    [demoProducts, previewProductId]
  );

  const previewForecast = useMemo(() => {
    if (!selectedProduct) return null;
    const series = buildDailySeries(demoSales, [selectedProduct.id], 45);
    return runDemandForecast({
      series,
      horizonDays: 21,
      currentStock: selectedProduct.currentStock,
      modelType: 'auto',
      promoActive: selectedProduct.promoActive,
      subjectLabel: selectedProduct.name,
    });
  }, [selectedProduct, demoSales]);

  const previewMetrics = useMemo(() => {
    const valuation = demoProducts.reduce(
      (sum, p) => sum + p.currentStock * p.unitPrice,
      0
    );
    const healthyCount = demoProducts.filter(
      (p) => p.currentStock > p.minStockLevel && p.currentStock <= p.maxStockLevel
    ).length;
    const healthPct =
      demoProducts.length > 0
        ? Math.round((healthyCount / demoProducts.length) * 100)
        : 100;
    const lowOrOut = demoProducts.filter((p) => p.currentStock <= p.minStockLevel);
    const recs = demoBusiness
      ? generateRecommendations({
          business: demoBusiness,
          products: demoProducts,
          sales: demoSales,
          statuses: {},
        })
      : [];
    return { valuation, healthPct, lowOrOut, topRec: recs[0] };
  }, [demoBusiness, demoProducts, demoSales]);

  const capabilityData = {
    forecasting: {
      eyebrow: '01. Intelligent Forecasting',
      title: 'Backtested time-series models tailored to each SKU’s data depth',
      body: 'SmartStock automatically evaluates Holt-Winters seasonal smoothing, weighted moving averages, and damped linear regression on a rolling holdout window, selecting the lowest-RMSE model per product.',
      bullets: [
        '7, 30, 60, and 90-day forward demand horizons with 90% uncertainty bands',
        'Automatic day-of-week buying surge and seasonal uplift calibration',
        'Transparent MAE and RMSE validation metrics for every forecast',
      ],
      metricLabel: 'Validation Method',
      metricValue: 'Rolling Holdout RMSE',
    },
    optimisation: {
      eyebrow: '02. Inventory Optimisation',
      title: 'Reorder quantities grounded in lead time, volatility, and open POs',
      body: 'Instead of arbitrary minimum thresholds, SmartStock calculates dynamic safety stock and reorder points—subtracting incoming purchase orders so you never over-order.',
      bullets: [
        'Lead-time depletion warnings before shelf stock reaches zero',
        'Excess capital detection for slow-moving and overstocked SKUs',
        'One-click staging into supplier Purchase Orders',
      ],
      metricLabel: 'Reorder Formula',
      metricValue: 'Lead Demand + Safety Stock',
    },
    scenario: {
      eyebrow: '03. Scenario Analysis',
      title: 'Stress-test demand spikes and supplier delays before committing cash',
      body: 'Simulate promotional campaigns, seasonal surges, or extended shipping lead times inside Scenario Lab to inspect SKU-level stockout exposure and required buffer capital.',
      bullets: [
        'Interactive demand variation, lead-time delay, and safety buffer sliders',
        'Side-by-side baseline vs simulated demand comparison charts',
        'Executive operational briefs synthesized on demand',
      ],
      metricLabel: 'Simulation Scope',
      metricValue: 'SKU & Portfolio Level',
    },
  }[activeCapability];

  return (
    <div className="min-h-screen bg-[#F7F3F1] text-[#3F3437]">
      {/* Top Navigation Bar - Clean 3-Zone Contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[#E8DFE1]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="whitespace-nowrap shrink-0">
            <BrandLogo size="md" />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#805F69]">
            <a href="#product" className="hover:text-[#49383D] transition-colors whitespace-nowrap shrink-0">
              Product
            </a>
            <a href="#capabilities" className="hover:text-[#49383D] transition-colors whitespace-nowrap shrink-0">
              Capabilities
            </a>
            <a href="#how-it-works" className="hover:text-[#49383D] transition-colors whitespace-nowrap shrink-0">
              How It Works
            </a>
            <a href="#benefits" className="hover:text-[#49383D] transition-colors whitespace-nowrap shrink-0">
              Benefits
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {signedInUser ? (
              <>
                <button
                  type="button"
                  onClick={onOpenProfile || onExploreDemo}
                  className="px-3.5 py-2 text-xs font-medium text-[#3F3437] hover:bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {signedInUser.name}
                </button>
                <button
                  type="button"
                  onClick={onExploreDemo}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#805F69] hover:bg-[#6B4E57] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Workspace
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onOpenAuth('signin')}
                  className="px-3.5 py-2 text-xs font-medium text-[#805F69] hover:text-[#49383D] hover:bg-[#FBF8F7] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('onboard')}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#805F69] hover:bg-[#6B4E57] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Explore SmartStock
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="top" className="bg-white border-b border-[#E8DFE1]">
        <div className="max-w-7xl mx-auto px-6 py-16 lg:py-20 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5 space-y-6">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#805F69]">
              AI-POWERED INVENTORY INTELLIGENCE
            </p>
            <h1
              className="font-display font-bold text-[#49383D] tracking-tight leading-[1.07]"
              style={{
                fontSize: 'clamp(2.35rem, 3.8vw, 3.4rem)',
                textWrap: 'balance',
              }}
            >
              Know What You Need Before You Need It.
            </h1>
            <p className="text-base leading-relaxed text-[#81777A] max-w-lg">
              Turn historical sales and inventory data into intelligent forecasts, actionable
              purchasing recommendations and better business decisions.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onOpenAuth('onboard')}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#805F69] hover:bg-[#6B4E57] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Explore SmartStock
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onExploreDemo}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[#805F69] bg-white hover:bg-[#FBF8F7] hover:text-[#49383D] border border-[#805F69]/50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                View Live Demo
              </button>
            </div>

            <div className="pt-5 border-t border-[#E8DFE1] grid grid-cols-3 gap-4 text-xs">
              <div>
                <div className="font-mono font-semibold text-base text-[#49383D] tabular-nums">
                  7–90 Days
                </div>
                <div className="text-[#81777A]">Rolling horizons</div>
              </div>
              <div>
                <div className="font-mono font-semibold text-base text-[#805F69] tabular-nums">
                  MAE / RMSE
                </div>
                <div className="text-[#81777A]">Backtested models</div>
              </div>
              <div>
                <div className="font-mono font-semibold text-base text-[#49383D] tabular-nums">
                  Explainable
                </div>
                <div className="text-[#81777A]">Reorder formulas</div>
              </div>
            </div>
          </div>

          {/* Right Side: Realistic SmartStock Workspace Preview */}
          <div className="lg:col-span-7">
            <div className="bg-white border border-[#E8DFE1] rounded-xl shadow-[0_2px_10px_rgba(73,56,61,0.05)] overflow-hidden">
              {/* Preview App Chrome */}
              <div className="px-5 py-3 border-b border-[#E8DFE1] bg-[#FBF8F7] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-semibold text-[#49383D]">
                    {demoBusiness?.name || 'FreshBasket Supermarket'}
                  </span>
                  <span className="text-[#A69B9E]" aria-hidden="true">·</span>
                  <span className="text-[#567062] font-semibold font-mono tabular-nums">
                    Health {previewMetrics.healthPct}%
                  </span>
                </div>
                <select
                  aria-label="Preview product selector"
                  value={selectedProduct?.id || ''}
                  onChange={(e) => setPreviewProductId(e.target.value)}
                  className="text-xs font-medium bg-white border border-[#E8DFE1] rounded-md px-2.5 py-1 text-[#3F3437] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                >
                  {demoProducts.slice(0, 6).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedProduct && previewForecast && (
                <div className="p-5 space-y-4">
                  {/* Valuation, Forecast & Stock Metrics Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-3 border-b border-[#E8DFE1]">
                    <div>
                      <div className="text-[11px] text-[#81777A]">Inventory Value</div>
                      <div className="text-base font-bold font-mono tabular-nums text-[#49383D]">
                        {formatINRCompact(previewMetrics.valuation)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#81777A]">On-Hand SKU</div>
                      <div className="text-base font-bold font-mono tabular-nums text-[#49383D]">
                        {selectedProduct.currentStock} units
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#81777A]">21d Forecast</div>
                      <div className="text-base font-bold font-mono tabular-nums text-[#805F69]">
                        {previewForecast.predictedTotal} units
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[#81777A]">Low-Stock Alerts</div>
                      <div className="text-base font-bold font-mono tabular-nums text-[#9E7D4A]">
                        {previewMetrics.lowOrOut.length} SKUs
                      </div>
                    </div>
                  </div>

                  {/* Live Demand Forecast Chart */}
                  <ForecastLineChart
                    points={previewForecast.points}
                    height={200}
                    compact
                  />

                  {/* Low Stock & AI Recommendation Split */}
                  <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-[#E8DFE1]">
                    <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-[#49383D] inline-flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#C3A16D]" />
                          Low-Stock Watchlist
                        </span>
                        <span className="font-mono text-[#81777A]">
                          {previewMetrics.lowOrOut.length} active
                        </span>
                      </div>
                      <div className="space-y-1 text-xs">
                        {previewMetrics.lowOrOut.slice(0, 2).map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="text-[#3F3437] truncate">{item.name}</span>
                            <span
                              className={`font-mono font-semibold shrink-0 tabular-nums ${
                                item.currentStock === 0
                                  ? 'text-[#A15E5E]'
                                  : 'text-[#9E7D4A]'
                              }`}
                            >
                              {item.currentStock} left
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-[#49383D]">
                          Intelligence Recommendation
                        </span>
                        <span className="font-mono font-semibold text-[#567062]">
                          {previewMetrics.topRec
                            ? `Order ${previewMetrics.topRec.recommendedOrderQty}`
                            : 'Optimal'}
                        </span>
                      </div>
                      <p className="text-xs text-[#81777A] line-clamp-2">
                        {previewMetrics.topRec
                          ? `${previewMetrics.topRec.productName}: ${previewMetrics.topRec.reason}`
                          : 'Inventory levels cover current lead-time demand.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Problem & Solution Editorial Section */}
      <section id="product" className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 rounded-xl overflow-hidden border border-[#E8DFE1] bg-white">
            {!imgError ? (
              <img
                src="/src/assets/images/retail_inventory_ops_1795612336970.jpg"
                alt="Organized specialty retail stockroom with neatly stocked shelves"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full min-h-[340px] object-cover"
              />
            ) : (
              <div className="w-full h-full min-h-[340px] bg-[#FBF8F7] flex flex-col items-center justify-center p-8 text-center">
                <BarChart3 className="w-10 h-10 text-[#805F69] mb-3" />
                <p className="text-sm font-medium text-[#3F3437]">
                  Retail Inventory Operations
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-6 bg-white border border-[#E8DFE1] rounded-xl p-8 flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <div className="text-xs font-semibold text-[#805F69]">
                The Operational Challenge
              </div>
              <h2 className="font-display text-2xl lg:text-3xl font-bold text-[#49383D] tracking-tight">
                Replace guesswork and static reorder rules with predictive clarity.
              </h2>
              <p className="text-[#81777A] leading-relaxed text-[15px]">
                Independent retailers, pharmacies, and distributors lose margin to both ends of the
                shelf: sudden stockouts on fast-moving items and working capital trapped in slow
                merchandise. SmartStock models every SKU’s velocity so purchasing stays ahead of
                demand.
              </p>
            </div>

            <div className="divide-y divide-[#E8DFE1] border-t border-[#E8DFE1] pt-2 text-sm">
              <div className="py-3 flex items-start justify-between gap-4">
                <span className="font-semibold text-[#49383D]">Legacy Spreadsheets</span>
                <span className="text-[#81777A] text-right max-w-xs">
                  Backward-looking counts that miss weekend surges and seasonal shifts.
                </span>
              </div>
              <div className="py-3 flex items-start justify-between gap-4">
                <span className="font-semibold text-[#567062]">SmartStock Intelligence</span>
                <span className="text-[#3F3437] text-right max-w-xs">
                  Backtested SKU forecasts paired with transparent safety-stock purchasing plans.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Capability Showcase */}
      <section id="capabilities" className="bg-white border-y border-[#E8DFE1] py-20">
        <div className="max-w-7xl mx-auto px-6 space-y-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl space-y-2">
              <div className="text-xs font-semibold text-[#805F69]">Core Capabilities</div>
              <h2 className="font-display text-3xl font-bold text-[#49383D] tracking-tight">
                Precision analytics across every purchasing cycle
              </h2>
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg">
              {(
                [
                  { id: 'forecasting', label: 'Forecasting', icon: TrendingUp },
                  { id: 'optimisation', label: 'Optimisation', icon: Layers },
                  { id: 'scenario', label: 'Scenario Lab', icon: Compass },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveCapability(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeCapability === tab.id
                        ? 'bg-[#E9DDE0] text-[#49383D] font-semibold'
                        : 'text-[#81777A] hover:text-[#49383D]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-[#F7F3F1] border border-[#E8DFE1] rounded-xl p-8 grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="text-xs font-mono font-semibold text-[#805F69]">
                {capabilityData.eyebrow}
              </div>
              <h3 className="font-display text-2xl font-bold text-[#49383D] tracking-tight">
                {capabilityData.title}
              </h3>
              <p className="text-sm text-[#81777A] leading-relaxed">{capabilityData.body}</p>
              <ul className="space-y-2.5 pt-2">
                {capabilityData.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm text-[#3F3437]">
                    <CheckCircle2 className="w-4 h-4 text-[#779384] mt-0.5 shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-5 bg-white border border-[#E8DFE1] rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-[#E8DFE1] pb-3">
                <span className="text-xs text-[#81777A]">{capabilityData.metricLabel}</span>
                <span className="text-xs font-mono font-semibold text-[#805F69]">
                  {capabilityData.metricValue}
                </span>
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#81777A]">Catalog Scope</span>
                  <span className="font-mono font-semibold text-[#49383D]">
                    SKU · Category · Portfolio
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#81777A]">Decision Output</span>
                  <span className="font-mono font-semibold text-[#49383D]">
                    Supplier Purchase Orders
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#81777A]">Model Transparency</span>
                  <span className="font-mono font-semibold text-[#49383D]">
                    Full Formula Breakdown
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onExploreDemo}
                className="w-full py-2.5 text-xs font-semibold text-white bg-[#805F69] hover:bg-[#6B4E57] rounded-lg transition-colors cursor-pointer"
              >
                Open in Live Workspace
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* How SmartStock Works */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-20 space-y-8">
        <div className="max-w-2xl space-y-2">
          <div className="text-xs font-semibold text-[#805F69]">How SmartStock Works</div>
          <h2 className="font-display text-3xl font-bold text-[#49383D] tracking-tight">
            Three steps from raw sales counts to verified replenishment
          </h2>
        </div>

        <div className="bg-white border border-[#E8DFE1] rounded-xl divide-y md:divide-y-0 md:divide-x divide-[#E8DFE1] grid md:grid-cols-3">
          {[
            {
              step: '01. Connect or import inventory',
              body: 'Select your business category, paste or upload CSV product logs, or launch with realistic 90-day retail data.',
            },
            {
              step: '02. Calibrate demand models',
              body: 'SmartStock backtests smoothing and regression algorithms on historical sales and scores forecast error.',
            },
            {
              step: '03. Execute purchase plans',
              body: 'Review prioritized stockout alerts, inspect reorder formulas, and submit supplier purchase orders in one click.',
            },
          ].map((item) => (
            <div key={item.step} className="p-7 space-y-2.5">
              <h3 className="font-display text-base font-bold text-[#49383D]">
                {item.step}
              </h3>
              <p className="text-sm text-[#81777A] leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Business Benefits */}
      <section id="benefits" className="bg-[#49383D] text-white py-20">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5 space-y-4">
            <div className="text-xs font-semibold text-[#B99AA0]">Business Impact</div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-white">
              Built for operators who watch both shelf availability and cash flow.
            </h2>
            <p className="text-[#E9DDE0]/85 leading-relaxed text-[15px]">
              Predict Smarter. Stock Better. Grow Faster. Every recommendation balances service
              levels against working capital discipline.
            </p>
          </div>

          <div className="lg:col-span-7 grid sm:grid-cols-2 gap-4">
            {[
              {
                title: 'Prevent costly stockouts',
                detail: 'Lead-time aware depletion tracking highlights risk before shelves run empty.',
              },
              {
                title: 'Free trapped working capital',
                detail: 'Surface slow-moving and overstocked SKUs tying up liquidity.',
              },
              {
                title: 'Explainable AI decisions',
                detail: 'Inspect every safety stock and reorder quantity calculation line by line.',
              },
              {
                title: 'End-to-end procurement',
                detail: 'Stage purchase plans, track incoming shipments, and auto-update stock on check-in.',
              },
            ].map((b) => (
              <div
                key={b.title}
                className="bg-[#3E2F34] border border-white/10 rounded-xl p-5 space-y-2"
              >
                <ShieldCheck className="w-4 h-4 text-[#B99AA0]" />
                <h3 className="font-display text-sm font-semibold text-white">{b.title}</h3>
                <p className="text-xs text-[#E9DDE0]/80 leading-relaxed">{b.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="bg-white border-b border-[#E8DFE1] py-16">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-5">
          <h2 className="font-display text-3xl font-bold text-[#49383D] tracking-tight">
            Ready to bring predictive clarity to your inventory?
          </h2>
          <p className="text-[#81777A] max-w-xl mx-auto text-[15px]">
            Explore the live multi-business demonstration or configure a tailored inventory
            environment for your store.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenAuth('onboard')}
              className="px-6 py-2.5 text-sm font-medium text-white bg-[#805F69] hover:bg-[#6B4E57] rounded-lg transition-colors cursor-pointer"
            >
              Explore SmartStock
            </button>
            <button
              type="button"
              onClick={onExploreDemo}
              className="px-6 py-2.5 text-sm font-medium text-[#805F69] bg-white hover:bg-[#FBF8F7] hover:text-[#49383D] border border-[#805F69]/50 rounded-lg transition-colors cursor-pointer"
            >
              View Live Demo
            </button>
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="bg-[#F7F3F1] py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#81777A]">
          <BrandLogo size="sm" />
          <div className="flex items-center gap-6">
            <a href="#product" className="hover:text-[#49383D]">
              Product
            </a>
            <a href="#capabilities" className="hover:text-[#49383D]">
              Capabilities
            </a>
            <a href="#how-it-works" className="hover:text-[#49383D]">
              How It Works
            </a>
            <a href="#benefits" className="hover:text-[#49383D]">
              Benefits
            </a>
          </div>
          <span>© 2026 SmartStock · Predict Smarter. Stock Better. Grow Faster.</span>
        </div>
      </footer>
    </div>
  );
};
