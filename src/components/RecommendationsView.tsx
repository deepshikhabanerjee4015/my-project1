import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Package,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import type {
  AppView,
  RecommendationStatus,
  RecommendationType,
  SmartRecommendation,
} from '../types/inventory';

interface RecommendationsViewProps {
  recommendations: SmartRecommendation[];
  purchaseDraftIds: string[];
  onUpdateStatus: (productId: string, status: RecommendationStatus) => Promise<void>;
  onAddToPurchasePlan: (rec: SmartRecommendation) => void;
  onViewProduct: (view: AppView, productId: string) => void;
}

type FilterTab =
  | 'active'
  | 'replenish'
  | 'excess_slow'
  | 'trends'
  | 'archived';

export const RecommendationsView: React.FC<RecommendationsViewProps> = ({
  recommendations,
  purchaseDraftIds,
  onUpdateStatus,
  onAddToPurchasePlan,
  onViewProduct,
}) => {
  const [filter, setFilter] = useState<FilterTab>('active');
  const [expandedId, setExpandedId] = useState<string | null>(
    recommendations[0]?.productId || null
  );

  const filtered = useMemo(() => {
    return recommendations.filter((r) => {
      if (filter === 'archived') {
        return r.status === 'reviewed' || r.status === 'dismissed' || r.status === 'in_plan';
      }
      if (r.status === 'dismissed') return false;
      if (filter === 'active') return r.status === 'active' || r.status === 'in_plan';
      if (filter === 'replenish') {
        return r.type === 'stockout_risk' || r.type === 'immediate_replenishment';
      }
      if (filter === 'excess_slow') {
        return r.type === 'excess_inventory' || r.type === 'slow_moving';
      }
      if (filter === 'trends') {
        return r.type === 'rising_demand' || r.type === 'declining_demand';
      }
      return true;
    });
  }, [recommendations, filter]);

  const counts = useMemo(() => {
    const active = recommendations.filter((r) => r.status === 'active' || r.status === 'in_plan').length;
    const replenish = recommendations.filter(
      (r) =>
        r.status !== 'dismissed' &&
        (r.type === 'stockout_risk' || r.type === 'immediate_replenishment')
    ).length;
    const excess = recommendations.filter(
      (r) =>
        r.status !== 'dismissed' &&
        (r.type === 'excess_inventory' || r.type === 'slow_moving')
    ).length;
    const trends = recommendations.filter(
      (r) =>
        r.status !== 'dismissed' &&
        (r.type === 'rising_demand' || r.type === 'declining_demand')
    ).length;
    const archived = recommendations.filter(
      (r) => r.status === 'reviewed' || r.status === 'dismissed' || r.status === 'in_plan'
    ).length;
    return { active, replenish, excess, trends, archived };
  }, [recommendations]);

  const getTypeIcon = (type: RecommendationType) => {
    switch (type) {
      case 'stockout_risk':
        return <AlertOctagon className="w-4 h-4 text-[#DC5555]" />;
      case 'immediate_replenishment':
        return <AlertTriangle className="w-4 h-4 text-[#E9A23B]" />;
      case 'rising_demand':
        return <TrendingUp className="w-4 h-4 text-[#16A36A]" />;
      case 'excess_inventory':
      case 'slow_moving':
      case 'declining_demand':
        return <TrendingDown className="w-4 h-4 text-[#4C7FE8]" />;
    }
  };

  const getTypeLabel = (type: RecommendationType) => {
    switch (type) {
      case 'stockout_risk':
        return 'Stockout Risk';
      case 'immediate_replenishment':
        return 'Immediate Replenishment';
      case 'excess_inventory':
        return 'Excess Inventory';
      case 'slow_moving':
        return 'Slow-Moving SKU';
      case 'rising_demand':
        return 'Rising Demand';
      case 'declining_demand':
        return 'Declining Demand';
    }
  };

  const getUrgencyStyle = (urgency: SmartRecommendation['urgency']) => {
    switch (urgency) {
      case 'critical':
        return 'text-[#DC5555] font-semibold';
      case 'high':
        return 'text-[#E9A23B] font-semibold';
      case 'medium':
        return 'text-[#4C7FE8] font-medium';
      case 'low':
        return 'text-[#738096] font-medium';
    }
  };

  return (
    <div className="space-y-6">
      {/* Segmented Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F6F8FB] border border-slate-200 rounded-lg">
          {(
            [
              { id: 'active', label: `Active (${counts.active})` },
              { id: 'replenish', label: `Replenish (${counts.replenish})` },
              { id: 'excess_slow', label: `Excess & Slow (${counts.excess})` },
              { id: 'trends', label: `Demand Shifts (${counts.trends})` },
              { id: 'archived', label: `Reviewed / In Plan (${counts.archived})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === t.id
                  ? 'bg-white text-[#101B2D] shadow-xs'
                  : 'text-[#738096] hover:text-[#101B2D]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="text-xs text-[#738096] font-mono tabular-nums">
          Total Suggested Reorder Cost:{' '}
          <strong className="text-[#101B2D]">
            $
            {Math.round(
              filtered.reduce((sum, r) => sum + r.recommendedOrderQty * r.unitCost, 0)
            ).toLocaleString()}
          </strong>
        </div>
      </div>

      {/* Recommendation Cards */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
          <Package className="w-8 h-8 text-[#738096] mx-auto" />
          <h3 className="font-display text-base font-semibold text-[#101B2D]">
            No recommendations in this view
          </h3>
          <p className="text-sm text-[#738096]">
            All items matching this filter have been resolved or stock levels are balanced.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((rec) => {
            const isExpanded = expandedId === rec.productId;
            const inDraft =
              purchaseDraftIds.includes(rec.productId) || rec.status === 'in_plan';

            return (
              <div
                key={rec.productId}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden"
              >
                <div className="p-5 space-y-4">
                  {/* Top Header Row */}
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-lg bg-[#F6F8FB] border border-slate-200 shrink-0 mt-0.5">
                        {getTypeIcon(rec.type)}
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-display text-base font-bold text-[#101B2D]">
                          {rec.productName}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#738096]">
                          <span className="font-mono">{rec.sku}</span>
                          <span aria-hidden="true">·</span>
                          <span>{rec.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>{getTypeLabel(rec.type)}</span>
                          <span aria-hidden="true">·</span>
                          <span className={getUrgencyStyle(rec.urgency)}>
                            {rec.urgency.charAt(0).toUpperCase() + rec.urgency.slice(1)} Priority
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onViewProduct('forecasting', rec.productId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#202B3C] bg-[#F6F8FB] hover:bg-slate-200/70 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View Forecast
                      </button>

                      {rec.recommendedOrderQty > 0 && (
                        <button
                          type="button"
                          onClick={() => onAddToPurchasePlan(rec)}
                          disabled={inDraft}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            inDraft
                              ? 'bg-emerald-50 text-[#16A36A] border border-emerald-200 cursor-default'
                              : 'bg-[#101B2D] hover:bg-[#263B55] text-white'
                          }`}
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          {inDraft ? 'Added to Purchase Plan' : `Add ${rec.recommendedOrderQty} to Plan`}
                        </button>
                      )}

                      {rec.status === 'active' && (
                        <>
                          <button
                            type="button"
                            onClick={() => onUpdateStatus(rec.productId, 'reviewed')}
                            title="Mark as Reviewed"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#738096] hover:text-[#16A36A] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Reviewed
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateStatus(rec.productId, 'dismissed')}
                            title="Dismiss Recommendation"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#738096] hover:text-[#DC5555] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Dismiss
                          </button>
                        </>
                      )}

                      {(rec.status === 'dismissed' || rec.status === 'reviewed') && (
                        <button
                          type="button"
                          onClick={() => onUpdateStatus(rec.productId, 'active')}
                          className="text-xs font-medium text-[#4C7FE8] hover:underline px-2 py-1 cursor-pointer"
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 py-3 border-y border-slate-100 text-xs">
                    <div>
                      <div className="text-[#738096]">Current Stock</div>
                      <div className="font-mono font-bold text-sm text-[#101B2D] tabular-nums mt-0.5">
                        {rec.currentStock} units
                        {rec.incomingStock > 0 && (
                          <span className="text-[#4C7FE8] font-normal ml-1">
                            (+{rec.incomingStock} in)
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#738096]">Predicted Demand (30d)</div>
                      <div className="font-mono font-bold text-sm text-[#101B2D] tabular-nums mt-0.5">
                        {rec.predictedDemand30d} units
                      </div>
                    </div>
                    <div>
                      <div className="text-[#738096]">Recommended Order</div>
                      <div
                        className={`font-mono font-bold text-sm tabular-nums mt-0.5 ${
                          rec.recommendedOrderQty > 0 ? 'text-[#16A36A]' : 'text-[#738096]'
                        }`}
                      >
                        {rec.recommendedOrderQty > 0
                          ? `${rec.recommendedOrderQty} units ($${Math.round(
                              rec.recommendedOrderQty * rec.unitCost
                            ).toLocaleString()})`
                          : '0 units (Sufficient)'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[#738096]">Reorder Point</div>
                      <div className="font-mono font-bold text-sm text-[#101B2D] tabular-nums mt-0.5">
                        {rec.math.reorderPoint} units
                      </div>
                    </div>
                    <div>
                      <div className="text-[#738096]">Suggested Reorder Date</div>
                      <div className="font-mono font-bold text-sm text-[#101B2D] tabular-nums mt-0.5">
                        {rec.recommendedOrderQty > 0 ? rec.suggestedReorderDate : 'Not needed'}
                      </div>
                    </div>
                  </div>

                  {/* Reason & Suggested Action */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                    <div className="space-y-1">
                      <p className="text-[#202B3C]">{rec.reason}</p>
                      <p className="text-xs font-medium text-[#263B55]">
                        Suggested action: {rec.suggestedAction}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : rec.productId)
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4C7FE8] hover:text-[#101B2D] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Why this recommendation?
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expandable Explainable AI Math Breakdown */}
                {isExpanded && (
                  <div className="bg-[#F6F8FB] border-t border-slate-200 px-5 py-4 space-y-3 text-xs">
                    <div className="font-semibold text-[#101B2D]">
                      Transparent Calculation & Forecast Basis ({rec.supplierName} ·{' '}
                      {rec.leadTimeDays}-day lead time)
                    </div>
                    <div className="grid sm:grid-cols-3 gap-4 font-mono tabular-nums">
                      <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
                        <div className="text-[#738096] font-sans">1. Lead-Time Demand</div>
                        <div className="text-[#101B2D] font-semibold">
                          {rec.math.avgDailySales}/day × {rec.math.leadTimeDays}d ={' '}
                          {rec.math.expectedLeadTimeDemand} units
                        </div>
                        <div className="text-[11px] text-[#738096] font-sans">
                          Daily volatility σ = {rec.math.dailyVolatility} units
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
                        <div className="text-[#738096] font-sans">
                          2. Reorder Point Formula
                        </div>
                        <div className="text-[#101B2D] font-semibold">
                          {Math.round(rec.math.expectedLeadTimeDemand)} + {rec.math.safetyStock}{' '}
                          safety = {rec.math.reorderPoint} units
                        </div>
                        <div className="text-[11px] text-[#738096] font-sans">
                          Net available: {rec.math.currentStock} on-hand +{' '}
                          {rec.math.incomingStock} incoming = {rec.math.netAvailable}
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
                        <div className="text-[#738096] font-sans">
                          3. Target & Order Quantity
                        </div>
                        <div className="text-[#101B2D] font-semibold">
                          Target ({rec.math.planningHorizonDemand} + {rec.math.safetyStock}) −{' '}
                          {rec.math.netAvailable} = {rec.recommendedOrderQty} units
                        </div>
                        <div className="text-[11px] text-[#738096] font-sans">
                          {rec.recommendedOrderQty === 0
                            ? 'Net stock exceeds reorder point; no purchase advised.'
                            : `Estimated coverage after delivery: ~30+ days`}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
