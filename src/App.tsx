import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  ChevronRight,
  Compass,
  FileSpreadsheet,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Store,
  TrendingUp,
  Truck,
  User,
  X,
} from 'lucide-react';
import { BrandLogo } from './components/BrandLogo';
import { DashboardView } from './components/DashboardView';
import { ForecastingView } from './components/ForecastingView';
import { InventoryView } from './components/InventoryView';
import { LandingPage } from './components/LandingPage';
import { OnboardingModal } from './components/OnboardingModal';
import {
  NotificationsView,
  ProfileView,
  ReportsView,
  SalesAnalyticsView,
  SuppliersView,
} from './components/OperationalViews';
import { ProductCatalogueView } from './components/ProductCatalogueView';
import { type DraftOrderLine, PurchasePlanView } from './components/PurchasePlanView';
import { RecommendationsView } from './components/RecommendationsView';
import { SettingsView } from './components/SettingsView';
import { SimulatorView } from './components/SimulatorView';
import { AlertMessage, Button } from './components/ui/DesignPrimitives';
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

interface NavGroup {
  label: string;
  items: Array<{
    id: AppView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    badgeTone?: 'emerald' | 'critical';
  }>;
}

const VALID_VIEWS: AppView[] = [
  'dashboard',
  'forecasting',
  'recommendations',
  'simulator',
  'inventory',
  'catalogue',
  'sales-analytics',
  'suppliers',
  'purchase-plan',
  'reports',
  'notifications',
  'settings',
  'profile',
];

