import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type Props = {
  onPrompt: (prompt: string) => void;
};

type Example = {
  label: string;
  prompt: string;
  hint?: string;
};

const SALES_EXAMPLES: Example[] = [
  {
    label: "Find active UK companies in Camden with SIC 86210 and ≥ 25 employees",
    prompt:
      "Find active UK companies in Camden with SIC 86210 and at least 25 employees. Return: company name, number, website, key contact (if available), and brief why-this-is-a-fit.",
  },
  {
    label: "List companies in Cambridge incorporated after 2022 with equity > £100k",
    prompt:
      "List companies in Cambridge incorporated after 2022 with equity over £100,000 and assets above £250,000. Summarize in a compact table.",
  },
  {
    label: "Newcastle upon Tyne: profit & loss available, assets > £400k",
    prompt:
      "Show companies in Newcastle upon Tyne that have filed profit and loss and have assets above £400,000. Include company number.",
  },
  {
    label: "Scottish Borders: assets > £500k and ≥ 8 employees",
    prompt:
      "Show companies in the Scottish Borders with assets over £500,000 and at least 8 employees. Include website if you can find it.",
  },
  {
    label: "Breweries in Yorkshire with owner/manager contact",
    prompt:
      "Find breweries in Yorkshire and include owner/manager contact details (email preferred). Return in a table with source links.",
  },
];

const RESEARCH_TIPS = [
  "Be specific: location, SIC code, headcount, assets/equity thresholds.",
  "Add evidence: ask for filings context (e.g., most recent accounts date).",
  "Ask for contact route: email preferred; else website/contact form/LinkedIn.",
  "For lead gen, request: company number, website, key contact + reason to reach out.",
  "Use constraints to cut cost: target by county/city instead of UK-wide.",
];

const Tip = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
    <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground flex-shrink-0" />
    <span>{children}</span>
  </li>
);

export default function WishboneSidebar({ onPrompt }: Props) {
  const [companyNumber, setCompanyNumber] = useState("");

  const handleExampleClick = (ex: Example) => {
    onPrompt(ex.prompt);
  };

  const handleQuickLookup = () => {
    const trimmed = companyNumber.trim();
    if (!trimmed) return;
    onPrompt(
      `Look up company number ${trimmed}. Return: legal name, status, registered address, incorporation date, most recent accounts dates, assets/equity, headcount if present, and a one-line creditworthiness note.`
    );
    setCompanyNumber("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleQuickLookup();
    }
  };

  return (
    <aside
      className="w-[320px] xl:w-[360px] border-l border-border bg-background"
      aria-label="Research Tips and Examples"
      data-testid="sidebar-research"
    >
      <ScrollArea className="h-full">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="pb-2">
            <h2 className="text-base font-semibold text-foreground">
              Research Tips
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Click an example to auto-fill and send. Or type your own prompt in
              chat.
            </p>
          </div>

          {/* Research Tips Card */}
          <Card data-testid="card-research-tips">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Company Research Tips
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {RESEARCH_TIPS.map((t, idx) => (
                  <Tip key={idx}>{t}</Tip>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Quick Company Lookup Card */}
          <Card data-testid="card-company-lookup">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Quick Company Lookup
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input
                  inputMode="numeric"
                  placeholder="12345678 or SC123456"
                  value={companyNumber}
                  onChange={(e) => setCompanyNumber(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1"
                  aria-label="Enter a UK company number"
                  data-testid="input-company-number"
                />
                <Button
                  onClick={handleQuickLookup}
                  size="default"
                  aria-label="Run company lookup"
                  data-testid="button-company-lookup"
                >
                  Go
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Example Prompts Card */}
          <Card data-testid="card-example-prompts">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Sales & Prospecting Examples
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {SALES_EXAMPLES.map((ex, i) => (
                  <li key={i}>
                    <Button
                      onClick={() => handleExampleClick(ex)}
                      variant="outline"
                      className="w-full text-left text-sm leading-relaxed h-auto py-2 px-3 whitespace-normal justify-start hover-elevate active-elevate-2"
                      data-testid={`button-example-${i}`}
                    >
                      {ex.label}
                    </Button>
                    {ex.hint && (
                      <div className="text-xs text-muted-foreground mt-1 ml-1">
                        {ex.hint}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Pro Tip Card */}
          <Card data-testid="card-pro-tip">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Pro tip</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground mb-3">
                Add constraints to save credits: limit by county/city and set asset/
                equity/headcount thresholds up-front.
              </p>
              <p className="text-xs text-muted-foreground">
                Edit <code className="bg-muted px-1 py-0.5 rounded text-xs">SALES_EXAMPLES</code> and{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">RESEARCH_TIPS</code> inside{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">WishboneSidebar.tsx</code> to
                add or modify examples.
              </p>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </aside>
  );
}
