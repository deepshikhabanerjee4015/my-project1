import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Barcode,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  LayoutGrid,
  List,
  Package,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ForecastLineChart } from './Charts';
import {
  Button,
  EmptyStateCard,
  ModalDialog,
  StatusLabel,
  SurfaceCard,
} from './ui/DesignPrimitives';
import { ProductImage } from './ui/ProductImage';
import {
  CATALOGUE_IMAGE_OPTIONS,
  SUPERMARKET_DEPARTMENTS,
} from '../data/productImages';
import { formatINR, formatINRCompact } from '../lib/currency';
import { buildDailySeries, generateRecommendations, runDemandForecast } from '../lib/forecasting';
import type { BusinessProfile, Product, SalesRecord } from '../types/inventory';

interface InventoryViewProps {
  business: BusinessProfile;
  products: Product[];
  sales: SalesRecord[];
  defaultLeadTimeDays: number;
  onAddProduct: (product: Partial<Product>) => Promise<void>;
  onUpdateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onRecordTransaction: (payload: {
    productId: string;
    quantitySold: number;
    quantityReceived: number;
  }) => Promise<void>;
  onImportProducts: (items: Array<Partial<Product>>) => Promise<void>;
}

type StockStatusFilter = 'all' | 'healthy' | 'low' | 'out' | 'excess';
type SortField = 'name' | 'stock' | 'price' | 'value';
type ViewLayout = 'hybrid' | 'cards' | 'table';

