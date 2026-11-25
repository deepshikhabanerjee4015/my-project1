import type {
  BusinessProfile,
  ForecastModelType,
  ForecastPoint,
  ForecastResult,
  Product,
  RecommendationMathDetails,
  RecommendationStatus,
  RecommendationType,
  SalesRecord,
  SmartRecommendation,
  UrgencyLevel,
} from '../types/inventory';

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getDayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

export function getReferenceDate(sales: SalesRecord[]): string {
  if (sales.length === 0) {
    return new Date().toISOString().slice(0, 10);
  }
  let maxDate = sales[0].date;
  for (const s of sales) {
    if (s.date > maxDate) maxDate = s.date;
  }
  return maxDate;
}

export interface DailySeriesPoint {
  date: string;
  qty: number;
  received: number;
  revenue: number;
}

export function buildDailySeries(
  sales: SalesRecord[],
  productIds: string[],
  lookbackDays = 90
): DailySeriesPoint[] {
  const idSet = new Set(productIds);
  const filtered = sales.filter((s) => idSet.has(s.productId));
  const refDate = getReferenceDate(filtered.length > 0 ? filtered : sales);

  const byDate = new Map<string, { qty: number; received: number; revenue: number }>();
  let minDateFound = refDate;
  for (const rec of filtered) {
    if (rec.date < minDateFound) minDateFound = rec.date;
    const prev = byDate.get(rec.date) || { qty: 0, received: 0, revenue: 0 };
    prev.qty += rec.quantitySold;
    prev.received += rec.quantityReceived;
    prev.revenue += rec.revenue;
    byDate.set(rec.date, prev);
  }

  const startDate = addDays(refDate, -(lookbackDays - 1));
  const effectiveStart = filtered.length > 0 && minDateFound > startDate ? minDateFound : startDate;

  const series: DailySeriesPoint[] = [];
  let cursor = effectiveStart;
  while (cursor <= refDate) {
    const entry = byDate.get(cursor) || { qty: 0, received: 0, revenue: 0 };
    series.push({
      date: cursor,
      qty: entry.qty,
      received: entry.received,
      revenue: entry.revenue,
    });
    cursor = addDays(cursor, 1);
  }
  return series;
}

// Compute 7-day-of-week multiplicative seasonality indices from historical series
function computeWeeklyIndices(values: number[], dates: string[]): number[] {
  const sums = new Array(7).fill(0);
  const counts = new Array(7).fill(0);
  const overallMean =
    values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 1;

  if (overallMean <= 0.01 || values.length < 14) {
    return new Array(7).fill(1);
  }

  for (let i = 0; i < values.length; i++) {
    const dow = getDayOfWeek(dates[i]);
    sums[dow] += values[i];
    counts[dow] += 1;
  }

  return sums.map((sum, dow) => {
    if (counts[dow] === 0) return 1;
    const raw = sum / counts[dow] / overallMean;
    // Dampen extremes so noise doesn't distort sparse SKUs
    return Math.max(0.65, Math.min(1.45, 0.3 + 0.7 * raw));
  });
}

function predictBaselineSMA(history: number[], horizon: number): number[] {
  const windowSize = Math.min(7, history.length);
  const slice = history.slice(-windowSize);
  const mean = slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
  return new Array(horizon).fill(Math.max(0, mean));
}

function predictWeightedMA(
  history: number[],
  dates: string[],
  horizon: number,
  promoBoost = 1
): number[] {
  const n = history.length;
  if (n === 0) return new Array(horizon).fill(0);

  const windowSize = Math.min(21, n);
  const slice = history.slice(-windowSize);
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < slice.length; i++) {
    const weight = i + 1;
    weightedSum += slice[i] * weight;
    totalWeight += weight;
  }
  const baseLevel = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Estimate gentle recent slope comparing last 7d vs prior 7d
  let slope = 0;
  if (n >= 14) {
    const recent7 = history.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const prior7 = history.slice(-14, -7).reduce((a, b) => a + b, 0) / 7;
    slope = Math.max(-baseLevel * 0.03, Math.min(baseLevel * 0.03, (recent7 - prior7) / 14));
  }

  const dowIndices = computeWeeklyIndices(history, dates);
  const lastDate = dates[dates.length - 1];
  const out: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    const fDate = addDays(lastDate, h);
    const dow = getDayOfWeek(fDate);
    // Dampen trend over long horizons to prevent runaway extrapolation
    const dampedStep = slope * Math.min(h, 21) * Math.pow(0.97, Math.max(0, h - 14));
    const val = Math.max(0, (baseLevel + dampedStep) * dowIndices[dow] * promoBoost);
    out.push(val);
  }
  return out;
}

