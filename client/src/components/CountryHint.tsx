import { useState, useEffect } from "react";
import { X } from "lucide-react";

export default function CountryHint() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has seen the hint before
    const hasSeenHint = localStorage.getItem('hasSeenCountryHint');
    
    if (!hasSeenHint) {
      // Show hint after a short delay
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('hasSeenCountryHint', 'true');
  };

  // Hide when user interacts with the country dropdown
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-testid="select-default-country"]')) {
        handleDismiss();
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
      <div className="bg-primary text-primary-foreground rounded-lg shadow-lg px-4 py-3 max-w-[240px] relative">
        <button
          onClick={handleDismiss}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary-foreground text-primary flex items-center justify-center hover-elevate active-elevate-2"
          data-testid="button-dismiss-hint"
          aria-label="Dismiss hint"
        >
          <X className="w-3 h-3" />
        </button>
        
        <div className="text-sm font-medium pr-4">
          👈 Choose your search country
        </div>
        <div className="text-xs mt-1 opacity-90">
          This will be used for all searches unless you specify a different location
        </div>
      </div>
    </div>
  );
}
