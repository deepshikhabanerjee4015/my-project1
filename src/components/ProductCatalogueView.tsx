import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Apple,
  ArrowRight,
  Baby,
  Barcode,
  Calendar,
  Candy,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Cookie,
  Croissant,
  Download,
  Edit3,
  Eye,
  Filter,
  Flame,
  Lamp,
  LayoutGrid,
  List,
  Milk,
  Package,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  SprayCan,
  Trash2,
  TrendingUp,
  Upload,
  Wheat,
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
import {
  buildDailySeries,
  generateRecommendations,
  runDemandForecast,
} from '../lib/forecasting';
import type {
  AppView,
  BusinessProfile,
  Product,
  SalesRecord,
  SmartRecommendation,
} from '../types/inventory';

interface ProductCatalogueViewProps {
  business: BusinessProfile;
  products: Product[];
  sales: SalesRecord[];
  defaultLeadTimeDays: number;
  initialProductId?: string;
  purchaseDraftIds: string[];
  onNavigate: (view: AppView, productId?: string) => void;
  onAddProduct: (product: Partial<Product>) => Promise<void>;
  onUpdateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onRecordTransaction: (payload: {
    productId: string;
    quantitySold: number;
    quantityReceived: number;
  }) => Promise<void>;
  onImportProducts: (items: Array<Partial<Product>>) => Promise<void>;
  onAddToPurchasePlan: (rec: SmartRecommendation) => void;
}

type StockFilter = 'all' | 'healthy' | 'low' | 'out' | 'excess';
type PricePreset = 'all' | 'under50' | '50to150' | '150to300' | 'over300' | 'custom';
type SortField = 'name' | 'price' | 'stock' | 'value';
type ViewMode = 'grid' | 'list';
type PageSizeOption = 24 | 48 | 'all';

function getStockStatus(p: Product): {
  key: Exclude<StockFilter, 'all'>;
  label: string;
  tone: 'healthy' | 'warning' | 'critical' | 'info';
} {
  if (p.currentStock === 0) {
    return { key: 'out', label: 'Out of Stock', tone: 'critical' };
  }
  if (
    p.currentStock <= p.minStockLevel ||
    p.currentStock <= (p.reorderLevel ?? p.minStockLevel)
  ) {
    return { key: 'low', label: 'Low Stock', tone: 'warning' };
  }
  if (p.currentStock > p.maxStockLevel) {
    return { key: 'excess', label: 'Excess Stock', tone: 'info' };
  }
  return { key: 'healthy', label: 'Healthy', tone: 'healthy' };
}

function getDepartmentIcon(category: string): React.ComponentType<{ className?: string }> {
  switch (category) {
    case 'Groceries & Staples':
      return Wheat;
    case 'Spices & Condiments':
      return Flame;
    case 'Dairy & Refrigerated Products':
      return Milk;
    case 'Bakery & Breakfast':
      return Croissant;
    case 'Snacks & Biscuits':
      return Cookie;
    case 'Chocolates & Confectionery':
      return Candy;
    case 'Beverages':
      return Coffee;
    case 'Personal Care & Beauty':
      return Sparkles;
    case 'Household Cleaning':
      return SprayCan;
    case 'Fresh Fruits & Vegetables':
      return Apple;
    case 'Baby Care':
      return Baby;
    case 'Home & Kitchen Essentials':
      return Lamp;
    default:
      return Package;
  }
}

