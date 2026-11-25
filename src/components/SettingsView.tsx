import React, { useEffect, useState } from 'react';
import { Building2, Plus, RotateCcw } from 'lucide-react';
import type { BusinessCategory, BusinessProfile } from '../types/inventory';

interface SettingsViewProps {
  business: BusinessProfile;
  businesses: BusinessProfile[];
  onUpdateBusiness: (id: string, updates: Partial<BusinessProfile>) => Promise<void>;
  onSwitchBusiness: (id: string) => Promise<void>;
  onOpenOnboarding: () => void;
  onResetDemo: () => Promise<void>;
}

const CATEGORIES: BusinessCategory[] = [
  'Grocery & Supermarket',
  'Pharmacy & Medical',
  'Retail Shop',
  'Wholesaler & Distributor',
  'E-Commerce',
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  business,
  businesses,
  onUpdateBusiness,
  onSwitchBusiness,
  onOpenOnboarding,
  onResetDemo,
}) => {
  const [name, setName] = useState(business.name);
  const [category, setCategory] = useState<BusinessCategory>(business.category);
  const [leadTime, setLeadTime] = useState(business.defaultLeadTimeDays);
  const [safetyFactor, setSafetyFactor] = useState(business.safetyStockFactor);
  const [horizon, setHorizon] = useState(business.planningHorizonDays);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(business.name);
    setCategory(business.category);
    setLeadTime(business.defaultLeadTimeDays);
    setSafetyFactor(business.safetyStockFactor);
    setHorizon(business.planningHorizonDays);
    setSavedMsg(null);
  }, [business]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    try {
      await onUpdateBusiness(business.id, {
        name,
        category,
        defaultLeadTimeDays: Number(leadTime),
        safetyStockFactor: Number(safetyFactor),
        planningHorizonDays: Number(horizon),
      });
      setSavedMsg('Environment preferences saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="font-display text-base font-bold text-[#101B2D]">
            Business Inventory Environment
          </h2>
          <p className="text-xs text-[#738096]">
            Configure forecasting defaults and safety stock policies for {business.name}
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#202B3C]">Business Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#202B3C]">Business Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as BusinessCategory)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#202B3C]">
                Default Lead Time (Days)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={leadTime}
                onChange={(e) => setLeadTime(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#202B3C]">
                Safety Stock Multiplier
              </label>
              <input
                type="number"
                step="0.05"
                min={0.5}
                max={2.0}
                value={safetyFactor}
                onChange={(e) => setSafetyFactor(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#202B3C]">
                Planning Horizon (Days)
              </label>
              <input
                type="number"
                min={7}
                max={90}
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          {savedMsg && (
            <div className="text-xs text-[#16A36A] font-medium">{savedMsg}</div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-white bg-[#101B2D] hover:bg-[#263B55] rounded-lg cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>

      <div className="lg:col-span-5 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-[#101B2D]">
              Configured Businesses
            </h2>
            <button
              type="button"
              onClick={onOpenOnboarding}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#4C7FE8] hover:text-[#101B2D] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Business
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {businesses.map((b) => (
              <div key={b.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Building2 className="w-4 h-4 text-[#263B55] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#101B2D] truncate">{b.name}</div>
                    <div className="text-xs text-[#738096]">{b.category}</div>
                  </div>
                </div>
                {b.id === business.id ? (
                  <span className="text-xs font-semibold text-[#16A36A]">Active</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSwitchBusiness(b.id)}
                    className="text-xs font-medium text-[#4C7FE8] hover:underline cursor-pointer"
                  >
                    Switch
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h3 className="font-display text-sm font-bold text-[#101B2D]">
            Demonstration Environment
          </h3>
          <p className="text-xs text-[#738096]">
            Restore the pre-seeded retail, pharmacy, and e-commerce datasets to their initial baseline state.
          </p>
          <button
            type="button"
            onClick={onResetDemo}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#202B3C] bg-[#F6F8FB] hover:bg-slate-200/70 border border-slate-200 rounded-lg cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Demo Datasets
          </button>
        </div>
      </div>
    </div>
  );
};
