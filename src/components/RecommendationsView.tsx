import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Lightbulb,
  ShoppingCart,
  XCircle,
} from 'lucide-react';
import { Button, EmptyStateCard, StatusLabel, SurfaceCard } from './ui/DesignPrimitives';
import { formatINRCompact } from '../lib/currency';
import type {
  AppView,
  RecommendationStatus,
  SmartRecommendation,
} from '../types/inventory';

interface RecommendationsViewProps {
  recommendations: SmartRecommendation[];
  purchaseDraftIds: string[];
  onUpdateStatus: (productId: string, status: RecommendationStatus) => Promise<void>;
  onAddToPurchasePlan: (rec: SmartRecommendation) => void;
  onViewProduct: (view: AppView, productId: string) => void;
}

type GroupKey =
  | 'immediate'
  | 'replenish'
  | 'excess'
  | 'slow'
  | 'opportunities';

export const RecommendationsView: React.FC<RecommendationsViewProps> = ({
  recommendations,
  purchaseDraftIds,
  onUpdateStatus,
  onAddToPurchasePlan,
  onViewProduct,
}) => {
  const [showArchived, setShowArchived] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(
    recommendations[0]?.productId || null
  );

  const visible = useMemo(
    () =>
      recommendations.filter((r) =>
        showArchived
          ? r.status === 'reviewed' || r.status === 'dismissed' || r.status === 'in_plan'
          : r.status !== 'dismissed'
      ),
    [recommendations, showArchived]
  );

  const groups: Array<{
    key: GroupKey;
    title: string;
    subtitle: string;
    items: SmartRecommendation[];
  }> = useMemo(() => {
    const immediate = visible.filter((r) => r.type === 'stockout_risk');
    const replenish = visible.filter((r) => r.type === 'immediate_replenishment');
    const excess = visible.filter((r) => r.type === 'excess_inventory');
    const slow = visible.filter((r) => r.type === 'slow_moving');
    const opportunities = visible.filter(
      (r) => r.type === 'rising_demand' || r.type === 'declining_demand'
    );

    const allGroups: Array<{
      key: GroupKey;
      title: string;
      subtitle: string;
      items: SmartRecommendation[];
    }> = [
      {
        key: 'immediate',
        title: 'Immediate Attention',
        subtitle: 'Out-of-stock SKUs or inventory depleting inside supplier lead times',
        items: immediate,
      },
      {
        key: 'replenish',
        title: 'Replenishment Required',
        subtitle: 'Available + incoming inventory has crossed the calculated reorder point',
        items: replenish,
      },
      {
        key: 'excess',
        title: 'Excess Inventory',
        subtitle: 'Overstocked SKUs holding excess working capital beyond planning targets',
        items: excess,
      },
      {
        key: 'slow',
        title: 'Slow-Moving Products',
        subtitle: 'Low-turnover items requiring reduced reorder minimums or bundling',
        items: slow,
      },
      {
        key: 'opportunities',
        title: 'Demand Opportunities',
        subtitle: 'Notable acceleration or deceleration shifts detected by forecasting models',
        items: opportunities,
      },
    ];
    return allGroups.filter((g) => g.items.length > 0);
  }, [visible]);

  const totalOrderInvestment = useMemo(
    () =>
      visible.reduce((sum, r) => sum + r.recommendedOrderQty * r.unitCost, 0),
    [visible]
  );

  const getUrgencyTone = (u: SmartRecommendation['urgency']) => {
    if (u === 'critical') return 'critical' as const;
    if (u === 'high') return 'warning' as const;
    if (u === 'medium') return 'info' as const;
    return 'neutral' as const;
  };

  return (
    <div className="space-y-6 animate-view-enter">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#49383D] tracking-tight">
            Smart Recommendations
          </h2>
          <p className="text-sm text-[#81777A] mt-0.5">
            Prioritized purchasing and inventory actions backed by transparent reorder formulas.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right text-xs">
            <div className="text-[#81777A]">Suggested Replenishment Capital</div>
            <div className="font-mono font-bold text-base text-[#49383D] tabular-nums">
              {formatINRCompact(totalOrderInvestment)}
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#FBF8F7] border border-[#E8DFE1] rounded-lg">
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                !showArchived
                  ? 'bg-[#E9DDE0] text-[#49383D] font-semibold'
                  : 'text-[#81777A] hover:text-[#49383D]'
              }`}
            >
              Prioritized Queue
            </button>
            <button
              type="button"
              onClick={() => setShowArchived(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                showArchived
                  ? 'bg-[#E9DDE0] text-[#49383D] font-semibold'
                  : 'text-[#81777A] hover:text-[#49383D]'
              }`}
            >
              Reviewed & In Plan
            </button>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyStateCard
          icon={<Lightbulb className="w-5 h-5" />}
          title="No recommendations in this view"
          description="Your active stock thresholds and forecast trajectories are balanced, or matching items have been reviewed."
        />
      ) : (
        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.key} className="space-y-3">
              <div className="flex items-baseline justify-between gap-4 border-b border-[#E8DFE1] pb-2">
                <div>
                  <h3 className="font-display text-base font-bold text-[#49383D]">
                    {group.title}
                  </h3>
                  <p className="text-xs text-[#81777A]">{group.subtitle}</p>
                </div>
                <span className="font-mono text-xs text-[#81777A] tabular-nums">
                  {group.items.length} {group.items.length === 1 ? 'SKU' : 'SKUs'}
                </span>
              </div>

              <div className="space-y-3">
                {group.items.map((rec) => {
                  const isExpanded = expandedId === rec.productId;
                  const inDraft =
                    purchaseDraftIds.includes(rec.productId) || rec.status === 'in_plan';

                  return (
                    <SurfaceCard key={rec.productId} className="overflow-hidden">
                      <div className="p-5 space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-3">
                              <h4 className="font-display text-base font-bold text-[#49383D]">
                                {rec.productName}
                              </h4>
                              <StatusLabel
                                tone={getUrgencyTone(rec.urgency)}
                                label={`${rec.urgency.charAt(0).toUpperCase() + rec.urgency.slice(1)} Urgency`}
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[#81777A]">
                              <span className="font-mono">{rec.sku}</span>
                              <span aria-hidden="true">·</span>
                              <span>{rec.category}</span>
                              <span aria-hidden="true">·</span>
                              <span>{rec.supplierName} ({rec.leadTimeDays}d lead)</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => onViewProduct('forecasting', rec.productId)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Inspect Forecast
                            </Button>

                            {rec.recommendedOrderQty > 0 && (
                              <Button
                                variant={inDraft ? 'secondary' : 'primary'}
                                size="sm"
                                disabled={inDraft}
                                onClick={() => onAddToPurchasePlan(rec)}
                              >
                                <ShoppingCart className="w-3.5 h-3.5" />
                                {inDraft
                                  ? 'In Purchase Plan'
                                  : `Add ${rec.recommendedOrderQty} to Plan`}
                              </Button>
                            )}

                            {rec.status === 'active' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onUpdateStatus(rec.productId, 'reviewed')}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Reviewed
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onUpdateStatus(rec.productId, 'dismissed')}
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  Dismiss
                                </Button>
                              </>
                            )}

                            {(rec.status === 'dismissed' || rec.status === 'reviewed') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onUpdateStatus(rec.productId, 'active')}
                              >
                                Restore
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 py-3 border-y border-[#E8DFE1] text-xs">
                          <div>
                            <div className="text-[#81777A]">Current Stock</div>
                            <div className="font-mono font-bold text-sm text-[#49383D] tabular-nums mt-0.5">
                              {rec.currentStock} units
                              {rec.incomingStock > 0 && (
                                <span className="text-[#64788A] font-normal ml-1">
                                  (+{rec.incomingStock})
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="text-[#81777A]">Predicted Demand</div>
                            <div className="font-mono font-bold text-sm text-[#49383D] tabular-nums mt-0.5">
                              {rec.predictedDemand30d} units / 30d
                            </div>
                          </div>
                          <div>
                            <div className="text-[#81777A]">Reorder Quantity</div>
                            <div
                              className={`font-mono font-bold text-sm tabular-nums mt-0.5 ${
                                rec.recommendedOrderQty > 0 ? 'text-[#779384]' : 'text-[#81777A]'
                              }`}
                            >
                              {rec.recommendedOrderQty > 0
                                ? `${rec.recommendedOrderQty} units`
                                : '0 units'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[#81777A]">Estimated Cost</div>
                            <div className="font-mono font-bold text-sm text-[#49383D] tabular-nums mt-0.5">
                              {rec.recommendedOrderQty > 0
                                ? formatINRCompact(rec.recommendedOrderQty * rec.unitCost)
                                : '—'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[#81777A]">Order By</div>
                            <div className="font-mono font-bold text-sm text-[#49383D] tabular-nums mt-0.5">
                              {rec.recommendedOrderQty > 0 ? rec.suggestedReorderDate : 'Not needed'}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                          <div className="space-y-1">
                            <p className="text-[#3F3437]">{rec.reason}</p>
                            <p className="text-xs font-medium text-[#805F69]">
                              Suggested action: {rec.suggestedAction}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : rec.productId)
                            }
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#805F69] hover:text-[#49383D] whitespace-nowrap shrink-0 cursor-pointer"
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

                      {isExpanded && (
                        <div className="bg-[#FBF8F7] border-t border-[#E8DFE1] px-5 py-4 space-y-3 text-xs">
                          <div className="font-semibold text-[#49383D]">
                            Transparent Calculation Breakdown
                          </div>
                          <div className="grid sm:grid-cols-3 gap-4 font-mono tabular-nums">
                            <div className="bg-white border border-[#E8DFE1] rounded-lg p-3 space-y-1">
                              <div className="text-[#81777A] font-sans">1. Lead-Time Demand</div>
                              <div className="text-[#49383D] font-semibold">
                                {rec.math.avgDailySales}/d × {rec.math.leadTimeDays}d ={' '}
                                {rec.math.expectedLeadTimeDemand} units
                              </div>
                              <div className="text-[11px] text-[#81777A] font-sans">
                                Daily demand volatility σ = {rec.math.dailyVolatility}
                              </div>
                            </div>
                            <div className="bg-white border border-[#E8DFE1] rounded-lg p-3 space-y-1">
                              <div className="text-[#81777A] font-sans">2. Reorder Point</div>
                              <div className="text-[#49383D] font-semibold">
                                {Math.round(rec.math.expectedLeadTimeDemand)} +{' '}
                                {rec.math.safetyStock} safety = {rec.math.reorderPoint} units
                              </div>
                              <div className="text-[11px] text-[#81777A] font-sans">
                                Net stock: {rec.math.currentStock} + {rec.math.incomingStock} in ={' '}
                                {rec.math.netAvailable}
                              </div>
                            </div>
                            <div className="bg-white border border-[#E8DFE1] rounded-lg p-3 space-y-1">
                              <div className="text-[#81777A] font-sans">3. Target Order Qty</div>
                              <div className="text-[#49383D] font-semibold">
                                ({rec.math.planningHorizonDemand} + {rec.math.safetyStock}) −{' '}
                                {rec.math.netAvailable} = {rec.recommendedOrderQty} units
                              </div>
                              <div className="text-[11px] text-[#81777A] font-sans">
                                {rec.recommendedOrderQty === 0
                                  ? 'Existing + incoming stock covers target.'
                                  : 'Restores full planning horizon + safety buffer.'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </SurfaceCard>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
