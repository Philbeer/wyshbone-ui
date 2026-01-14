/**
 * CountryHint - disabled in V1
 * 
 * This pop-up was too noisy for the current flow.
 * The country selector is still available in the sidebar and header.
 * 
 * To re-enable: remove the early return below.
 */
export default function CountryHint() {
  // V1: Disabled - do not show the country hint pop-up
  return null;

  // Original implementation kept for potential future use:
  /*
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  ... rest of the component
  */

  // Mobile positioning: below header, pointing up
  if (isMobile) {
    return (
      <div
        className="fixed z-50 animate-in fade-in slide-in-from-top-2 duration-500"
        style={{
          left: '50%',
          top: '4.5rem',
          transform: 'translateX(-50%)',
        }}
        data-testid="hint-country-selector"
      >
        {/* Arrow pointing up at header */}
        <div
          className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0"
          style={{
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderBottom: '8px solid hsl(var(--primary))',
          }}
        />
        
        {/* Hint box */}
        <div className="bg-primary text-primary-foreground rounded-lg shadow-lg px-4 py-3 max-w-[260px] relative">
          <div className="text-sm font-medium text-center">
            ☝️ Choose your search country
          </div>
          <div className="text-xs mt-1 opacity-90 text-center">
            This will be used for all searches unless you specify a different location
          </div>
          
          {/* Clickable text buttons */}
          <div className="flex gap-3 mt-3 text-xs justify-center border-t border-primary-foreground/20 pt-2">
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

  // Desktop positioning: beside sidebar, pointing left
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
