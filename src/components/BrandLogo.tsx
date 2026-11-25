import React from 'react';

interface BrandLogoProps {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'dark',
  size = 'md',
}) => {
  const iconSize = size === 'sm' ? 24 : size === 'lg' ? 34 : 28;
  const textClass =
    size === 'sm'
      ? 'text-base'
      : size === 'lg'
      ? 'text-xl'
      : 'text-lg';

  const primaryColor = variant === 'light' ? '#FFFFFF' : '#101B2D';
  const secondaryStroke = variant === 'light' ? '#94A3B8' : '#263B55';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Isometric inventory container frame */}
        <path
          d="M16 3L27.5 9.5V22.5L16 29L4.5 22.5V9.5L16 3Z"
          stroke={primaryColor}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 9.5L16 16L27.5 9.5"
          stroke={secondaryStroke}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M16 16V29"
          stroke={secondaryStroke}
          strokeWidth="1.5"
        />
        {/* Upward predictive intelligence trajectory */}
        <path
          d="M8.5 19.5L13.5 14.5L17.5 17L24 10.5"
          stroke="#16A36A"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20.5 10.5H24V14"
          stroke="#16A36A"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={`font-display font-bold tracking-tight ${textClass} ${
          variant === 'light' ? 'text-white' : 'text-[#101B2D]'
        }`}
      >
        SmartStock
      </span>
    </span>
  );
};
