import React from 'react';
import { storage } from '../lib/storage';

interface AdBannerProps {
  type: 'adsense' | 'adskeeper';
  className?: string;
}

export const AdBanner: React.FC<AdBannerProps> = ({ type, className = '' }) => {
  const adConfig = storage.getAds();
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!adConfig.showAds || !containerRef.current) return;

    const code = type === 'adsense' ? adConfig.adsenseCode : adConfig.adsKeeperCode;
    if (!code) return;

    // Clear previous content
    containerRef.current.innerHTML = '';

    // Create a range to parse the HTML and execute scripts
    const range = document.createRange();
    range.selectNode(containerRef.current);
    const documentFragment = range.createContextualFragment(code);
    
    containerRef.current.appendChild(documentFragment);
  }, [adConfig, type]);

  if (!adConfig.showAds) return null;

  return (
    <div className={`ad-container my-8 flex justify-center overflow-hidden ${className}`}>
      <div ref={containerRef} className="max-w-full" />
    </div>
  );
};
