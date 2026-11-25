export type BusinessCategory =
  | 'Grocery & Supermarket'
  | 'Pharmacy & Medical'
  | 'Retail Shop'
  | 'Wholesaler & Distributor'
  | 'E-Commerce';

export interface BusinessProfile {
  id: string;
  name: string;
  category: BusinessCategory;
  currency: string;
  defaultLeadTimeDays: number;
  safetyStockFactor: number; // e.g., 1.0 = standard, 1.25 = conservative
  planningHorizonDays: number; // e.g., 30
  ownerName: string;
  ownerEmail: string;
  createdAt: string;
  isDemo?: boolean;
}

export interface Product {
  id: string;
  sku: string;
  businessId: string;
  name: string;
  category: string;
  currentStock: number;
  minStockLevel: number;
  maxStockLevel: number;
  unitPrice: number;
  unitCost: number;
  supplierName: string;
  leadTimeDays: number;
  incomingStock: number;
  seasonalTag: 'Year-Round' | 'Holiday Peak' | 'Winter Seasonal' | 'Summer Peak' | 'Back-to-School';
  promoActive: boolean;
  lastUpdated: string;
}

export interface SalesRecord {
  id: string;
  businessId: string;
  productId: string;
  date: string; // YYYY-MM-DD
  quantitySold: number;
  quantityReceived: number;
  revenue: number;
  unitPrice: number;
}

export type ActivityType =
  | 'product_added'
  | 'stock_updated'
  | 'order_received'
  | 'stock_sold'
  | 'low_stock_alert'
  | 'forecast_updated'
  | 'po_created';

export interface ActivityLog {
  id: string;
  businessId: string;
  type: ActivityType;
  title: string;
  description: string;
  productId?: string;
  timestamp: string;
}

export interface PurchaseOrderItem {
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  businessId: string;
  supplierName: string;
  status: 'draft' | 'submitted' | 'received';
  items: PurchaseOrderItem[];
  totalCost: number;
  createdAt: string;
  expectedDeliveryDate: string;
  receivedAt?: string;
  notes?: string;
}

export type RecommendationStatus = 'active' | 'reviewed' | 'dismissed' | 'in_plan';

export type ForecastModelType =
  | 'auto'
  | 'holt_winters'
  | 'weighted_ma'
  | 'linear_trend'
  | 'baseline_sma';

export interface ForecastPoint {
  date: string;
  actual?: number;
  predicted?: number;
  lowerBound?: number;
  upperBound?: number;
  isForecast: boolean;
}

export interface ForecastResult {
  modelUsed: Exclude<ForecastModelType, 'auto'>;
  modelLabel: string;
  horizonDays: number;
  dataPointsCount: number;
  historicalTotal: number;
  predictedTotal: number;
  avgDailySales: number;
  priorAvgDailySales: number;
  demandGrowthPct: number;
  expectedDepletionDays: number | null;
  expectedDepletionDate: string | null;
  mae: number;
  rmse: number;
  mape: number;
  confidenceLabel: 'High' | 'Moderate' | 'Limited Data';
  points: ForecastPoint[];
  patterns: string[];
  explanation: string;
}

export type RecommendationType =
  | 'stockout_risk'
  | 'immediate_replenishment'
  | 'excess_inventory'
  | 'slow_moving'
  | 'rising_demand'
  | 'declining_demand';

export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low';

export interface RecommendationMathDetails {
  avgDailySales: number;
  dailyVolatility: number;
  leadTimeDays: number;
  expectedLeadTimeDemand: number;
  safetyStock: number;
  reorderPoint: number;
  currentStock: number;
  incomingStock: number;
  netAvailable: number;
  planningHorizonDemand: number;
  targetStockLevel: number;
  recommendedOrderQty: number;
  demandGrowthPct: number;
  daysOfSupply: number | null;
}

export interface SmartRecommendation {
  productId: string;
  sku: string;
  productName: string;
  category: string;
  currentStock: number;
  incomingStock: number;
  minStockLevel: number;
  unitCost: number;
  unitPrice: number;
  supplierName: string;
  leadTimeDays: number;
  predictedDemand30d: number;
  recommendedOrderQty: number;
  suggestedReorderDate: string;
  daysUntilStockout: number | null;
  urgency: UrgencyLevel;
  type: RecommendationType;
  reason: string;
  suggestedAction: string;
  math: RecommendationMathDetails;
  status: RecommendationStatus;
}

export interface AIInsight {
  id: string;
  category: 'demand_surge' | 'replenishment' | 'slow_moving' | 'seasonal' | 'excess_capital';
  title: string;
  description: string;
  productId?: string;
  productName?: string;
  suggestedAction: string;
  targetView: 'dashboard' | 'forecasting' | 'recommendations' | 'inventory' | 'purchase-plan' | 'simulator';
  impactMetric: string;
}

export type AppView =
  | 'dashboard'
  | 'forecasting'
  | 'recommendations'
  | 'inventory'
  | 'purchase-plan'
  | 'simulator'
  | 'settings';

export interface SmartStockState {
  businesses: BusinessProfile[];
  activeBusinessId: string;
  products: Product[];
  sales: SalesRecord[];
  purchaseOrders: PurchaseOrder[];
  activities: ActivityLog[];
  recommendationStatuses: Record<string, RecommendationStatus>;
}
