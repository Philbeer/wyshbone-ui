import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Database, Calendar } from "lucide-react";

type Props = {
  onPrompt: (prompt: string) => void;
  isVisible: boolean;
  onHide: () => void;
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

const WYSHBONE_FEATURES = [
  {
    icon: Search,
    title: "Deep Research",
    description: "Comprehensive analysis with sources, citations, and evidence. Perfect for market research and competitive analysis.",
  },
  {
    icon: Database,
    title: "Wyshbone Global Database (Quick Search)",
    description: "Quick business discovery with verified listings and Place IDs. Search millions of venues worldwide instantly.",
  },
  {
    icon: Calendar,
    title: "Scheduled Monitoring",
    description: "Automated searches that run daily, weekly, or monthly. Get email alerts when new businesses match your criteria.",
  },
];

const FeatureCard = ({ icon: Icon, title, description }: { icon: any; title: string; description: string }) => (
  <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
    <div className="flex-shrink-0 mt-0.5">
      <Icon className="h-5 w-5 text-primary" />
    </div>
    <div className="flex-1 min-w-0">
      <h4 className="text-sm font-semibold text-foreground mb-1">{title}</h4>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  </div>
);

export default function WishboneSidebar({ onPrompt, isVisible, onHide }: Props) {
  const handleExampleClick = (ex: Example) => {
    onPrompt(ex.prompt);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
          className="hidden lg:block flex-shrink-0 w-[min(320px,100vw)] xl:w-[min(360px,100vw)] border-l border-border bg-background"
          aria-label="Research Tips and Examples"
          data-testid="sidebar-research"
        >
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {/* Header */}
              <div className="pb-2 flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-foreground">
                    What can I do?
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Discover businesses, research markets, and automate monitoring
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onHide}
                  className="flex-shrink-0"
                  data-testid="button-hide-sidebar"
                  aria-label="Hide sidebar"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

          {/* Wyshbone Functions Card */}
          <Card data-testid="card-wyshbone-functions">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Wyshbone Functions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {WYSHBONE_FEATURES.map((feature, idx) => (
                  <FeatureCard
                    key={idx}
                    icon={feature.icon}
                    title={feature.title}
                    description={feature.description}
                  />
                ))}
              </div>
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
                Just describe what you need in natural language. The AI will automatically choose the best approach and offer alternatives when your request is ambiguous.
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
