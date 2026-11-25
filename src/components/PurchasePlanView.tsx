import React, { useState } from 'react';
import {
  CheckCircle2,
  PackageCheck,
  PlusCircle,
  ShoppingCart,
  Trash2,
  Truck,
} from 'lucide-react';
import type {
  PurchaseOrder,
  SmartRecommendation,
} from '../types/inventory';

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
    <div className="space-y-6">
      {/* Draft Purchase Plan */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-[#101B2D]">
              Active Purchase Plan (Draft)
            </h2>
            <p className="text-xs text-[#738096]">
              Review recommended quantities before issuing purchase orders to suppliers
            </p>
          </div>
          {urgentAvailableCount > 0 && (
            <button
              type="button"
              onClick={onAutoFillUrgent}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#101B2D] bg-[#F6F8FB] hover:bg-slate-200/70 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 text-[#16A36A]" />
              Add {urgentAvailableCount} Recommended Restocks
            </button>
          )}
        </div>

        {draftLines.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <ShoppingCart className="w-8 h-8 text-[#738096] mx-auto" />
            <div className="text-sm font-semibold text-[#101B2D]">
              Your draft purchase plan is empty
            </div>
            <p className="text-xs text-[#738096] max-w-md mx-auto">
              Add items from Smart Recommendations or click &ldquo;Add Recommended Restocks&rdquo;
              above to stage a supplier purchase order.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F6F8FB] border-b border-slate-200 text-[11px] font-semibold text-[#738096]">
                    <th className="py-2.5 px-5">SKU</th>
                    <th className="py-2.5 px-4">Product</th>
                    <th className="py-2.5 px-4">Supplier</th>
                    <th className="py-2.5 px-4 text-right">Unit Cost</th>
                    <th className="py-2.5 px-4 text-right">Order Qty</th>
                    <th className="py-2.5 px-4 text-right">Line Total</th>
                    <th className="py-2.5 px-5 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {draftLines.map((line) => (
                    <tr key={line.productId}>
                      <td className="py-3 px-5 font-mono text-xs text-[#738096]">
                        {line.sku}
                      </td>
                      <td className="py-3 px-4 font-medium text-[#101B2D]">
                        {line.productName}
                      </td>
                      <td className="py-3 px-4 text-xs text-[#738096]">
                        {line.supplierName}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                        ${line.unitCost.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) =>
                            onUpdateDraftQty(line.productId, Number(e.target.value))
                          }
                          className="w-20 px-2 py-1 text-right text-sm font-mono tabular-nums border border-slate-200 rounded-md"
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-[#101B2D] tabular-nums">
                        ${(line.quantity * line.unitCost).toFixed(2)}
                      </td>
                      <td className="py-3 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => onRemoveDraftLine(line.productId)}
                          className="p-1 text-[#738096] hover:text-[#DC5555] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 bg-[#F6F8FB] border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Order notes for supplier..."
                className="flex-1 min-w-[240px] max-w-md px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
              />
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <div className="text-xs text-[#738096]">
                    Total ({draftTotalUnits} units)
                  </div>
                  <div className="font-mono font-bold text-lg text-[#101B2D] tabular-nums">
                    ${draftTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 text-xs font-medium text-white bg-[#16A36A] hover:bg-[#138a59] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {submitting ? 'Submitting PO...' : 'Submit Purchase Order'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Purchase Order History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-[#101B2D]">
              Submitted & Received Purchase Orders
            </h2>
            <p className="text-xs text-[#738096]">
              Marking an order as received automatically updates on-hand inventory
            </p>
          </div>
          <span className="text-xs font-mono text-[#738096] tabular-nums">
            {purchaseOrders.length} orders
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {purchaseOrders.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#738096]">
              No purchase orders submitted yet.
            </div>
          ) : (
            purchaseOrders.map((po) => (
              <div
                key={po.id}
                className="p-5 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-sm text-[#101B2D]">
                      {po.poNumber}
                    </span>
                    <span className="text-xs text-[#738096]">·</span>
                    <span className="text-sm font-medium text-[#202B3C]">
                      {po.supplierName}
                    </span>
                    <span className="text-xs text-[#738096]">·</span>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        po.status === 'received'
                          ? 'text-[#16A36A]'
                          : 'text-[#4C7FE8]'
                      }`}
                    >
                      {po.status === 'received' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Truck className="w-3.5 h-3.5" />
                      )}
                      {po.status === 'received' ? 'Received' : 'In Transit'}
                    </span>
                  </div>
                  <div className="text-xs text-[#738096]">
                    {po.items.map((i) => `${i.productName} (×${i.quantity})`).join(', ')}
                  </div>
                  <div className="text-[11px] font-mono text-[#738096] tabular-nums">
                    Created {po.createdAt} · Expected {po.expectedDeliveryDate}
                    {po.receivedAt ? ` · Checked in ${po.receivedAt}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-mono font-bold text-base text-[#101B2D] tabular-nums">
                      ${po.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[11px] text-[#738096] font-mono tabular-nums">
                      {po.items.reduce((a, b) => a + b.quantity, 0)} total units
                    </div>
                  </div>
                  {po.status !== 'received' && (
                    <button
                      type="button"
                      disabled={receivingId === po.id}
                      onClick={() => handleReceive(po.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#101B2D] hover:bg-[#263B55] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <PackageCheck className="w-3.5 h-3.5" />
                      {receivingId === po.id ? 'Updating...' : 'Mark Received'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