function predictHoltWinters(
  history: number[],
  dates: string[],
  horizon: number,
  promoBoost = 1
): number[] {
  const n = history.length;
  if (n < 7) return predictBaselineSMA(history, horizon);

  const dowIndices = computeWeeklyIndices(history, dates);
  const deseasonalized = history.map((v, i) => v / dowIndices[getDayOfWeek(dates[i])]);

  const alpha = 0.28;
  const beta = 0.12;
  const phi = 0.94; // Trend dampening factor

  let level = deseasonalized[0];
  let trend =
    n >= 7
      ? (deseasonalized.slice(0, 7).reduce((a, b) => a + b, 0) / 7 - deseasonalized[0]) / 7
      : 0;

  for (let i = 1; i < n; i++) {
    const prevLevel = level;
    level = alpha * deseasonalized[i] + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
  }

  const lastDate = dates[dates.length - 1];
  const out: number[] = [];
  let cumulativePhi = 0;
  for (let h = 1; h <= horizon; h++) {
    cumulativePhi += Math.pow(phi, h);
    const fDate = addDays(lastDate, h);
    const dow = getDayOfWeek(fDate);
    const raw = (level + cumulativePhi * trend) * dowIndices[dow] * promoBoost;
    out.push(Math.max(0, raw));
  }
  return out;
}

function predictLinearTrend(
  history: number[],
  dates: string[],
  horizon: number,
  promoBoost = 1
): number[] {
  const n = history.length;
  if (n < 7) return predictBaselineSMA(history, horizon);

  const dowIndices = computeWeeklyIndices(history, dates);
  const y = history.map((v, i) => v / dowIndices[getDayOfWeek(dates[i])]);

  const meanX = (n - 1) / 2;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (y[i] - meanY);
    den += (i - meanX) * (i - meanX);
  }
  const rawSlope = den > 0 ? num / den : 0;
  const maxSlope = Math.max(0.05, meanY * 0.025);
  const slope = Math.max(-maxSlope, Math.min(maxSlope, rawSlope));
  const intercept = meanY - slope * meanX;

  const lastDate = dates[dates.length - 1];
  const out: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    const fDate = addDays(lastDate, h);
    const dow = getDayOfWeek(fDate);
    const dampedH = Math.min(h, 30) + Math.max(0, h - 30) * 0.4;
    const base = intercept + slope * (n - 1 + dampedH);
    out.push(Math.max(0, base * dowIndices[dow] * promoBoost));
  }
  return out;
}

function evaluateErrors(actual: number[], predicted: number[]) {
  if (actual.length === 0) return { mae: 0, rmse: 0, mape: 0 };
  let absErr = 0;
  let sqErr = 0;
  let pctErr = 0;
  let pctCount = 0;

  for (let i = 0; i < actual.length; i++) {
    const err = actual[i] - predicted[i];
    absErr += Math.abs(err);
    sqErr += err * err;
    if (actual[i] > 0) {
      pctErr += Math.abs(err) / actual[i];
      pctCount += 1;
    }
  }
  return {
    mae: absErr / actual.length,
    rmse: Math.sqrt(sqErr / actual.length),
    mape: pctCount > 0 ? (pctErr / pctCount) * 100 : 0,
  };
}

const MODEL_LABELS: Record<Exclude<ForecastModelType, 'auto'>, string> = {
  holt_winters: 'Holt-Winters Seasonal Exponential Smoothing',
  weighted_ma: 'Weighted Moving Average + Weekly Cycle',
  linear_trend: 'Damped Linear Regression + Seasonality',
  baseline_sma: 'Simple Moving Average Baseline (Limited History)',
};

