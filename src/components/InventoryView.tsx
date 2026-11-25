import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Download,
  Edit3,
  Eye,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ForecastLineChart } from './Charts';
import { buildDailySeries, runDemandForecast } from '../lib/forecasting';
import type { Product, SalesRecord } from '../types/inventory';

interface InventoryViewProps {
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
type SortField = 'name' | 'stock' | 'price' | 'velocity' | 'value';

function getStockStatus(p: Product): {
  key: Exclude<StockStatusFilter, 'all'>;
  label: string;
  colorClass: string;
} {
  if (p.currentStock === 0) {
    return { key: 'out', label: 'Out of Stock', colorClass: 'text-[#DC5555]' };
  }
  if (p.currentStock <= p.minStockLevel) {
    return { key: 'low', label: 'Low Stock', colorClass: 'text-[#E9A23B]' };
  }
  if (p.currentStock > p.maxStockLevel) {
    return { key: 'excess', label: 'Excess', colorClass: 'text-[#4C7FE8]' };
  }
  return { key: 'healthy', label: 'Healthy', colorClass: 'text-[#16A36A]' };
}

export const InventoryView: React.FC<InventoryViewProps> = ({
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
  const [statusFilter, setStatusFilter] = useState<StockStatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [txProduct, setTxProduct] = useState<Product | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const detailProduct = useMemo(
    () => products.find((p) => p.id === detailProductId) || null,
    [products, detailProductId]
  );

  // Form states
  const [formState, setFormState] = useState({
    name: '',
    sku: '',
    category: 'Dairy & Refrigerated',
    currentStock: 25,
    minStockLevel: 15,
    maxStockLevel: 80,
    unitPrice: 12.99,
    unitCost: 6.5,
    supplierName: 'Primary Supplier',
    leadTimeDays: defaultLeadTimeDays,
    incomingStock: 0,
    seasonalTag: 'Year-Round' as Product['seasonalTag'],
    promoActive: false,
  });

  const [txSold, setTxSold] = useState(0);
  const [txReceived, setTxReceived] = useState(0);
  const [csvText, setCsvText] = useState(
    'sku,name,category,currentStock,minStockLevel,unitPrice,unitCost,supplierName,leadTimeDays\nSKU-901,Organic Almond Butter 16oz,Pantry Staples,32,15,13.99,7.20,Willamette Provisions,5\nSKU-902,Sparkling Yuzu Tonic 4-Pack,Beverages & Coffee,12,20,8.99,4.50,Alpine Springs Beverage,4'
  );
  const [busy, setBusy] = useState(false);

  // Compute 30-day sales velocity per product
  const velocityMap = useMemo(() => {
    const map = new Map<string, number>();
    const byProd = new Map<string, number>();
    for (const s of sales) {
      byProd.set(s.productId, (byProd.get(s.productId) || 0) + s.quantitySold);
    }
    products.forEach((p) => {
      const total = byProd.get(p.id) || 0;
      map.set(p.id, Number((total / 90).toFixed(2)));
    });
    return map;
  }, [products, sales]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) {
          return false;
        }
        if (categoryFilter !== 'all' && p.category !== categoryFilter) {
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
        else if (sortField === 'velocity')
          cmp = (velocityMap.get(a.id) || 0) - (velocityMap.get(b.id) || 0);
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [products, search, categoryFilter, statusFilter, sortField, sortDir, velocityMap]);

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

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setFormState({
      name: '',
      sku: `SKU-${Math.floor(100 + Math.random() * 899)}`,
      category: categories[0] || 'General Merchandise',
      currentStock: 25,
      minStockLevel: 15,
      maxStockLevel: 80,
      unitPrice: 12.99,
      unitCost: 6.5,
      supplierName: 'Primary Supplier',
      leadTimeDays: defaultLeadTimeDays,
      incomingStock: 0,
      seasonalTag: 'Year-Round',
      promoActive: false,
    });
    setShowFormModal(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormState({
      name: p.name,
      sku: p.sku,
      category: p.category,
      currentStock: p.currentStock,
      minStockLevel: p.minStockLevel,
      maxStockLevel: p.maxStockLevel,
      unitPrice: p.unitPrice,
      unitCost: p.unitCost,
      supplierName: p.supplierName,
      leadTimeDays: p.leadTimeDays,
      incomingStock: p.incomingStock,
      seasonalTag: p.seasonalTag,
      promoActive: p.promoActive,
    });
    setShowFormModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setModalError(null);
    try {
      if (editingProduct) {
        await onUpdateProduct(editingProduct.id, formState);
      } else {
        await onAddProduct(formState);
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
          name: row.name,
          category: row.category || 'General',
          currentStock: Number(row.currentStock) || 0,
          minStockLevel: Number(row.minStockLevel) || 10,
          unitPrice: Number(row.unitPrice) || 10,
          unitCost: Number(row.unitCost) || 5,
          supplierName: row.supplierName || 'Primary Supplier',
          leadTimeDays: Number(row.leadTimeDays) || defaultLeadTimeDays,
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

  const handleExportCsv = () => {
    const header =
      'SKU,Name,Category,CurrentStock,MinStockLevel,UnitPrice,UnitCost,StockValue,VelocityPerDay,Status,LastUpdated';
    const rows = filteredProducts.map((p) => {
      const st = getStockStatus(p).label;
      const val = (p.currentStock * p.unitPrice).toFixed(2);
      const vel = (velocityMap.get(p.id) || 0).toFixed(2);
      return `${p.sku},"${p.name.replace(/"/g, '""')}","${p.category}",${p.currentStock},${p.minStockLevel},${p.unitPrice},${p.unitCost},${val},${vel},${st},${p.lastUpdated}`;
    });
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartstock-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-[#738096] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by product name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#202B3C] bg-[#F6F8FB] hover:bg-slate-200/70 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Import CSV
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#202B3C] bg-[#F6F8FB] hover:bg-slate-200/70 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#101B2D] hover:bg-[#263B55] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Product
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F6F8FB] border border-slate-200 rounded-lg">
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
                onClick={() => setStatusFilter(st.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === st.id
                    ? 'bg-white text-[#101B2D] shadow-xs'
                    : 'text-[#738096] hover:text-[#101B2D]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-[#202B3C] focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <span className="text-xs font-mono text-[#738096] tabular-nums">
              {filteredProducts.length} SKUs
            </span>
          </div>
        </div>
      </div>

      {/* Product Data Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F6F8FB] text-[11px] font-semibold text-[#738096]">
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className="inline-flex items-center gap-1 hover:text-[#101B2D] cursor-pointer"
                  >
                    Product Name
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('stock')}
                    className="inline-flex items-center gap-1 hover:text-[#101B2D] cursor-pointer"
                  >
                    Stock
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right">Min</th>
                <th className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('price')}
                    className="inline-flex items-center gap-1 hover:text-[#101B2D] cursor-pointer"
                  >
                    Unit Price
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('value')}
                    className="inline-flex items-center gap-1 hover:text-[#101B2D] cursor-pointer"
                  >
                    Stock Value
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('velocity')}
                    className="inline-flex items-center gap-1 hover:text-[#101B2D] cursor-pointer"
                  >
                    Velocity
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Updated</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-[#738096]">
                    No products match your search or filters.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const status = getStockStatus(p);
                  const vel = velocityMap.get(p.id) || 0;
                  const stockVal = p.currentStock * p.unitPrice;
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-[#F6F8FB]/70 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-xs text-[#738096] whitespace-nowrap">
                        {p.sku}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#101B2D] max-w-[240px] truncate">
                        <button
                          type="button"
                          onClick={() => setDetailProductId(p.id)}
                          className="hover:text-[#4C7FE8] text-left truncate cursor-pointer"
                        >
                          {p.name}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#738096] whitespace-nowrap">
                        {p.category}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-[#101B2D] tabular-nums">
                        {p.currentStock}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-[#738096] tabular-nums">
                        {p.minStockLevel}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-[#202B3C] tabular-nums">
                        ${p.unitPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-medium text-[#101B2D] tabular-nums">
                        ${Math.round(stockVal).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-[#738096] tabular-nums">
                        {vel.toFixed(1)}/d
                      </td>
                      <td className={`py-3 px-4 text-xs font-semibold whitespace-nowrap ${status.colorClass}`}>
                        {status.label}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[#738096] whitespace-nowrap">
                        {p.lastUpdated}
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
                            className="p-1.5 text-[#738096] hover:text-[#16A36A] hover:bg-slate-100 rounded-md cursor-pointer"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDetailProductId(p.id)}
                            title="View Details"
                            className="p-1.5 text-[#738096] hover:text-[#4C7FE8] hover:bg-slate-100 rounded-md cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            title="Edit Product"
                            className="p-1.5 text-[#738096] hover:text-[#101B2D] hover:bg-slate-100 rounded-md cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingProduct(p)}
                            title="Delete Product"
                            className="p-1.5 text-[#738096] hover:text-[#DC5555] hover:bg-slate-100 rounded-md cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {showFormModal && (
        <div
          className="fixed inset-0 z-50 bg-[#101B2D]/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl shadow-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#101B2D]">
                {editingProduct ? `Edit ${editingProduct.name}` : 'Add New Product'}
              </h3>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="p-1 text-[#738096] hover:text-[#101B2D] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-medium text-[#202B3C]">Product Name</label>
                  <input
                    type="text"
                    required
                    value={formState.name}
                    onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#202B3C]">SKU</label>
                  <input
                    type="text"
                    required
                    value={formState.sku}
                    onChange={(e) => setFormState({ ...formState, sku: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#202B3C]">Category</label>
                  <input
                    type="text"
                    required
                    value={formState.category}
                    onChange={(e) => setFormState({ ...formState, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#202B3C]">Supplier Name</label>
                  <input
                    type="text"
                    required
                    value={formState.supplierName}
                    onChange={(e) => setFormState({ ...formState, supplierName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#202B3C]">Current Stock</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={formState.currentStock}
                    onChange={(e) =>
                      setFormState({ ...formState, currentStock: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#202B3C]">Min Stock</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={formState.minStockLevel}
                    onChange={(e) =>
                      setFormState({ ...formState, minStockLevel: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#202B3C]">Max Stock</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={formState.maxStockLevel}
                    onChange={(e) =>
                      setFormState({ ...formState, maxStockLevel: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#202B3C]">Unit Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0.01}
                    required
                    value={formState.unitPrice}
                    onChange={(e) =>
                      setFormState({ ...formState, unitPrice: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#202B3C]">Unit Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0.01}
                    required
                    value={formState.unitCost}
                    onChange={(e) =>
                      setFormState({ ...formState, unitCost: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#202B3C]">Lead Time (d)</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={formState.leadTimeDays}
                    onChange={(e) =>
                      setFormState({ ...formState, leadTimeDays: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 items-center">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#202B3C]">Seasonal Profile</label>
                  <select
                    value={formState.seasonalTag}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        seasonalTag: e.target.value as Product['seasonalTag'],
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="Year-Round">Year-Round</option>
                    <option value="Holiday Peak">Holiday Peak</option>
                    <option value="Winter Seasonal">Winter Seasonal</option>
                    <option value="Summer Peak">Summer Peak</option>
                    <option value="Back-to-School">Back-to-School</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 pt-5 text-xs text-[#202B3C] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.promoActive}
                    onChange={(e) =>
                      setFormState({ ...formState, promoActive: e.target.checked })
                    }
                    className="accent-[#16A36A]"
                  />
                  Active promotional campaign (+15% uplift)
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 text-xs font-medium text-[#738096] hover:text-[#101B2D] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#101B2D] hover:bg-[#263B55] rounded-lg cursor-pointer"
                >
                  {busy ? 'Saving...' : editingProduct ? 'Save Changes' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingProduct && (
        <div className="fixed inset-0 z-50 bg-[#101B2D]/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-lg">
            <h3 className="font-display text-base font-bold text-[#101B2D]">
              Delete {deletingProduct.name}?
            </h3>
            <p className="text-sm text-[#738096]">
              This will permanently remove SKU <strong className="font-mono">{deletingProduct.sku}</strong> and its associated historical sales from your workspace.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingProduct(null)}
                className="px-4 py-2 text-xs font-medium text-[#202B3C] bg-[#F6F8FB] border border-slate-200 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-medium text-white bg-[#DC5555] hover:bg-red-700 rounded-lg cursor-pointer"
              >
                {busy ? 'Deleting...' : 'Delete Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Sale / Stock Adjustment Modal */}
      {txProduct && (
        <div className="fixed inset-0 z-50 bg-[#101B2D]/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#101B2D]">
                Record Sale or Stock Receipt
              </h3>
              <button
                type="button"
                onClick={() => setTxProduct(null)}
                className="p-1 text-[#738096] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#738096]">
              {txProduct.name} · Current stock: <strong className="font-mono text-[#101B2D]">{txProduct.currentStock}</strong> units
            </p>
            <form onSubmit={handleSaveTransaction} className="space-y-4">
              {modalError && (
                <div className="text-xs text-[#DC5555] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {modalError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#202B3C]">Units Sold Today</label>
                  <input
                    type="number"
                    min={0}
                    value={txSold}
                    onChange={(e) => setTxSold(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[#202B3C]">Units Received</label>
                  <input
                    type="number"
                    min={0}
                    value={txReceived}
                    onChange={(e) => setTxReceived(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTxProduct(null)}
                  className="px-4 py-2 text-xs font-medium text-[#738096] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#16A36A] hover:bg-[#138a59] rounded-lg cursor-pointer"
                >
                  {busy ? 'Recording...' : 'Update Inventory & Sales'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-[#101B2D]/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#101B2D]">
                Bulk Import Products (CSV)
              </h3>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1 text-[#738096] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#738096]">
              Upload a local <code className="font-mono">.csv</code> file or paste rows below with columns:{' '}
              <code className="font-mono">sku,name,category,currentStock,minStockLevel,unitPrice,unitCost,supplierName,leadTimeDays</code>.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileUpload}
              className="block w-full text-xs text-[#738096] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-200 file:text-xs file:font-medium file:bg-[#F6F8FB] file:text-[#101B2D] hover:file:bg-slate-200/70"
            />
            {modalError && (
              <div className="text-xs text-[#DC5555] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {modalError}
              </div>
            )}
            <textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="w-full p-3 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-xs font-medium text-[#738096] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleCsvImport}
                className="px-4 py-2 text-xs font-medium text-white bg-[#101B2D] hover:bg-[#263B55] rounded-lg cursor-pointer"
              >
                {busy ? 'Importing...' : 'Import Products'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Drawer */}
      {detailProduct && detailForecast && (
        <div className="fixed inset-0 z-50 bg-[#101B2D]/50 flex justify-end">
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto border-l border-slate-200 p-6 space-y-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <div className="text-xs font-mono text-[#738096]">
                  {detailProduct.sku} · {detailProduct.category}
                </div>
                <h3 className="font-display text-xl font-bold text-[#101B2D] mt-1">
                  {detailProduct.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailProductId(null)}
                className="p-1.5 text-[#738096] hover:text-[#101B2D] rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 text-xs">
              <div className="bg-[#F6F8FB] border border-slate-200 rounded-lg p-3">
                <div className="text-[#738096]">On-Hand Stock</div>
                <div className="font-mono font-bold text-lg text-[#101B2D] tabular-nums mt-0.5">
                  {detailProduct.currentStock}
                </div>
              </div>
              <div className="bg-[#F6F8FB] border border-slate-200 rounded-lg p-3">
                <div className="text-[#738096]">30d Forecast</div>
                <div className="font-mono font-bold text-lg text-[#16A36A] tabular-nums mt-0.5">
                  {detailForecast.predictedTotal}
                </div>
              </div>
              <div className="bg-[#F6F8FB] border border-slate-200 rounded-lg p-3">
                <div className="text-[#738096]">Gross Margin</div>
                <div className="font-mono font-bold text-lg text-[#101B2D] tabular-nums mt-0.5">
                  {Math.round(
                    ((detailProduct.unitPrice - detailProduct.unitCost) /
                      detailProduct.unitPrice) *
                      100
                  )}
                  %
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#101B2D]">
                60-Day Sales History & 30-Day Demand Forecast
              </div>
              <div className="border border-slate-200 rounded-xl p-3">
                <ForecastLineChart points={detailForecast.points} height={210} compact />
              </div>
              <p className="text-xs text-[#738096] leading-relaxed">
                {detailForecast.explanation}
              </p>
            </div>

            <div className="border-t border-slate-200 pt-4 grid grid-cols-2 gap-y-3 text-xs">
              <div>
                <span className="text-[#738096]">Supplier:</span>{' '}
                <strong className="text-[#101B2D]">{detailProduct.supplierName}</strong>
              </div>
              <div>
                <span className="text-[#738096]">Lead Time:</span>{' '}
                <strong className="font-mono text-[#101B2D]">
                  {detailProduct.leadTimeDays} days
                </strong>
              </div>
              <div>
                <span className="text-[#738096]">Unit Price / Cost:</span>{' '}
                <strong className="font-mono text-[#101B2D]">
                  ${detailProduct.unitPrice.toFixed(2)} / ${detailProduct.unitCost.toFixed(2)}
                </strong>
              </div>
              <div>
                <span className="text-[#738096]">Seasonal Tag:</span>{' '}
                <strong className="text-[#101B2D]">{detailProduct.seasonalTag}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
