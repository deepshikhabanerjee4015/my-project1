import React, { useState } from 'react';
import {
  PackageCheck,
  PlusCircle,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import {
  Button,
  EmptyStateCard,
  SectionHeader,
  StatusLabel,
  SurfaceCard,
} from './ui/DesignPrimitives';
import { formatINR } from '../lib/currency';
import type { PurchaseOrder, SmartRecommendation } from '../types/inventory';

export interface DraftOrderLine {
  productId: string;
  sku: string;
  productName: string;
  supplierName: string;
  unitCost: number;
  quantity: number;
}

interface PurchasePlanViewProps {
  draftLines: DraftOrderLine[];
  purchaseOrders: PurchaseOrder[];
  recommendations: SmartRecommendation[];
  onUpdateDraftQty: (productId: string, qty: number) => void;
  onRemoveDraftLine: (productId: string) => void;
  onAutoFillUrgent: () => void;
  onSubmitPO: (notes: string) => Promise<void>;
  onMarkReceived: (poId: string) => Promise<void>;
}

export const PurchasePlanView: React.FC<PurchasePlanViewProps> = ({
  draftLines,
  purchaseOrders,
  recommendations,
  onUpdateDraftQty,
  onRemoveDraftLine,
  onAutoFillUrgent,
  onSubmitPO,
  onMarkReceived,
}) => {
  const [notes, setNotes] = useState(
    'Replenishment generated via SmartStock demand forecast.'
  );
  const [submitting, setSubmitting] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);

  const urgentAvailableCount = recommendations.filter(
    (r) =>
      r.recommendedOrderQty > 0 &&
      r.status !== 'in_plan' &&
      !draftLines.some((d) => d.productId === r.productId)
  ).length;

  const draftTotalUnits = draftLines.reduce((s, d) => s + d.quantity, 0);
  const draftTotalCost = draftLines.reduce(
    (s, d) => s + d.quantity * d.unitCost,
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draftLines.length === 0) return;
    setSubmitting(true);
    try {
      await onSubmitPO(notes);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceive = async (poId: string) => {
    setReceivingId(poId);
    try {
      await onMarkReceived(poId);
    } finally {
      setReceivingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-view-enter">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#49383D] tracking-tight">
          Purchase Orders
        </h2>
        <p className="text-sm text-[#81777A] mt-0.5">
          Stage supplier replenishment plans, issue purchase orders, and check in incoming stock.
        </p>
      </div>

      {/* Draft Purchase Plan */}
      <SurfaceCard className="overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E8DFE1] flex flex-wrap items-center justify-between gap-3">
          <SectionHeader
            title="Draft Purchase Plan"
            subtitle="Review recommended quantities before issuing purchase orders to suppliers"
          />
          {urgentAvailableCount > 0 && (
            <Button variant="secondary" size="sm" onClick={onAutoFillUrgent}>
              <PlusCircle className="w-3.5 h-3.5 text-[#805F69]" />
              Add {urgentAvailableCount} Recommended Restocks
            </Button>
          )}
        </div>

        {draftLines.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <ShoppingCart className="w-7 h-7 text-[#81777A] mx-auto" />
            <div className="text-sm font-semibold text-[#49383D]">
              Your draft purchase plan is empty
            </div>
            <p className="text-xs text-[#81777A] max-w-md mx-auto">
              Add items from Smart Recommendations or click &ldquo;Add Recommended Restocks&rdquo;
              above to stage a supplier purchase order.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#FBF8F7] border-b border-[#E8DFE1] text-[11px] font-semibold text-[#81777A]">
                    <th className="py-2.5 px-5">SKU</th>
                    <th className="py-2.5 px-4">Product</th>
                    <th className="py-2.5 px-4">Supplier</th>
                    <th className="py-2.5 px-4 text-right">Unit Cost</th>
                    <th className="py-2.5 px-4 text-right">Order Qty</th>
                    <th className="py-2.5 px-4 text-right">Estimated Cost</th>
                    <th className="py-2.5 px-5 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8DFE1] text-sm">
                  {draftLines.map((line) => (
                    <tr key={line.productId} className="hover:bg-[#FBF8F7]/50">
                      <td className="py-3 px-5 font-mono text-xs text-[#81777A]">
                        {line.sku}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#49383D]">
                        {line.productName}
                      </td>
                      <td className="py-3 px-4 text-xs text-[#81777A]">
                        {line.supplierName}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                        {formatINR(line.unitCost, 2)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) =>
                            onUpdateDraftQty(line.productId, Number(e.target.value))
                          }
                          className="w-20 h-8 px-2 text-right text-sm font-mono tabular-nums bg-white border border-[#E8DFE1] rounded-md focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-[#49383D] tabular-nums">
                        {formatINR(line.quantity * line.unitCost, 2)}
                      </td>
                      <td className="py-3 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => onRemoveDraftLine(line.productId)}
                          className="p-1 text-[#81777A] hover:text-[#A15E5E] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 bg-[#FBF8F7] border-t border-[#E8DFE1] flex flex-wrap items-center justify-between gap-4">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Order notes for supplier..."
                className="flex-1 min-w-[240px] max-w-md h-9 px-3 text-xs bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
              />
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <div className="text-xs text-[#81777A]">
                    Total ({draftTotalUnits} units)
                  </div>
                  <div className="font-mono font-bold text-lg text-[#49383D] tabular-nums">
                    {formatINR(draftTotalCost, 2)}
                  </div>
                </div>
                <Button type="submit" variant="emerald" disabled={submitting}>
                  {submitting ? 'Submitting PO...' : 'Submit Purchase Order'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </SurfaceCard>

      {/* Structured Purchase Orders Table */}
      {purchaseOrders.length === 0 ? (
        <EmptyStateCard
          icon={<ShoppingCart className="w-5 h-5" />}
          title="No purchase orders submitted yet"
          description="Stage recommended products above to create your first supplier purchase order."
        />
      ) : (
        <SurfaceCard className="overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E8DFE1] flex items-center justify-between">
            <SectionHeader
              title="Order Ledger"
              subtitle="Checking in a shipment automatically updates on-hand inventory"
            />
            <span className="text-xs font-mono text-[#81777A] tabular-nums">
              {purchaseOrders.length} orders
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FBF8F7] border-b border-[#E8DFE1] text-[11px] font-semibold text-[#81777A]">
                  <th className="py-3 px-5">Order Number</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Products</th>
                  <th className="py-3 px-4 text-right">Quantity</th>
                  <th className="py-3 px-4 text-right">Estimated Cost</th>
                  <th className="py-3 px-4">Order Date</th>
                  <th className="py-3 px-4">Expected Delivery</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFE1] text-sm">
                {purchaseOrders.map((po) => {
                  const qty = po.items.reduce((a, b) => a + b.quantity, 0);
                  return (
                    <tr key={po.id} className="hover:bg-[#FBF8F7]/60">
                      <td className="py-3.5 px-5 font-mono font-bold text-xs text-[#49383D] whitespace-nowrap">
                        {po.poNumber}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-[#3F3437]">
                        {po.supplierName}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-[#81777A] max-w-[260px] truncate">
                        {po.items.map((i) => `${i.productName} (×${i.quantity})`).join(', ')}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums">
                        {qty}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-xs text-[#49383D] tabular-nums">
                        {formatINR(po.totalCost, 2)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-[#81777A] whitespace-nowrap">
                        {po.createdAt}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-[#81777A] whitespace-nowrap">
                        {po.receivedAt ? `Checked in ${po.receivedAt}` : po.expectedDeliveryDate}
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusLabel
                          tone={po.status === 'received' ? 'healthy' : 'info'}
                          label={po.status === 'received' ? 'Received' : 'In Transit'}
                        />
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        {po.status !== 'received' ? (
                          <Button
                            size="sm"
                            disabled={receivingId === po.id}
                            onClick={() => handleReceive(po.id)}
                          >
                            <PackageCheck className="w-3.5 h-3.5" />
                            {receivingId === po.id ? 'Updating...' : 'Mark Received'}
                          </Button>
                        ) : (
                          <span className="text-xs text-[#81777A]">Completed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
};
