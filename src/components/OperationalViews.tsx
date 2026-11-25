import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ShoppingCart,
  Truck,
  User,
} from 'lucide-react';
import { ForecastLineChart, TopProductsBarChart } from './Charts';
import {
  Button,
  EmptyStateCard,
  SectionHeader,
  StatusLabel,
  SurfaceCard,
} from './ui/DesignPrimitives';
import { buildDailySeries, getReferenceDate, runDemandForecast } from '../lib/forecasting';
import { formatINRCompact } from '../lib/currency';
import type {
  ActivityLog,
  AppView,
  BusinessProfile,
  Product,
  PurchaseOrder,
  SalesRecord,
  SmartRecommendation,
} from '../types/inventory';

/* -------------------------------------------------------------------------- */
/* 1. SALES ANALYTICS VIEW                                                    */
/* -------------------------------------------------------------------------- */
export const SalesAnalyticsView: React.FC<{
  business: BusinessProfile;
  products: Product[];
  sales: SalesRecord[];
  onNavigate: (view: AppView) => void;
}> = ({ business, products, sales, onNavigate }) => {
  const [rangeDays, setRangeDays] = useState<30 | 60 | 90>(30);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))),
    [products]
  );

  const scopedProducts = useMemo(
    () =>
      categoryFilter === 'all'
        ? products
        : products.filter((p) => p.category === categoryFilter),
    [products, categoryFilter]
  );

  const refDate = useMemo(() => getReferenceDate(sales), [sales]);

  const analytics = useMemo(() => {
    const cutoff = new Date(`${refDate}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - rangeDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const idSet = new Set(scopedProducts.map((p) => p.id));
    let totalUnits = 0;
    let totalRevenue = 0;
    let totalCogs = 0;
    const byProd = new Map<string, { units: number; revenue: number }>();
    const byCat = new Map<string, { units: number; revenue: number }>();

    const costLookup = new Map(scopedProducts.map((p) => [p.id, p.unitCost]));
    const catLookup = new Map(scopedProducts.map((p) => [p.id, p.category]));

    for (const s of sales) {
      if (!idSet.has(s.productId) || s.date < cutoffStr) continue;
      totalUnits += s.quantitySold;
      totalRevenue += s.revenue;
      totalCogs += s.quantitySold * (costLookup.get(s.productId) || 0);

      const pPrev = byProd.get(s.productId) || { units: 0, revenue: 0 };
      pPrev.units += s.quantitySold;
      pPrev.revenue += s.revenue;
      byProd.set(s.productId, pPrev);

      const cat = catLookup.get(s.productId) || 'Other';
      const cPrev = byCat.get(cat) || { units: 0, revenue: 0 };
      cPrev.units += s.quantitySold;
      cPrev.revenue += s.revenue;
      byCat.set(cat, cPrev);
    }

    const avgInvCost = scopedProducts.reduce(
      (sum, p) => sum + p.currentStock * p.unitCost,
      0
    );
    const annualizedCogs = (totalCogs / rangeDays) * 365;
    const turnover = avgInvCost > 0 ? annualizedCogs / avgInvCost : 0;
    const grossMarginPct =
      totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0;

    const topProducts = scopedProducts
      .map((p) => ({
        id: p.id,
        name: p.name,
        unitsSold: byProd.get(p.id)?.units || 0,
        revenue: byProd.get(p.id)?.revenue || 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    const categoryRows = Array.from(byCat.entries())
      .map(([name, val]) => ({ name, ...val }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      totalUnits,
      totalRevenue,
      grossMarginPct,
      turnover,
      topProducts,
      categoryRows,
    };
  }, [scopedProducts, sales, refDate, rangeDays]);

  const trendForecast = useMemo(() => {
    const series = buildDailySeries(
      sales,
      scopedProducts.map((p) => p.id),
      rangeDays
    );
    return runDemandForecast({
      series,
      horizonDays: 14,
      currentStock: scopedProducts.reduce((s, p) => s + p.currentStock, 0),
      modelType: 'auto',
      subjectLabel: business.name,
    });
  }, [sales, scopedProducts, rangeDays, business.name]);

  if (products.length === 0 || sales.length === 0) {
    return (
      <EmptyStateCard
        icon={<BarChart3 className="w-5 h-5" />}
        title="No sales history recorded yet"
        description="Record daily sales in Inventory or import historical records to unlock turnover and category performance analytics."
        action={<Button onClick={() => onNavigate('inventory')}>Open Inventory</Button>}
      />
    );
  }

  const maxCatRev = Math.max(1, ...analytics.categoryRows.map((c) => c.revenue));

  return (
    <div className="space-y-6 animate-view-enter">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#49383D] tracking-tight">
            Sales Analytics
          </h2>
          <p className="text-sm text-[#81777A] mt-0.5">
            Revenue contribution, gross margin, inventory turnover, and category performance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 px-3 text-xs font-medium bg-white border border-[#E8DFE1] rounded-lg text-[#3F3437] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 p-1 bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg">
            {([30, 60, 90] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setRangeDays(d)}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md cursor-pointer ${
                  rangeDays === d
                    ? 'bg-[#E9DDE0] text-[#49383D] font-semibold'
                    : 'text-[#81777A] hover:text-[#49383D]'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SurfaceCard className="p-4 space-y-1">
          <div className="text-xs text-[#81777A]">Period Revenue ({rangeDays}d)</div>
          <div className="font-mono font-bold text-2xl text-[#49383D] tabular-nums">
            {formatINRCompact(analytics.totalRevenue)}
          </div>
          <div className="text-xs text-[#81777A] font-mono tabular-nums">
            {analytics.totalUnits.toLocaleString()} units sold
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4 space-y-1">
          <div className="text-xs text-[#81777A]">Realized Gross Margin</div>
          <div className="font-mono font-bold text-2xl text-[#779384] tabular-nums">
            {analytics.grossMarginPct.toFixed(1)}%
          </div>
          <div className="text-xs text-[#81777A]">Based on SKU unit cost</div>
        </SurfaceCard>

        <SurfaceCard className="p-4 space-y-1">
          <div className="text-xs text-[#81777A]">Annualized Turnover</div>
          <div className="font-mono font-bold text-2xl text-[#49383D] tabular-nums">
            {analytics.turnover.toFixed(1)}×
          </div>
          <div className="text-xs text-[#81777A]">COGS / inventory cost</div>
        </SurfaceCard>

        <SurfaceCard className="p-4 space-y-1">
          <div className="text-xs text-[#81777A]">Active Categories</div>
          <div className="font-mono font-bold text-2xl text-[#49383D] tabular-nums">
            {analytics.categoryRows.length}
          </div>
          <div className="text-xs text-[#81777A]">Generating sales volume</div>
        </SurfaceCard>
      </div>

      <SurfaceCard className="p-6 space-y-4">
        <SectionHeader
          title={`Historical Sales Velocity (${rangeDays}d) + 14d Projection`}
          subtitle="Daily unit sales across selected scope"
        />
        <ForecastLineChart points={trendForecast.points} height={255} />
      </SurfaceCard>

      <div className="grid lg:grid-cols-12 gap-6">
        <SurfaceCard className="lg:col-span-6 p-6 space-y-4">
          <SectionHeader
            title="Category Performance"
            subtitle={`Trailing ${rangeDays}-day revenue share by category`}
          />
          <div className="space-y-4">
            {analytics.categoryRows.map((cat) => (
              <div key={cat.name} className="space-y-1.5">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-[#3F3437]">{cat.name}</span>
                  <span className="font-mono text-[#49383D] tabular-nums">
                    {cat.units.toLocaleString()} units ·{' '}
                    <strong>{formatINRCompact(cat.revenue)}</strong>
                  </span>
                </div>
                <div className="h-2 w-full bg-[#FBF8F7] rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-[#805F69] rounded-sm"
                    style={{ width: `${Math.max(5, (cat.revenue / maxCatRev) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard className="lg:col-span-6 p-6 space-y-4">
          <SectionHeader
            title="Product Contribution"
            subtitle={`Top revenue-generating SKUs over ${rangeDays} days`}
          />
          <TopProductsBarChart items={analytics.topProducts} />
        </SurfaceCard>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. SUPPLIERS DIRECTORY VIEW                                                */
/* -------------------------------------------------------------------------- */
export const SuppliersView: React.FC<{
  products: Product[];
  purchaseOrders: PurchaseOrder[];
  onNavigate: (view: AppView) => void;
}> = ({ products, purchaseOrders, onNavigate }) => {
  const suppliers = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        products: Product[];
        avgLeadTime: number;
        inventoryValue: number;
        lowStockCount: number;
        poCount: number;
        lastOrderDate: string | null;
      }
    >();

    for (const p of products) {
      const prev = map.get(p.supplierName) || {
        name: p.supplierName,
        products: [],
        avgLeadTime: 0,
        inventoryValue: 0,
        lowStockCount: 0,
        poCount: 0,
        lastOrderDate: null,
      };
      prev.products.push(p);
      prev.inventoryValue += p.currentStock * p.unitCost;
      if (p.currentStock <= p.minStockLevel) prev.lowStockCount += 1;
      map.set(p.supplierName, prev);
    }

    for (const sup of map.values()) {
      sup.avgLeadTime = Math.round(
        sup.products.reduce((a, b) => a + b.leadTimeDays, 0) /
          Math.max(1, sup.products.length)
      );
      const matchingPOs = purchaseOrders.filter((po) =>
        po.supplierName.includes(sup.name)
      );
      sup.poCount = matchingPOs.length;
      sup.lastOrderDate = matchingPOs[0]?.createdAt || null;
    }

    return Array.from(map.values()).sort(
      (a, b) => b.inventoryValue - a.inventoryValue
    );
  }, [products, purchaseOrders]);

  return (
    <div className="space-y-6 animate-view-enter">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#49383D] tracking-tight">
            Suppliers
          </h2>
          <p className="text-sm text-[#81777A] mt-0.5">
            Vendor directory, delivery lead times, supplied SKU coverage, and procurement activity.
          </p>
        </div>
        <Button size="sm" onClick={() => onNavigate('purchase-plan')}>
          <ShoppingCart className="w-3.5 h-3.5" />
          Open Purchase Orders
        </Button>
      </div>

      {suppliers.length === 0 ? (
        <EmptyStateCard
          icon={<Truck className="w-5 h-5" />}
          title="No suppliers configured"
          description="Add products with supplier names and lead times in Inventory to build your vendor directory."
          action={<Button onClick={() => onNavigate('inventory')}>Add Products</Button>}
        />
      ) : (
        <SurfaceCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FBF8F7] border-b border-[#E8DFE1] text-[11px] font-semibold text-[#81777A]">
                  <th className="py-3 px-5">Supplier</th>
                  <th className="py-3 px-4">Supplied Products</th>
                  <th className="py-3 px-4 text-right">Lead Time</th>
                  <th className="py-3 px-4 text-right">Cost Value On Hand</th>
                  <th className="py-3 px-4">Replenishment Status</th>
                  <th className="py-3 px-5">Recent PO Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFE1] text-sm">
                {suppliers.map((sup) => (
                  <tr key={sup.name} className="hover:bg-[#FBF8F7]/60">
                    <td className="py-4 px-5">
                      <div className="font-semibold text-[#49383D]">{sup.name}</div>
                      <div className="text-xs text-[#81777A] font-mono">
                        orders@{sup.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14)}.com
                      </div>
                    </td>
                    <td className="py-4 px-4 text-xs text-[#3F3437] max-w-[260px]">
                      <div className="font-mono font-semibold text-[#49383D]">
                        {sup.products.length} SKUs
                      </div>
                      <div className="text-[#81777A] truncate">
                        {sup.products.map((p) => p.name).join(', ')}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-xs text-[#49383D] tabular-nums">
                      {sup.avgLeadTime} days
                    </td>
                    <td className="py-4 px-4 text-right font-mono font-semibold text-xs text-[#49383D] tabular-nums">
                      {formatINRCompact(sup.inventoryValue)}
                    </td>
                    <td className="py-4 px-4">
                      <StatusLabel
                        tone={sup.lowStockCount > 0 ? 'warning' : 'healthy'}
                        label={
                          sup.lowStockCount > 0
                            ? `${sup.lowStockCount} SKU low`
                            : 'All covered'
                        }
                      />
                    </td>
                    <td className="py-4 px-5 text-xs font-mono text-[#81777A]">
                      {sup.poCount > 0
                        ? `${sup.poCount} PO(s) · Last ${sup.lastOrderDate}`
                        : 'No active POs'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. REPORTS VIEW                                                            */
/* -------------------------------------------------------------------------- */
export const ReportsView: React.FC<{
  business: BusinessProfile;
  products: Product[];
  sales: SalesRecord[];
  recommendations: SmartRecommendation[];
}> = ({ business, products, sales, recommendations }) => {
  const reportStats = useMemo(() => {
    const excessItems = products.filter((p) => p.currentStock > p.maxStockLevel);
    const excessCapital = excessItems.reduce(
      (s, p) => s + (p.currentStock - p.maxStockLevel) * p.unitCost,
      0
    );
    const stockoutItems = recommendations.filter((r) => r.type === 'stockout_risk');
    const totalValuation = products.reduce(
      (s, p) => s + p.currentStock * p.unitPrice,
      0
    );
    return { excessItems, excessCapital, stockoutItems, totalValuation };
  }, [products, recommendations]);

  const downloadCsv = (filename: string, lines: string[]) => {
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportValuationReport = () => {
    const header = 'SKU,Name,Category,Stock,UnitCost,UnitPrice,CostValue,RetailValue';
    const rows = products.map((p) =>
      [
        p.sku,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.category}"`,
        p.currentStock,
        p.unitCost,
        p.unitPrice,
        (p.currentStock * p.unitCost).toFixed(2),
        (p.currentStock * p.unitPrice).toFixed(2),
      ].join(',')
    );
    downloadCsv(`smartstock-valuation-report.csv`, [header, ...rows]);
  };

  const exportReplenishmentReport = () => {
    const header =
      'SKU,Product,Supplier,CurrentStock,Predicted30dDemand,ReorderPoint,RecommendedOrderQty,EstimatedCost,Urgency';
    const rows = recommendations.map((r) =>
      [
        r.sku,
        `"${r.productName.replace(/"/g, '""')}"`,
        `"${r.supplierName}"`,
        r.currentStock,
        r.predictedDemand30d,
        r.math.reorderPoint,
        r.recommendedOrderQty,
        (r.recommendedOrderQty * r.unitCost).toFixed(2),
        r.urgency,
      ].join(',')
    );
    downloadCsv(`smartstock-replenishment-report.csv`, [header, ...rows]);
  };

  const exportSalesLedger = () => {
    const prodNames = new Map(products.map((p) => [p.id, p.name]));
    const header = 'Date,Product,UnitsSold,UnitsReceived,Revenue';
    const rows = sales
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((s) =>
        [
          s.date,
          `"${(prodNames.get(s.productId) || s.productId).replace(/"/g, '""')}"`,
          s.quantitySold,
          s.quantityReceived,
          s.revenue.toFixed(2),
        ].join(',')
      );
    downloadCsv(`smartstock-sales-ledger.csv`, [header, ...rows]);
  };

  if (products.length === 0) {
    return (
      <EmptyStateCard
        icon={<FileSpreadsheet className="w-5 h-5" />}
        title="No report data available"
        description="Add products and sales transactions to generate exportable inventory valuation and stockout reports."
      />
    );
  }

  return (
    <div className="space-y-6 animate-view-enter">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#49383D] tracking-tight">
          Reports
        </h2>
        <p className="text-sm text-[#81777A] mt-0.5">
          Downloadable business intelligence summaries for {business.name}.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <SurfaceCard className="p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[#64788A]">Financial Valuation</div>
            <h3 className="font-display text-base font-bold text-[#49383D]">
              Inventory Asset & Margin Report
            </h3>
            <p className="text-xs text-[#81777A]">
              Full SKU cost basis, retail valuation ({formatINRCompact(reportStats.totalValuation)}), and margin summary.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={exportValuationReport}>
            <Download className="w-3.5 h-3.5" />
            Download Valuation CSV
          </Button>
        </SurfaceCard>

        <SurfaceCard className="p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[#805F69]">Purchasing Intelligence</div>
            <h3 className="font-display text-base font-bold text-[#49383D]">
              Replenishment & Stockout Brief
            </h3>
            <p className="text-xs text-[#81777A]">
              {reportStats.stockoutItems.length} stockout-risk SKUs with reorder points and supplier cost estimates.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={exportReplenishmentReport}>
            <Download className="w-3.5 h-3.5" />
            Download Replenishment CSV
          </Button>
        </SurfaceCard>

        <SurfaceCard className="p-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[#9E7D4A]">Audit Trail</div>
            <h3 className="font-display text-base font-bold text-[#49383D]">
              Historical Sales & Receipt Ledger
            </h3>
            <p className="text-xs text-[#81777A]">
              {sales.length.toLocaleString()} daily transaction rows across the last 90 days.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={exportSalesLedger}>
            <Download className="w-3.5 h-3.5" />
            Download Ledger CSV
          </Button>
        </SurfaceCard>
      </div>

      {/* Excess & Stockout Summary */}
      <div className="grid lg:grid-cols-2 gap-6">
        <SurfaceCard className="p-6 space-y-3">
          <SectionHeader
            title="Stockout Risk Exposure"
            subtitle="Items depleting inside supplier delivery lead times"
          />
          {reportStats.stockoutItems.length === 0 ? (
            <p className="text-xs text-[#779384]">No SKUs currently in critical stockout risk.</p>
          ) : (
            <div className="divide-y divide-[#E8DFE1] text-xs">
              {reportStats.stockoutItems.map((r) => (
                <div key={r.productId} className="py-2.5 flex justify-between gap-4">
                  <span className="font-medium text-[#49383D]">{r.productName}</span>
                  <span className="font-mono text-[#A15E5E] shrink-0">
                    {r.currentStock} left · Order {r.recommendedOrderQty}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-6 space-y-3">
          <SectionHeader
            title="Excess Inventory Valuation"
            subtitle={`${formatINRCompact(reportStats.excessCapital)} above max shelf targets`}
          />
          {reportStats.excessItems.length === 0 ? (
            <p className="text-xs text-[#779384]">No SKUs exceed maximum capacity limits.</p>
          ) : (
            <div className="divide-y divide-[#E8DFE1] text-xs">
              {reportStats.excessItems.map((p) => (
                <div key={p.id} className="py-2.5 flex justify-between gap-4">
                  <span className="font-medium text-[#49383D]">{p.name}</span>
                  <span className="font-mono text-[#64788A] shrink-0">
                    {p.currentStock} / {p.maxStockLevel} max
                  </span>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. NOTIFICATIONS CENTER VIEW                                               */
/* -------------------------------------------------------------------------- */
export const NotificationsView: React.FC<{
  recommendations: SmartRecommendation[];
  activities: ActivityLog[];
  onNavigate: (view: AppView, productId?: string) => void;
}> = ({ recommendations, activities, onNavigate }) => {
  const alerts = recommendations.filter(
    (r) => r.status === 'active' && (r.urgency === 'critical' || r.urgency === 'high')
  );

  return (
    <div className="space-y-6 animate-view-enter">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#49383D] tracking-tight">
          Notifications
        </h2>
        <p className="text-sm text-[#81777A] mt-0.5">
          Active stockout warnings, reorder alerts, and chronological workspace events.
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        <SurfaceCard className="lg:col-span-6 p-6 space-y-4">
          <SectionHeader
            title="Active Stock Alerts"
            subtitle={`${alerts.length} actionable alerts requiring review`}
          />
          {alerts.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#81777A]">
              <Bell className="w-5 h-5 mx-auto mb-2 text-[#779384]" />
              All active inventory alerts have been addressed.
            </div>
          ) : (
            <div className="divide-y divide-[#E8DFE1]">
              {alerts.map((a) => (
                <div key={a.productId} className="py-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#49383D] inline-flex items-center gap-2">
                      <AlertTriangle
                        className={`w-4 h-4 ${
                          a.urgency === 'critical' ? 'text-[#BC7777]' : 'text-[#C3A16D]'
                        }`}
                      />
                      {a.productName}
                    </span>
                    <StatusLabel
                      tone={a.urgency === 'critical' ? 'critical' : 'warning'}
                      label={a.urgency === 'critical' ? 'Critical' : 'Warning'}
                    />
                  </div>
                  <p className="text-xs text-[#81777A]">{a.reason}</p>
                  <button
                    type="button"
                    onClick={() => onNavigate('recommendations', a.productId)}
                    className="text-xs font-medium text-[#805F69] hover:text-[#49383D] hover:underline cursor-pointer"
                  >
                    Resolve in Smart Recommendations →
                  </button>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="lg:col-span-6 p-6 space-y-4">
          <SectionHeader
            title="System Event Feed"
            subtitle="Recorded inventory, sales, and purchase order events"
          />
          <div className="divide-y divide-[#E8DFE1]">
            {activities.slice(0, 12).map((act) => (
              <div key={act.id} className="py-3 flex items-start justify-between gap-4">
                <div className="flex items-start gap-2.5 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-[#805F69] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#49383D]">{act.title}</div>
                    <div className="text-xs text-[#81777A] truncate">{act.description}</div>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-[#81777A] shrink-0">
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

/* -------------------------------------------------------------------------- */
/* 5. PROFILE VIEW                                                            */
/* -------------------------------------------------------------------------- */
export const ProfileView: React.FC<{
  authUser: { name: string; email: string };
  business: BusinessProfile;
  businesses: BusinessProfile[];
  onSwitchBusiness: (id: string) => Promise<void>;
  onNavigate: (view: AppView) => void;
  onSignOut: () => void;
}> = ({ authUser, business, businesses, onSwitchBusiness, onNavigate, onSignOut }) => {
  const [imgErr, setImgErr] = useState(false);

  return (
    <div className="space-y-6 animate-view-enter max-w-4xl">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#49383D] tracking-tight">
          Profile
        </h2>
        <p className="text-sm text-[#81777A] mt-0.5">
          Account identity, active workspace access, and operational role.
        </p>
      </div>

      <SurfaceCard className="p-6 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          {!imgErr ? (
            <img
              src="/src/assets/images/avatar_owner_profile_1795612336964.jpg"
              alt={authUser.name}
              referrerPolicy="no-referrer"
              onError={() => setImgErr(true)}
              className="w-16 h-16 rounded-full object-cover border border-[#E8DFE1]"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#49383D] text-white flex items-center justify-center">
              <User className="w-6 h-6" />
            </div>
          )}
          <div>
            <h3 className="font-display text-lg font-bold text-[#49383D]">
              {authUser.name}
            </h3>
            <p className="text-xs text-[#81777A]">{authUser.email}</p>
            <p className="text-xs text-[#779384] font-medium mt-1">
              Operations Owner · {business.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="secondary" size="sm" onClick={() => onNavigate('settings')}>
            Edit Business Settings
          </Button>
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            Sign Out
          </Button>
        </div>
      </SurfaceCard>

      <SurfaceCard className="p-6 space-y-4">
        <SectionHeader
          title="Accessible Business Workspaces"
          subtitle="Switch between configured retail, pharmacy, and e-commerce environments"
        />
        <div className="divide-y divide-[#E8DFE1]">
          {businesses.map((b) => (
            <div key={b.id} className="py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Building2 className="w-4 h-4 text-[#805F69]" />
                <div>
                  <div className="text-sm font-semibold text-[#49383D]">{b.name}</div>
                  <div className="text-xs text-[#81777A]">{b.category}</div>
                </div>
              </div>
              {b.id === business.id ? (
                <StatusLabel tone="healthy" label="Active Workspace" />
              ) : (
                <Button variant="secondary" size="sm" onClick={() => onSwitchBusiness(b.id)}>
                  Switch
                </Button>
              )}
            </div>
          ))}
        </div>
      </SurfaceCard>
    </div>
  );
};
