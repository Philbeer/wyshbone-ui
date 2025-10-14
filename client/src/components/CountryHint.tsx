import { useState, useEffect } from "react";

export default function CountryHint() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has permanently dismissed the hint
    const isPermanentlyDismissed = localStorage.getItem('countryHintDismissedForever') === 'true';
    
    if (!isPermanentlyDismissed) {
      // Show hint after a short delay every time page loads
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    // Temporary close - just for this session
    setIsVisible(false);
  };

  const handleCloseForever = () => {
    // Permanent close - never show again
    setIsVisible(false);
    localStorage.setItem('countryHintDismissedForever', 'true');
  };

  // Hide when user interacts with the country dropdown
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-testid="select-default-country"]')) {
        handleClose();
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className="fixed z-50 animate-in fade-in slide-in-from-left-2 duration-500"
      style={{
        left: 'calc(var(--sidebar-width, 16rem) + 1rem)',
        top: '6rem',
      }}
      data-testid="hint-country-selector"
    >
      {/* Arrow pointing left */}
      <div
        className="absolute -left-2 top-1/2 -translate-y-1/2 w-0 h-0"
        style={{
          borderTop: '8px solid transparent',
          borderBottom: '8px solid transparent',
          borderRight: '8px solid hsl(var(--primary))',
        }}
      />
      
      {/* Hint box */}
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg px-4 py-3 max-w-[260px] relative">
        <div className="text-sm font-medium">
          👈 Choose your search country
        </div>
        <div className="text-xs mt-1 opacity-90">
          This will be used for all searches unless you specify a different location
        </div>
        
        {/* Clickable text buttons */}
        <div className="flex gap-3 mt-3 text-xs justify-end border-t border-primary-foreground/20 pt-2">
          <button
            onClick={handleClose}
            className="underline hover-elevate active-elevate-2 px-2 py-1 rounded"
            data-testid="button-close-hint"
          >
            Close
          </button>
          <button
            onClick={handleCloseForever}
            className="underline hover-elevate active-elevate-2 px-2 py-1 rounded"
            data-testid="button-dismiss-hint-forever"
          >
            Close forever
          </button>
        </div>
      </div>
    </div>
  );
}
