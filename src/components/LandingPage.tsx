import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Compass,
  FileSpreadsheet,
  Layers,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { ForecastLineChart } from './Charts';
import { buildDailySeries, runDemandForecast } from '../lib/forecasting';
import type { Product, SalesRecord } from '../types/inventory';

interface LandingPageProps {
  demoProducts: Product[];
  demoSales: SalesRecord[];
  onExploreDemo: () => void;
  onOpenAuth: (initialTab: 'signin' | 'onboard') => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  demoProducts,
  demoSales,
  onExploreDemo,
  onOpenAuth,
}) => {
  const [previewProductId, setPreviewProductId] = useState<string>(
    demoProducts[0]?.id || ''
  );
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

  const featureItems = [
    {
      num: '01',
      title: 'AI Demand Forecasting',
      desc: 'Selects between Holt-Winters seasonal smoothing, weighted moving averages, and regression via rolling holdout validation.',
      icon: TrendingUp,
      span: 'lg:col-span-2',
    },
    {
      num: '02',
      title: 'Intelligent Restocking',
      desc: 'Computes transparent reorder points using supplier lead times, demand volatility, and incoming purchase orders.',
      icon: Layers,
      span: 'lg:col-span-1',
    },
    {
      num: '03',
      title: 'Inventory Health Monitoring',
      desc: 'Flags stockouts, low-cover SKUs, slow-moving stock, and excess working capital tied up on shelves.',
      icon: ShieldAlert,
      span: 'lg:col-span-1',
    },
    {
      num: '04',
      title: 'Seasonal Trend Analysis',
      desc: 'Automatically models day-of-week buying surges and seasonal uplift across holidays, winter peaks, and promotions.',
      icon: CalendarRange,
      span: 'lg:col-span-1',
    },
    {
      num: '05',
      title: 'Scenario Simulation',
      desc: 'Stress-test your inventory against demand spikes, promotional campaigns, and supplier delivery delays before committing cash.',
      icon: Compass,
      span: 'lg:col-span-1',
    },
    {
      num: '06',
      title: 'Business Intelligence Reports',
      desc: 'Export clean purchase plans, valuation summaries, and SKU velocity ledgers ready for supplier orders and accounting.',
      icon: FileSpreadsheet,
      span: 'lg:col-span-2',
    },
  ];

  return (
    <div className="min-h-screen bg-[#F6F8FB] text-[#202B3C]">
      {/* Top Navigation Bar - Strict 3-Zone Contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="whitespace-nowrap shrink-0">
            <BrandLogo size="md" />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#738096]">
            <a
              href="#product"
              className="hover:text-[#101B2D] transition-colors whitespace-nowrap shrink-0"
            >
              Product
            </a>
            <a
              href="#features"
              className="hover:text-[#101B2D] transition-colors whitespace-nowrap shrink-0"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="hover:text-[#101B2D] transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#about"
              className="hover:text-[#101B2D] transition-colors whitespace-nowrap shrink-0"
            >
              About
            </a>
            <button
              type="button"
              onClick={() => onOpenAuth('signin')}
              className="hover:text-[#101B2D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('onboard')}
              className="px-4 py-2 text-sm font-medium text-white bg-[#101B2D] hover:bg-[#263B55] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="top" className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-16 lg:py-20 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-5 space-y-6">
            <p className="text-xs font-medium tracking-wide text-[#16A36A]">
              Predict Smarter · Stock Better · Grow Faster
            </p>
            <h1
              className="font-display font-bold text-[#101B2D] tracking-tight leading-[1.08]"
              style={{
                fontSize: 'clamp(2.25rem, 3.8vw, 3.35rem)',
                textWrap: 'balance',
              }}
            >
              Inventory Decisions, Powered by Intelligence.
            </h1>
            <p className="text-base lg:text-[17px] leading-relaxed text-[#738096] max-w-xl">
              Predict demand, prevent stockouts and optimise purchasing with AI-powered inventory
              intelligence designed for growing businesses.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onOpenAuth('onboard')}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#101B2D] hover:bg-[#263B55] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onExploreDemo}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[#101B2D] bg-[#F6F8FB] hover:bg-slate-200/70 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Explore Demo
              </button>
            </div>

            <div className="pt-4 border-t border-slate-100 grid grid-cols-3 gap-4 text-xs">
              <div>
                <div className="font-mono font-semibold text-base text-[#101B2D] tabular-nums">
                  7–90d
                </div>
                <div className="text-[#738096]">Forecast horizons</div>
              </div>
              <div>
                <div className="font-mono font-semibold text-base text-[#16A36A] tabular-nums">
                  MAE / RMSE
                </div>
                <div className="text-[#738096]">Backtested models</div>
              </div>
              <div>
                <div className="font-mono font-semibold text-base text-[#101B2D] tabular-nums">
                  1-Click
                </div>
                <div className="text-[#738096]">Purchase orders</div>
              </div>
            </div>
          </div>

          {/* Interactive Live Analytics Preview */}
          <div className="lg:col-span-7">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 bg-[#F6F8FB] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-[#738096]">
                    Live Preview · Harborview Specialty Market
                  </div>
                  <div className="text-sm font-semibold text-[#101B2D]">
                    Demand Forecast & Replenishment Window
                  </div>
                </div>
                <select
                  aria-label="Preview product selector"
                  value={selectedProduct?.id || ''}
                  onChange={(e) => setPreviewProductId(e.target.value)}
                  className="text-xs font-medium bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-[#202B3C] focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
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
                  <div className="grid grid-cols-3 gap-4 pb-3 border-b border-slate-100">
                    <div>
                      <div className="text-xs text-[#738096]">On-Hand Stock</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-[#101B2D]">
                        {selectedProduct.currentStock} units
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#738096]">21-Day Forecast</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-[#16A36A]">
                        {previewForecast.predictedTotal} units
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#738096]">Est. Depletion</div>
                      <div className="text-lg font-bold font-mono tabular-nums text-[#202B3C]">
                        {previewForecast.expectedDepletionDays !== null
                          ? `${previewForecast.expectedDepletionDays} days`
                          : 'Covered'}
                      </div>
                    </div>
                  </div>

                  <ForecastLineChart
                    points={previewForecast.points}
                    height={230}
                    compact
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs text-[#738096]">
                    <div className="flex items-center gap-4">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-0.5 bg-[#101B2D]" />
                        Actual Sales
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-0.5 border-t-2 border-dashed border-[#16A36A]" />
                        Predicted Demand
                      </span>
                    </div>
                    <span className="font-mono tabular-nums">
                      Model: {previewForecast.modelLabel.split(' ')[0]} · RMSE{' '}
                      {previewForecast.rmse}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Problem & Solution Section */}
      <section id="product" className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 rounded-xl overflow-hidden border border-slate-200 bg-white">
            {!imgError ? (
              <img
                src="/src/assets/images/retail_inventory_ops_1795612336970.jpg"
                alt="Organized specialty retail stockroom with neatly stocked shelves"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full min-h-[320px] object-cover"
              />
            ) : (
              <div className="w-full h-full min-h-[320px] bg-slate-100 flex flex-col items-center justify-center p-8 text-center">
                <BarChart3 className="w-10 h-10 text-[#263B55] mb-3" />
                <p className="text-sm font-medium text-[#202B3C]">
                  Retail Inventory Operations
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-6 flex flex-col justify-between bg-white border border-slate-200 rounded-xl p-8 space-y-6">
            <div className="space-y-3">
              <div className="text-xs font-medium text-[#4C7FE8]">
                Why static spreadsheets fall short
              </div>
              <h2 className="font-display text-2xl lg:text-3xl font-bold text-[#101B2D] tracking-tight">
                Stop reacting to empty shelves and overstocked capital.
              </h2>
              <p className="text-[#738096] leading-relaxed text-[15px]">
                Traditional inventory tools only tell you what happened yesterday. When demand shifts
                across weekends, seasons, or supplier delays, manual reorder rules leave store
                owners choosing between lost sales or cash locked in slow-moving stock.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
              <div className="space-y-1.5">
                <div className="text-sm font-semibold text-[#101B2D]">
                  Without forecasting
                </div>
                <p className="text-sm text-[#738096]">
                  Fixed reorder minimums miss rising trends, causing sudden stockouts on top-margin
                  items while slow SKUs accumulate.
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="text-sm font-semibold text-[#16A36A]">
                  With SmartStock
                </div>
                <p className="text-sm text-[#738096]">
                  Every SKU combines historical velocity, supplier lead time, and safety buffers
                  into a transparent purchase plan.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Section (6 Cards) */}
      <section id="features" className="bg-white border-y border-slate-200 py-20">
        <div className="max-w-7xl mx-auto px-6 space-y-10">
          <div className="max-w-2xl space-y-2">
            <div className="text-xs font-medium text-[#16A36A]">Platform Capabilities</div>
            <h2 className="font-display text-3xl font-bold text-[#101B2D] tracking-tight">
              Built for practical inventory decisions
            </h2>
            <p className="text-[#738096] text-[15px]">
              Six integrated intelligence modules designed for retail stores, pharmacies,
              supermarkets, and distributors.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {featureItems.map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.num}
                  className={`${feat.span} bg-[#F6F8FB] border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[#738096]">{feat.num}.</span>
                    <Icon className="w-5 h-5 text-[#263B55]" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-display text-lg font-semibold text-[#101B2D]">
                      {feat.title}
                    </h3>
                    <p className="text-sm text-[#738096] leading-relaxed">{feat.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-20 space-y-10">
        <div className="max-w-2xl space-y-2">
          <div className="text-xs font-medium text-[#4C7FE8]">Workflow</div>
          <h2 className="font-display text-3xl font-bold text-[#101B2D] tracking-tight">
            From raw sales history to verified purchase orders
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              step: '01. Import sales and inventory data',
              body: 'Select your business category, upload CSV stock logs, or connect daily sales counts in under two minutes.',
            },
            {
              step: '02. Analyse and predict demand',
              body: 'SmartStock backtests smoothing and regression models on your SKU history and scores forecast error with MAE and RMSE.',
            },
            {
              step: '03. Receive purchasing recommendations',
              body: 'Review explainable reorder quantities, safety stock formulas, and submit supplier purchase orders in one click.',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
            >
              <h3 className="font-display text-base font-semibold text-[#101B2D]">
                {item.step}
              </h3>
              <p className="text-sm text-[#738096] leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits Section */}
      <section id="about" className="bg-[#101B2D] text-white py-20">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 space-y-4">
            <div className="text-xs font-medium text-[#16A36A]">Measurable Outcomes</div>
            <h2 className="font-display text-3xl font-bold tracking-tight">
              Enterprise-grade supply intelligence without enterprise complexity.
            </h2>
            <p className="text-slate-300 leading-relaxed text-[15px]">
              Designed specifically for independent operators and regional chains who need clear
              explanations rather than opaque black-box charts.
            </p>
          </div>

          <div className="lg:col-span-6 grid sm:grid-cols-2 gap-4">
            {[
              {
                title: 'Fewer unexpected stock shortages',
                detail: 'Lead-time aware alerts warn before shelf stock drops below delivery windows.',
              },
              {
                title: 'Reduced excess inventory',
                detail: 'Spot slow-moving SKUs and overstocked capital before margins erode.',
              },
              {
                title: 'Better purchasing decisions',
                detail: 'Exact recommended order quantities factor in incoming POs and safety stock.',
              },
              {
                title: 'Improved visibility into future demand',
                detail: '7, 30, 60, and 90-day curves with transparent uncertainty intervals.',
              },
            ].map((b) => (
              <div
                key={b.title}
                className="bg-[#263B55]/50 border border-white/10 rounded-xl p-5 space-y-2"
              >
                <CheckCircle2 className="w-4 h-4 text-[#16A36A]" />
                <h3 className="font-display text-sm font-semibold text-white">{b.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{b.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA & Quiet Footer */}
      <section className="bg-white border-b border-slate-200 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-5">
          <h2 className="font-display text-3xl font-bold text-[#101B2D] tracking-tight">
            Ready to forecast your next 90 days?
          </h2>
          <p className="text-[#738096] max-w-xl mx-auto text-[15px]">
            Launch the live demonstration environment with pre-loaded retail datasets or configure
            your own store profile in seconds.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenAuth('onboard')}
              className="px-6 py-2.5 text-sm font-medium text-white bg-[#101B2D] hover:bg-[#263B55] rounded-lg transition-colors cursor-pointer"
            >
              Configure Your Business
            </button>
            <button
              type="button"
              onClick={onExploreDemo}
              className="px-6 py-2.5 text-sm font-medium text-[#101B2D] bg-[#F6F8FB] hover:bg-slate-200/70 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Launch Interactive Demo
            </button>
          </div>
        </div>
      </section>

      <footer className="bg-[#F6F8FB] py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#738096]">
          <BrandLogo size="sm" />
          <div className="flex items-center gap-6">
            <a href="#product" className="hover:text-[#101B2D]">
              Product
            </a>
            <a href="#features" className="hover:text-[#101B2D]">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-[#101B2D]">
              How It Works
            </a>
          </div>
          <span>© 2026 SmartStock Inventory Intelligence</span>
        </div>
      </footer>
    </div>
  );
};
