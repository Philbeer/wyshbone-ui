import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { buildApiUrl } from "@/lib/queryClient";
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
  defaultCountry?: string; // ISO code like "GB", "FR", "US"
}

// Map ISO codes to full country names (matches database format)
const ISO_TO_COUNTRY_NAME: Record<string, string> = {
  "FR": "France",
  "US": "United States",
  "GB": "United Kingdom",
  "UK": "United Kingdom",
  "DE": "Germany",
  "IT": "Italy",
  "ES": "Spain",
  "CA": "Canada",
  "AU": "Australia",
  "NZ": "New Zealand",
  "JP": "Japan",
  "CN": "China",
  "IN": "India",
  "BR": "Brazil",
  "MX": "Mexico",
  "AR": "Argentina",
  "CL": "Chile",
  "CO": "Colombia",
  "PE": "Peru",
  "IE": "Ireland",
  "NL": "Netherlands",
  "BE": "Belgium",
  "CH": "Switzerland",
  "AT": "Austria",
  "SE": "Sweden",
  "NO": "Norway",
  "DK": "Denmark",
  "FI": "Finland",
  "PL": "Poland",
  "PT": "Portugal",
  "GR": "Greece",
  "TR": "Turkey",
  "RU": "Russian Federation",
  "ZA": "South Africa",
  "EG": "Egypt",
  "NG": "Nigeria",
  "KE": "Kenya",
  "SA": "Saudi Arabia",
  "AE": "United Arab Emirates",
  "IL": "Israel",
  "SG": "Singapore",
  "TH": "Thailand",
  "VN": "Viet Nam",
  "PH": "Philippines",
  "ID": "Indonesia",
  "MY": "Malaysia",
  "KR": "Korea, Republic of",
  "TW": "Taiwan"
};

export function LocationSuggestions({
  inputValue,
  onSelectLocation,
  isVisible,
  inputRef,
  defaultCountry,
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

    // Look for common location trigger words (allow punctuation, numbers, hyphens)
    const locationPattern = /(?:in|at|from|near|around)\s+([\w\s\-.']+)$/i;
    const match = inputValue.match(locationPattern);
    
    if (match && match[1]) {
      const term = match[1].trim();
      if (term.length >= 2) {
        setSearchQuery(term);
      }
    } else {
      // Check if the last word might be a location (at least 3 chars, allow punctuation)
      const words = inputValue.trim().split(/\s+/);
      const lastWord = words[words.length - 1];
      if (lastWord && lastWord.length >= 3 && /^[\w\-.']+$/.test(lastWord)) {
        setSearchQuery(lastWord);
      } else {
        setSearchQuery("");
      }
    }
  }, [inputValue, isVisible]);

  // Convert ISO code to full country name for API
  const countryName = defaultCountry ? ISO_TO_COUNTRY_NAME[defaultCountry.toUpperCase()] : undefined;

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/location-hints/search", debouncedQuery, countryName],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return null;
      
      const params = new URLSearchParams({
        query: debouncedQuery,
        limit: "8"
      });
      
      // Add country filter if available
      if (countryName) {
        params.append("country", countryName);
      }
      
      const response = await fetch(buildApiUrl(`/api/location-hints/search?${params.toString()}`));
      
      if (!response.ok) {
        throw new Error("Failed to fetch location suggestions");
      }
      
      return response.json() as Promise<{ results: LocationHint[] }>;
    },
    enabled: !!debouncedQuery && debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const results = data?.results || [];

  // Don't show if no search query
  if (!debouncedQuery) {
    return null;
  }

  const handleSelectLocation = (location: LocationHint) => {
    const locationText = location.town_city || location.subcountry || location.country;
    
    // Replace the last word or location phrase with the selected location
    // Match the same pattern as detection (with punctuation, numbers, hyphens)
    const locationPattern = /(?:in|at|from|near|around)\s+([\w\s\-.']+)$/i;
    const match = inputValue.match(locationPattern);
    
    if (match) {
      // Replace the location after the trigger word
      const newValue = inputValue.replace(locationPattern, (full, captured) => {
        return full.replace(captured, locationText);
      });
      onSelectLocation(newValue);
    } else {
      // Replace the last word (allow punctuation)
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
        ) : error ? (
          <div className="px-3 py-3 text-sm text-destructive">
            Failed to load location suggestions
          </div>
        ) : results.length === 0 ? (
          <div className="px-3 py-3 text-sm text-muted-foreground">
            No locations found
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