function getInitialRouteFromHash(): { mode: 'landing' | 'workspace'; view: AppView } {
  if (typeof window === 'undefined') return { mode: 'landing', view: 'dashboard' };
  const raw = window.location.hash.replace(/^#\/?/, '').trim() as AppView;
  if (raw && VALID_VIEWS.includes(raw) && raw !== 'profile') {
    return { mode: 'workspace', view: raw };
  }
  return { mode: 'landing', view: 'dashboard' };
}

export default function App() {
  const initialRoute = useMemo(() => getInitialRouteFromHash(), []);
  const [state, setState] = useState<SmartStockState>(() => createInitialSeedState());
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'landing' | 'workspace'>(initialRoute.mode);
  const [activeView, setActiveView] = useState<AppView>(initialRoute.view);
  const [focusedProductId, setFocusedProductId] = useState<string | undefined>(undefined);
  const [authModal, setAuthModal] = useState<'signin' | 'onboard' | null>(null);
  const [authUser, setAuthUser] = useState<{ name: string; email: string } | null>(() => {
    try {
      const saved = sessionStorage.getItem('smartstock_auth_user');
      return saved ? (JSON.parse(saved) as { name: string; email: string }) : null;
    } catch {
      return null;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [globalSearch, setGlobalSearch] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [draftLinesByBiz, setDraftLinesByBiz] = useState<Record<string, DraftOrderLine[]>>({});
  const [banner, setBanner] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (authUser) {
        sessionStorage.setItem('smartstock_auth_user', JSON.stringify(authUser));
      } else {
        sessionStorage.removeItem('smartstock_auth_user');
      }
    } catch {
      // ignore storage quota errors
    }
  }, [authUser]);

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

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setShowProfileMenu(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotifications(false);
        setShowProfileMenu(false);
        setGlobalSearch('');
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const raw = window.location.hash.replace(/^#\/?/, '').trim() as AppView;
      if (raw && VALID_VIEWS.includes(raw)) {
        if (raw === 'profile' && !authUser) return;
        setMode('workspace');
        setActiveView(raw);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [authUser]);

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
    if (view === 'profile' && !authUser) {
      setAuthModal('signin');
      return;
    }
    setActiveView(view);
    setFocusedProductId(productId);
    setMobileMenuOpen(false);
    setShowNotifications(false);
    setShowProfileMenu(false);
    setGlobalSearch('');
    if (typeof window !== 'undefined') {
      window.location.hash = `#/${view}`;
    }
  };

  const handleSignIn = ({ email }: { email: string }) => {
    const matchedBiz = state.businesses.find(
      (b) => b.ownerEmail.toLowerCase() === email.toLowerCase()
    );
    const derivedName =
      matchedBiz?.ownerName ||
      email
        .split('@')[0]
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    setAuthUser({
      name: derivedName,
      email,
    });
    if (matchedBiz) {
      setState((prev) => ({ ...prev, activeBusinessId: matchedBiz.id }));
    }
    setAuthModal(null);
    setMode('workspace');
    setActiveView('dashboard');
    notify('success', `Signed in as ${derivedName}.`);
  };

  const handleSignOut = () => {
    setAuthUser(null);
    setShowProfileMenu(false);
    setMobileMenuOpen(false);
    setActiveView('dashboard');
    setMode('landing');
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
    setAuthUser({
      name: payload.ownerName || 'Operations Manager',
      email: payload.ownerEmail || 'owner@business.com',
    });
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
    notify('success', `Staged ${rec.recommendedOrderQty} units of "${rec.productName}" to purchase plan.`);
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

  const navGroups: NavGroup[] = useMemo(
    () => [
      {
        label: 'Overview',
        items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
      },
      {
        label: 'Intelligence',
        items: [
          { id: 'forecasting', label: 'Demand Forecast', icon: TrendingUp },
          {
            id: 'recommendations',
            label: 'Smart Recommendations',
            icon: Lightbulb,
            badge: urgentAlerts.length,
            badgeTone: 'critical',
          },
          { id: 'simulator', label: 'Scenario Lab', icon: Compass },
        ],
      },
      {
        label: 'Operations',
        items: [
          { id: 'inventory', label: 'Inventory Management', icon: Boxes },
          { id: 'catalogue', label: 'Product Catalogue', icon: Store },
          { id: 'sales-analytics', label: 'Sales Analytics', icon: BarChart3 },
          { id: 'suppliers', label: 'Suppliers', icon: Truck },
          {
            id: 'purchase-plan',
            label: 'Purchase Orders',
            icon: ShoppingCart,
            badge: currentDraftLines.length,
            badgeTone: 'emerald',
          },
        ],
      },
      {
        label: 'Insights',
        items: [
          { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
          {
            id: 'notifications',
            label: 'Notifications',
            icon: Bell,
            badge: urgentAlerts.length,
            badgeTone: 'critical',
          },
        ],
      },
      {
        label: 'Settings',
        items: [
          { id: 'settings', label: 'Settings', icon: Settings },
          ...(authUser
            ? [{ id: 'profile' as AppView, label: 'Profile', icon: User }]
            : []),
        ],
      },
    ],
    [urgentAlerts.length, currentDraftLines.length, authUser]
  );

  const breadcrumbMeta: Record<AppView, { group: string; page: string }> = {
    dashboard: { group: 'Overview', page: 'Dashboard' },
    forecasting: { group: 'Intelligence', page: 'Demand Forecast' },
    recommendations: { group: 'Intelligence', page: 'Smart Recommendations' },
    simulator: { group: 'Intelligence', page: 'Scenario Lab' },
    inventory: { group: 'Operations', page: 'Inventory Management' },
    catalogue: { group: 'Operations', page: 'Product Catalogue' },
    'sales-analytics': { group: 'Operations', page: 'Sales Analytics' },
    suppliers: { group: 'Operations', page: 'Suppliers' },
    'purchase-plan': { group: 'Operations', page: 'Purchase Orders' },
    reports: { group: 'Insights', page: 'Reports' },
    notifications: { group: 'Insights', page: 'Notifications' },
    settings: { group: 'Settings', page: 'Settings' },
    profile: { group: 'Settings', page: 'Profile' },
  };

  const contextualAction = useMemo(() => {
    switch (activeView) {
      case 'dashboard':
        return urgentAlerts.length > 0
          ? {
              label: `Review Alerts (${urgentAlerts.length})`,
              variant: 'emerald' as const,
              onClick: () => handleNavigate('recommendations'),
            }
          : {
              label: 'Demand Forecast',
              variant: 'secondary' as const,
              onClick: () => handleNavigate('forecasting'),
            };
      case 'forecasting':
        return {
          label: 'Replenishment Plan',
          variant: 'secondary' as const,
          onClick: () => handleNavigate('recommendations'),
        };
      case 'recommendations':
        return {
          label:
            currentDraftLines.length > 0
              ? `Purchase Orders (${currentDraftLines.length})`
              : 'Purchase Orders',
          variant: 'emerald' as const,
          onClick: () => handleNavigate('purchase-plan'),
        };
      case 'inventory':
        return {
          label: 'Product Catalogue',
          variant: 'secondary' as const,
          onClick: () => handleNavigate('catalogue'),
        };
      case 'catalogue':
        return {
          label: 'Inventory Management',
          variant: 'secondary' as const,
          onClick: () => handleNavigate('inventory'),
        };
      case 'sales-analytics':
        return {
          label: 'Export Reports',
          variant: 'secondary' as const,
          onClick: () => handleNavigate('reports'),
        };
      case 'suppliers':
      case 'reports':
      case 'notifications':
        return {
          label: 'Purchase Orders',
          variant: 'secondary' as const,
          onClick: () => handleNavigate('purchase-plan'),
        };
      case 'purchase-plan':
        return {
          label: 'Supplier Directory',
          variant: 'secondary' as const,
          onClick: () => handleNavigate('suppliers'),
        };
      case 'simulator':
        return {
          label: 'View Reports',
          variant: 'secondary' as const,
          onClick: () => handleNavigate('reports'),
        };
      case 'settings':
        return {
          label: 'New Workspace',
          variant: 'emerald' as const,
          onClick: () => setAuthModal('onboard'),
        };
      case 'profile':
        return {
          label: 'Business Settings',
          variant: 'secondary' as const,
          onClick: () => handleNavigate('settings'),
        };
    }
  }, [activeView, urgentAlerts.length, currentDraftLines.length]);

  if (mode === 'landing') {
    const demoBiz = state.businesses[0];
    const demoProds = state.products.filter((p) => p.businessId === demoBiz?.id);
    const demoSales = state.sales.filter((s) => s.businessId === demoBiz?.id);

    return (
      <>
        <LandingPage
          demoBusiness={demoBiz}
          demoProducts={demoProds}
          demoSales={demoSales}
          signedInUser={authUser}
          onExploreDemo={() => {
            setMode('workspace');
            setActiveView('dashboard');
          }}
          onOpenAuth={(tab) => setAuthModal(tab)}
          onOpenProfile={() => {
            setMode('workspace');
            setActiveView(authUser ? 'profile' : 'dashboard');
          }}
        />
        {authModal && (
          <OnboardingModal
            initialTab={authModal}
            isInDemoWorkspace={false}
            onClose={() => setAuthModal(null)}
            onSignIn={handleSignIn}
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

  const renderSidebarNav = (collapsed: boolean) => (
    <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
      {navGroups.map((group, groupIdx) => (
        <div key={group.label}>
          {!collapsed ? (
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#E9DDE0]/65">
              {group.label}
            </div>
          ) : (
            groupIdx > 0 && <div className="border-t border-white/15 my-2 mx-2" />
          )}

          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={collapsed ? item.label : undefined}
                  onClick={() => handleNavigate(item.id)}
                  className={`relative w-full flex items-center ${
                    collapsed ? 'justify-center px-0 py-2.5' : 'justify-between px-3 py-2'
                  } rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#805F69] text-white before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-[#E9DDE0]'
                      : 'text-[#E9DDE0]/90 hover:bg-[#58444A] hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-[#E9DDE0]' : 'text-[#E9DDE0]/75'
                      }`}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </span>
                  {!collapsed && item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`font-mono text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded ${
                        item.badgeTone === 'critical'
                          ? 'bg-[#BC7777]/30 text-[#F9EFEF]'
                          : 'bg-[#B99AA0]/30 text-[#E9DDE0]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {collapsed && item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`absolute top-1.5 right-2.5 w-1.5 h-1.5 rounded-full ${
                        item.badgeTone === 'critical' ? 'bg-[#BC7777]' : 'bg-[#B99AA0]'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#F7F3F1] text-[#3F3437] flex">
      {/* Collapsible Desktop Left Sidebar (Deep Burgundy) */}
      <aside
        className={`hidden lg:flex lg:flex-col bg-[#49383D] text-white shrink-0 border-r border-[#3A2C30] transition-[width] duration-200 sticky top-0 h-screen ${
          sidebarCollapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        {/* Brand Header */}
        <div
          className={`h-16 flex items-center border-b border-white/10 shrink-0 ${
            sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-5'
          }`}
        >
          <button
            type="button"
            onClick={() => setMode('landing')}
            className="cursor-pointer focus:outline-none"
            title="Return to SmartStock Overview"
          >
            <BrandLogo variant="light" size="md" iconOnly={sidebarCollapsed} />
          </button>
        </div>

        {/* Active Business Selector (Expanded) */}
        {!sidebarCollapsed && (
          <div className="px-4 py-3.5 border-b border-white/12 space-y-1.5 shrink-0">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#E9DDE0]/70">
                Workspace
              </label>
              <button
                type="button"
                onClick={() => setAuthModal('onboard')}
                className="text-[11px] font-medium text-[#E9DDE0] hover:text-white inline-flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                New
              </button>
            </div>
            <select
              aria-label="Switch active business"
              value={activeBusiness.id}
              onChange={(e) => handleSwitchBusiness(e.target.value)}
              className="w-full px-2.5 py-2 text-xs font-medium bg-[#3E2F34] text-white border border-white/15 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B99AA0]"
            >
              {state.businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Grouped Navigation */}
        {renderSidebarNav(sidebarCollapsed)}

        {/* Footer Profile / Demo Session Controls */}
        <div className="p-3 border-t border-white/12 space-y-2 shrink-0">
          {authUser ? (
            !sidebarCollapsed ? (
              <button
                type="button"
                onClick={() => handleNavigate('profile')}
                className="w-full flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/8 transition-colors text-left cursor-pointer"
              >
                {!avatarError ? (
                  <img
                    src="/src/assets/images/avatar_owner_profile_1795612336964.jpg"
                    alt={authUser.name}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                    className="w-8 h-8 rounded-full object-cover border border-[#B99AA0]/50 shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#805F69] text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {authUser.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white truncate">
                    {authUser.name}
                  </div>
                  <div className="text-[11px] text-[#E9DDE0]/75 truncate">
                    {activeBusiness.category}
                  </div>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleNavigate('profile')}
                title={authUser.name}
                className="w-full flex justify-center py-1 cursor-pointer"
              >
                {!avatarError ? (
                  <img
                    src="/src/assets/images/avatar_owner_profile_1795612336964.jpg"
                    alt={authUser.name}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                    className="w-8 h-8 rounded-full object-cover border border-[#B99AA0]/50"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#805F69] text-white text-xs font-bold flex items-center justify-center">
                    {authUser.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </button>
            )
          ) : !sidebarCollapsed ? (
            <div className="p-2.5 rounded-lg bg-[#3E2F34] border border-white/12 space-y-2">
              <div className="text-[11px] font-medium text-[#E9DDE0]">
                Live Demo Session
              </div>
              <button
                type="button"
                onClick={() => setAuthModal('signin')}
                className="w-full py-1.5 text-xs font-medium text-white bg-[#805F69] hover:bg-[#B99AA0] hover:text-[#49383D] rounded-md transition-colors cursor-pointer"
              >
                Sign In to Account
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModal('signin')}
              title="Sign In"
              className="w-full flex justify-center py-2 text-[#E9DDE0] hover:text-white cursor-pointer"
            >
              <User className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#49383D]/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-72 bg-[#49383D] text-white flex flex-col h-full">
            <div className="h-16 px-5 flex items-center justify-between border-b border-white/12">
              <BrandLogo variant="light" size="md" />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-[#E9DDE0] hover:text-white rounded-lg"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 border-b border-white/12 space-y-2">
              <select
                aria-label="Switch active business mobile"
                value={activeBusiness.id}
                onChange={(e) => handleSwitchBusiness(e.target.value)}
                className="w-full px-2.5 py-2 text-xs font-medium bg-[#3E2F34] text-white border border-white/15 rounded-lg"
              >
                {state.businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAuthModal('onboard');
                }}
                className="w-full py-2 text-xs font-medium text-white bg-[#805F69] hover:bg-[#B99AA0] hover:text-[#49383D] rounded-lg transition-colors cursor-pointer"
              >
                + New Business Setup
              </button>
            </div>
            {renderSidebarNav(false)}
            <div className="p-3 border-t border-white/12">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setMode('landing');
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs text-[#E9DDE0] hover:text-white cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Exit to Landing Page
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Consistent Enterprise Top Header */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-sm border-b border-[#E8DFE1] px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Left: Collapse Toggle + Breadcrumb Navigation */}
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 text-[#3F3437] hover:bg-[#FBF8F7] rounded-lg cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="hidden lg:inline-flex p-1.5 text-[#805F69] hover:text-[#49383D] hover:bg-[#FBF8F7] rounded-lg transition-colors cursor-pointer"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>

            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1.5 text-xs min-w-0"
            >
              <button
                type="button"
                onClick={() => handleNavigate('dashboard')}
                className="hidden sm:inline font-medium text-[#81777A] hover:text-[#49383D] cursor-pointer"
              >
                {activeBusiness.name}
              </button>
              <ChevronRight className="hidden sm:inline w-3.5 h-3.5 text-[#A69B9E] shrink-0" />
              <span className="hidden md:inline text-[#81777A] shrink-0">
                {breadcrumbMeta[activeView].group}
              </span>
              <ChevronRight className="hidden md:inline w-3.5 h-3.5 text-[#A69B9E] shrink-0" />
              <span className="font-semibold text-[#49383D] truncate">
                {breadcrumbMeta[activeView].page}
              </span>
            </nav>
          </div>

          {/* Right: Search, Business Switcher, Contextual Action, Notifications, Profile */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Global Search */}
            <div className="relative hidden md:block w-56 xl:w-64">
              <Search className="w-3.5 h-3.5 text-[#81777A] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search products or SKUs..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="w-full h-9 pl-8.5 pr-3 text-xs bg-white border border-[#E8DFE1] rounded-lg text-[#3F3437] placeholder:text-[#A69B9E] focus:outline-none focus:ring-2 focus:ring-[#805F69] transition-colors"
              />
              {searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-10 bg-white border border-[#E8DFE1] rounded-xl shadow-lg overflow-hidden z-40">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleNavigate('catalogue', p.id)}
                      className="w-full px-3 py-2 text-left hover:bg-[#FBF8F7] flex items-center justify-between gap-2 text-xs border-b border-[#E8DFE1] last:border-0 cursor-pointer"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-[#49383D] block truncate">
                          {p.name}
                        </span>
                        <span className="font-mono text-[10px] text-[#81777A]">
                          {p.sku}
                        </span>
                      </span>
                      <span className="font-mono text-[#81777A] shrink-0 tabular-nums">
                        {p.currentStock} left
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Compact Business Switcher when sidebar collapsed */}
            {sidebarCollapsed && (
              <select
                aria-label="Switch business from header"
                value={activeBusiness.id}
                onChange={(e) => handleSwitchBusiness(e.target.value)}
                className="hidden sm:block h-9 px-2.5 text-xs font-medium bg-white border border-[#E8DFE1] rounded-lg text-[#49383D] max-w-[180px] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
              >
                {state.businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}

            {/* Contextual Page Action */}
            <div className="hidden sm:block">
              <Button
                size="sm"
                variant={contextualAction.variant}
                onClick={contextualAction.onClick}
              >
                {contextualAction.label}
              </Button>
            </div>

            {/* Notification Centre Popover */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => {
                  setShowNotifications((v) => !v);
                  setShowProfileMenu(false);
                }}
                aria-label="Notifications"
                className="relative h-9 w-9 inline-flex items-center justify-center text-[#49383D] hover:bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {urgentAlerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[#BC7777] text-white font-mono text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {urgentAlerts.length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 top-11 w-80 bg-white border border-[#E8DFE1] rounded-xl shadow-lg overflow-hidden z-40">
                  <div className="px-4 py-3 border-b border-[#E8DFE1] flex items-center justify-between bg-[#FBF8F7]">
                    <span className="text-xs font-semibold text-[#49383D]">
                      Inventory Alerts
                    </span>
                    <button
                      type="button"
                      onClick={() => handleNavigate('notifications')}
                      className="text-[11px] font-medium text-[#805F69] hover:text-[#49383D] hover:underline cursor-pointer"
                    >
                      Open Center
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-[#E8DFE1]">
                    {urgentAlerts.length === 0 ? (
                      <div className="p-5 text-xs text-[#81777A] text-center">
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
                          className="w-full p-3.5 text-left hover:bg-[#F7F3F1] space-y-1 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="font-semibold text-[#49383D] truncate">
                              {alert.productName}
                            </span>
                            <span
                              className={`font-semibold shrink-0 ${
                                alert.urgency === 'critical'
                                  ? 'text-[#A15E5E]'
                                  : 'text-[#9E7D4A]'
                              }`}
                            >
                              {alert.urgency === 'critical' ? 'Critical' : 'Warning'}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#81777A] line-clamp-2">
                            {alert.reason}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Dropdown Menu (Authenticated) OR Sign In CTA (Demo Mode) */}
            {authUser ? (
              <div className="relative pl-2 border-l border-[#E8DFE1]" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu((v) => !v);
                    setShowNotifications(false);
                  }}
                  className="flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-[#FBF8F7] transition-colors cursor-pointer"
                  aria-label="Open profile menu"
                >
                  {!avatarError ? (
                    <img
                      src="/src/assets/images/avatar_owner_profile_1795612336964.jpg"
                      alt={authUser.name}
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarError(true)}
                      className="w-7 h-7 rounded-full object-cover border border-[#E8DFE1]"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#49383D] text-white text-[11px] font-bold flex items-center justify-center">
                      {authUser.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="hidden xl:block text-left leading-tight">
                    <div className="text-xs font-semibold text-[#49383D]">
                      {authUser.name}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-[#81777A]" />
                </button>

                {showProfileMenu && (
                  <div className="absolute right-0 top-11 w-56 bg-white border border-[#E8DFE1] rounded-xl shadow-lg overflow-hidden z-40 py-1">
                    <div className="px-3.5 py-2.5 border-b border-[#E8DFE1]">
                      <div className="text-xs font-semibold text-[#49383D] truncate">
                        {authUser.name}
                      </div>
                      <div className="text-[11px] text-[#81777A] truncate">
                        {authUser.email}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleNavigate('profile')}
                      className="w-full px-3.5 py-2 text-left text-xs text-[#3F3437] hover:bg-[#FBF8F7] flex items-center gap-2 cursor-pointer"
                    >
                      <User className="w-3.5 h-3.5 text-[#81777A]" />
                      Profile & Workspaces
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigate('settings')}
                      className="w-full px-3.5 py-2 text-left text-xs text-[#3F3437] hover:bg-[#FBF8F7] flex items-center gap-2 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-[#81777A]" />
                      Business Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setAuthModal('onboard');
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs text-[#805F69] font-medium hover:bg-[#FBF8F7] flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      New Business Setup
                    </button>
                    <div className="border-t border-[#E8DFE1] my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        setMode('landing');
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs text-[#81777A] hover:text-[#49383D] hover:bg-[#FBF8F7] flex items-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      View Landing Page
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full px-3.5 py-2 text-left text-xs text-[#8E4F4F] hover:bg-[#F9EFEF] flex items-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 pl-2 border-l border-[#E8DFE1]">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAuthModal('signin')}
                >
                  Sign In
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setAuthModal('onboard')}
                >
                  Get Started
                </Button>
              </div>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-5 sm:p-6 lg:p-8 max-w-[1480px] w-full mx-auto space-y-5">
          {banner && (
            <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full shadow-lg rounded-lg animate-view-enter">
              <AlertMessage
                tone={banner.type}
                message={banner.message}
                onDismiss={() => setBanner(null)}
              />
            </div>
          )}

          {loading ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-28 bg-white border border-[#E8DFE1] rounded-xl p-4 space-y-3 animate-pulse"
                  >
                    <div className="h-3 w-24 bg-[#FBF8F7] rounded" />
                    <div className="h-7 w-32 bg-[#E9DDE0] rounded" />
                    <div className="h-2.5 w-20 bg-[#FBF8F7] rounded" />
                  </div>
                ))}
              </div>
              <div className="h-72 bg-white border border-[#E8DFE1] rounded-xl p-6 animate-pulse">
                <div className="h-4 w-48 bg-[#FBF8F7] rounded mb-6" />
                <div className="h-48 w-full bg-[#F7F3F1] rounded-lg" />
              </div>
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
              {activeView === 'simulator' && (
                <SimulatorView
                  business={activeBusiness}
                  products={activeProducts}
                  sales={activeSales}
                />
              )}
              {activeView === 'inventory' && (
                <InventoryView
                  business={activeBusiness}
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
              {activeView === 'catalogue' && (
                <ProductCatalogueView
                  business={activeBusiness}
                  products={activeProducts}
                  sales={activeSales}
                  defaultLeadTimeDays={activeBusiness.defaultLeadTimeDays}
                  initialProductId={focusedProductId}
                  purchaseDraftIds={currentDraftLines.map((l) => l.productId)}
                  onNavigate={handleNavigate}
                  onAddProduct={handleAddProduct}
                  onUpdateProduct={handleUpdateProduct}
                  onDeleteProduct={handleDeleteProduct}
                  onRecordTransaction={handleRecordTransaction}
                  onImportProducts={handleImportProducts}
                  onAddToPurchasePlan={handleAddToPurchasePlan}
                />
              )}
              {activeView === 'sales-analytics' && (
                <SalesAnalyticsView
                  business={activeBusiness}
                  products={activeProducts}
                  sales={activeSales}
                  onNavigate={handleNavigate}
                />
              )}
              {activeView === 'suppliers' && (
                <SuppliersView
                  products={activeProducts}
                  purchaseOrders={activePOs}
                  onNavigate={handleNavigate}
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
              {activeView === 'reports' && (
                <ReportsView
                  business={activeBusiness}
                  products={activeProducts}
                  sales={activeSales}
                  recommendations={recommendations}
                />
              )}
              {activeView === 'notifications' && (
                <NotificationsView
                  recommendations={recommendations}
                  activities={activeActivities}
                  onNavigate={handleNavigate}
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
              {activeView === 'profile' && authUser && (
                <ProfileView
                  authUser={authUser}
                  business={activeBusiness}
                  businesses={state.businesses}
                  onSwitchBusiness={handleSwitchBusiness}
                  onNavigate={handleNavigate}
                  onSignOut={handleSignOut}
                />
              )}
            </>
          )}
        </main>
      </div>

      {authModal && (
        <OnboardingModal
          initialTab={authModal}
          isInDemoWorkspace={!authUser}
          onClose={() => setAuthModal(null)}
          onSignIn={handleSignIn}
          onEnterDemo={() => setAuthModal(null)}
          onCreateBusiness={handleCreateBusiness}
        />
      )}
    </div>
  );
}
