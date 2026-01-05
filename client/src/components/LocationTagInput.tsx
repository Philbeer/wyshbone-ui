import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, MapPin, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buildApiUrl } from "@/lib/queryClient";
import { useDebounce } from "@/hooks/useDebounce";

interface LocationHint {
  country: string;
  geonameid: string | null;
  subcountry: string | null;
  town_city: string | null;
}

interface LocationTagInputProps {
  value: string[]; // Array of selected locations
  onChange: (locations: string[]) => void;
  placeholder?: string;
  defaultCountry?: string; // ISO code like "GB", "US"
}

// Map ISO codes to full country names
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
};

export function LocationTagInput({
  value = [],
  onChange,
  placeholder = "Type a location...",
  defaultCountry = "GB",
}: LocationTagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debouncedQuery = useDebounce(inputValue, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert ISO code to full country name for API
  const countryName = ISO_TO_COUNTRY_NAME[defaultCountry.toUpperCase()];

  // Fetch location suggestions
  const { data, isLoading } = useQuery({
    queryKey: ["/api/location-hints/search", debouncedQuery, countryName],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return null;

      const params = new URLSearchParams({
        query: debouncedQuery,
        limit: "8"
      });

      if (countryName) {
        params.append("country", countryName);
      }

      const response = await fetch(buildApiUrl(`/api/location-hints/search?${params.toString()}`));

      if (!response.ok) {
        throw new Error("Failed to fetch location suggestions");
      }

      return response.json() as Promise<{ results: LocationHint[] }>;
    },
    enabled: !!debouncedQuery && debouncedQuery.length >= 2 && showSuggestions,
    staleTime: 5 * 60 * 1000,
  });

  const results = data?.results || [];

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectLocation = (location: LocationHint) => {
    const locationText = location.town_city || location.subcountry || location.country;

    // Add location if not already in list
    if (!value.includes(locationText)) {
      onChange([...value, locationText]);
    }

    setInputValue("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleRemoveLocation = (locationToRemove: string) => {
    onChange(value.filter(loc => loc !== locationToRemove));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setShowSuggestions(true);
  };

  const handleInputFocus = () => {
    if (inputValue.length >= 2) {
      setShowSuggestions(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Remove last tag on backspace if input is empty
    if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }

    // Close suggestions on Escape
    if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Selected locations as tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {value.map((location) => (
            <Badge
              key={location}
              variant="secondary"
              className="pl-3 pr-2 py-1 text-sm"
            >
              <MapPin className="w-3 h-3 mr-1" />
              {location}
              <button
                type="button"
                onClick={() => handleRemoveLocation(location)}
                className="ml-1 hover:bg-muted rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Input field */}
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={handleKeyDown}
        placeholder={value.length > 0 ? "Add another location..." : placeholder}
      />

      {/* Suggestions dropdown */}
      {showSuggestions && inputValue.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Searching locations...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              No locations found for "{inputValue}"
            </div>
          ) : (
            <div>
              {results.map((location, index) => {
                const locationText = location.town_city || location.subcountry || location.country;
                const isAlreadySelected = value.includes(locationText);

                return (
                  <button
                    key={`${location.geonameid}-${index}`}
                    onClick={() => handleSelectLocation(location)}
                    disabled={isAlreadySelected}
                    className={`w-full px-3 py-2 flex items-start gap-2 text-left transition-colors ${
                      isAlreadySelected
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-accent cursor-pointer"
                    }`}
                  >
                    <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {location.town_city || location.subcountry}
                        {isAlreadySelected && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (already added)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[location.subcountry, location.country]
                          .filter(Boolean)
                          .filter((item) => item !== (location.town_city || location.subcountry))
                          .join(", ")}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
