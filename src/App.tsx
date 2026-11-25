import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Boxes,
  Compass,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  Search,
  Settings,
  ShoppingCart,
  TrendingUp,
  X,
} from 'lucide-react';
import { BrandLogo } from './components/BrandLogo';
import { DashboardView } from './components/DashboardView';
import { ForecastingView } from './components/ForecastingView';
import { InventoryView } from './components/InventoryView';
import { LandingPage } from './components/LandingPage';
import { OnboardingModal } from './components/OnboardingModal';
import { type DraftOrderLine, PurchasePlanView } from './components/PurchasePlanView';
import { RecommendationsView } from './components/RecommendationsView';
import { SettingsView } from './components/SettingsView';
import { SimulatorView } from './components/SimulatorView';
import { createInitialSeedState } from './data/seedData';
import { generateRecommendations } from './lib/forecasting';
import type {
  AppView,
  BusinessCategory,
  BusinessProfile,
  Product,
  RecommendationStatus,
  SmartRecommendation,
  SmartStockState,
} from './types/inventory';

export default function App() {
  const [state, setState] = useState<SmartStockState>(() => createInitialSeedState());
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'landing' | 'workspace'>('landing');
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [focusedProductId, setFocusedProductId] = useState<string | undefined>(undefined);
  const [authModal, setAuthModal] = useState<'signin' | 'onboard' | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [globalSearch, setGlobalSearch] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [draftLinesByBiz, setDraftLinesByBiz] = useState<Record<string, DraftOrderLine[]>>({});
  const [banner, setBanner] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const notify = useCallback((type: 'error' | 'success', message: string) => {
    setBanner({ type, message });
    setTimeout(() => {
      setBanner((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = (await res.json()) as SmartStockState;
        setState(data);
      }
    } catch (err) {
      console.error('Failed to load server state:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const activeBusiness = useMemo(
    () =>
      state.businesses.find((b) => b.id === state.activeBusinessId) ||
      state.businesses[0],
    [state.businesses, state.activeBusinessId]
  );

  const activeProducts = useMemo(
    () => state.products.filter((p) => p.businessId === activeBusiness.id),
    [state.products, activeBusiness.id]
  );

  const activeSales = useMemo(
    () => state.sales.filter((s) => s.businessId === activeBusiness.id),
    [state.sales, activeBusiness.id]
  );

  const activePOs = useMemo(
    () => state.purchaseOrders.filter((po) => po.businessId === activeBusiness.id),
    [state.purchaseOrders, activeBusiness.id]
  );

  const activeActivities = useMemo(
    () => state.activities.filter((a) => a.businessId === activeBusiness.id),
    [state.activities, activeBusiness.id]
  );

  const recommendations = useMemo(
    () =>
      generateRecommendations({
        business: activeBusiness,
        products: activeProducts,
        sales: activeSales,
        statuses: state.recommendationStatuses,
      }),
    [activeBusiness, activeProducts, activeSales, state.recommendationStatuses]
  );

  const urgentAlerts = useMemo(
    () =>
      recommendations.filter(
        (r) =>
          r.status === 'active' &&
          (r.urgency === 'critical' || r.urgency === 'high')
      ),
    [recommendations]
  );

  const currentDraftLines = draftLinesByBiz[activeBusiness.id] || [];

  const handleNavigate = (view: AppView, productId?: string) => {
    setActiveView(view);
    setFocusedProductId(productId);
    setMobileMenuOpen(false);
    setShowNotifications(false);
    setGlobalSearch('');
  };

  const handleSwitchBusiness = async (businessId: string) => {
    setState((prev) => ({ ...prev, activeBusinessId: businessId }));
    setFocusedProductId(undefined);
    await fetch('/api/businesses/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId }),
    });
  };

  const handleCreateBusiness = async (payload: {
    name: string;
    category: BusinessCategory;
    ownerName: string;
    ownerEmail: string;
    defaultLeadTimeDays: number;
    safetyStockFactor: number;
    includeStarterProducts: boolean;
  }) => {
    const res = await fetch('/api/businesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create business');
    setState(data.state);
    setAuthModal(null);
    setMode('workspace');
    setActiveView('dashboard');
  };

  const assertOk = async (res: Response, fallbackMsg: string) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = (err as { error?: string }).error || fallbackMsg;
      notify('error', msg);
      throw new Error(msg);
    }
  };

  const handleUpdateBusiness = async (id: string, updates: Partial<BusinessProfile>) => {
    const res = await fetch(`/api/businesses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    await assertOk(res, 'Failed to update business settings.');
    await fetchState();
    notify('success', 'Business configuration saved.');
  };

  const handleAddProduct = async (product: Partial<Product>) => {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...product, businessId: activeBusiness.id }),
    });
    await assertOk(res, 'Failed to add product.');
    await fetchState();
    notify('success', `Added "${product.name}" to catalog.`);
  };

  const handleUpdateProduct = async (id: string, updates: Partial<Product>) => {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    await assertOk(res, 'Failed to update product.');
    await fetchState();
    notify('success', 'Product updated.');
  };

  const handleDeleteProduct = async (id: string) => {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    await assertOk(res, 'Failed to delete product.');
    await fetchState();
    notify('success', 'Product removed from catalog.');
  };

  const handleRecordTransaction = async (payload: {
    productId: string;
    quantitySold: number;
    quantityReceived: number;
  }) => {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await assertOk(res, 'Failed to record stock transaction.');
    await fetchState();
    notify('success', 'Inventory and sales ledger updated.');
  };

  const handleImportProducts = async (items: Array<Partial<Product>>) => {
    const res = await fetch('/api/products/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId: activeBusiness.id, items }),
    });
    await assertOk(res, 'Failed to import products.');
    await fetchState();
    notify('success', `Imported ${items.length} products.`);
  };

  const handleUpdateRecStatus = async (
    productId: string,
    status: RecommendationStatus
  ) => {
    setState((prev) => ({
      ...prev,
      recommendationStatuses: {
        ...prev.recommendationStatuses,
        [productId]: status,
      },
    }));
    const res = await fetch(`/api/recommendations/${productId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await assertOk(res, 'Failed to update recommendation status.');
  };

  const handleAddToPurchasePlan = (rec: SmartRecommendation) => {
    if (rec.recommendedOrderQty <= 0) return;
    setDraftLinesByBiz((prev) => {
      const existing = prev[activeBusiness.id] || [];
      if (existing.some((l) => l.productId === rec.productId)) return prev;
      return {
        ...prev,
        [activeBusiness.id]: [
          ...existing,
          {
            productId: rec.productId,
            sku: rec.sku,
            productName: rec.productName,
            supplierName: rec.supplierName,
            unitCost: rec.unitCost,
            quantity: rec.recommendedOrderQty,
          },
        ],
      };
    });
  };

  const handleAutoFillUrgent = () => {
    const toAdd = recommendations.filter(
      (r) =>
        r.recommendedOrderQty > 0 &&
        r.status !== 'in_plan' &&
        !currentDraftLines.some((d) => d.productId === r.productId)
    );
    if (toAdd.length === 0) return;
    setDraftLinesByBiz((prev) => ({
      ...prev,
      [activeBusiness.id]: [
        ...(prev[activeBusiness.id] || []),
        ...toAdd.map((r) => ({
          productId: r.productId,
          sku: r.sku,
          productName: r.productName,
          supplierName: r.supplierName,
          unitCost: r.unitCost,
          quantity: r.recommendedOrderQty,
        })),
      ],
    }));
  };

  const handleUpdateDraftQty = (productId: string, qty: number) => {
    setDraftLinesByBiz((prev) => ({
      ...prev,
      [activeBusiness.id]: (prev[activeBusiness.id] || []).map((l) =>
        l.productId === productId ? { ...l, quantity: Math.max(1, qty) } : l
      ),
    }));
  };

  const handleRemoveDraftLine = (productId: string) => {
    setDraftLinesByBiz((prev) => ({
      ...prev,
      [activeBusiness.id]: (prev[activeBusiness.id] || []).filter(
        (l) => l.productId !== productId
      ),
    }));
  };

  const handleSubmitPO = async (notes: string) => {
    if (currentDraftLines.length === 0) return;
    const suppliers = Array.from(new Set(currentDraftLines.map((l) => l.supplierName)));
    const supplierLabel =
      suppliers.length === 1 ? suppliers[0] : `${suppliers[0]} + ${suppliers.length - 1} more`;

    const res = await fetch('/api/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId: activeBusiness.id,
        supplierName: supplierLabel,
        notes,
        items: currentDraftLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
        })),
      }),
    });

    await assertOk(res, 'Failed to submit purchase order.');
    setDraftLinesByBiz((prev) => ({ ...prev, [activeBusiness.id]: [] }));
    await fetchState();
    notify('success', 'Purchase order submitted and incoming stock updated.');
  };

  const handleMarkPOReceived = async (poId: string) => {
    const res = await fetch(`/api/purchase-orders/${poId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'received' }),
    });
    await assertOk(res, 'Failed to mark purchase order received.');
    await fetchState();
    notify('success', 'Shipment checked in and inventory updated.');
  };

  const handleResetDemo = async () => {
    const res = await fetch('/api/reset-demo', { method: 'POST' });
    await assertOk(res, 'Failed to reset demonstration datasets.');
    const fresh = (await res.json()) as SmartStockState;
    setState(fresh);
    setDraftLinesByBiz({});
    notify('success', 'Demonstration datasets restored.');
  };

  const searchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    return activeProducts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [globalSearch, activeProducts]);

  const navItems: Array<{
    id: AppView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'forecasting', label: 'Demand Forecasting', icon: TrendingUp },
    {
      id: 'recommendations',
      label: 'Smart Recommendations',
      icon: Lightbulb,
      badge: urgentAlerts.length,
    },
    { id: 'inventory', label: 'Inventory & Products', icon: Boxes },
    {
      id: 'purchase-plan',
      label: 'Purchase Plan',
      icon: ShoppingCart,
      badge: currentDraftLines.length,
    },
    { id: 'simulator', label: 'Scenario Simulator', icon: Compass },
    { id: 'settings', label: 'Business Settings', icon: Settings },
  ];

  const pageMeta: Record<AppView, { title: string; subtitle: string }> = {
    dashboard: {
      title: `Welcome back, ${activeBusiness.ownerName.split(' ')[0]}`,
      subtitle: `${activeBusiness.name} · ${activeBusiness.category}`,
    },
    forecasting: {
      title: 'AI Demand Forecasting Engine',
      subtitle: 'Time-series projections, backtest error scoring, and depletion timelines',
    },
    recommendations: {
      title: 'Smart Recommendations',
      subtitle: 'Explainable reorder points, safety stock targets, and stockout prevention',
    },
    inventory: {
      title: 'Inventory & Product Management',
      subtitle: 'Catalog stock levels, unit economics, velocity metrics, and CSV workflows',
    },
    'purchase-plan': {
      title: 'Intelligent Purchase Plan',
      subtitle: 'Stage supplier purchase orders and check in incoming shipments',
    },
    simulator: {
      title: 'Scenario Simulation & BI Reports',
      subtitle: 'Model demand surges, supplier delays, and export supply-chain reports',
    },
    settings: {
      title: 'Business Environment Settings',
      subtitle: 'Lead time defaults, safety stock buffers, and workspace switching',
    },
  };

  if (mode === 'landing') {
    const demoBiz = state.businesses[0];
    const demoProds = state.products.filter((p) => p.businessId === demoBiz?.id);
    const demoSales = state.sales.filter((s) => s.businessId === demoBiz?.id);

    return (
      <>
        <LandingPage
          demoProducts={demoProds}
          demoSales={demoSales}
          onExploreDemo={() => {
            setMode('workspace');
            setActiveView('dashboard');
          }}
          onOpenAuth={(tab) => setAuthModal(tab)}
        />
        {authModal && (
          <OnboardingModal
            initialTab={authModal}
            onClose={() => setAuthModal(null)}
            onEnterDemo={() => {
              setAuthModal(null);
              setMode('workspace');
              setActiveView('dashboard');
            }}
            onCreateBusiness={handleCreateBusiness}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F8FB] text-[#202B3C] flex">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-[#101B2D] text-white shrink-0 border-r border-[#263B55]">
        <div className="h-16 px-5 flex items-center justify-between border-b border-white/10">
          <button
            type="button"
            onClick={() => setMode('landing')}
            className="cursor-pointer"
            title="Return to SmartStock Overview"
          >
            <BrandLogo variant="light" size="md" />
          </button>
        </div>

        {/* Business Selector */}
        <div className="p-4 border-b border-white/10 space-y-1.5">
          <label className="block text-[11px] font-medium text-slate-400">
            Active Business
          </label>
          <select
            aria-label="Switch active business"
            value={activeBusiness.id}
            onChange={(e) => handleSwitchBusiness(e.target.value)}
            className="w-full px-2.5 py-2 text-xs font-medium bg-[#263B55] text-white border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16A36A]"
          >
            {state.businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#263B55] text-white'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#16A36A]' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="font-mono text-[11px] font-semibold text-white bg-[#16A36A] px-1.5 py-0.5 rounded-md tabular-nums">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <button
            type="button"
            onClick={() => setAuthModal('onboard')}
            className="w-full py-2 text-xs font-medium text-white bg-[#16A36A] hover:bg-[#138a59] rounded-lg transition-colors cursor-pointer"
          >
            + New Business Setup
          </button>
          <button
            type="button"
            onClick={() => setMode('landing')}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs text-slate-300 hover:text-white cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Exit to Landing Page
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#101B2D]/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-68 bg-[#101B2D] text-white flex flex-col h-full">
            <div className="h-16 px-5 flex items-center justify-between border-b border-white/10">
              <BrandLogo variant="light" size="md" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 border-b border-white/10">
              <select
                value={activeBusiness.id}
                onChange={(e) => handleSwitchBusiness(e.target.value)}
                className="w-full px-2.5 py-2 text-xs font-medium bg-[#263B55] text-white border border-white/15 rounded-lg"
              >
                {state.businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium ${
                      active ? 'bg-[#263B55] text-white' : 'text-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="font-mono text-xs bg-[#16A36A] px-1.5 rounded">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-[#202B3C] hover:bg-slate-100 rounded-lg"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-base sm:text-lg font-bold text-[#101B2D] truncate">
                {pageMeta[activeView].title}
              </h1>
              <p className="text-xs text-[#738096] truncate">
                {pageMeta[activeView].subtitle} ·{' '}
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Global Search */}
            <div className="relative hidden md:block w-64">
              <Search className="w-4 h-4 text-[#738096] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search products or SKUs..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F6F8FB] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
              />
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-10 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-40">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleNavigate('forecasting', p.id)}
                      className="w-full px-3 py-2 text-left hover:bg-[#F6F8FB] flex items-center justify-between gap-2 text-xs border-b border-slate-100 last:border-0 cursor-pointer"
                    >
                      <span className="font-medium text-[#101B2D] truncate">{p.name}</span>
                      <span className="font-mono text-[#738096] shrink-0">
                        {p.currentStock} left
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Notification Control */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications((v) => !v)}
                aria-label="Stock alerts"
                className="relative p-2 text-[#202B3C] hover:bg-[#F6F8FB] border border-slate-200 rounded-lg cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {urgentAlerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#DC5555] text-white font-mono text-[10px] font-bold flex items-center justify-center">
                    {urgentAlerts.length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 top-11 w-80 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-40">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-[#101B2D]">
                      Urgent Inventory Alerts
                    </span>
                    <button
                      type="button"
                      onClick={() => handleNavigate('recommendations')}
                      className="text-[11px] font-medium text-[#4C7FE8] hover:underline cursor-pointer"
                    >
                      View all
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {urgentAlerts.length === 0 ? (
                      <div className="p-4 text-xs text-[#738096] text-center">
                        No urgent stock alerts right now.
                      </div>
                    ) : (
                      urgentAlerts.map((alert) => (
                        <button
                          key={alert.productId}
                          type="button"
                          onClick={() =>
                            handleNavigate('recommendations', alert.productId)
                          }
                          className="w-full p-3 text-left hover:bg-[#F6F8FB] space-y-1 cursor-pointer"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-[#101B2D] truncate">
                              {alert.productName}
                            </span>
                            <span
                              className={`font-semibold shrink-0 ml-2 ${
                                alert.urgency === 'critical'
                                  ? 'text-[#DC5555]'
                                  : 'text-[#E9A23B]'
                              }`}
                            >
                              {alert.urgency === 'critical' ? 'Critical' : 'Low Stock'}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#738096] line-clamp-2">
                            {alert.reason}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
              {!avatarError ? (
                <img
                  src="/src/assets/images/avatar_owner_profile_1795612336964.jpg"
                  alt={activeBusiness.ownerName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                  className="w-8 h-8 rounded-full object-cover border border-slate-200"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#263B55] text-white text-xs font-bold flex items-center justify-center">
                  {activeBusiness.ownerName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="hidden sm:block text-left leading-tight">
                <div className="text-xs font-semibold text-[#101B2D]">
                  {activeBusiness.ownerName}
                </div>
                <div className="text-[11px] text-[#738096]">Owner</div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto space-y-5">
          {banner && (
            <div
              className={`px-4 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between ${
                banner.type === 'error'
                  ? 'bg-red-50 border-red-200 text-[#DC5555]'
                  : 'bg-emerald-50 border-emerald-200 text-[#16A36A]'
              }`}
            >
              <span>{banner.message}</span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="ml-4 hover:opacity-75 cursor-pointer"
                aria-label="Dismiss message"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {activeView === 'dashboard' && (
                <DashboardView
                  business={activeBusiness}
                  products={activeProducts}
                  sales={activeSales}
                  recommendations={recommendations}
                  activities={activeActivities}
                  onNavigate={handleNavigate}
                />
              )}
              {activeView === 'forecasting' && (
                <ForecastingView
                  products={activeProducts}
                  sales={activeSales}
                  initialProductId={focusedProductId}
                  onNavigate={handleNavigate}
                />
              )}
              {activeView === 'recommendations' && (
                <RecommendationsView
                  recommendations={recommendations}
                  purchaseDraftIds={currentDraftLines.map((l) => l.productId)}
                  onUpdateStatus={handleUpdateRecStatus}
                  onAddToPurchasePlan={handleAddToPurchasePlan}
                  onViewProduct={handleNavigate}
                />
              )}
              {activeView === 'inventory' && (
                <InventoryView
                  products={activeProducts}
                  sales={activeSales}
                  defaultLeadTimeDays={activeBusiness.defaultLeadTimeDays}
                  onAddProduct={handleAddProduct}
                  onUpdateProduct={handleUpdateProduct}
                  onDeleteProduct={handleDeleteProduct}
                  onRecordTransaction={handleRecordTransaction}
                  onImportProducts={handleImportProducts}
                />
              )}
              {activeView === 'purchase-plan' && (
                <PurchasePlanView
                  draftLines={currentDraftLines}
                  purchaseOrders={activePOs}
                  recommendations={recommendations}
                  onUpdateDraftQty={handleUpdateDraftQty}
                  onRemoveDraftLine={handleRemoveDraftLine}
                  onAutoFillUrgent={handleAutoFillUrgent}
                  onSubmitPO={handleSubmitPO}
                  onMarkReceived={handleMarkPOReceived}
                />
              )}
              {activeView === 'simulator' && (
                <SimulatorView
                  business={activeBusiness}
                  products={activeProducts}
                  sales={activeSales}
                />
              )}
              {activeView === 'settings' && (
                <SettingsView
                  business={activeBusiness}
                  businesses={state.businesses}
                  onUpdateBusiness={handleUpdateBusiness}
                  onSwitchBusiness={handleSwitchBusiness}
                  onOpenOnboarding={() => setAuthModal('onboard')}
                  onResetDemo={handleResetDemo}
                />
              )}
            </>
          )}
        </main>
      </div>

      {authModal && (
        <OnboardingModal
          initialTab={authModal}
          onClose={() => setAuthModal(null)}
          onEnterDemo={() => setAuthModal(null)}
          onCreateBusiness={handleCreateBusiness}
        />
      )}
    </div>
  );
}
