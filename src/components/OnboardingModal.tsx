import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { BusinessCategory } from '../types/inventory';
import { BrandLogo } from './BrandLogo';

interface OnboardingModalProps {
  initialTab: 'signin' | 'onboard';
  onClose: () => void;
  onEnterDemo: () => void;
  onCreateBusiness: (payload: {
    name: string;
    category: BusinessCategory;
    ownerName: string;
    ownerEmail: string;
    defaultLeadTimeDays: number;
    safetyStockFactor: number;
    includeStarterProducts: boolean;
  }) => Promise<void>;
}

const CATEGORIES: BusinessCategory[] = [
  'Grocery & Supermarket',
  'Retail Shop',
  'Pharmacy & Medical',
  'Wholesaler & Distributor',
  'E-Commerce',
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  initialTab,
  onClose,
  onEnterDemo,
  onCreateBusiness,
}) => {
  const [tab, setTab] = useState<'signin' | 'onboard'>(initialTab);
  const [email, setEmail] = useState('elena@harborviewmarket.com');
  const [password, setPassword] = useState('demo-workspace');
  const [bizName, setBizName] = useState('');
  const [category, setCategory] = useState<BusinessCategory>('Retail Shop');
  const [ownerName, setOwnerName] = useState('');
  const [leadTime, setLeadTime] = useState(5);
  const [safetyMode, setSafetyMode] = useState<'lean' | 'balanced' | 'conservative'>('balanced');
  const [includeStarter, setIncludeStarter] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) {
      setError('Please enter a valid work email address.');
      return;
    }
    onEnterDemo();
  };

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bizName.trim()) {
      setError('Please enter your business name.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const safetyFactor =
        safetyMode === 'lean' ? 0.85 : safetyMode === 'conservative' ? 1.3 : 1.05;
      await onCreateBusiness({
        name: bizName.trim(),
        category,
        ownerName: ownerName.trim() || 'Operations Manager',
        ownerEmail: email.trim() || 'owner@business.com',
        defaultLeadTimeDays: Number(leadTime) || 5,
        safetyStockFactor: safetyFactor,
        includeStarterProducts: includeStarter,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create workspace.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#101B2D]/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <BrandLogo size="sm" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-[#738096] hover:text-[#101B2D] rounded-md hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-5">
          <div className="grid grid-cols-2 p-1 bg-[#F6F8FB] rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setTab('onboard');
                setError(null);
              }}
              className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                tab === 'onboard'
                  ? 'bg-white text-[#101B2D] shadow-xs'
                  : 'text-[#738096] hover:text-[#101B2D]'
              }`}
            >
              Business Onboarding
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('signin');
                setError(null);
              }}
              className={`py-2 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                tab === 'signin'
                  ? 'bg-white text-[#101B2D] shadow-xs'
                  : 'text-[#738096] hover:text-[#101B2D]'
              }`}
            >
              Sign In / Demo Access
            </button>
          </div>
        </div>

        {tab === 'signin' ? (
          <form onSubmit={handleSignIn} className="p-6 space-y-4">
            <div>
              <h2 id="onboarding-title" className="font-display text-lg font-bold text-[#101B2D]">
                Sign in to SmartStock
              </h2>
              <p className="text-xs text-[#738096] mt-0.5">
                Access your configured inventory environments or enter demonstration mode.
              </p>
            </div>

            {error && (
              <div className="text-xs text-[#DC5555] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#202B3C]">Work Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#202B3C]">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
              />
            </div>

            <div className="pt-2 flex flex-col gap-2.5">
              <button
                type="submit"
                className="w-full py-2.5 text-sm font-medium text-white bg-[#101B2D] hover:bg-[#263B55] rounded-lg transition-colors cursor-pointer"
              >
                Continue to Workspace
              </button>
              <button
                type="button"
                onClick={onEnterDemo}
                className="w-full py-2.5 text-sm font-medium text-[#101B2D] bg-[#F6F8FB] hover:bg-slate-200/70 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Enter Instant Demo Mode (3 Sample Businesses)
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleOnboard} className="p-6 space-y-4">
            <div>
              <h2 id="onboarding-title" className="font-display text-lg font-bold text-[#101B2D]">
                Configure Your Inventory Environment
              </h2>
              <p className="text-xs text-[#738096] mt-0.5">
                Tailor lead time defaults, safety buffers, and starter SKUs for your store type.
              </p>
            </div>

            {error && (
              <div className="text-xs text-[#DC5555] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#202B3C]">Business Name</label>
                <input
                  type="text"
                  placeholder="e.g. Oakridge Grocers"
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#202B3C]">Your Name</label>
                <input
                  type="text"
                  placeholder="e.g. Maya Lin"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#202B3C]">Business Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as BusinessCategory)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#202B3C]">
                  Default Supplier Lead Time (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={leadTime}
                  onChange={(e) => setLeadTime(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#202B3C]">
                  Safety Stock Policy
                </label>
                <select
                  value={safetyMode}
                  onChange={(e) =>
                    setSafetyMode(e.target.value as 'lean' | 'balanced' | 'conservative')
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#4C7FE8]"
                >
                  <option value="lean">Lean (Lower holding cost)</option>
                  <option value="balanced">Balanced (Recommended)</option>
                  <option value="conservative">Conservative (Zero-stockout focus)</option>
                </select>
              </div>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-[#F6F8FB] border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={includeStarter}
                onChange={(e) => setIncludeStarter(e.target.checked)}
                className="mt-0.5 accent-[#16A36A]"
              />
              <span className="text-xs text-[#202B3C]">
                Pre-populate with realistic 90-day starter products and sales history for{' '}
                <strong>{category}</strong> (recommended for testing forecasts immediately).
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-sm font-medium text-white bg-[#16A36A] hover:bg-[#138a59] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
            >
              {submitting ? 'Creating Environment...' : 'Launch SmartStock Workspace'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