function getStockStatus(p: Product): {
  key: Exclude<StockStatusFilter, 'all'>;
  label: string;
  tone: 'healthy' | 'warning' | 'critical' | 'info';
} {
  if (p.currentStock === 0) {
    return { key: 'out', label: 'Out of Stock', tone: 'critical' };
  }
  if (p.currentStock <= p.minStockLevel || p.currentStock <= (p.reorderLevel ?? p.minStockLevel)) {
    return { key: 'low', label: 'Low Stock', tone: 'warning' };
  }
  if (p.currentStock > p.maxStockLevel) {
    return { key: 'excess', label: 'Excess Stock', tone: 'info' };
  }
  return { key: 'healthy', label: 'Healthy', tone: 'healthy' };
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  business,
  products,
  sales,
  defaultLeadTimeDays,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onRecordTransaction,
  onImportProducts,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewLayout, setViewLayout] = useState<ViewLayout>('table');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'forecast' | 'history' | 'reorder'>('overview');
  const [txProduct, setTxProduct] = useState<Product | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const detailProduct = useMemo(
    () => products.find((p) => p.id === detailProductId) || null,
    [products, detailProductId]
  );

  const [formState, setFormState] = useState({
    name: '',
    brand: '',
    packagingSize: '1 kg',
    sku: '',
    barcode: '',
    category: SUPERMARKET_DEPARTMENTS[0].category,
    description: '',
    imageUrl: CATALOGUE_IMAGE_OPTIONS[0].url,
    currentStock: 25,
    minStockLevel: 15,
    reorderLevel: 25,
    maxStockLevel: 100,
    unitPrice: 120,
    unitCost: 90,
    supplierName: 'Primary Distributor',
    leadTimeDays: defaultLeadTimeDays,
    incomingStock: 0,
    expiryDate: '',
    seasonalTag: 'Year-Round' as Product['seasonalTag'],
    promoActive: false,
  });

  const [txSold, setTxSold] = useState(0);
  const [txReceived, setTxReceived] = useState(0);
  const [csvText, setCsvText] = useState(
    'sku,barcode,name,brand,packagingSize,category,currentStock,minStockLevel,reorderLevel,unitPrice,unitCost,supplierName,leadTimeDays,expiryDate\nFB-GRC-199,8901491109901,Fortune Sunlite Oil – 1 litre,Fortune,1 litre,Grocery & Staples,34,15,24,145,122,Adani Wilmar Distributors,4,2027-06-30\nFB-BEV-299,8901058899202,Red Bull Energy Drink – 250 ml,Red Bull,250 ml,Beverages,28,12,20,125,92,Metro Beverages Supply,3,2027-05-15'
  );
  const [busy, setBusy] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))).sort(),
    [products]
  );

  const brands = useMemo(
    () =>
      Array.from(
        new Set(products.map((p) => p.brand).filter((b): b is string => Boolean(b && b.trim())))
      ).sort(),
    [products]
  );

  const summaryStats = useMemo(() => {
    let totalRetailValue = 0;
    let totalCostValue = 0;
    let totalUnits = 0;
    let lowCount = 0;
    let outCount = 0;
    let excessCount = 0;

    for (const p of products) {
      totalRetailValue += p.currentStock * p.unitPrice;
      totalCostValue += p.currentStock * p.unitCost;
      totalUnits += p.currentStock;
      const status = getStockStatus(p).key;
      if (status === 'out') outCount += 1;
      else if (status === 'low') lowCount += 1;
      else if (status === 'excess') excessCount += 1;
    }

    return {
      totalCount: products.length,
      totalRetailValue,
      totalCostValue,
      totalUnits,
      lowCount,
      outCount,
      excessCount,
    };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (q) {
          const matchesName = p.name.toLowerCase().includes(q);
          const matchesSku = p.sku.toLowerCase().includes(q);
          const matchesBarcode = (p.barcode || '').toLowerCase().includes(q);
          const matchesBrand = (p.brand || '').toLowerCase().includes(q);
          if (!matchesName && !matchesSku && !matchesBarcode && !matchesBrand) {
            return false;
          }
        }
        if (categoryFilter !== 'all' && p.category !== categoryFilter) {
          return false;
        }
        if (brandFilter !== 'all' && (p.brand || '') !== brandFilter) {
          return false;
        }
        if (statusFilter !== 'all' && getStockStatus(p).key !== statusFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortField === 'stock') cmp = a.currentStock - b.currentStock;
        else if (sortField === 'price') cmp = a.unitPrice - b.unitPrice;
        else if (sortField === 'value')
          cmp = a.currentStock * a.unitPrice - b.currentStock * b.unitPrice;
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [products, search, categoryFilter, brandFilter, statusFilter, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = useMemo(
    () => filteredProducts.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredProducts, safePage]
  );

  const detailForecast = useMemo(() => {
    if (!detailProduct) return null;
    const series = buildDailySeries(sales, [detailProduct.id], 60);
    return runDemandForecast({
      series,
      horizonDays: 30,
      currentStock: detailProduct.currentStock,
      modelType: 'auto',
      promoActive: detailProduct.promoActive,
      subjectLabel: detailProduct.name,
    });
  }, [detailProduct, sales]);

  const detailRec = useMemo(() => {
    if (!detailProduct) return null;
    return (
      generateRecommendations({
        business,
        products: [detailProduct],
        sales,
        statuses: {},
      })[0] || null
    );
  }, [detailProduct, business, sales]);

  const detailHistory = useMemo(() => {
    if (!detailProduct) return [];
    return sales
      .filter((s) => s.productId === detailProduct.id)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 12);
  }, [detailProduct, sales]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  const handleSortSelect = (val: string) => {
    const [field, dir] = val.split(':') as [SortField, 'asc' | 'desc'];
    setSortField(field);
    setSortDir(dir);
    setPage(1);
  };

  const toggleSelectAll = () => {
    const pageIds = pagedProducts.map((p) => p.id);
    const allSelected = pageIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setModalError(null);
    const num = Math.floor(200 + Math.random() * 799);
    setFormState({
      name: '',
      brand: '',
      packagingSize: '1 kg',
      sku: `FB-SKU-${num}`,
      barcode: `890149110${num}4`,
      category: categories[0] || SUPERMARKET_DEPARTMENTS[0].category,
      description: '',
      imageUrl: CATALOGUE_IMAGE_OPTIONS[0].url,
      currentStock: 30,
      minStockLevel: 15,
      reorderLevel: 25,
      maxStockLevel: 100,
      unitPrice: 120,
      unitCost: 92,
      supplierName: 'Primary Distributor',
      leadTimeDays: defaultLeadTimeDays,
      incomingStock: 0,
      expiryDate: '2027-06-30',
      seasonalTag: 'Year-Round',
      promoActive: false,
    });
    setShowFormModal(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setModalError(null);
    setFormState({
      name: p.name,
      brand: p.brand || '',
      packagingSize: p.packagingSize || 'Standard Pack',
      sku: p.sku,
      barcode: p.barcode || '',
      category: p.category,
      description: p.description || '',
      imageUrl: p.imageUrl || CATALOGUE_IMAGE_OPTIONS[0].url,
      currentStock: p.currentStock,
      minStockLevel: p.minStockLevel,
      reorderLevel: p.reorderLevel ?? Math.round(p.minStockLevel * 1.4),
      maxStockLevel: p.maxStockLevel,
      unitPrice: p.unitPrice,
      unitCost: p.unitCost,
      supplierName: p.supplierName,
      leadTimeDays: p.leadTimeDays,
      incomingStock: p.incomingStock,
      expiryDate: p.expiryDate || '',
      seasonalTag: p.seasonalTag,
      promoActive: p.promoActive,
    });
    setShowFormModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formState.minStockLevel > formState.maxStockLevel) {
      setModalError('Minimum stock threshold cannot exceed maximum stock capacity.');
      return;
    }
    if (formState.reorderLevel < formState.minStockLevel) {
      setModalError('Reorder level should be at least equal to minimum stock threshold.');
      return;
    }
    setBusy(true);
    setModalError(null);
    try {
      const payload: Partial<Product> = {
        ...formState,
        description: formState.description.trim() || undefined,
        expiryDate: formState.expiryDate.trim() || undefined,
      };
      if (editingProduct) {
        await onUpdateProduct(editingProduct.id, payload);
      } else {
        await onAddProduct(payload);
      }
      setShowFormModal(false);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;
    setBusy(true);
    try {
      await onDeleteProduct(deletingProduct.id);
      if (detailProductId === deletingProduct.id) setDetailProductId(null);
      setSelectedIds((prev) => prev.filter((id) => id !== deletingProduct.id));
      setDeletingProduct(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txProduct) return;
    setBusy(true);
    setModalError(null);
    try {
      await onRecordTransaction({
        productId: txProduct.id,
        quantitySold: txSold,
        quantityReceived: txReceived,
      });
      setTxProduct(null);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Unable to record transaction.');
    } finally {
      setBusy(false);
    }
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvText(reader.result);
        setModalError(null);
      }
    };
    reader.readAsText(file);
  };

  const handleCsvImport = async () => {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      setModalError('Provide a header row and at least one CSV product row.');
      return;
    }
    const headers = lines[0].split(',').map((h) => h.trim());
    const items: Array<Partial<Product>> = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = cols[idx] || '';
      });
      if (row.name) {
        items.push({
          sku: row.sku,
          barcode: row.barcode || '',
          name: row.name,
          brand: row.brand || 'Store Brand',
          packagingSize: row.packagingSize || 'Standard Pack',
          category: row.category || SUPERMARKET_DEPARTMENTS[0].category,
          imageUrl: row.imageUrl || CATALOGUE_IMAGE_OPTIONS[0].url,
          currentStock: Number(row.currentStock) || 0,
          minStockLevel: Number(row.minStockLevel) || 10,
          reorderLevel: Number(row.reorderLevel) || 18,
          unitPrice: Number(row.unitPrice) || 50,
          unitCost: Number(row.unitCost) || 35,
          supplierName: row.supplierName || 'Primary Distributor',
          leadTimeDays: Number(row.leadTimeDays) || defaultLeadTimeDays,
          expiryDate: row.expiryDate || undefined,
        });
      }
    }
    if (items.length === 0) {
      setModalError('No valid product rows with a "name" column were found.');
      return;
    }
    setBusy(true);
    setModalError(null);
    try {
      await onImportProducts(items);
      setShowImportModal(false);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'CSV import failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = (onlySelected = false) => {
    const source = onlySelected
      ? filteredProducts.filter((p) => selectedIds.includes(p.id))
      : filteredProducts;
    const header =
      'SKU,Barcode,Product,Brand,PackagingSize,Category,AvailableStock,MinimumStock,ReorderLevel,PurchasePriceINR,SellingPriceINR,InventoryValueINR,ExpiryDate,Supplier,Status,LastUpdated';
    const rows = source.map((p) => {
      const st = getStockStatus(p).label;
      const val = (p.currentStock * p.unitPrice).toFixed(2);
      return `${p.sku},"${p.barcode || ''}","${p.name.replace(/"/g, '""')}","${(p.brand || '').replace(/"/g, '""')}","${p.packagingSize || ''}","${p.category}",${p.currentStock},${p.minStockLevel},${p.reorderLevel ?? p.minStockLevel},${p.unitCost},${p.unitPrice},${val},"${p.expiryDate || 'N/A'}","${p.supplierName.replace(/"/g, '""')}",${st},${p.lastUpdated}`;
    });
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartstock-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setBrandFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const hasActiveFilters =
    search.trim() !== '' ||
    categoryFilter !== 'all' ||
    brandFilter !== 'all' ||
    statusFilter !== 'all';

  return (
    <div className="space-y-6 animate-view-enter">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#49383D] tracking-tight">
            Inventory Management
          </h2>
          <p className="text-sm text-[#81777A] mt-0.5">
            Shelf stock quantities, reorder thresholds, daily adjustments, expiry tracking, and replenishment ledger.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setModalError(null);
              setShowImportModal(true);
            }}
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleExportCsv(false)}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
          <Button size="sm" onClick={openAddModal}>
            <Plus className="w-3.5 h-3.5" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Catalogue KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SurfaceCard className="p-4 space-y-1">
          <div className="text-xs font-medium text-[#81777A]">Active Supermarket SKUs</div>
          <div className="font-mono font-bold text-2xl text-[#49383D] tabular-nums">
            {summaryStats.totalCount}
          </div>
          <div className="text-xs text-[#81777A] font-mono tabular-nums">
            {summaryStats.totalUnits.toLocaleString('en-IN')} total shelf units
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4 space-y-1">
          <div className="text-xs font-medium text-[#81777A]">Inventory Retail Valuation</div>
          <div className="font-mono font-bold text-2xl text-[#49383D] tabular-nums">
            {formatINRCompact(summaryStats.totalRetailValue)}
          </div>
          <div className="text-xs text-[#81777A] font-mono tabular-nums">
            Purchase basis: {formatINRCompact(summaryStats.totalCostValue)}
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4 space-y-1">
          <div className="text-xs font-medium text-[#81777A]">Reorder Attention</div>
          <div className="font-mono font-bold text-2xl text-[#9E7D4A] tabular-nums">
            {summaryStats.lowCount + summaryStats.outCount} SKUs
          </div>
          <div className="text-xs text-[#81777A] font-mono tabular-nums">
            {summaryStats.outCount} out of stock · {summaryStats.lowCount} low
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4 space-y-1">
          <div className="text-xs font-medium text-[#81777A]">Overstock / Categories</div>
          <div className="font-mono font-bold text-2xl text-[#64788A] tabular-nums">
            {summaryStats.excessCount} excess
          </div>
          <div className="text-xs text-[#81777A] font-mono tabular-nums">
            Across {categories.length} aisles · {brands.length} brands
          </div>
        </SurfaceCard>
      </div>

      {/* Filters, Search, Sort & Layout Toolbar */}
      <SurfaceCard className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-[#81777A] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search product name, SKU, brand, or barcode..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full h-10 pl-9 pr-3 text-sm bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg text-xs">
                <span className="font-mono font-semibold text-[#49383D]">
                  {selectedIds.length} selected
                </span>
                <button
                  type="button"
                  onClick={() => handleExportCsv(true)}
                  className="text-[#805F69] font-medium hover:text-[#49383D] hover:underline cursor-pointer"
                >
                  Export Selected
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-[#81777A] hover:text-[#49383D] cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}

            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 px-3 text-xs font-medium bg-white border border-[#E8DFE1] rounded-lg text-[#3F3437] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by brand"
              value={brandFilter}
              onChange={(e) => {
                setBrandFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 px-3 text-xs font-medium bg-white border border-[#E8DFE1] rounded-lg text-[#3F3437] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
            >
              <option value="all">All Brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <div className="relative flex items-center">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#81777A] absolute left-3 pointer-events-none" />
              <select
                aria-label="Sort products"
                value={`${sortField}:${sortDir}`}
                onChange={(e) => handleSortSelect(e.target.value)}
                className="h-10 pl-8 pr-3 text-xs font-medium bg-white border border-[#E8DFE1] rounded-lg text-[#3F3437] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
              >
                <option value="name:asc">Sort: Name (A–Z)</option>
                <option value="price:desc">Price: High to Low</option>
                <option value="price:asc">Price: Low to High</option>
                <option value="stock:desc">Quantity: High to Low</option>
                <option value="stock:asc">Quantity: Low to High</option>
                <option value="value:desc">Inventory Value: High to Low</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E8DFE1]">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg">
            {(
              [
                { id: 'all', label: 'All Status' },
                { id: 'healthy', label: 'Healthy' },
                { id: 'low', label: 'Low Stock' },
                { id: 'out', label: 'Out of Stock' },
                { id: 'excess', label: 'Excess' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setStatusFilter(st.id);
                  setPage(1);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === st.id
                    ? 'bg-[#E9DDE0] text-[#49383D] font-semibold'
                    : 'text-[#81777A] hover:text-[#49383D]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-medium text-[#805F69] hover:text-[#49383D] cursor-pointer"
              >
                Reset filters
              </button>
            )}

            <span className="text-xs font-mono text-[#81777A] tabular-nums">
              Showing {pagedProducts.length} of {filteredProducts.length} SKUs
            </span>

            <div className="flex items-center gap-1 p-1 bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg">
              {(
                [
                  { id: 'hybrid', label: 'Cards + Table', icon: LayoutGrid },
                  { id: 'cards', label: 'Cards', icon: LayoutGrid },
                  { id: 'table', label: 'Table', icon: List },
                ] as const
              ).map((mode) => {
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setViewLayout(mode.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      viewLayout === mode.id
                        ? 'bg-[#E9DDE0] text-[#49383D] font-semibold'
                        : 'text-[#81777A] hover:text-[#49383D]'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </SurfaceCard>

      {products.length === 0 ? (
        <EmptyStateCard
          icon={<Package className="w-5 h-5" />}
          title="Your inventory catalog is empty"
          description="Add your first product manually or bulk import a CSV file to begin tracking stock levels and demand."
          action={<Button onClick={openAddModal}>Add First Product</Button>}
        />
      ) : filteredProducts.length === 0 ? (
        <EmptyStateCard
          icon={<Search className="w-5 h-5" />}
          title="No matching supermarket products"
          description="Try clearing a brand, category, or stock status filter to inspect all inventory items."
          action={
            <Button variant="secondary" onClick={resetFilters}>
              Reset All Filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Visual Product Catalogue Cards */}
          {(viewLayout === 'hybrid' || viewLayout === 'cards') && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#81777A]">
                  Visual Shelf View ({pagedProducts.length})
                </h3>
                <span className="text-xs text-[#81777A]">
                  Click any product card to inspect 30-day forecast & unit economics
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {pagedProducts.map((p) => {
                  const status = getStockStatus(p);
                  return (
                    <SurfaceCard
                      key={p.id}
                      className="overflow-hidden flex flex-col justify-between hover:border-[#805F69]/50 transition-colors"
                    >
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            setDetailProductId(p.id);
                            setDetailTab('overview');
                          }}
                          className="block w-full aspect-[4/3] bg-white border-b border-[#E8DFE1] overflow-hidden cursor-pointer group"
                        >
                          <ProductImage
                            sku={p.sku}
                            src={p.imageUrl}
                            alt={p.name}
                            className="p-2.5 group-hover:scale-[1.03] transition-transform duration-300"
                          />
                        </button>

                        <div className="p-3.5 space-y-2">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="font-medium text-[#805F69] truncate">
                              {p.brand || p.category} · {p.packagingSize || 'Pack'}
                            </span>
                            <StatusLabel tone={status.tone} label={status.label} />
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setDetailProductId(p.id);
                              setDetailTab('overview');
                            }}
                            className="text-left font-display text-sm font-bold text-[#49383D] hover:text-[#805F69] leading-snug line-clamp-2 min-h-[2.4rem] cursor-pointer"
                          >
                            {p.name}
                          </button>

                          <div className="flex items-baseline justify-between gap-2 pt-1">
                            <div>
                              <div className="font-mono font-bold text-base text-[#49383D] tabular-nums">
                                {formatINR(p.unitPrice)}
                              </div>
                              <div className="text-[11px] text-[#81777A] font-mono">
                                Cost {formatINR(p.unitCost)}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="font-mono font-semibold text-sm text-[#49383D] tabular-nums">
                                {p.currentStock} units
                              </div>
                              <div className="text-[11px] text-[#81777A] font-mono tabular-nums">
                                Reorder @ {p.reorderLevel ?? p.minStockLevel}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="px-3.5 py-2.5 bg-[#FBF8F7]/70 border-t border-[#E8DFE1] flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-[#81777A] truncate">
                          {p.sku}
                        </span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setModalError(null);
                              setTxProduct(p);
                              setTxSold(0);
                              setTxReceived(0);
                            }}
                            title="Log Sale or Restock"
                            className="p-1.5 text-[#81777A] hover:text-[#779384] hover:bg-white rounded-md cursor-pointer"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            title="Edit Product"
                            className="p-1.5 text-[#81777A] hover:text-[#49383D] hover:bg-white rounded-md cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingProduct(p)}
                            title="Delete Product"
                            className="p-1.5 text-[#81777A] hover:text-[#A15E5E] hover:bg-white rounded-md cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </SurfaceCard>
                  );
                })}
              </div>
            </section>
          )}

          {/* Detailed Supermarket Inventory Ledger Table */}
          {(viewLayout === 'hybrid' || viewLayout === 'table') && (
            <section className="space-y-3">
              {viewLayout === 'hybrid' && (
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#81777A]">
                    Structured Inventory Ledger
                  </h3>
                  <span className="text-xs font-mono text-[#81777A] tabular-nums">
                    Total Stock Valuation: {formatINRCompact(filteredProducts.reduce((s, p) => s + p.currentStock * p.unitPrice, 0))}
                  </span>
                </div>
              )}

              <SurfaceCard className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#E8DFE1] bg-[#FBF8F7] text-[11px] font-semibold text-[#81777A]">
                        <th className="py-3 pl-4 pr-2 w-9">
                          <input
                            type="checkbox"
                            aria-label="Select all on page"
                            checked={
                              pagedProducts.length > 0 &&
                              pagedProducts.every((p) => selectedIds.includes(p.id))
                            }
                            onChange={toggleSelectAll}
                            className="accent-[#805F69]"
                          />
                        </th>
                        <th className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => toggleSort('name')}
                            className="inline-flex items-center gap-1 hover:text-[#49383D] cursor-pointer"
                          >
                            Product & Brand
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="py-3 px-4">SKU & Barcode</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => toggleSort('stock')}
                            className="inline-flex items-center gap-1 hover:text-[#49383D] cursor-pointer"
                          >
                            Stock / Reorder
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => toggleSort('price')}
                            className="inline-flex items-center gap-1 hover:text-[#49383D] cursor-pointer"
                          >
                            Selling / Cost
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => toggleSort('value')}
                            className="inline-flex items-center gap-1 hover:text-[#49383D] cursor-pointer"
                          >
                            Inventory Value
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="py-3 px-4">Expiry & Supplier</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DFE1] text-sm">
                      {pagedProducts.map((p) => {
                        const status = getStockStatus(p);
                        const stockVal = p.currentStock * p.unitPrice;
                        return (
                          <tr
                            key={p.id}
                            className="hover:bg-[#FBF8F7]/60 transition-colors"
                          >
                            <td className="py-3 pl-4 pr-2">
                              <input
                                type="checkbox"
                                aria-label={`Select ${p.name}`}
                                checked={selectedIds.includes(p.id)}
                                onChange={() => toggleSelectOne(p.id)}
                                className="accent-[#805F69]"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3 min-w-[230px]">
                                <div className="w-11 h-9 rounded-md overflow-hidden border border-[#E8DFE1] bg-white shrink-0">
                                  <ProductImage
                                    sku={p.sku}
                                    src={p.imageUrl}
                                    alt={p.name}
                                    className="p-0.5"
                                    iconClassName="w-4 h-4"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDetailProductId(p.id);
                                      setDetailTab('overview');
                                    }}
                                    className="font-medium text-[#49383D] hover:text-[#805F69] text-left truncate block max-w-[220px] cursor-pointer"
                                  >
                                    {p.name}
                                  </button>
                                  <div className="text-[11px] text-[#81777A] truncate">
                                    {p.brand || 'Standard'} · {p.packagingSize || '1 unit'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="font-mono text-xs font-medium text-[#49383D]">
                                {p.sku}
                              </div>
                              <div className="font-mono text-[11px] text-[#81777A]">
                                {p.barcode || '—'}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-xs text-[#81777A] whitespace-nowrap">
                              {p.category}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="font-mono font-semibold text-[#49383D] tabular-nums">
                                {p.currentStock} units
                              </div>
                              <div className="font-mono text-[11px] text-[#81777A] tabular-nums">
                                Min {p.minStockLevel} · Reorder {p.reorderLevel ?? p.minStockLevel}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="font-mono text-xs font-semibold text-[#49383D] tabular-nums">
                                {formatINR(p.unitPrice)}
                              </div>
                              <div className="font-mono text-[11px] text-[#81777A] tabular-nums">
                                Cost {formatINR(p.unitCost)}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-[#49383D] tabular-nums whitespace-nowrap">
                              {formatINRCompact(stockVal)}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="text-xs text-[#3F3437] max-w-[160px] truncate">
                                {p.supplierName}
                              </div>
                              <div className="font-mono text-[11px] text-[#81777A]">
                                {p.expiryDate ? `Exp ${p.expiryDate}` : 'Non-perishable'}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <StatusLabel tone={status.tone} label={status.label} />
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModalError(null);
                                    setTxProduct(p);
                                    setTxSold(0);
                                    setTxReceived(0);
                                  }}
                                  title="Log Sale or Restock"
                                  className="p-1.5 text-[#81777A] hover:text-[#779384] hover:bg-[#FBF8F7] rounded-md cursor-pointer"
                                >
                                  <ShoppingBag className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDetailProductId(p.id);
                                    setDetailTab('overview');
                                  }}
                                  title="Product Detail View"
                                  className="p-1.5 text-[#81777A] hover:text-[#805F69] hover:bg-[#FBF8F7] rounded-md cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditModal(p)}
                                  title="Edit Product"
                                  className="p-1.5 text-[#81777A] hover:text-[#49383D] hover:bg-[#FBF8F7] rounded-md cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingProduct(p)}
                                  title="Delete Product"
                                  className="p-1.5 text-[#81777A] hover:text-[#A15E5E] hover:bg-[#FBF8F7] rounded-md cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer */}
                {totalPages > 1 && (
                  <div className="px-4 py-3 border-t border-[#E8DFE1] bg-[#FBF8F7] flex items-center justify-between text-xs text-[#81777A]">
                    <span className="font-mono tabular-nums">
                      Page {safePage} of {totalPages}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={safePage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        Previous
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={safePage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Next
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </SurfaceCard>
            </section>
          )}
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {showFormModal && (
        <ModalDialog
          title={editingProduct ? `Edit ${editingProduct.name}` : 'Add New Supermarket Product'}
          subtitle="Configure brand, packaging, barcode, INR pricing, thresholds, and supplier details."
          maxWidth="max-w-2xl"
          onClose={() => setShowFormModal(false)}
        >
          <form onSubmit={handleSaveProduct} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
            {modalError && (
              <div className="text-xs text-[#8E4F4F] bg-[#F9EFEF] border border-[#E6CECE] rounded-lg px-3 py-2">
                {modalError}
              </div>
            )}

            <div className="grid sm:grid-cols-12 gap-3 items-start">
              <div className="sm:col-span-3">
                <div className="aspect-[4/3] rounded-lg border border-[#E8DFE1] overflow-hidden bg-white">
                  <ProductImage
                    sku={formState.sku}
                    src={formState.imageUrl}
                    alt={formState.name || 'Product preview'}
                    className="p-2"
                  />
                </div>
              </div>
              <div className="sm:col-span-9 space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="block text-xs font-medium text-[#3F3437]">Product Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Amul Taaza Toned Milk – 1 litre"
                      value={formState.name}
                      onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                      className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#3F3437]">Brand</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Amul"
                      value={formState.brand}
                      onChange={(e) => setFormState({ ...formState, brand: e.target.value })}
                      className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#3F3437]">Packaging Size</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., 500 g, 1 litre"
                      value={formState.packagingSize}
                      onChange={(e) => setFormState({ ...formState, packagingSize: e.target.value })}
                      className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#3F3437]">SKU</label>
                    <input
                      type="text"
                      required
                      value={formState.sku}
                      onChange={(e) => setFormState({ ...formState, sku: e.target.value })}
                      className="w-full h-10 px-3 text-sm font-mono bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#3F3437]">Barcode (EAN)</label>
                    <input
                      type="text"
                      required
                      value={formState.barcode}
                      onChange={(e) => setFormState({ ...formState, barcode: e.target.value })}
                      className="w-full h-10 px-3 text-sm font-mono bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Category</label>
                <input
                  type="text"
                  required
                  list="inventory-category-options"
                  value={formState.category}
                  onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                  className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
                <datalist id="inventory-category-options">
                  {SUPERMARKET_DEPARTMENTS.map((dept) => (
                    <option key={dept.id} value={dept.category} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Supplier Name</label>
                <input
                  type="text"
                  required
                  value={formState.supplierName}
                  onChange={(e) => setFormState({ ...formState, supplierName: e.target.value })}
                  className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#3F3437]">Description</label>
              <textarea
                rows={2}
                placeholder="Product packaging and shelf description..."
                value={formState.description}
                onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                className="w-full p-2.5 text-xs bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Available Stock</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={formState.currentStock}
                  onChange={(e) =>
                    setFormState({ ...formState, currentStock: Number(e.target.value) })
                  }
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Min Threshold</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={formState.minStockLevel}
                  onChange={(e) =>
                    setFormState({ ...formState, minStockLevel: Number(e.target.value) })
                  }
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Reorder Level</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={formState.reorderLevel}
                  onChange={(e) =>
                    setFormState({ ...formState, reorderLevel: Number(e.target.value) })
                  }
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Max Capacity</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formState.maxStockLevel}
                  onChange={(e) =>
                    setFormState({ ...formState, maxStockLevel: Number(e.target.value) })
                  }
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Selling Price (₹)</label>
                <input
                  type="number"
                  step="0.5"
                  min={1}
                  required
                  value={formState.unitPrice}
                  onChange={(e) =>
                    setFormState({ ...formState, unitPrice: Number(e.target.value) })
                  }
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Purchase Price (₹)</label>
                <input
                  type="number"
                  step="0.5"
                  min={1}
                  required
                  value={formState.unitCost}
                  onChange={(e) =>
                    setFormState({ ...formState, unitCost: Number(e.target.value) })
                  }
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Lead Time (d)</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={formState.leadTimeDays}
                  onChange={(e) =>
                    setFormState({ ...formState, leadTimeDays: Number(e.target.value) })
                  }
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Expiry Date</label>
                <input
                  type="date"
                  value={formState.expiryDate}
                  onChange={(e) =>
                    setFormState({ ...formState, expiryDate: e.target.value })
                  }
                  className="w-full h-10 px-3 text-sm font-mono bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Product Image Preset</label>
                <select
                  value={CATALOGUE_IMAGE_OPTIONS.some((p) => p.url === formState.imageUrl) ? formState.imageUrl : ''}
                  onChange={(e) => {
                    if (e.target.value) setFormState({ ...formState, imageUrl: e.target.value });
                  }}
                  className="w-full h-10 px-3 text-sm border border-[#E8DFE1] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                >
                  <option value="">Custom image URL</option>
                  {CATALOGUE_IMAGE_OPTIONS.map((img) => (
                    <option key={img.url} value={img.url}>
                      {img.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Image URL</label>
                <input
                  type="text"
                  value={formState.imageUrl}
                  onChange={(e) => setFormState({ ...formState, imageUrl: e.target.value })}
                  className="w-full h-10 px-3 text-xs font-mono bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 items-center">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Seasonal Profile</label>
                <select
                  value={formState.seasonalTag}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      seasonalTag: e.target.value as Product['seasonalTag'],
                    })
                  }
                  className="w-full h-10 px-3 text-sm border border-[#E8DFE1] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                >
                  <option value="Year-Round">Year-Round</option>
                  <option value="Holiday Peak">Holiday Peak</option>
                  <option value="Winter Seasonal">Winter Seasonal</option>
                  <option value="Summer Peak">Summer Peak</option>
                  <option value="Back-to-School">Back-to-School</option>
                </select>
              </div>

              <label className="flex items-center gap-2 pt-5 text-xs text-[#3F3437] cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.promoActive}
                  onChange={(e) =>
                    setFormState({ ...formState, promoActive: e.target.checked })
                  }
                  className="accent-[#805F69]"
                />
                Active promotional uplift (+15%)
              </label>
            </div>

            <div className="pt-3 border-t border-[#E8DFE1] flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowFormModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving...' : editingProduct ? 'Save Changes' : 'Add Product'}
              </Button>
            </div>
          </form>
        </ModalDialog>
      )}

      {/* Delete Confirmation Modal */}
      {deletingProduct && (
        <ModalDialog
          title={`Delete ${deletingProduct.name}?`}
          subtitle="This action cannot be undone."
          maxWidth="max-w-md"
          onClose={() => setDeletingProduct(null)}
        >
          <div className="p-6 space-y-4">
            <p className="text-sm text-[#81777A]">
              Removing SKU <strong className="font-mono text-[#49383D]">{deletingProduct.sku}</strong> permanently deletes its inventory record and historical sales ledger.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeletingProduct(null)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={busy} onClick={handleConfirmDelete}>
                {busy ? 'Deleting...' : 'Delete Product'}
              </Button>
            </div>
          </div>
        </ModalDialog>
      )}

      {/* Record Sale / Stock Receipt Modal */}
      {txProduct && (
        <ModalDialog
          title="Record Sale or Stock Receipt"
          subtitle={`${txProduct.name} · Currently ${txProduct.currentStock} units on hand`}
          maxWidth="max-w-md"
          onClose={() => setTxProduct(null)}
        >
          <form onSubmit={handleSaveTransaction} className="p-6 space-y-4">
            {modalError && (
              <div className="text-xs text-[#8E4F4F] bg-[#F9EFEF] border border-[#E6CECE] rounded-lg px-3 py-2">
                {modalError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Units Sold Today</label>
                <input
                  type="number"
                  min={0}
                  value={txSold}
                  onChange={(e) => setTxSold(Number(e.target.value))}
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">Units Received</label>
                <input
                  type="number"
                  min={0}
                  value={txReceived}
                  onChange={(e) => setTxReceived(Number(e.target.value))}
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setTxProduct(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="emerald" disabled={busy}>
                {busy ? 'Recording...' : 'Update Inventory & Sales'}
              </Button>
            </div>
          </form>
        </ModalDialog>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <ModalDialog
          title="Bulk Import Products (CSV)"
          subtitle="Upload a CSV file or paste structured INR supermarket rows."
          maxWidth="max-w-2xl"
          onClose={() => setShowImportModal(false)}
        >
          <div className="p-6 space-y-4">
            <p className="text-xs text-[#81777A]">
              Columns:{' '}
              <code className="font-mono text-[#49383D]">
                sku,barcode,name,brand,packagingSize,category,currentStock,minStockLevel,reorderLevel,unitPrice,unitCost,supplierName,leadTimeDays,expiryDate
              </code>
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileUpload}
              className="block w-full text-xs text-[#81777A] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-[#E8DFE1] file:text-xs file:font-medium file:bg-[#FBF8F7] file:text-[#49383D] hover:file:bg-[#E9DDE0]"
            />
            {modalError && (
              <div className="text-xs text-[#8E4F4F] bg-[#F9EFEF] border border-[#E6CECE] rounded-lg px-3 py-2">
                {modalError}
              </div>
            )}
            <textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full p-3 text-xs font-mono bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowImportModal(false)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={handleCsvImport}>
                {busy ? 'Importing...' : 'Import Products'}
              </Button>
            </div>
          </div>
        </ModalDialog>
      )}

      {/* Tabbed Product Detail Workspace Drawer */}
      {detailProduct && detailForecast && (
        <div className="fixed inset-0 z-50 bg-[#49383D]/50 flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto border-l border-[#E8DFE1] p-6 space-y-6 shadow-[0_20px_50px_rgba(73,56,61,0.18)] animate-view-enter">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E8DFE1]">
              <div className="flex items-start gap-4">
                <div className="w-24 h-20 rounded-xl border border-[#E8DFE1] overflow-hidden bg-white shrink-0">
                  <ProductImage
                    sku={detailProduct.sku}
                    src={detailProduct.imageUrl}
                    alt={detailProduct.name}
                    className="p-1.5"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#81777A]">
                    <span>{detailProduct.sku}</span>
                    <span aria-hidden="true">·</span>
                    <span>{detailProduct.category}</span>
                    <StatusLabel
                      tone={getStockStatus(detailProduct).tone}
                      label={getStockStatus(detailProduct).label}
                    />
                  </div>
                  <h3 className="font-display text-xl font-bold text-[#49383D]">
                    {detailProduct.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#81777A]">
                    <span>
                      Brand: <strong className="text-[#3F3437]">{detailProduct.brand || 'Standard'}</strong>
                    </span>
                    <span>
                      Pack: <strong className="text-[#3F3437]">{detailProduct.packagingSize || 'Unit'}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Barcode className="w-3.5 h-3.5" />
                      {detailProduct.barcode || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close product detail drawer"
                onClick={() => setDetailProductId(null)}
                className="p-1.5 text-[#81777A] hover:text-[#49383D] rounded-lg hover:bg-[#FBF8F7] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Drawer Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="emerald"
                size="sm"
                onClick={() => {
                  setModalError(null);
                  setTxProduct(detailProduct);
                  setTxSold(0);
                  setTxReceived(0);
                }}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                Log Sale / Restock
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openEditModal(detailProduct)}
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Product
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeletingProduct(detailProduct)}
              >
                <Trash2 className="w-3.5 h-3.5 text-[#A15E5E]" />
                Delete
              </Button>
            </div>

            {/* Workspace Tabs */}
            <div className="flex items-center gap-1 p-1 bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg">
              {(
                [
                  { id: 'overview', label: 'Overview' },
                  { id: 'forecast', label: 'Demand Forecast' },
                  { id: 'history', label: 'Movement History' },
                  { id: 'reorder', label: 'Reorder Math' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDetailTab(tab.id)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    detailTab === tab.id
                      ? 'bg-[#E9DDE0] text-[#49383D] font-semibold'
                      : 'text-[#81777A] hover:text-[#49383D]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {detailTab === 'overview' && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-3.5">
                    <div className="text-[#81777A]">Available Stock</div>
                    <div className="font-mono font-bold text-xl text-[#49383D] tabular-nums mt-0.5">
                      {detailProduct.currentStock}
                    </div>
                  </div>
                  <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-3.5">
                    <div className="text-[#81777A]">Inventory Value</div>
                    <div className="font-mono font-bold text-xl text-[#49383D] tabular-nums mt-0.5">
                      {formatINRCompact(detailProduct.currentStock * detailProduct.unitPrice)}
                    </div>
                  </div>
                  <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-3.5">
                    <div className="text-[#81777A]">30d Forecast</div>
                    <div className="font-mono font-bold text-xl text-[#805F69] tabular-nums mt-0.5">
                      {detailForecast.predictedTotal}
                    </div>
                  </div>
                  <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-3.5">
                    <div className="text-[#81777A]">Gross Margin</div>
                    <div className="font-mono font-bold text-xl text-[#779384] tabular-nums mt-0.5">
                      {Math.round(
                        ((detailProduct.unitPrice - detailProduct.unitCost) /
                          Math.max(1, detailProduct.unitPrice)) *
                          100
                      )}
                      %
                    </div>
                  </div>
                </div>

                <div className="border border-[#E8DFE1] rounded-xl divide-y divide-[#E8DFE1] text-xs">
                  <div className="px-4 py-3 flex justify-between">
                    <span className="text-[#81777A]">Brand & Packaging</span>
                    <span className="font-semibold text-[#49383D]">
                      {detailProduct.brand || 'Standard'} · {detailProduct.packagingSize || 'Unit'}
                    </span>
                  </div>
                  <div className="px-4 py-3 flex justify-between">
                    <span className="text-[#81777A]">EAN Barcode</span>
                    <span className="font-mono font-semibold text-[#49383D]">
                      {detailProduct.barcode || 'Not assigned'}
                    </span>
                  </div>
                  <div className="px-4 py-3 flex justify-between">
                    <span className="text-[#81777A]">Primary Supplier</span>
                    <span className="font-semibold text-[#49383D]">{detailProduct.supplierName}</span>
                  </div>
                  <div className="px-4 py-3 flex justify-between">
                    <span className="text-[#81777A]">Supplier Lead Time</span>
                    <span className="font-mono font-semibold text-[#49383D]">
                      {detailProduct.leadTimeDays} days
                    </span>
                  </div>
                  <div className="px-4 py-3 flex justify-between">
                    <span className="text-[#81777A]">Selling Price / Purchase Price (INR)</span>
                    <span className="font-mono font-semibold text-[#49383D]">
                      {formatINR(detailProduct.unitPrice)} / {formatINR(detailProduct.unitCost)}
                    </span>
                  </div>
                  <div className="px-4 py-3 flex justify-between">
                    <span className="text-[#81777A]">Min / Reorder / Max Thresholds</span>
                    <span className="font-mono font-semibold text-[#49383D]">
                      {detailProduct.minStockLevel} / {detailProduct.reorderLevel ?? detailProduct.minStockLevel} / {detailProduct.maxStockLevel} units
                    </span>
                  </div>
                  <div className="px-4 py-3 flex justify-between items-center">
                    <span className="text-[#81777A] inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Expiry Date
                    </span>
                    <span className="font-mono font-semibold text-[#49383D]">
                      {detailProduct.expiryDate || 'Not applicable (Non-perishable)'}
                    </span>
                  </div>
                  <div className="px-4 py-3 flex justify-between">
                    <span className="text-[#81777A]">Seasonal Profile</span>
                    <span className="font-semibold text-[#49383D]">{detailProduct.seasonalTag}</span>
                  </div>
                </div>
              </div>
            )}

            {detailTab === 'forecast' && (
              <div className="space-y-4">
                <div className="border border-[#E8DFE1] rounded-xl p-4">
                  <ForecastLineChart points={detailForecast.points} height={240} compact />
                </div>
                <p className="text-xs text-[#3F3437] leading-relaxed">
                  {detailForecast.explanation}
                </p>
                <div className="grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
                  <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-3">
                    <div className="text-[#81777A] font-sans">Avg Daily</div>
                    <div className="font-bold text-sm text-[#49383D] mt-0.5">
                      {detailForecast.avgDailySales.toFixed(1)}/d
                    </div>
                  </div>
                  <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-3">
                    <div className="text-[#81777A] font-sans">RMSE</div>
                    <div className="font-bold text-sm text-[#49383D] mt-0.5">
                      {detailForecast.rmse}
                    </div>
                  </div>
                  <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-3">
                    <div className="text-[#81777A] font-sans">Depletion</div>
                    <div className="font-bold text-sm text-[#49383D] mt-0.5">
                      {detailForecast.expectedDepletionDays !== null
                        ? `${detailForecast.expectedDepletionDays}d`
                        : 'Covered'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {detailTab === 'history' && (
              <div className="border border-[#E8DFE1] rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#FBF8F7] border-b border-[#E8DFE1] text-[#81777A]">
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4 text-right">Sold</th>
                      <th className="py-2.5 px-4 text-right">Received</th>
                      <th className="py-2.5 px-4 text-right">Revenue (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8DFE1] font-mono tabular-nums">
                    {detailHistory.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center font-sans text-[#81777A]">
                          No transactions recorded yet.
                        </td>
                      </tr>
                    ) : (
                      detailHistory.map((h) => (
                        <tr key={h.id}>
                          <td className="py-2.5 px-4 text-[#81777A]">{h.date}</td>
                          <td className="py-2.5 px-4 text-right text-[#49383D]">
                            {h.quantitySold}
                          </td>
                          <td className="py-2.5 px-4 text-right text-[#779384]">
                            {h.quantityReceived > 0 ? `+${h.quantityReceived}` : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right text-[#49383D]">
                            {formatINR(h.revenue, 2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {detailTab === 'reorder' && (
              <div className="space-y-3 text-xs">
                {detailRec ? (
                  <>
                    <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-xl p-4 space-y-2">
                      <div className="font-semibold text-[#49383D]">{detailRec.reason}</div>
                      <p className="text-[#81777A]">{detailRec.suggestedAction}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 font-mono tabular-nums">
                      <div className="border border-[#E8DFE1] rounded-lg p-3">
                        <div className="text-[#81777A] font-sans">Reorder Point</div>
                        <div className="font-bold text-base text-[#49383D] mt-0.5">
                          {detailRec.math.reorderPoint} units
                        </div>
                      </div>
                      <div className="border border-[#E8DFE1] rounded-lg p-3">
                        <div className="text-[#81777A] font-sans">Recommended Order</div>
                        <div className="font-bold text-base text-[#779384] mt-0.5">
                          {detailRec.recommendedOrderQty} units
                        </div>
                      </div>
                      <div className="border border-[#E8DFE1] rounded-lg p-3">
                        <div className="text-[#81777A] font-sans">Est. Order Cost</div>
                        <div className="font-bold text-base text-[#49383D] mt-0.5">
                          {formatINRCompact(detailRec.recommendedOrderQty * detailProduct.unitCost)}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-[#81777A]">
                    Inventory levels for {detailProduct.name} are currently optimal with no immediate reorder needed.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
