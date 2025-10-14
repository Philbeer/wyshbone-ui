import { useState, useEffect } from "react";
import { X } from "lucide-react";

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
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg px-4 py-3 max-w-[260px] relative pt-6">
        {/* Two close buttons */}
        <div className="absolute -top-1 -right-1 flex gap-1">
          <button
            onClick={handleClose}
            className="w-5 h-5 rounded-full bg-primary-foreground text-primary flex items-center justify-center hover-elevate active-elevate-2 text-[10px] font-bold"
            data-testid="button-close-hint"
            aria-label="Close"
            title="Close"
          >
            <X className="w-3 h-3" />
          </button>
          <button
            onClick={handleCloseForever}
            className="w-5 h-5 rounded-full bg-primary-foreground text-primary flex items-center justify-center hover-elevate active-elevate-2"
            data-testid="button-dismiss-hint-forever"
            aria-label="Close forever"
            title="Close forever"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
        
        <div className="text-sm font-medium">
          👈 Choose your search country
        </div>
        <div className="text-xs mt-1 opacity-90">
          This will be used for all searches unless you specify a different location
        </div>
        
        {/* Button labels */}
        <div className="flex gap-2 mt-2 text-[10px] opacity-75 justify-end">
          <span>Close</span>
          <span>Close forever</span>
        </div>
      </div>
    </div>
  );
}
