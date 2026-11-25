import React from 'react';

interface BrandLogoProps {
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  iconOnly?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'dark',
  size = 'md',
  iconOnly = false,
}) => {
  const iconSize = size === 'sm' ? 24 : size === 'lg' ? 34 : 28;
  const textClass =
    size === 'sm'
      ? 'text-base'
      : size === 'lg'
      ? 'text-xl'
      : 'text-[17px]';

  const primaryColor = variant === 'light' ? '#FFFFFF' : '#49383D';
  const secondaryStroke = variant === 'light' ? '#B99AA0' : '#805F69';
  const trendColor = variant === 'light' ? '#E9DDE0' : '#779384';

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
        <path
          d="M16 3L27.5 9.5V22.5L16 29L4.5 22.5V9.5L16 3Z"
          stroke={primaryColor}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 9.5L16 16L27.5 9.5"
          stroke={secondaryStroke}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M16 16V29" stroke={secondaryStroke} strokeWidth="1.4" />
        <path
          d="M8.5 19.5L13.5 14.5L17.5 17L24 10.5"
          stroke={trendColor}
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20.5 10.5H24V14"
          stroke={trendColor}
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!iconOnly && (
        <span
          className={`font-display font-bold tracking-tight ${textClass} ${
            variant === 'light' ? 'text-white' : 'text-[#49383D]'
          }`}
        >
          SmartStock
        </span>
      )}
    </span>
  );
};
