import React, { useEffect, useState } from 'react';
import { Building2, Plus, RotateCcw } from 'lucide-react';
import { Button, SectionHeader, StatusLabel, SurfaceCard } from './ui/DesignPrimitives';
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
    <div className="space-y-6 animate-view-enter">
      <div>
        <h2 className="font-display text-2xl font-bold text-[#49383D] tracking-tight">
          Business Settings
        </h2>
        <p className="text-sm text-[#81777A] mt-0.5">
          Lead time policies, safety stock buffers, and active business workspace administration.
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        <SurfaceCard className="lg:col-span-7 p-6 space-y-5">
          <SectionHeader
            title="Inventory Environment Policy"
            subtitle={`Configure forecasting defaults and safety thresholds for ${business.name}`}
          />

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#3F3437]">Business Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full h-10 px-3 text-sm bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#3F3437]">Business Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as BusinessCategory)}
                  className="w-full h-10 px-3 text-sm border border-[#E8DFE1] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#805F69]"
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
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#3F3437]">
                  Default Lead Time (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={leadTime}
                  onChange={(e) => setLeadTime(Number(e.target.value))}
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#3F3437]">
                  Safety Stock Multiplier
                </label>
                <input
                  type="number"
                  step="0.05"
                  min={0.5}
                  max={2.0}
                  value={safetyFactor}
                  onChange={(e) => setSafetyFactor(Number(e.target.value))}
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#3F3437]">
                  Planning Horizon (Days)
                </label>
                <input
                  type="number"
                  min={7}
                  max={90}
                  value={horizon}
                  onChange={(e) => setHorizon(Number(e.target.value))}
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-[#E8DFE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#805F69]"
                />
              </div>
            </div>

            {savedMsg && (
              <div className="text-xs text-[#779384] font-medium">{savedMsg}</div>
            )}

            <div className="pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </form>
        </SurfaceCard>

        <div className="lg:col-span-5 space-y-6">
          <SurfaceCard className="p-6 space-y-4">
            <SectionHeader
              title="Configured Workspaces"
              action={
                <button
                  type="button"
                  onClick={onOpenOnboarding}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#805F69] hover:text-[#49383D] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Business
                </button>
              }
            />

            <div className="divide-y divide-[#E8DFE1]">
              {businesses.map((b) => (
                <div key={b.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Building2 className="w-4 h-4 text-[#805F69] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#49383D] truncate">{b.name}</div>
                      <div className="text-xs text-[#81777A]">{b.category}</div>
                    </div>
                  </div>
                  {b.id === business.id ? (
                    <StatusLabel tone="healthy" label="Active" />
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onSwitchBusiness(b.id)}
                    >
                      Switch
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6 space-y-3">
            <SectionHeader
              title="Demonstration Environment"
              subtitle="Restore the pre-seeded retail, pharmacy, and e-commerce datasets to their initial baseline state."
            />
            <Button variant="secondary" size="sm" onClick={onResetDemo}>
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Demo Datasets
            </Button>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
};
