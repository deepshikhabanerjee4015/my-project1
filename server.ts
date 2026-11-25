import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { createDatasetForBusiness, createInitialSeedState } from './src/data/seedData.ts';
import type {
  ActivityLog,
  BusinessProfile,
  Product,
  PurchaseOrder,
  RecommendationStatus,
  SalesRecord,
  SmartStockState,
} from './src/types/inventory.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'smartstock-db.json');

function ensureDb(): SmartStockState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as SmartStockState;
      if (parsed && Array.isArray(parsed.businesses) && parsed.businesses.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load DB file, re-seeding:', err);
  }
  const initial = createInitialSeedState();
  saveDb(initial);
  return initial;
}

function saveDb(state: SmartStockState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist DB file:', err);
  }
}

let dbState: SmartStockState = ensureDb();

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function appendActivity(
  businessId: string,
  type: ActivityLog['type'],
  title: string,
  description: string,
  productId?: string
): void {
  const entry: ActivityLog = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    businessId,
    type,
    title,
    description,
    productId,
    timestamp: new Date().toISOString(),
  };
  dbState.activities.unshift(entry);
  if (dbState.activities.length > 250) {
    dbState.activities = dbState.activities.slice(0, 250);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, businesses: dbState.businesses.length });
  });

  // Get full application state
  app.get('/api/state', (_req, res) => {
    res.json(dbState);
  });

  // Switch active business
  app.post('/api/businesses/active', (req, res) => {
    const { businessId } = req.body as { businessId?: string };
    if (!businessId || !dbState.businesses.some((b) => b.id === businessId)) {
      res.status(404).json({ error: 'Business not found.' });
      return;
    }
    dbState.activeBusinessId = businessId;
    saveDb(dbState);
    res.json({ activeBusinessId: businessId });
  });

  // Create / Onboard a new business
  app.post('/api/businesses', (req, res) => {
    const body = req.body as Partial<BusinessProfile> & { includeStarterProducts?: boolean };
    if (!body.name || !body.category) {
      res.status(400).json({ error: 'Business name and category are required.' });
      return;
    }

    const newBiz: BusinessProfile = {
      id: `biz-${Date.now().toString(36)}`,
      name: body.name.trim(),
      category: body.category,
      currency: body.currency || 'USD',
      defaultLeadTimeDays: Number(body.defaultLeadTimeDays) || 5,
      safetyStockFactor: Number(body.safetyStockFactor) || 1.1,
      planningHorizonDays: Number(body.planningHorizonDays) || 30,
      ownerName: body.ownerName?.trim() || 'Business Owner',
      ownerEmail: body.ownerEmail?.trim() || 'owner@business.com',
      createdAt: new Date().toISOString(),
      isDemo: false,
    };

    const dataset = createDatasetForBusiness(
      newBiz,
      new Date(),
      body.includeStarterProducts !== false
    );

    dbState.businesses.push(newBiz);
    dbState.activeBusinessId = newBiz.id;
    dbState.products.push(...dataset.products);
    dbState.sales.push(...dataset.sales);
    dbState.purchaseOrders.push(...dataset.purchaseOrders);
    dbState.activities.unshift(...dataset.activities);
    saveDb(dbState);

    res.status(201).json({ business: newBiz, state: dbState });
  });

  // Update business settings
  app.put('/api/businesses/:id', (req, res) => {
    const { id } = req.params;
    const idx = dbState.businesses.findIndex((b) => b.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Business not found.' });
      return;
    }
    const updates = req.body as Partial<BusinessProfile>;
    dbState.businesses[idx] = {
      ...dbState.businesses[idx],
      ...updates,
      id,
    };
    saveDb(dbState);
    res.json({ business: dbState.businesses[idx] });
  });

  // Add a product
  app.post('/api/products', (req, res) => {
    const body = req.body as Partial<Product>;
    const businessId = body.businessId || dbState.activeBusinessId;
    if (!body.name || !body.category || !body.sku) {
      res.status(400).json({ error: 'Product name, SKU, and category are required.' });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const product: Product = {
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sku: body.sku.trim().toUpperCase(),
      businessId,
      name: body.name.trim(),
      category: body.category.trim(),
      currentStock: Math.max(0, Number(body.currentStock) || 0),
      minStockLevel: Math.max(0, Number(body.minStockLevel) || 10),
      maxStockLevel: Math.max(10, Number(body.maxStockLevel) || 100),
      unitPrice: Math.max(0.01, Number(body.unitPrice) || 10),
      unitCost: Math.max(0.01, Number(body.unitCost) || 5),
      supplierName: body.supplierName?.trim() || 'Primary Supplier',
      leadTimeDays: Math.max(1, Number(body.leadTimeDays) || 5),
      incomingStock: Math.max(0, Number(body.incomingStock) || 0),
      seasonalTag: body.seasonalTag || 'Year-Round',
      promoActive: Boolean(body.promoActive),
      lastUpdated: today,
    };

    dbState.products.push(product);
    appendActivity(
      businessId,
      'product_added',
      `Added product: ${product.name}`,
      `SKU ${product.sku} added to ${product.category} with ${product.currentStock} units on hand.`,
      product.id
    );
    saveDb(dbState);
    res.status(201).json({ product });
  });

  // Update a product
  app.put('/api/products/:id', (req, res) => {
    const { id } = req.params;
    const idx = dbState.products.findIndex((p) => p.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const prev = dbState.products[idx];
    const updates = req.body as Partial<Product>;
    const nextStock =
      updates.currentStock !== undefined ? Math.max(0, Number(updates.currentStock)) : prev.currentStock;

    const updated: Product = {
      ...prev,
      ...updates,
      id: prev.id,
      businessId: prev.businessId,
      currentStock: nextStock,
      lastUpdated: new Date().toISOString().slice(0, 10),
    };

    dbState.products[idx] = updated;
    if (nextStock !== prev.currentStock) {
      appendActivity(
        prev.businessId,
        nextStock === 0 || nextStock < updated.minStockLevel ? 'low_stock_alert' : 'stock_updated',
        `Stock updated: ${updated.name}`,
        `On-hand inventory adjusted from ${prev.currentStock} to ${nextStock} units.`,
        updated.id
      );
    } else {
      appendActivity(
        prev.businessId,
        'stock_updated',
        `Updated product details: ${updated.name}`,
        `Catalog configuration updated for SKU ${updated.sku}.`,
        updated.id
      );
    }

    saveDb(dbState);
    res.json({ product: updated });
  });

  // Delete a product
  app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;
    const idx = dbState.products.findIndex((p) => p.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    const removed = dbState.products[idx];
    dbState.products.splice(idx, 1);
    dbState.sales = dbState.sales.filter((s) => s.productId !== id);
    appendActivity(
      removed.businessId,
      'stock_updated',
      `Removed product: ${removed.name}`,
      `SKU ${removed.sku} removed from active catalog.`
    );
    saveDb(dbState);
    res.json({ ok: true });
  });

  // Bulk import products from CSV rows
  app.post('/api/products/import', (req, res) => {
    const { businessId, items } = req.body as {
      businessId?: string;
      items?: Array<Partial<Product>>;
    };
    const targetBiz = businessId || dbState.activeBusinessId;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'No product rows supplied for import.' });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const created: Product[] = [];

    for (const row of items) {
      if (!row.name) continue;
      const prod: Product = {
        id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sku: (row.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase(),
        businessId: targetBiz,
        name: String(row.name).trim(),
        category: String(row.category || 'General Merchandise').trim(),
        currentStock: Math.max(0, Number(row.currentStock) || 0),
        minStockLevel: Math.max(0, Number(row.minStockLevel) || 10),
        maxStockLevel: Math.max(20, Number(row.maxStockLevel) || 100),
        unitPrice: Math.max(0.01, Number(row.unitPrice) || 12),
        unitCost: Math.max(0.01, Number(row.unitCost) || 6),
        supplierName: String(row.supplierName || 'Primary Supplier').trim(),
        leadTimeDays: Math.max(1, Number(row.leadTimeDays) || 5),
        incomingStock: Math.max(0, Number(row.incomingStock) || 0),
        seasonalTag: row.seasonalTag || 'Year-Round',
        promoActive: Boolean(row.promoActive),
        lastUpdated: today,
      };
      dbState.products.push(prod);
      created.push(prod);
    }

    appendActivity(
      targetBiz,
      'product_added',
      `Imported ${created.length} products via CSV`,
      `Catalog expanded with ${created.length} imported SKUs.`
    );
    saveDb(dbState);
    res.status(201).json({ importedCount: created.length, products: created });
  });

  // Record a sale or stock receipt
  app.post('/api/sales', (req, res) => {
    const { productId, quantitySold = 0, quantityReceived = 0, date } = req.body as {
      productId?: string;
      quantitySold?: number;
      quantityReceived?: number;
      date?: string;
    };
    const idx = dbState.products.findIndex((p) => p.id === productId);
    if (idx === -1) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const product = dbState.products[idx];
    const sold = Math.max(0, Math.round(Number(quantitySold) || 0));
    const received = Math.max(0, Math.round(Number(quantityReceived) || 0));
    if (sold === 0 && received === 0) {
      res.status(400).json({ error: 'Enter a quantity sold or received greater than zero.' });
      return;
    }
    const txDate = date || new Date().toISOString().slice(0, 10);

    const newStock = Math.max(0, product.currentStock + received - sold);
    dbState.products[idx] = {
      ...product,
      currentStock: newStock,
      lastUpdated: txDate,
    };

    const existingSaleIdx = dbState.sales.findIndex(
      (s) => s.productId === product.id && s.date === txDate
    );
    if (existingSaleIdx !== -1) {
      const prev = dbState.sales[existingSaleIdx];
      const totalSold = prev.quantitySold + sold;
      dbState.sales[existingSaleIdx] = {
        ...prev,
        quantitySold: totalSold,
        quantityReceived: prev.quantityReceived + received,
        revenue: Number((totalSold * product.unitPrice).toFixed(2)),
      };
    } else {
      const record: SalesRecord = {
        id: `sale-${product.id}-${txDate}-${Date.now()}`,
        businessId: product.businessId,
        productId: product.id,
        date: txDate,
        quantitySold: sold,
        quantityReceived: received,
        revenue: Number((sold * product.unitPrice).toFixed(2)),
        unitPrice: product.unitPrice,
      };
      dbState.sales.push(record);
    }

    if (sold > 0) {
      appendActivity(
        product.businessId,
        newStock <= product.minStockLevel ? 'low_stock_alert' : 'stock_sold',
        `Recorded sale: ${product.name}`,
        `Sold ${sold} units ($${(sold * product.unitPrice).toFixed(2)}). Remaining stock: ${newStock}.`,
        product.id
      );
    }
    if (received > 0) {
      appendActivity(
        product.businessId,
        'order_received',
        `Stock received: ${product.name}`,
        `Checked in ${received} units. On-hand stock is now ${newStock}.`,
        product.id
      );
    }

    saveDb(dbState);
    res.status(201).json({ product: dbState.products[idx] });
  });

  // Update recommendation review/dismiss status
  app.post('/api/recommendations/:productId/status', (req, res) => {
    const { productId } = req.params;
    const { status } = req.body as { status?: RecommendationStatus };
    if (!status) {
      res.status(400).json({ error: 'Status is required.' });
      return;
    }
    dbState.recommendationStatuses[productId] = status;
    saveDb(dbState);
    res.json({ productId, status });
  });

  // Create a Purchase Order
  app.post('/api/purchase-orders', (req, res) => {
    const { businessId, supplierName, items, notes } = req.body as {
      businessId?: string;
      supplierName?: string;
      items?: Array<{ productId: string; quantity: number }>;
      notes?: string;
    };
    const targetBiz = businessId || dbState.activeBusinessId;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Purchase order must contain at least one item.' });
      return;
    }

    const poItems = items
      .map((item) => {
        const prod = dbState.products.find((p) => p.id === item.productId);
        if (!prod || item.quantity <= 0) return null;
        const qty = Math.round(item.quantity);
        return {
          productId: prod.id,
          sku: prod.sku,
          productName: prod.name,
          quantity: qty,
          unitCost: prod.unitCost,
          lineTotal: Number((qty * prod.unitCost).toFixed(2)),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (poItems.length === 0) {
      res.status(400).json({ error: 'No valid products found for purchase order.' });
      return;
    }

    const totalCost = Number(
      poItems.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)
    );
    const maxLead = Math.max(
      ...poItems.map((i) => dbState.products.find((p) => p.id === i.productId)?.leadTimeDays || 5)
    );
    const today = new Date();
    const expected = new Date(today);
    expected.setUTCDate(expected.getUTCDate() + maxLead);

    const po: PurchaseOrder = {
      id: `po-${Date.now()}`,
      poNumber: `PO-${Math.floor(10000 + Math.random() * 89999)}`,
      businessId: targetBiz,
      supplierName: supplierName || 'Consolidated Suppliers',
      status: 'submitted',
      items: poItems,
      totalCost,
      createdAt: today.toISOString().slice(0, 10),
      expectedDeliveryDate: expected.toISOString().slice(0, 10),
      notes,
    };

    // Update incomingStock and recommendation status
    for (const item of poItems) {
      const pIdx = dbState.products.findIndex((p) => p.id === item.productId);
      if (pIdx !== -1) {
        dbState.products[pIdx].incomingStock += item.quantity;
        dbState.recommendationStatuses[item.productId] = 'in_plan';
      }
    }

    dbState.purchaseOrders.unshift(po);
    appendActivity(
      targetBiz,
      'po_created',
      `Purchase order ${po.poNumber} submitted`,
      `Ordered ${poItems.reduce((a, b) => a + b.quantity, 0)} units across ${poItems.length} SKUs ($${totalCost.toLocaleString()}).`
    );

    saveDb(dbState);
    res.status(201).json({ purchaseOrder: po });
  });

  // Mark Purchase Order as received
  app.patch('/api/purchase-orders/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body as { status?: PurchaseOrder['status'] };
    const idx = dbState.purchaseOrders.findIndex((po) => po.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Purchase order not found.' });
      return;
    }

    const po = dbState.purchaseOrders[idx];
    if (status === 'received' && po.status !== 'received') {
      const today = new Date().toISOString().slice(0, 10);
      po.status = 'received';
      po.receivedAt = today;

      for (const item of po.items) {
        const pIdx = dbState.products.findIndex((p) => p.id === item.productId);
        if (pIdx !== -1) {
          const prod = dbState.products[pIdx];
          prod.currentStock += item.quantity;
          prod.incomingStock = Math.max(0, prod.incomingStock - item.quantity);
          prod.lastUpdated = today;
          dbState.recommendationStatuses[item.productId] = 'reviewed';

          dbState.sales.push({
            id: `recv-${prod.id}-${Date.now()}`,
            businessId: prod.businessId,
            productId: prod.id,
            date: today,
            quantitySold: 0,
            quantityReceived: item.quantity,
            revenue: 0,
            unitPrice: prod.unitPrice,
          });
        }
      }

      appendActivity(
        po.businessId,
        'order_received',
        `Received ${po.poNumber} from ${po.supplierName}`,
        `Checked in ${po.items.reduce((a, b) => a + b.quantity, 0)} units into active inventory.`
      );
    } else if (status) {
      po.status = status;
    }

    saveDb(dbState);
    res.json({ purchaseOrder: po });
  });

  // Reset demo data
  app.post('/api/reset-demo', (_req, res) => {
    dbState = createInitialSeedState();
    saveDb(dbState);
    res.json(dbState);
  });

  // Server-side Gemini AI Intelligence Insights endpoint
  app.post('/api/ai/insights', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Gemini API key is not configured on the server. Check Settings > Secrets.',
      });
      return;
    }

    const { businessName, businessCategory, summaryPayload } = req.body as {
      businessName?: string;
      businessCategory?: string;
      summaryPayload?: unknown;
    };

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `You are SmartStock Intelligence, a pragmatic retail supply-chain analyst for "${businessName}" (${businessCategory}).
Analyze this quantitative inventory and demand forecast snapshot (grounded in real historical data) and return 4 concise, high-impact executive insights.

Snapshot Data:
${JSON.stringify(summaryPayload)}

Rules:
- Reference exact product names, unit quantities, and percentages from the snapshot. Do not invent numbers.
- Each insight must map to a valid targetView from: "forecasting", "recommendations", "inventory", "purchase-plan", "simulator".
- Each insight category must be one of: "demand_surge", "replenishment", "slow_moving", "seasonal", "excess_capital".`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                productName: { type: Type.STRING },
                suggestedAction: { type: Type.STRING },
                targetView: { type: Type.STRING },
                impactMetric: { type: Type.STRING },
              },
              required: [
                'category',
                'title',
                'description',
                'suggestedAction',
                'targetView',
                'impactMetric',
              ],
            },
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '[]').trim());
      res.json({ insights: parsed });
    } catch (err: unknown) {
      console.error('Gemini /api/ai/insights error:', err);
      const message = err instanceof Error ? err.message : 'Failed to generate AI insights.';
      res.status(500).json({ error: message });
    }
  });

  // Server-side Gemini AI Scenario Simulation Narrative endpoint
  app.post('/api/ai/scenario', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Gemini API key is not configured on the server. Check Settings > Secrets.',
      });
      return;
    }

    const { businessName, scenarioParams, simulationResults } = req.body as {
      businessName?: string;
      scenarioParams?: unknown;
      simulationResults?: unknown;
    };

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `You are an inventory operations strategist advising "${businessName}".
A what-if supply chain simulation just completed with these parameters and quantitative outcomes:
Parameters: ${JSON.stringify(scenarioParams)}
Quantitative Results: ${JSON.stringify(simulationResults)}

Provide a concise, actionable 3-part operational brief:
1) Executive Risk Assessment (2 sentences referencing the exact simulated stockout count and capital impact)
2) Immediate Purchasing Adjustments (specific actions for the highest-risk SKUs)
3) Cash Flow & Buffer Recommendation (1-2 sentences).
Use plain, practical business language suitable for a store owner.`,
      });

      res.json({ narrative: response.text ?? '' });
    } catch (err: unknown) {
      console.error('Gemini /api/ai/scenario error:', err);
      const message = err instanceof Error ? err.message : 'Failed to run AI scenario brief.';
      res.status(500).json({ error: message });
    }
  });

  // Mount Vite in dev, or serve static dist in prod
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SmartStock server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