export function runDemandForecast(params: {
  series: DailySeriesPoint[];
  horizonDays: number;
  currentStock: number;
  modelType?: ForecastModelType;
  promoActive?: boolean;
  seasonalFactor?: number;
  subjectLabel: string;
}): ForecastResult {
  const {
    series,
    horizonDays,
    currentStock,
    modelType = 'auto',
    promoActive = false,
    seasonalFactor = 1,
    subjectLabel,
  } = params;

  const values = series.map((s) => s.qty);
  const dates = series.map((s) => s.date);
  const n = values.length;
  const promoBoost = (promoActive ? 1.15 : 1.0) * seasonalFactor;

  // Choose model & validate via holdout
  let chosenModel: Exclude<ForecastModelType, 'auto'> = 'baseline_sma';
  let mae = 0;
  let rmse = 0;
  let mape = 0;

  if (n < 14) {
    chosenModel = modelType === 'auto' ? 'baseline_sma' : modelType;
    const mean = n > 0 ? values.reduce((a, b) => a + b, 0) / n : 0;
    const errs = evaluateErrors(values, new Array(n).fill(mean));
    mae = errs.mae;
    rmse = errs.rmse;
    mape = errs.mape;
  } else {
    const holdout = n >= 28 ? 14 : 5;
    const trainV = values.slice(0, n - holdout);
    const trainD = dates.slice(0, n - holdout);
    const testV = values.slice(n - holdout);

    const candidates: Array<Exclude<ForecastModelType, 'auto'>> =
      n >= 28
        ? ['holt_winters', 'weighted_ma', 'linear_trend']
        : ['weighted_ma', 'linear_trend', 'baseline_sma'];

    const evaluateCandidate = (m: Exclude<ForecastModelType, 'auto'>) => {
      let preds: number[];
      if (m === 'holt_winters') preds = predictHoltWinters(trainV, trainD, holdout, 1);
      else if (m === 'weighted_ma') preds = predictWeightedMA(trainV, trainD, holdout, 1);
      else if (m === 'linear_trend') preds = predictLinearTrend(trainV, trainD, holdout, 1);
      else preds = predictBaselineSMA(trainV, holdout);
      return evaluateErrors(testV, preds);
    };

    if (modelType === 'auto') {
      let bestRmse = Infinity;
      for (const m of candidates) {
        const res = evaluateCandidate(m);
        if (res.rmse < bestRmse) {
          bestRmse = res.rmse;
          chosenModel = m;
          mae = res.mae;
          rmse = res.rmse;
          mape = res.mape;
        }
      }
    } else {
      chosenModel = modelType;
      const res = evaluateCandidate(modelType);
      mae = res.mae;
      rmse = res.rmse;
      mape = res.mape;
    }
  }

  let futurePreds: number[];
  if (chosenModel === 'holt_winters') {
    futurePreds = predictHoltWinters(values, dates, horizonDays, promoBoost);
  } else if (chosenModel === 'weighted_ma') {
    futurePreds = predictWeightedMA(values, dates, horizonDays, promoBoost);
  } else if (chosenModel === 'linear_trend') {
    futurePreds = predictLinearTrend(values, dates, horizonDays, promoBoost);
  } else {
    futurePreds = predictBaselineSMA(values, horizonDays).map((v) => v * promoBoost);
  }

  // Build points: historical + future
  const points: ForecastPoint[] = series.map((s) => ({
    date: s.date,
    actual: Math.round(s.qty),
    isForecast: false,
  }));

  // Anchor line continuity at last historical day
  if (points.length > 0) {
    points[points.length - 1].predicted = points[points.length - 1].actual;
  }

  const lastDate = dates[dates.length - 1] || new Date().toISOString().slice(0, 10);
  const uncertaintyBase = Math.max(0.8, rmse || mae || 1.2);

  let cumulativeDemand = 0;
  let depletionDayOffset: number | null = null;

  for (let h = 1; h <= horizonDays; h++) {
    const predVal = futurePreds[h - 1];
    cumulativeDemand += predVal;
    if (depletionDayOffset === null && currentStock > 0 && cumulativeDemand >= currentStock) {
      depletionDayOffset = h;
    }
    const band = 1.645 * uncertaintyBase * Math.sqrt(1 + h / 14); // 90% prediction interval
    points.push({
      date: addDays(lastDate, h),
      predicted: Number(predVal.toFixed(1)),
      lowerBound: Number(Math.max(0, predVal - band).toFixed(1)),
      upperBound: Number((predVal + band).toFixed(1)),
      isForecast: true,
    });
  }

  const historicalTotal = Math.round(values.reduce((a, b) => a + b, 0));
  const predictedTotal = Math.round(futurePreds.reduce((a, b) => a + b, 0));
  const avgDailySales = horizonDays > 0 ? predictedTotal / horizonDays : 0;

  // Compare prior 14 days vs recent 14 days for growth rate
  const recentWindow = Math.min(14, Math.floor(n / 2));
  const recentAvg =
    recentWindow > 0
      ? values.slice(-recentWindow).reduce((a, b) => a + b, 0) / recentWindow
      : avgDailySales;
  const priorAvg =
    recentWindow > 0 && n >= recentWindow * 2
      ? values.slice(-recentWindow * 2, -recentWindow).reduce((a, b) => a + b, 0) / recentWindow
      : recentAvg;

  const demandGrowthPct =
    priorAvg > 0.05 ? ((avgDailySales - priorAvg) / priorAvg) * 100 : 0;

  let expectedDepletionDays: number | null = depletionDayOffset;
  if (currentStock === 0) {
    expectedDepletionDays = 0;
  } else if (expectedDepletionDays === null && avgDailySales > 0.05) {
    expectedDepletionDays = Math.round(currentStock / avgDailySales);
  }

  const expectedDepletionDate =
    expectedDepletionDays !== null ? addDays(lastDate, expectedDepletionDays) : null;

  const confidenceLabel: ForecastResult['confidenceLabel'] =
    n < 14 ? 'Limited Data' : rmse <= Math.max(2, avgDailySales * 0.45) ? 'High' : 'Moderate';

  // Detect demand patterns
  const patterns: string[] = [];
  if (n >= 14) {
    const dowIndices = computeWeeklyIndices(values, dates);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    let maxDow = 0;
    for (let i = 1; i < 7; i++) {
      if (dowIndices[i] > dowIndices[maxDow]) maxDow = i;
    }
    if (dowIndices[maxDow] >= 1.12) {
      patterns.push(
        `Peak weekly volume occurs on ${dayNames[maxDow]}s (+${Math.round(
          (dowIndices[maxDow] - 1) * 100
        )}% above baseline).`
      );
    }
  }
  if (demandGrowthPct >= 10) {
    patterns.push(`Upward demand momentum detected (+${demandGrowthPct.toFixed(1)}% vs prior period).`);
  } else if (demandGrowthPct <= -10) {
    patterns.push(`Softening demand velocity (${demandGrowthPct.toFixed(1)}% vs prior period).`);
  } else {
    patterns.push('Steady demand trajectory with low structural drift.');
  }
  if (promoActive) {
    patterns.push('Active promotional uplift (+15%) factored into forward projection.');
  }
  if (seasonalFactor > 1.05) {
    patterns.push(`Seasonal multiplier (${seasonalFactor.toFixed(2)}x) applied to forecast curve.`);
  }

  // Generate grounded natural language explanation
  const trendPhrase =
    demandGrowthPct >= 8
      ? `Recent sales activity indicates an upward demand shift (+${demandGrowthPct.toFixed(1)}%).`
      : demandGrowthPct <= -8
      ? `Recent sales velocity has cooled (${demandGrowthPct.toFixed(1)}% vs the prior baseline).`
      : 'Recent sales cadence remains consistent with historical averages.';

  const stockPhrase =
    currentStock === 0
      ? 'Current stock is depleted (0 units on hand); immediate restocking is required.'
      : expectedDepletionDays !== null && expectedDepletionDays <= horizonDays
      ? `At ${avgDailySales.toFixed(1)} units/day, existing inventory (${currentStock} units) is projected to deplete in ${expectedDepletionDays} days (${expectedDepletionDate}).`
      : `Existing inventory (${currentStock} units) covers projected demand across the ${horizonDays}-day window.`;

  const explanation = `Predicted demand for ${subjectLabel} over the next ${horizonDays} days is ${predictedTotal.toLocaleString()} units (~${avgDailySales.toFixed(
    1
  )}/day) using ${MODEL_LABELS[chosenModel]}. ${trendPhrase} ${stockPhrase}`;

  return {
    modelUsed: chosenModel,
    modelLabel: MODEL_LABELS[chosenModel],
    horizonDays,
    dataPointsCount: n,
    historicalTotal,
    predictedTotal,
    avgDailySales: Number(avgDailySales.toFixed(2)),
    priorAvgDailySales: Number(priorAvg.toFixed(2)),
    demandGrowthPct: Number(demandGrowthPct.toFixed(1)),
    expectedDepletionDays,
    expectedDepletionDate,
    mae: Number(mae.toFixed(2)),
    rmse: Number(rmse.toFixed(2)),
    mape: Number(mape.toFixed(1)),
    confidenceLabel,
    points,
    patterns,
    explanation,
    };
}

