import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'emerald' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}) => {
  const base =
    'inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#805F69] focus-visible:ring-offset-1 disabled:opacity-55 disabled:cursor-not-allowed whitespace-nowrap shrink-0 cursor-pointer active:scale-[0.99]';
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-xs',
  };
  const variants = {
    primary: 'bg-[#805F69] text-white hover:bg-[#6B4E57]',
    secondary:
      'bg-white text-[#805F69] border border-[#805F69]/55 hover:bg-[#FBF8F7] hover:text-[#49383D] hover:border-[#805F69]',
    emerald: 'bg-[#49383D] text-white hover:bg-[#3A2C30]',
    danger: 'bg-[#BC7777] text-white hover:bg-[#A56363]',
    ghost: 'text-[#49383D] hover:text-[#49383D] hover:bg-[#FBF8F7]',
  };

  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export const SurfaceCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`bg-white border border-[#E8DFE1] rounded-xl ${className}`}
  >
    {children}
  </div>
);

export const SectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ title, subtitle, action }) => (
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 className="font-display text-base font-semibold text-[#49383D] tracking-tight">
        {title}
      </h2>
      {subtitle && <p className="text-xs text-[#81777A] mt-0.5">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const StatusLabel: React.FC<{
  tone: 'healthy' | 'warning' | 'critical' | 'neutral' | 'info';
  label: string;
}> = ({ tone, label }) => {
  const isOutOfStock = label.toLowerCase().includes('out of stock');

  if (isOutOfStock) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#F9EFEF] border border-[#E6CECE] text-[#8E4F4F] text-[11px] font-semibold whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#8E4F4F]" aria-hidden="true" />
        {label}
      </span>
    );
  }

  const styles = {
    healthy: { text: 'text-[#567062]', dot: 'bg-[#779384]' },
    warning: { text: 'text-[#9E7D4A]', dot: 'bg-[#C3A16D]' },
    critical: { text: 'text-[#A15E5E]', dot: 'bg-[#BC7777]' },
    info: { text: 'text-[#64788A]', dot: 'bg-[#8296A8]' },
    neutral: { text: 'text-[#81777A]', dot: 'bg-[#A69B9E]' },
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${styles.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.dot}`} aria-hidden="true" />
      {label}
    </span>
  );
};

export const AlertMessage: React.FC<{
  tone: 'error' | 'success' | 'info';
  message: string;
  onDismiss?: () => void;
}> = ({ tone, message, onDismiss }) => {
  const palette = {
    error: 'bg-[#F9EFEF] border-[#E6CECE] text-[#8E4F4F]',
    success: 'bg-[#EFF4F1] border-[#CFE0D7] text-[#567062]',
    info: 'bg-[#FBF8F7] border-[#E9DDE0] text-[#49383D]',
  }[tone];

  const Icon =
    tone === 'error'
      ? AlertCircle
      : tone === 'success'
      ? CheckCircle2
      : Info;

  return (
    <div
      className={`px-4 py-2.5 rounded-lg border text-xs font-medium flex items-center justify-between gap-3 ${palette}`}
    >
      <span className="inline-flex items-center gap-2">
        <Icon className="w-4 h-4 shrink-0" />
        <span>{message}</span>
      </span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="p-0.5 hover:opacity-75 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export const EmptyStateCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <SurfaceCard className="p-12 text-center space-y-3">
    <div className="w-10 h-10 rounded-xl bg-[#E9DDE0]/60 text-[#805F69] mx-auto flex items-center justify-center">
      {icon}
    </div>
    <div className="space-y-1">
      <h3 className="font-display text-base font-semibold text-[#49383D]">{title}</h3>
      <p className="text-sm text-[#81777A] max-w-md mx-auto">{description}</p>
    </div>
    {action && <div className="pt-1">{action}</div>}
  </SurfaceCard>
);

export const ModalDialog: React.FC<{
  title: string;
  subtitle?: string;
  maxWidth?: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, maxWidth = 'max-w-lg', onClose, children }) => (
  <div
    className="fixed inset-0 z-50 bg-[#49383D]/45 backdrop-blur-[2px] flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
  >
    <div
      className={`bg-white border border-[#E8DFE1] rounded-xl w-full ${maxWidth} shadow-lg overflow-hidden animate-view-enter`}
    >
      <div className="px-6 py-4 border-b border-[#E8DFE1] flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-bold text-[#49383D]">{title}</h3>
          {subtitle && <p className="text-xs text-[#81777A] mt-0.5">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="p-1.5 text-[#81777A] hover:text-[#49383D] hover:bg-[#FBF8F7] rounded-lg cursor-pointer transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);