export const ProductCatalogueView: React.FC<ProductCatalogueViewProps> = ({
  business,
  products,
  sales,
  defaultLeadTimeDays,
  initialProductId,
  purchaseDraftIds,
  onNavigate,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onRecordTransaction,
  onImportProducts,
  onAddToPurchasePlan,
}) => {
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [brandFilter, setBrandFilter] = useState('all');
  const [pricePreset, setPricePreset] = useState<PricePreset>('all');
  const [customMinPrice, setCustomMinPrice] = useState('');
  const [customMaxPrice, setCustomMaxPrice] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(24);

  const [detailProductId, setDetailProductId] = useState<string | null>(
    initialProductId || null
  );
  const [detailTab, setDetailTab] = useState<'overview' | 'forecast' | 'reorder'>('overview');

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [txProduct, setTxProduct] = useState<Product | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const categoryMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialProductId) {
      setDetailProductId(initialProductId);
      setDetailTab('overview');
    }
  }, [initialProductId]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setSearchFocused(false);
      }
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(target)) {
        setShowCategoryMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const [formState, setFormState] = useState({
    name: '',
    brand: '',
    packagingSize: '1 kg',
    sku: '',
    barcode: '',
    category: SUPERMARKET_DEPARTMENTS[0].category,
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
    expiryDate: '',
    seasonalTag: 'Year-Round' as Product['seasonalTag'],
    promoActive: false,
  });

  const [txSold, setTxSold] = useState(0);
  const [txReceived, setTxReceived] = useState(0);
  const [csvText, setCsvText] = useState(
    'sku,barcode,name,brand,packagingSize,category,currentStock,minStockLevel,reorderLevel,unitPrice,unitCost,supplierName,leadTimeDays,expiryDate,description\nFB-GRC-199,8901491109901,Fortune Sunlite Refined Oil – 1 litre,Fortune,1 litre,Groceries & Staples,36,15,24,148,124,Adani Wilmar Distributors,4,2027-06-30,Light and healthy refined sunflower cooking oil for everyday cooking.\nFB-BEV-299,8901058899202,Paper Boat Swing Mixed Fruit – 1 litre,Paper Boat,1 litre,Beverages,28,12,20,115,84,Hector Beverages Supply,3,2027-04-20,Rich mixed fruit nectar packed in family-size aseptic carton.'
  );

  const departmentItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      counts.set(p.category, (counts.get(p.category) || 0) + 1);
    }

    const list = SUPERMARKET_DEPARTMENTS.map((dept) => ({
      id: dept.id,
      category: dept.category,
      shortLabel: dept.shortLabel,
      description: dept.description,
      count: counts.get(dept.category) || 0,
    }));

    const knownSet = new Set(SUPERMARKET_DEPARTMENTS.map((d) => d.category));
    for (const [category, count] of counts.entries()) {
      if (!knownSet.has(category)) {
        list.push({
          id: category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          category,
          shortLabel: category,
          description: `${category} assortment`,
          count,
        });
      }
    }

    return list;
  }, [products]);

  const brands = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((p) => p.brand)
            .filter((b): b is string => Boolean(b && b.trim()))
        )
      ).sort(),
    [products]
  );

  const summaryStats = useMemo(() => {
    const categoriesSet = new Set<string>();
    let activeProducts = 0;
    let lowCount = 0;
    let outCount = 0;
    let totalUnits = 0;
    let totalRetailValue = 0;

    for (const p of products) {
      categoriesSet.add(p.category);
      totalUnits += p.currentStock;
      totalRetailValue += p.currentStock * p.unitPrice;
      if (p.currentStock > 0) activeProducts += 1;
      const status = getStockStatus(p).key;
      if (status === 'out') outCount += 1;
      else if (status === 'low') lowCount += 1;
    }

    return {
      totalProducts: products.length,
      totalCategories: categoriesSet.size,
      activeProducts,
      lowStockProducts: lowCount + outCount,
      lowCount,
      outCount,
      totalUnits,
      totalRetailValue,
    };
  }, [products]);

  const liveSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.brand || '').toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode || '').toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [products, search]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minCustom = customMinPrice.trim() ? Number(customMinPrice) : null;
    const maxCustom = customMaxPrice.trim() ? Number(customMaxPrice) : null;

    return products
      .filter((p) => {
        if (q) {
          const matches =
            p.name.toLowerCase().includes(q) ||
            (p.brand || '').toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.barcode || '').toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q);
          if (!matches) return false;
        }

        if (
          selectedCategories.length > 0 &&
          !selectedCategories.includes(p.category)
        ) {
          return false;
        }

        if (brandFilter !== 'all' && (p.brand || '') !== brandFilter) {
          return false;
        }

        if (pricePreset === 'under50' && p.unitPrice >= 50) return false;
        if (pricePreset === '50to150' && (p.unitPrice < 50 || p.unitPrice > 150)) {
          return false;
        }
        if (pricePreset === '150to300' && (p.unitPrice <= 150 || p.unitPrice > 300)) {
          return false;
        }
        if (pricePreset === 'over300' && p.unitPrice <= 300) return false;
        if (pricePreset === 'custom') {
          if (minCustom !== null && !Number.isNaN(minCustom) && p.unitPrice < minCustom) {
            return false;
          }
          if (maxCustom !== null && !Number.isNaN(maxCustom) && p.unitPrice > maxCustom) {
            return false;
          }
        }

        if (stockFilter !== 'all' && getStockStatus(p).key !== stockFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortField === 'price') cmp = a.unitPrice - b.unitPrice;
        else if (sortField === 'stock') cmp = a.currentStock - b.currentStock;
        else if (sortField === 'value') {
          cmp = a.currentStock * a.unitPrice - b.currentStock * b.unitPrice;
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [
    products,
    search,
    selectedCategories,
    brandFilter,
    pricePreset,
    customMinPrice,
    customMaxPrice,
    stockFilter,
    sortField,
    sortDir,
  ]);

  const effectivePageSize =
    pageSize === 'all' ? Math.max(1, filteredProducts.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / effectivePageSize));
  const safePage = Math.min(page, totalPages);

  const pagedProducts = useMemo(() => {
    if (pageSize === 'all') return filteredProducts;
    return filteredProducts.slice(
      (safePage - 1) * effectivePageSize,
      safePage * effectivePageSize
    );
  }, [filteredProducts, pageSize, safePage, effectivePageSize]);

  const detailProduct = useMemo(
    () => products.find((p) => p.id === detailProductId) || null,
    [products, detailProductId]
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
      .slice(0, 10);
  }, [detailProduct, sales]);

  const selectSingleCategory = (cat: string | null) => {
    if (!cat) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories([cat]);
    }
    setPage(1);
  };

  const toggleMultiCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
    setPage(1);
  };

  const handleSortSelect = (val: string) => {
    const [field, dir] = val.split(':') as [SortField, 'asc' | 'desc'];
    setSortField(field);
    setSortDir(dir);
    setPage(1);
  };

  const resetAllFilters = () => {
    setSearch('');
    setSelectedCategories([]);
    setBrandFilter('all');
    setPricePreset('all');
    setCustomMinPrice('');
    setCustomMaxPrice('');
    setStockFilter('all');
    setPage(1);
  };

  const hasActiveFilters =
    search.trim() !== '' ||
    selectedCategories.length > 0 ||
    brandFilter !== 'all' ||
    pricePreset !== 'all' ||
    stockFilter !== 'all';

  const openAddModal = () => {
    setEditingProduct(null);
    setModalError(null);
    const num = Math.floor(200 + Math.random() * 799);
    setFormState({
      name: '',
      brand: '',
      packagingSize: '1 kg',
      sku: `FB-CAT-${num}`,
      barcode: `890149110${num}4`,
      category:
        selectedCategories.length === 1
          ? selectedCategories[0]
          : SUPERMARKET_DEPARTMENTS[0].category,
      description: '',
      imageUrl: CATALOGUE_IMAGE_OPTIONS[0].url,
      currentStock: 35,
      minStockLevel: 15,
      reorderLevel: 25,
      maxStockLevel: 120,
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
          description: row.description || undefined,
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

  const handleExportCatalogue = () => {
    const header =
      'SKU,Barcode,Product,Brand,PackagingSize,Category,SellingPriceINR,PurchasePriceINR,AvailableStock,MinimumStock,ReorderLevel,InventoryValueINR,ExpiryDate,Supplier,Status,Description';
    const rows = filteredProducts.map((p) => {
      const st = getStockStatus(p).label;
      const val = (p.currentStock * p.unitPrice).toFixed(2);
      return `${p.sku},"${p.barcode || ''}","${p.name.replace(/"/g, '""')}","${(
        p.brand || ''
      ).replace(/"/g, '""')}","${p.packagingSize || ''}","${p.category}",${
        p.unitPrice
      },${p.unitCost},${p.currentStock},${p.minStockLevel},${
        p.reorderLevel ?? p.minStockLevel
      },${val},"${p.expiryDate || 'N/A'}","${p.supplierName.replace(
        /"/g,
        '""'
      )}",${st},"${(p.description || '').replace(/"/g, '""')}"`;
    });
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartstock-product-catalogue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: Array<number | 'ellipsis'> = [1];
    const start = Math.max(2, safePage - 1);
    const end = Math.min(totalPages - 1, safePage + 1);
    if (start > 2) pages.push('ellipsis');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  }, [totalPages, safePage]);

  const startIndex = pageSize === 'all' ? 1 : (safePage - 1) * effectivePageSize + 1;
  const endIndex =
    pageSize === 'all'
      ? filteredProducts.length
      : Math.min(filteredProducts.length, safePage * effectivePageSize);

  return (
    <div className="space-y-6 animate-view-enter">
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[26px] font-bold text-[#49383D] tracking-tight">
            Explore Product Catalogue
          </h1>
          <p className="text-sm text-[#81777A] mt-0.5">
            A complete view of your retail products, categories and inventory.
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
            Import Products
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportCatalogue}>
            <Download className="w-3.5 h-3.5" />
            Export Catalogue
          </Button>
          <Button size="sm" onClick={openAddModal}>
            <Plus className="w-3.5 h-3.5" />
            Add Product
          </Button>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SurfaceCard className="p-4 space-y-1">
          <div className="text-xs font-medium text-[#81777A]">Total Products</div>
          <div className="font-mono font-bold text-2xl text-[#49383D] tabular-nums">
            {summaryStats.totalProducts}
          </div>
          <div className="text-xs text-[#81777A] font-mono tabular-nums">
            {summaryStats.totalUnits.toLocaleString('en-IN')} units ·{' '}
            {formatINRCompact(summaryStats.totalRetailValue)}
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4 space-y-1">
          <div className="text-xs font-medium text-[#81777A]">Total Categories</div>
          <div className="font-mono font-bold text-2xl text-[#49383D] tabular-nums">
            {summaryStats.totalCategories}
          </div>
          <div className="text-xs text-[#81777A] font-mono tabular-nums">
            {brands.length} stocked brands
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4 space-y-1">
          <div className="text-xs font-medium text-[#81777A]">Active Products</div>
          <div className="font-mono font-bold text-2xl text-[#779384] tabular-nums">
            {summaryStats.activeProducts}
          </div>
          <div className="text-xs text-[#81777A] font-mono tabular-nums">
            {summaryStats.totalProducts > 0
              ? `${Math.round(
                  (summaryStats.activeProducts / summaryStats.totalProducts) * 100
                )}% in stock on shelf`
              : 'No SKUs'}
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-4 space-y-1">
          <div className="text-xs font-medium text-[#81777A]">Low Stock Products</div>
          <div className="font-mono font-bold text-2xl text-[#9E7D4A] tabular-nums">
            {summaryStats.lowStockProducts}
          </div>
          <div className="text-xs text-[#81777A] font-mono tabular-nums">
            {summaryStats.outCount} out of stock · {summaryStats.lowCount} low
          </div>
        </SurfaceCard>
      </div>

      {/* Category Navigation Bar */}
      <SurfaceCard className="p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#81777A]">
            Supermarket Departments ({departmentItems.length})
          </span>
          {selectedCategories.length > 0 && (
            <button
              type="button"
              onClick={() => selectSingleCategory(null)}
              className="text-xs font-medium text-[#805F69] hover:text-[#49383D] cursor-pointer"
            >
              Show All Departments
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => selectSingleCategory(null)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              selectedCategories.length === 0
                ? 'bg-[#49383D] text-white border-[#49383D]'
                : 'bg-[#F7F3F1] text-[#3F3437] border-[#E8DFE1] hover:bg-[#FBF8F7] hover:border-[#B99AA0]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
            <span>All Products</span>
            <span
              className={`font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded ${
                selectedCategories.length === 0
                  ? 'bg-white/15 text-white'
                  : 'bg-white text-[#805F69]'
              }`}
            >
              {products.length}
            </span>
          </button>

          {departmentItems.map((dept) => {
            const Icon = getDepartmentIcon(dept.category);
            const isSelected = selectedCategories.includes(dept.category);
            return (
              <button
                key={dept.id}
                type="button"
                onClick={() => selectSingleCategory(dept.category)}
                title={dept.category}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-[#49383D] text-white border-[#49383D]'
                    : 'bg-white text-[#3F3437] border-[#E8DFE1] hover:bg-[#FBF8F7] hover:border-[#B99AA0]'
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isSelected ? 'text-[#B99AA0]' : 'text-[#805F69]'
                  }`}
                />
                <span>{dept.shortLabel}</span>
                <span
                  className={`font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded ${
                    isSelected
                      ? 'bg-white/15 text-white'
                      : 'bg-[#FBF8F7] text-[#805F69]'
                  }`}
                >
                  {dept.count}
                </span>
              </button>
            );
          })}
        </div>
      </SurfaceCard>

      {/* Search, Multi-Filters, Sorting & Grid/List Toolbar */}
      <SurfaceCard className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Large Search Bar with Live Suggestions */}
          <div className="relative flex-1 min-w-[260px] max-w-xl" ref={searchContainerRef}>
            <Search className="w-4 h-4 text-[#81777A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search products, brands, SKUs, or barcodes..."
              value={search}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => {
                setSearch(e.target.value);
                setSearchFocused(true);
                setPage(1);
              }}
              className="w-full h-10 pl-10 pr-9 text-sm bg-white border border-[#E8DFE1] rounded-lg text-[#3F3437] placeholder:text-[#A69B9E] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#81777A] hover:text-[#49383D] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {searchFocused && search.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-11 bg-white border border-[#E8DFE1] rounded-xl shadow-lg z-30 overflow-hidden">
                {liveSuggestions.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-[#81777A]">
                    No products match &ldquo;{search}&rdquo;
                  </div>
                ) : (
                  <div className="divide-y divide-[#E8DFE1]">
                    {liveSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setDetailProductId(item.id);
                          setDetailTab('overview');
                          setSearchFocused(false);
                        }}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-[#FBF8F7]/70 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-8 rounded border border-[#E8DFE1] overflow-hidden shrink-0">
                            <ProductImage
                              sku={item.sku}
                              src={item.imageUrl}
                              alt={item.name}
                              className="p-0.5"
                              iconClassName="w-4 h-4"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#49383D] truncate">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-[#81777A] truncate">
                              {item.brand} · <span className="font-mono">{item.sku}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-xs font-semibold text-[#49383D] tabular-nums">
                            {formatINR(item.unitPrice)}
                          </div>
                          <div className="font-mono text-[10px] text-[#81777A] tabular-nums">
                            {item.currentStock} in stock
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Multi-select Categories Popover */}
            <div className="relative" ref={categoryMenuRef}>
              <button
                type="button"
                onClick={() => setShowCategoryMenu((v) => !v)}
                className="h-10 px-3 inline-flex items-center gap-2 text-xs font-medium bg-white border border-[#E8DFE1] rounded-lg text-[#3F3437] hover:bg-[#FBF8F7]/60 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Filter className="w-3.5 h-3.5 text-[#805F69]" />
                <span>
                  {selectedCategories.length === 0
                    ? 'Categories: All'
                    : selectedCategories.length === 1
                    ? selectedCategories[0]
                    : `${selectedCategories.length} Categories`}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-[#81777A]" />
              </button>

              {showCategoryMenu && (
                <div className="absolute right-0 top-11 w-68 bg-white border border-[#E8DFE1] rounded-xl shadow-lg z-30 p-2 space-y-1">
                  <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#E8DFE1]">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#81777A]">
                      Filter Departments
                    </span>
                    {selectedCategories.length > 0 && (
                      <button
                        type="button"
                        onClick={() => selectSingleCategory(null)}
                        className="text-[11px] font-medium text-[#805F69] hover:text-[#49383D] cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-[#E8DFE1]/50">
                    {departmentItems.map((dept) => {
                      const checked = selectedCategories.includes(dept.category);
                      return (
                        <button
                          key={dept.id}
                          type="button"
                          onClick={() => toggleMultiCategory(dept.category)}
                          className="w-full px-2.5 py-2 text-left text-xs flex items-center justify-between gap-2 rounded-md hover:bg-[#FBF8F7] cursor-pointer"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                checked
                                  ? 'bg-[#805F69] border-[#805F69] text-white'
                                  : 'border-[#D8CCD0] bg-white'
                              }`}
                            >
                              {checked && <Check className="w-3 h-3" />}
                            </span>
                            <span className="truncate text-[#3F3437]">{dept.category}</span>
                          </span>
                          <span className="font-mono text-[11px] text-[#81777A] tabular-nums">
                            {dept.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Brand Filter */}
            <select
              aria-label="Filter by brand"
              value={brandFilter}
              onChange={(e) => {
                setBrandFilter(e.target.value);
                setPage(1);
              }}
              className="h-10 px-3 text-xs font-medium bg-white border border-[#E8DFE1] rounded-lg text-[#3F3437] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
            >
              <option value="all">All Brands ({brands.length})</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            {/* Price Range Filter */}
            <select
              aria-label="Filter by price range"
              value={pricePreset}
              onChange={(e) => {
                setPricePreset(e.target.value as PricePreset);
                setPage(1);
              }}
              className="h-10 px-3 text-xs font-medium bg-white border border-[#E8DFE1] rounded-lg text-[#3F3437] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
            >
              <option value="all">All Prices</option>
              <option value="under50">Under ₹50</option>
              <option value="50to150">₹50 – ₹150</option>
              <option value="150to300">₹150 – ₹300</option>
              <option value="over300">Over ₹300</option>
              <option value="custom">Custom ₹ Range</option>
            </select>

            {/* Sort Selector */}
            <div className="relative flex items-center">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#81777A] absolute left-3 pointer-events-none" />
              <select
                aria-label="Sort products"
                value={`${sortField}:${sortDir}`}
                onChange={(e) => handleSortSelect(e.target.value)}
                className="h-10 pl-8 pr-3 text-xs font-medium bg-white border border-[#E8DFE1] rounded-lg text-[#3F3437] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
              >
                <option value="name:asc">Sort: Name (A–Z)</option>
                <option value="name:desc">Sort: Name (Z–A)</option>
                <option value="price:asc">Price: Low to High</option>
                <option value="price:desc">Price: High to Low</option>
                <option value="stock:asc">Stock: Low to High</option>
                <option value="stock:desc">Stock: High to Low</option>
                <option value="value:desc">Inventory Value: High to Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* Custom INR Min/Max inputs if chosen */}
        {pricePreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[#E8DFE1] text-xs">
            <span className="font-medium text-[#81777A]">Custom Price Range (₹):</span>
            <input
              type="number"
              min={0}
              placeholder="Min ₹"
              value={customMinPrice}
              onChange={(e) => {
                setCustomMinPrice(e.target.value);
                setPage(1);
              }}
              className="w-24 h-8 px-2.5 font-mono bg-white border border-[#E8DFE1] rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#805F69]"
            />
            <span className="text-[#81777A]">to</span>
            <input
              type="number"
              min={0}
              placeholder="Max ₹"
              value={customMaxPrice}
              onChange={(e) => {
                setCustomMaxPrice(e.target.value);
                setPage(1);
              }}
              className="w-24 h-8 px-2.5 font-mono bg-white border border-[#E8DFE1] rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-[#805F69]"
            />
          </div>
        )}

        {/* Stock Status Tabs + View Mode + Page Size */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E8DFE1]">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg">
            {(
              [
                { id: 'all', label: 'All Availability' },
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
                  setStockFilter(st.id);
                  setPage(1);
                }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  stockFilter === st.id
                    ? 'bg-[#E9DDE0] text-[#49383D] font-semibold'
                    : 'text-[#81777A] hover:text-[#49383D]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-xs font-medium text-[#805F69] hover:text-[#49383D] cursor-pointer"
              >
                Reset filters
              </button>
            )}

            <span className="text-xs font-mono text-[#81777A] tabular-nums">
              {filteredProducts.length === 0
                ? '0 products'
                : `Showing ${startIndex}–${endIndex} of ${filteredProducts.length} products`}
            </span>

            <select
              aria-label="Products per page"
              value={String(pageSize)}
              onChange={(e) => {
                const v = e.target.value;
                setPageSize(v === 'all' ? 'all' : (Number(v) as 24 | 48));
                setPage(1);
              }}
              className="h-8 px-2 text-xs font-mono bg-white border border-[#E8DFE1] rounded-lg text-[#3F3437] focus:outline-none focus:ring-2 focus:ring-[#805F69]"
            >
              <option value="24">24 / page</option>
              <option value="48">48 / page</option>
              <option value="all">Show All</option>
            </select>

            <div className="flex items-center gap-1 p-1 bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-[#E9DDE0] text-[#49383D] font-semibold'
                    : 'text-[#81777A] hover:text-[#49383D]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-[#E9DDE0] text-[#49383D] font-semibold'
                    : 'text-[#81777A] hover:text-[#49383D]'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                List
              </button>
            </div>
          </div>
        </div>
      </SurfaceCard>

      {/* Catalogue Display */}
      {products.length === 0 ? (
        <EmptyStateCard
          icon={<Package className="w-5 h-5" />}
          title="Your product catalogue is empty"
          description="Add your first supermarket SKU manually or import a CSV sheet to start managing your catalogue."
          action={<Button onClick={openAddModal}>Add First Product</Button>}
        />
      ) : filteredProducts.length === 0 ? (
        <EmptyStateCard
          icon={<Search className="w-5 h-5" />}
          title="No matching products found"
          description="Try adjusting your department, brand, price range, or stock availability filters."
          action={
            <Button variant="secondary" onClick={resetAllFilters}>
              Clear All Filters
            </Button>
          }
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {pagedProducts.map((p) => {
            const status = getStockStatus(p);
            return (
              <SurfaceCard
                key={p.id}
                className="overflow-hidden flex flex-col justify-between hover:border-[#805F69]/60 transition-colors group"
              >
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setDetailProductId(p.id);
                      setDetailTab('overview');
                    }}
                    className="block w-full aspect-[4/3] bg-white border-b border-[#E8DFE1] overflow-hidden cursor-pointer"
                  >
                    <ProductImage
                      sku={p.sku}
                      src={p.imageUrl}
                      alt={`${p.name} (${p.brand || p.category})`}
                      className="p-3 group-hover:scale-[1.03] transition-transform duration-300"
                      showFallbackSku
                    />
                  </button>

                  <div className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-medium text-[#805F69] truncate">
                        {p.brand || 'Supermarket'} · {p.packagingSize || 'Pack'}
                      </span>
                      <StatusLabel tone={status.tone} label={status.label} />
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setDetailProductId(p.id);
                        setDetailTab('overview');
                      }}
                      className="text-left font-display text-[15px] font-bold text-[#49383D] hover:text-[#805F69] leading-snug line-clamp-2 min-h-[2.6rem] cursor-pointer"
                    >
                      {p.name}
                    </button>

                    <div className="text-[11px] text-[#81777A] truncate">
                      {p.category}
                    </div>

                    <div className="flex items-baseline justify-between gap-2 pt-1 border-t border-[#E8DFE1]/70">
                      <div>
                        <div className="font-mono font-bold text-lg text-[#49383D] tabular-nums">
                          {formatINR(p.unitPrice)}
                        </div>
                        <div className="text-[11px] text-[#81777A] font-mono tabular-nums">
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

                <div className="px-4 py-2.5 bg-[#FBF8F7]/65 border-t border-[#E8DFE1] flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-[#81777A] truncate">
                    {p.sku}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDetailProductId(p.id);
                      setDetailTab('overview');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#805F69] hover:text-[#49383D] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    View Details
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </SurfaceCard>
            );
          })}
        </div>
      ) : (
        <SurfaceCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E8DFE1] bg-[#FBF8F7] text-[11px] font-semibold text-[#81777A]">
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">SKU & Barcode</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-right">Selling / Cost</th>
                  <th className="py-3 px-4 text-right">Available Stock</th>
                  <th className="py-3 px-4">Supplier & Expiry</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFE1] text-sm">
                {pagedProducts.map((p) => {
                  const status = getStockStatus(p);
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-[#FBF8F7]/55 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3 min-w-[240px]">
                          <button
                            type="button"
                            onClick={() => {
                              setDetailProductId(p.id);
                              setDetailTab('overview');
                            }}
                            className="w-12 h-10 rounded-lg overflow-hidden border border-[#E8DFE1] bg-white shrink-0 cursor-pointer"
                          >
                            <ProductImage
                              sku={p.sku}
                              src={p.imageUrl}
                              alt={p.name}
                              className="p-1"
                              iconClassName="w-4 h-4"
                            />
                          </button>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => {
                                setDetailProductId(p.id);
                                setDetailTab('overview');
                              }}
                              className="font-semibold text-[#49383D] hover:text-[#805F69] text-left truncate block max-w-[240px] cursor-pointer"
                            >
                              {p.name}
                            </button>
                            <div className="text-[11px] text-[#81777A] truncate">
                              {p.brand || 'Supermarket'} · {p.packagingSize || 'Pack'}
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
                        <div className="font-mono text-xs font-semibold text-[#49383D] tabular-nums">
                          {formatINR(p.unitPrice)}
                        </div>
                        <div className="font-mono text-[11px] text-[#81777A] tabular-nums">
                          Cost {formatINR(p.unitCost)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold text-[#49383D] tabular-nums">
                          {p.currentStock} units
                        </div>
                        <div className="font-mono text-[11px] text-[#81777A] tabular-nums">
                          Min {p.minStockLevel} · Reorder {p.reorderLevel ?? p.minStockLevel}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-xs text-[#3F3437] max-w-[165px] truncate">
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
                              setDetailProductId(p.id);
                              setDetailTab('overview');
                            }}
                            title="View Product Details"
                            className="p-1.5 text-[#805F69] hover:text-[#49383D] hover:bg-[#FBF8F7] rounded-md cursor-pointer"
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}

      {/* Pagination Footer */}
      {filteredProducts.length > 0 && pageSize !== 'all' && totalPages > 1 && (
        <SurfaceCard className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#81777A]">
          <span className="font-mono tabular-nums">
            Showing {startIndex}–{endIndex} of {filteredProducts.length} SKUs (Page {safePage} of{' '}
            {totalPages})
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

            <div className="hidden sm:flex items-center gap-1">
              {pageNumbers.map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`el-${idx}`} className="px-2 text-[#A69B9E]">
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item)}
                    className={`min-w-8 h-8 px-2 rounded-lg font-mono text-xs font-medium transition-colors cursor-pointer ${
                      item === safePage
                        ? 'bg-[#805F69] text-white font-semibold'
                        : 'bg-white border border-[#E8DFE1] text-[#3F3437] hover:bg-[#FBF8F7]'
                    }`}
                  >
                    {item}
                  </button>
                )
              )}
            </div>

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
        </SurfaceCard>
      )}

      {/* Product Detail Drawer */}
      {detailProduct && detailForecast && (
        <div className="fixed inset-0 z-50 bg-[#49383D]/50 flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto border-l border-[#E8DFE1] p-6 space-y-6 shadow-[0_20px_50px_rgba(73,56,61,0.18)] animate-view-enter">
            {/* Drawer Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E8DFE1]">
              <div className="flex items-start gap-4 min-w-0">
                <div className="w-28 h-24 rounded-xl border border-[#E8DFE1] overflow-hidden bg-white shrink-0">
                  <ProductImage
                    sku={detailProduct.sku}
                    src={detailProduct.imageUrl}
                    alt={detailProduct.name}
                    className="p-2"
                  />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#81777A]">
                    <span>{detailProduct.sku}</span>
                    <span aria-hidden="true">·</span>
                    <span>{detailProduct.category}</span>
                    <StatusLabel
                      tone={getStockStatus(detailProduct).tone}
                      label={getStockStatus(detailProduct).label}
                    />
                  </div>
                  <h2 className="font-display text-xl font-bold text-[#49383D] leading-tight">
                    {detailProduct.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#81777A]">
                    <span>
                      Brand:{' '}
                      <strong className="text-[#3F3437]">
                        {detailProduct.brand || 'Supermarket'}
                      </strong>
                    </span>
                    <span>
                      Pack:{' '}
                      <strong className="text-[#3F3437]">
                        {detailProduct.packagingSize || 'Unit'}
                      </strong>
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
                aria-label="Close product detail view"
                onClick={() => setDetailProductId(null)}
                className="p-1.5 text-[#81777A] hover:text-[#49383D] rounded-lg hover:bg-[#FBF8F7] cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Action Buttons */}
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
                Adjust Stock
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
                variant="secondary"
                size="sm"
                onClick={() => {
                  const id = detailProduct.id;
                  setDetailProductId(null);
                  onNavigate('forecasting', id);
                }}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Demand Forecast
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

            {/* Product Description */}
            {detailProduct.description && (
              <div className="bg-[#F7F3F1] border border-[#E8DFE1] rounded-xl px-4 py-3 text-xs text-[#3F3437] leading-relaxed">
                {detailProduct.description}
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg">
              {(
                [
                  { id: 'overview', label: 'Product Details' },
                  { id: 'forecast', label: 'Sales & 30d Forecast' },
                  { id: 'reorder', label: 'Reorder Recommendation' },
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
                    <div className="text-[#81777A]">Selling Price</div>
                    <div className="font-mono font-bold text-xl text-[#49383D] tabular-nums mt-0.5">
                      {formatINR(detailProduct.unitPrice)}
                    </div>
                  </div>
                  <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-3.5">
                    <div className="text-[#81777A]">Available Stock</div>
                    <div className="font-mono font-bold text-xl text-[#49383D] tabular-nums mt-0.5">
                      {detailProduct.currentStock}
                    </div>
                  </div>
                  <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-3.5">
                    <div className="text-[#81777A]">Inventory Value</div>
                    <div className="font-mono font-bold text-xl text-[#805F69] tabular-nums mt-0.5">
                      {formatINRCompact(
                        detailProduct.currentStock * detailProduct.unitPrice
                      )}
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
                  <div className="px-4 py-3 flex justify-between gap-4">
                    <span className="text-[#81777A]">Department</span>
                    <span className="font-semibold text-[#49383D] text-right">
                      {detailProduct.category}
                    </span>
                  </div>
                  <div className="px-4 py-3 flex justify-between gap-4">
                    <span className="text-[#81777A]">Brand & Packaging Size</span>
                    <span className="font-semibold text-[#49383D] text-right">
                      {detailProduct.brand || 'Standard'} ·{' '}
                      {detailProduct.packagingSize || 'Unit'}
                    </span>
                  </div>
                  <div className="px-4 py-3 flex justify-between gap-4">
                    <span className="text-[#81777A]">SKU / EAN Barcode</span>
                    <span className="font-mono font-semibold text-[#49383D] text-right">
                      {detailProduct.sku} · {detailProduct.barcode || 'Not assigned'}
                    </span>
                  </div>
                  <div className="px-4 py-3 flex justify-between gap-4">
                    <span className="text-[#81777A]">Purchase Cost / Selling Price</span>
                    <span className="font-mono font-semibold text-[#49383D] text-right">
                      {formatINR(detailProduct.unitCost)} / {formatINR(detailProduct.unitPrice)}
                    </span>
                  </div>
                  <div className="px-4 py-3 flex justify-between gap-4">
                    <span className="text-[#81777A]">Min / Reorder / Max Thresholds</span>
                    <span className="font-mono font-semibold text-[#49383D] text-right">
                      {detailProduct.minStockLevel} /{' '}
                      {detailProduct.reorderLevel ?? detailProduct.minStockLevel} /{' '}
                      {detailProduct.maxStockLevel} units
                    </span>
                  </div>
                  <div className="px-4 py-3 flex justify-between gap-4">
                    <span className="text-[#81777A]">Supplier & Lead Time</span>
                    <span className="font-semibold text-[#49383D] text-right">
                      {detailProduct.supplierName} ({detailProduct.leadTimeDays}d)
                    </span>
                  </div>
                  <div className="px-4 py-3 flex justify-between items-center gap-4">
                    <span className="text-[#81777A] inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Expiry Date
                    </span>
                    <span className="font-mono font-semibold text-[#49383D]">
                      {detailProduct.expiryDate || 'Non-perishable'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {detailTab === 'forecast' && (
              <div className="space-y-4">
                <div className="border border-[#E8DFE1] rounded-xl p-4">
                  <ForecastLineChart points={detailForecast.points} height={220} compact />
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
                  <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-3">
                    <div className="text-[#81777A] font-sans">30d Predicted</div>
                    <div className="font-bold text-base text-[#49383D] mt-0.5">
                      {detailForecast.predictedTotal} units
                    </div>
                  </div>
                  <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-3">
                    <div className="text-[#81777A] font-sans">Avg Daily Sales</div>
                    <div className="font-bold text-base text-[#805F69] mt-0.5">
                      {detailForecast.avgDailySales.toFixed(1)}/day
                    </div>
                  </div>
                  <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg p-3">
                    <div className="text-[#81777A] font-sans">Runout Window</div>
                    <div className="font-bold text-base text-[#49383D] mt-0.5">
                      {detailForecast.expectedDepletionDays !== null
                        ? `${detailForecast.expectedDepletionDays} days`
                        : '30+ days'}
                    </div>
                  </div>
                </div>

                <div className="border border-[#E8DFE1] rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#FBF8F7] border-b border-[#E8DFE1] flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#49383D]">
                      Recent Sales History
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const id = detailProduct.id;
                        setDetailProductId(null);
                        onNavigate('forecasting', id);
                      }}
                      className="font-medium text-[#805F69] hover:text-[#49383D] cursor-pointer"
                    >
                      Open Forecast Workspace →
                    </button>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E8DFE1] text-[#81777A]">
                        <th className="py-2 px-4">Date</th>
                        <th className="py-2 px-4 text-right">Sold</th>
                        <th className="py-2 px-4 text-right">Received</th>
                        <th className="py-2 px-4 text-right">Revenue (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DFE1] font-mono tabular-nums">
                      {detailHistory.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-6 text-center font-sans text-[#81777A]"
                          >
                            No sales recorded yet.
                          </td>
                        </tr>
                      ) : (
                        detailHistory.map((h) => (
                          <tr key={h.id}>
                            <td className="py-2 px-4 text-[#81777A]">{h.date}</td>
                            <td className="py-2 px-4 text-right text-[#49383D]">
                              {h.quantitySold}
                            </td>
                            <td className="py-2 px-4 text-right text-[#779384]">
                              {h.quantityReceived > 0 ? `+${h.quantityReceived}` : '—'}
                            </td>
                            <td className="py-2 px-4 text-right text-[#49383D]">
                              {formatINR(h.revenue, 2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detailTab === 'reorder' && (
              <div className="space-y-4 text-xs">
                {detailRec ? (
                  <>
                    <div className="bg-[#FBF8F7] border border-[#E8DFE1] rounded-xl p-4 space-y-2">
                      <div className="font-semibold text-sm text-[#49383D]">
                        {detailRec.reason}
                      </div>
                      <p className="text-[#81777A] leading-relaxed">
                        {detailRec.suggestedAction}
                      </p>
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
                        <div className="text-[#81777A] font-sans">Est. Order Value</div>
                        <div className="font-bold text-base text-[#49383D] mt-0.5">
                          {formatINRCompact(
                            detailRec.recommendedOrderQty * detailProduct.unitCost
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {detailRec.recommendedOrderQty > 0 && (
                        <Button
                          variant="emerald"
                          size="sm"
                          disabled={purchaseDraftIds.includes(detailProduct.id)}
                          onClick={() => onAddToPurchasePlan(detailRec)}
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          {purchaseDraftIds.includes(detailProduct.id)
                            ? 'Staged in Purchase Plan'
                            : `Add ${detailRec.recommendedOrderQty}u to Purchase Plan`}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const id = detailProduct.id;
                          setDetailProductId(null);
                          onNavigate('recommendations', id);
                        }}
                      >
                        Open Smart Recommendations →
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="bg-[#F7F3F1] border border-[#E8DFE1] rounded-xl p-4 text-[#81777A]">
                    Stock levels for <strong className="text-[#49383D]">{detailProduct.name}</strong>{' '}
                    are healthy against current demand velocity. No urgent replenishment is needed.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {showFormModal && (
        <ModalDialog
          title={
            editingProduct ? `Edit ${editingProduct.name}` : 'Add Product to Catalogue'
          }
          subtitle="Configure retail pricing, department, packaging, stock thresholds, and product image."
          maxWidth="max-w-2xl"
          onClose={() => setShowFormModal(false)}
        >
          <form
            onSubmit={handleSaveProduct}
            className="p-6 space-y-4 max-h-[82vh] overflow-y-auto"
          >
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
                    <label className="block text-xs font-medium text-[#3F3437]">
                      Product Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Amul Taaza Toned Milk – 1 litre"
                      value={formState.name}
                      onChange={(e) =>
                        setFormState({ ...formState, name: e.target.value })
                      }
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
                      onChange={(e) =>
                        setFormState({ ...formState, brand: e.target.value })
                      }
                      className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#3F3437]">
                      Packaging Size
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., 500 g, 1 litre"
                      value={formState.packagingSize}
                      onChange={(e) =>
                        setFormState({ ...formState, packagingSize: e.target.value })
                      }
                      className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#3F3437]">SKU</label>
                    <input
                      type="text"
                      required
                      value={formState.sku}
                      onChange={(e) =>
                        setFormState({ ...formState, sku: e.target.value })
                      }
                      className="w-full h-10 px-3 text-sm font-mono bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#3F3437]">
                      Barcode (EAN)
                    </label>
                    <input
                      type="text"
                      required
                      value={formState.barcode}
                      onChange={(e) =>
                        setFormState({ ...formState, barcode: e.target.value })
                      }
                      className="w-full h-10 px-3 text-sm font-mono bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">
                  Department / Category
                </label>
                <input
                  type="text"
                  required
                  list="catalogue-department-options"
                  value={formState.category}
                  onChange={(e) =>
                    setFormState({ ...formState, category: e.target.value })
                  }
                  className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
                <datalist id="catalogue-department-options">
                  {SUPERMARKET_DEPARTMENTS.map((d) => (
                    <option key={d.id} value={d.category} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">
                  Supplier Name
                </label>
                <input
                  type="text"
                  required
                  value={formState.supplierName}
                  onChange={(e) =>
                    setFormState({ ...formState, supplierName: e.target.value })
                  }
                  className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#3F3437]">
                Product Description
              </label>
              <textarea
                rows={2}
                placeholder="Brief supermarket product description, pack contents, and key highlights..."
                value={formState.description}
                onChange={(e) =>
                  setFormState({ ...formState, description: e.target.value })
                }
                className="w-full p-2.5 text-xs bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">
                  Available Stock
                </label>
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
                <label className="block text-xs font-medium text-[#3F3437]">
                  Min Threshold
                </label>
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
                <label className="block text-xs font-medium text-[#3F3437]">
                  Reorder Level
                </label>
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
                <label className="block text-xs font-medium text-[#3F3437]">
                  Max Capacity
                </label>
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
                <label className="block text-xs font-medium text-[#3F3437]">
                  Selling Price (₹)
                </label>
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
                <label className="block text-xs font-medium text-[#3F3437]">
                  Purchase Price (₹)
                </label>
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
                <label className="block text-xs font-medium text-[#3F3437]">
                  Lead Time (d)
                </label>
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
                <label className="block text-xs font-medium text-[#3F3437]">
                  Expiry Date
                </label>
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
                <label className="block text-xs font-medium text-[#3F3437]">
                  Catalogue Image Preset
                </label>
                <select
                  value={
                    CATALOGUE_IMAGE_OPTIONS.some((p) => p.url === formState.imageUrl)
                      ? formState.imageUrl
                      : ''
                  }
                  onChange={(e) => {
                    if (e.target.value) {
                      setFormState({ ...formState, imageUrl: e.target.value });
                    }
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
                <label className="block text-xs font-medium text-[#3F3437]">
                  Image URL
                </label>
                <input
                  type="text"
                  value={formState.imageUrl}
                  onChange={(e) =>
                    setFormState({ ...formState, imageUrl: e.target.value })
                  }
                  className="w-full h-10 px-3 text-xs font-mono bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#E8DFE1] flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowFormModal(false)}
              >
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
              Removing SKU{' '}
              <strong className="font-mono text-[#49383D]">{deletingProduct.sku}</strong>{' '}
              permanently deletes its product record and sales history.
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

      {/* Adjust Stock Modal */}
      {txProduct && (
        <ModalDialog
          title="Adjust Stock or Record Sale"
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
                <label className="block text-xs font-medium text-[#3F3437]">
                  Units Sold
                </label>
                <input
                  type="number"
                  min={0}
                  value={txSold}
                  onChange={(e) => setTxSold(Number(e.target.value))}
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#3F3437]">
                  Units Received
                </label>
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
                {busy ? 'Updating...' : 'Update Stock'}
              </Button>
            </div>
          </form>
        </ModalDialog>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <ModalDialog
          title="Import Supermarket Products (CSV)"
          subtitle="Upload a CSV file or paste product catalogue rows below."
          maxWidth="max-w-2xl"
          onClose={() => setShowImportModal(false)}
        >
          <div className="p-6 space-y-4">
            <p className="text-xs text-[#81777A]">
              Columns:{' '}
              <code className="font-mono text-[#49383D]">
                sku,barcode,name,brand,packagingSize,category,currentStock,minStockLevel,reorderLevel,unitPrice,unitCost,supplierName,leadTimeDays,expiryDate,description
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
    </div>
  );
};
