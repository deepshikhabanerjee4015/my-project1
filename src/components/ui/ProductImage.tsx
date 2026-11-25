import React, { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { resolveProductImage } from '../../data/productImages';

export interface ProductImageProps {
  sku?: string;
  src?: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  iconClassName?: string;
  showFallbackSku?: boolean;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  sku = '',
  src,
  alt,
  className = 'p-2',
  containerClassName = 'w-full h-full',
  iconClassName = 'w-7 h-7',
  showFallbackSku = false,
}) => {
  const resolvedSrc = resolveProductImage(sku, src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  if (!resolvedSrc || failed) {
    return (
      <div
        className={`${containerClassName} flex flex-col items-center justify-center gap-1 bg-[#FBF8F7] text-[#805F69] px-2 text-center`}
      >
        <Package className={iconClassName} />
        {showFallbackSku && sku && (
          <span className="font-mono text-[10px] font-medium text-[#81777A] truncate max-w-full">
            {sku}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`${containerClassName} bg-white flex items-center justify-center overflow-hidden`}>
      <img
        src={resolvedSrc}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`w-full h-full object-contain ${className}`}
      />
    </div>
  );
};
