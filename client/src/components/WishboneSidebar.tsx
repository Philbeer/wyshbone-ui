import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

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
    label: "Deep research on micropubs in Cornwall",
    prompt: "Research micropubs in Cornwall",
  },
  {
    label: "Find new restaurants in Manchester - Contact info",
    prompt: "Find new restaurants in Manchester with owner contact details",
  },
  {
    label: "Quick search of Wyshbone Global Database for cafes in Bristol",
    prompt: "Search the Wyshbone Global Database for cafes in Bristol",
  },
  {
    label: "Schedule weekly monitor for new breweries in Kent",
    prompt: "Create a weekly monitor for new breweries in Kent and email me results",
  },
  {
    label: "Deep dive into craft beer venues in Yorkshire",
    prompt: "Deep research on craft beer venues in Yorkshire",
  },
];

const RESEARCH_TIPS = [
  "Choose your search type: 'Deep Research' for comprehensive analysis, 'Find Contacts' for verified business info, or 'Wyshbone Global Database' for quick listings",
  "Include location details: city, county, and country (defaults to UK if not specified)",
  "Set up monitors: Ask to create scheduled searches that run daily/weekly and email you results",
  "Use natural language: Just describe what you need - the AI will determine the best approach",
  "Follow-up questions work: Say 'deep dive' or 'get contacts' after a search to explore further",
];

const Tip = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
    <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground flex-shrink-0" />
    <span>{children}</span>
  </li>
);

export default function WishboneSidebar({ onPrompt }: Props) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const handleExampleClick = (ex: Example) => {
    onPrompt(ex.prompt);
  };

  const handleHide = () => {
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.aside
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="hidden lg:block w-[320px] xl:w-[360px] border-l border-border bg-background"
          aria-label="Research Tips and Examples"
          data-testid="sidebar-research"
        >
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {/* Header */}
              <div className="pb-2 flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-foreground">
                    Research Tips
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click an example to auto-fill and send. Or type your own prompt in
                    chat.
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleHide}
                  className="flex-shrink-0"
                  data-testid="button-hide-sidebar"
                  aria-label="Hide sidebar"
                >
                  <X className="h-4 w-4" />
                </Button>
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
              <p className="text-sm text-foreground">
                The AI intelligently offers all three search options when your request is ambiguous. You can also create scheduled monitors that run automatically and email you when new venues are discovered.
              </p>
            </CardContent>
          </Card>
            </div>
          </ScrollArea>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