export function generateRecommendations(params: {
  business: BusinessProfile;
  products: Product[];
  sales: SalesRecord[];
  statuses: Record<string, RecommendationStatus>;
}): SmartRecommendation[] {
  const { business, products, sales, statuses } = params;
  const refDate = getReferenceDate(sales);
  const recs: SmartRecommendation[] = [];

  for (const product of products) {
    const series = buildDailySeries(sales, [product.id], 90);
    const seasonalFactor =
      product.seasonalTag === 'Holiday Peak'
        ? 1.18
        : product.seasonalTag === 'Winter Seasonal'
        ? 1.12
        : 1.0;

    const forecast30 = runDemandForecast({
      series,
      horizonDays: business.planningHorizonDays || 30,
      currentStock: product.currentStock,
      modelType: 'auto',
      promoActive: product.promoActive,
      seasonalFactor,
      subjectLabel: product.name,
    });

    const values = series.map((s) => s.qty);
    const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const variance =
      values.length > 1
        ? values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1)
        : 0;
    const dailyVolatility = Math.sqrt(variance);

    const avgDaily = forecast30.avgDailySales;
    const leadTime = product.leadTimeDays || business.defaultLeadTimeDays || 5;
    const expectedLeadTimeDemand = avgDaily * leadTime;

    // Safety stock = z * sigma * sqrt(L) + buffer days * business factor
    const safetyStock = Math.max(
      product.minStockLevel > 0 ? Math.round(product.minStockLevel * 0.4) : 2,
      Math.ceil(
        (1.65 * dailyVolatility * Math.sqrt(leadTime) + avgDaily * 2) *
          (business.safetyStockFactor || 1.0)
      )
    );

    const reorderPoint = Math.ceil(expectedLeadTimeDemand + safetyStock);
    const netAvailable = product.currentStock + (product.incomingStock || 0);
    const targetStockLevel = Math.ceil(forecast30.predictedTotal + safetyStock);

    // Never recommend buying more if netAvailable is already above reorder point & covers lead time + buffer
    const needsReorder = netAvailable <= reorderPoint;
    const recommendedOrderQty = needsReorder
      ? Math.max(1, targetStockLevel - netAvailable)
      : 0;

    const daysOfSupply = avgDaily > 0.05 ? Math.round(product.currentStock / avgDaily) : null;
    const daysUntilStockout =
      product.currentStock === 0
        ? 0
        : avgDaily > 0.05
        ? Math.round(product.currentStock / avgDaily)
        : null;

    const daysUntilReorderPoint =
      avgDaily > 0.05 ? Math.max(0, Math.floor((netAvailable - reorderPoint) / avgDaily)) : 30;
    const suggestedReorderDate = needsReorder
      ? refDate
      : addDays(refDate, Math.min(60, daysUntilReorderPoint));

    const math: RecommendationMathDetails = {
      avgDailySales: Number(avgDaily.toFixed(2)),
      dailyVolatility: Number(dailyVolatility.toFixed(2)),
      leadTimeDays: leadTime,
      expectedLeadTimeDemand: Number(expectedLeadTimeDemand.toFixed(1)),
      safetyStock,
      reorderPoint,
      currentStock: product.currentStock,
      incomingStock: product.incomingStock || 0,
      netAvailable,
      planningHorizonDemand: forecast30.predictedTotal,
      targetStockLevel,
      recommendedOrderQty,
      demandGrowthPct: forecast30.demandGrowthPct,
      daysOfSupply,
    };

    let type: RecommendationType | null = null;
    let urgency: UrgencyLevel = 'low';
    let reason = '';
    let suggestedAction = '';

    if (product.currentStock === 0) {
      type = 'stockout_risk';
      urgency = 'critical';
      reason = `Zero units on hand while forecasted demand is ${avgDaily.toFixed(
        1
      )} units/day. Lost sales are occurring now.`;
      suggestedAction = `Place an expedited purchase order for ${recommendedOrderQty} units from ${product.supplierName}.`;
    } else if (daysUntilStockout !== null && daysUntilStockout <= leadTime && product.incomingStock < expectedLeadTimeDemand) {
      type = 'stockout_risk';
      urgency = 'critical';
      reason = `Only ${daysUntilStockout} days of stock left (${product.currentStock} units), which is below the ${leadTime}-day supplier lead time.`;
      suggestedAction = `Order ${recommendedOrderQty} units immediately to prevent a stockout before delivery arrives.`;
    } else if (needsReorder) {
      type = 'immediate_replenishment';
      urgency = 'high';
      reason = `Net available stock (${netAvailable} units) has fallen below the calculated reorder point (${reorderPoint} units).`;
      suggestedAction = `Add ${recommendedOrderQty} units to your purchase plan by ${suggestedReorderDate}.`;
    } else if (daysOfSupply !== null && daysOfSupply > 55 && product.currentStock * product.unitCost > 4000) {
      type = 'excess_inventory';
      urgency = 'medium';
      reason = `${daysOfSupply} days of supply on hand (₹${Math.round(
        product.currentStock * product.unitCost
      ).toLocaleString('en-IN')} capital tied up), well above the ${business.planningHorizonDays}-day planning target.`;
      suggestedAction = 'Pause replenishment and consider a targeted bundle or markdown to free working capital.';
    } else if (forecast30.demandGrowthPct >= 14) {
      type = 'rising_demand';
      urgency = 'medium';
      reason = `Forecasted demand is rising +${forecast30.demandGrowthPct.toFixed(
        1
      )}% (${avgDaily.toFixed(1)} units/day). Current stock covers ${daysOfSupply ?? '—'} days.`;
      suggestedAction = `Monitor velocity closely and prepare a replenishment order around ${suggestedReorderDate}.`;
    } else if (avgDaily < 0.45 && product.currentStock > product.minStockLevel * 1.5) {
      type = 'slow_moving';
      urgency = 'low';
      reason = `Low turnover (${avgDaily.toFixed(2)} units/day) with ${product.currentStock} units sitting in storage.`;
      suggestedAction = 'Reduce minimum reorder thresholds and avoid new purchasing until stock normalizes.';
    } else if (forecast30.demandGrowthPct <= -14) {
      type = 'declining_demand';
      urgency = 'low';
      reason = `Demand velocity slowed by ${forecast30.demandGrowthPct.toFixed(
        1
      )}% compared to the prior two-week window.`;
      suggestedAction = 'Scale down upcoming supplier commitments to avoid overstocking.';
    }

    if (type) {
      recs.push({
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        category: product.category,
        currentStock: product.currentStock,
        incomingStock: product.incomingStock || 0,
        minStockLevel: product.minStockLevel,
        unitCost: product.unitCost,
        unitPrice: product.unitPrice,
        supplierName: product.supplierName,
        leadTimeDays: leadTime,
        predictedDemand30d: forecast30.predictedTotal,
        recommendedOrderQty,
        suggestedReorderDate,
        daysUntilStockout,
        urgency,
        type,
        reason,
        suggestedAction,
        math,
        status: statuses[product.id] || 'active',
      });
    }
  }

  const urgencyRank: Record<UrgencyLevel, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return recs.sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency]);
}
