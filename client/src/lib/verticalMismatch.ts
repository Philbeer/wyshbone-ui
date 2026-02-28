import type { VerticalId } from "./verticals/types";

interface MismatchConfig {
  keywords: string[];
}

const MISMATCH_MAP: Partial<Record<VerticalId, MismatchConfig>> = {
  brewery: {
    keywords: [
      "vulnerable adults",
      "housing",
      "council support",
      "benefits",
      "charity",
      "social care",
      "mental health",
      "safeguarding",
      "domestic abuse",
      "homelessness",
      "welfare",
      "nhs",
      "child protection",
      "elderly care",
      "disability",
      "care home",
      "social services",
      "food bank",
    ],
  },
};

export function detectVerticalMismatch(
  verticalId: VerticalId,
  query: string
): { mismatch: boolean; matchedTerms: string[] } {
  const config = MISMATCH_MAP[verticalId];
  if (!config) return { mismatch: false, matchedTerms: [] };

  const lower = query.toLowerCase();
  const matchedTerms = config.keywords.filter((kw) => lower.includes(kw));
  return { mismatch: matchedTerms.length > 0, matchedTerms };
}

export function getVerticalLabel(verticalId: VerticalId): string {
  const labels: Record<VerticalId, string> = {
    brewery: "Breweries",
    generic: "General",
    animal_physio: "Animal Physio",
    other: "Other",
  };
  return labels[verticalId] || verticalId;
}
