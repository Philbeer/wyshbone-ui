import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    label: "Coffee shops in Brooklyn, New York, US - Owner contact",
    prompt:
      "Find coffee shops in Brooklyn, New York, United States. Include owner or manager contact information.",
  },
  {
    label: "Restaurants in Austin, Texas, US - General Manager",
    prompt:
      "Find restaurants in Austin, Texas, United States. Get general manager contact details.",
  },
  {
    label: "Marketing agencies in London, UK - Marketing Director",
    prompt:
      "Find marketing agencies in London, United Kingdom. Look for marketing director contact information.",
  },
  {
    label: "Gyms in Toronto, Canada - Operations Manager",
    prompt:
      "Find gyms and fitness centers in Toronto, Canada. Include operations manager contact details.",
  },
  {
    label: "Bakeries in Melbourne, Australia - Head Baker",
    prompt:
      "Find bakeries in Melbourne, Australia. Get head baker or owner contact information.",
  },
];

const RESEARCH_TIPS = [
  "Specify business type: e.g., 'coffee shops', 'restaurants', 'marketing agencies'",
  "Include location: city, state/county, and country for best results",
  "Define target position: owner, manager, director, or specific role",
  "Request contact info: email preferred; also website, phone, or LinkedIn",
  "Be specific to save credits: narrow searches to specific areas instead of country-wide",
];

const Tip = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
    <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground flex-shrink-0" />
    <span>{children}</span>
  </li>
);

export default function WishboneSidebar({ onPrompt }: Props) {
  const handleExampleClick = (ex: Example) => {
    onPrompt(ex.prompt);
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
                Search Tips
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

          {/* Example Prompts Card */}
          <Card data-testid="card-example-prompts">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Example Searches
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
                Be specific with location and business type to get the most accurate results. The more details you provide, the better the matches.
              </p>
              <p className="text-xs text-muted-foreground">
                Edit <code className="bg-muted px-1 py-0.5 rounded text-xs">SALES_EXAMPLES</code> and{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">RESEARCH_TIPS</code> inside{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">WishboneSidebar.tsx</code> to
                customize examples for your use case.
              </p>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </aside>
  );
}
