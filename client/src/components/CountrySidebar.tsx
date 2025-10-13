import { useQuery } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { Card } from "@/components/ui/card";

interface CountryPreference {
  code: string;
  name: string;
}

export function CountrySidebar() {
  const { data: country } = useQuery<CountryPreference>({
    queryKey: ["/api/country/preference"],
    refetchOnWindowFocus: false,
  });

  return (
    <aside className="w-64 border-r border-border bg-background flex flex-col p-4" data-testid="sidebar-country">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Search Settings</h2>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Default Country</span>
          </div>
          <div className="mt-2">
            <div className="text-lg font-semibold" data-testid="text-country-name">{country?.name || "United Kingdom"}</div>
            <div className="text-xs text-muted-foreground mt-1" data-testid="text-country-code">
              {country?.code || "GB"}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Change country via chat: <br />
              <span className="font-mono text-foreground">"set country to India"</span>
            </p>
          </div>
        </Card>
      </div>
    </aside>
  );
}
