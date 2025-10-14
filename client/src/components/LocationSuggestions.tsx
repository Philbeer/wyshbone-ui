import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { MapPin, Loader2 } from "lucide-react";

interface LocationHint {
  country: string;
  geonameid: string | null;
  subcountry: string | null;
  town_city: string | null;
}

interface LocationSuggestionsProps {
  inputValue: string;
  onSelectLocation: (location: string) => void;
  isVisible: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

export function LocationSuggestions({
  inputValue,
  onSelectLocation,
  isVisible,
  inputRef,
}: LocationSuggestionsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 300);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Extract potential location terms from the input
  useEffect(() => {
    if (!isVisible) {
      setSearchQuery("");
      return;
    }

    // Look for common location trigger words
    const locationPattern = /(?:in|at|from|near|around)\s+([a-zA-Z\s]+)$/i;
    const match = inputValue.match(locationPattern);
    
    if (match && match[1]) {
      const term = match[1].trim();
      if (term.length >= 2) {
        setSearchQuery(term);
      }
    } else {
      // Check if the last word might be a location (at least 3 chars)
      const words = inputValue.trim().split(/\s+/);
      const lastWord = words[words.length - 1];
      if (lastWord && lastWord.length >= 3 && /^[a-zA-Z]+$/.test(lastWord)) {
        setSearchQuery(lastWord);
      } else {
        setSearchQuery("");
      }
    }
  }, [inputValue, isVisible]);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/location-hints/search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return null;
      
      const response = await fetch(
        `/api/location-hints/search?query=${encodeURIComponent(debouncedQuery)}&limit=8`
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch location suggestions");
      }
      
      return response.json() as Promise<{ results: LocationHint[] }>;
    },
    enabled: !!debouncedQuery && debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const results = data?.results || [];

  // Don't show if no search query or no results
  if (!debouncedQuery || results.length === 0) {
    return null;
  }

  const handleSelectLocation = (location: LocationHint) => {
    const locationText = location.town_city || location.subcountry || location.country;
    
    // Replace the last word or location phrase with the selected location
    const locationPattern = /(?:in|at|from|near|around)\s+([a-zA-Z\s]+)$/i;
    const match = inputValue.match(locationPattern);
    
    if (match) {
      // Replace the location after the trigger word
      const newValue = inputValue.replace(locationPattern, (full, captured) => {
        return full.replace(captured, locationText);
      });
      onSelectLocation(newValue);
    } else {
      // Replace the last word
      const words = inputValue.trim().split(/\s+/);
      words[words.length - 1] = locationText;
      onSelectLocation(words.join(" "));
    }
  };

  // Calculate position relative to input
  const inputRect = inputRef.current?.getBoundingClientRect();
  
  if (!inputRect) return null;

  return (
    <div
      ref={suggestionsRef}
      className="fixed bg-popover border border-border rounded-lg shadow-lg max-w-md z-50 overflow-hidden"
      style={{
        left: `${inputRect.left}px`,
        bottom: `${window.innerHeight - inputRect.top + 8}px`,
        width: `${Math.min(inputRect.width, 400)}px`,
      }}
      data-testid="location-suggestions"
    >
      <div className="py-2">
        <div className="px-3 py-1 text-xs text-muted-foreground font-medium border-b border-border mb-1">
          Location suggestions
        </div>
        
        {isLoading ? (
          <div className="px-3 py-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Searching locations...</span>
          </div>
        ) : (
          <div className="max-h-[240px] overflow-y-auto">
            {results.map((location, index) => (
              <button
                key={`${location.geonameid}-${index}`}
                onClick={() => handleSelectLocation(location)}
                className="w-full px-3 py-2 flex items-start gap-2 hover-elevate active-elevate-2 text-left transition-colors"
                data-testid={`location-suggestion-${index}`}
              >
                <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {location.town_city || location.subcountry}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[location.subcountry, location.country]
                      .filter(Boolean)
                      .filter(
                        (item) =>
                          item !==
                          (location.town_city || location.subcountry)
                      )
                      .join(", ")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
