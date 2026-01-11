/**
 * WABSScore Component
 *
 * Displays WABS (Worth A Bloody Share) score with signal breakdown
 * Shows relevance, novelty, actionability, and urgency metrics
 */

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sparkles, TrendingUp, Lightbulb, CheckCircle, Clock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WABSScoreProps {
  score: number;
  signals?: {
    relevance: number;
    novelty: number;
    actionability: number;
    urgency: number;
  };
  compact?: boolean;
  className?: string;
}

export function WABSScore({ score, signals, compact = false, className = "" }: WABSScoreProps) {
  // Score color based on threshold
  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-green-600 bg-green-50 border-green-200";
    if (score >= 50) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-gray-600 bg-gray-50 border-gray-200";
  };

  const getScoreBadgeVariant = (score: number): "default" | "secondary" | "destructive" | "outline" => {
    if (score >= 70) return "default";
    if (score >= 50) return "secondary";
    return "outline";
  };

  // Signal color based on value
  const getSignalColor = (value: number) => {
    if (value >= 70) return "text-green-600";
    if (value >= 50) return "text-yellow-600";
    return "text-gray-500";
  };

  // Compact view - just score badge
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant={getScoreBadgeVariant(score)}
              className={`text-xs font-mono ${className}`}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              {score}/100
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-1">
              <div className="font-semibold">WABS Score: {score}/100</div>
              {signals && (
                <>
                  <div>Relevance: {signals.relevance}/100</div>
                  <div>Novelty: {signals.novelty}/100</div>
                  <div>Actionability: {signals.actionability}/100</div>
                  <div>Urgency: {signals.urgency}/100</div>
                </>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full view - score + signal breakdown
  return (
    <Card className={`p-3 ${getScoreColor(score)} ${className}`}>
      <div className="space-y-2">
        {/* Main Score */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">WABS Score</span>
          </div>
          <div className="text-2xl font-bold font-mono">{score}/100</div>
        </div>

        {/* Signal Breakdown */}
        {signals && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Relevance */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    <span className="text-gray-600">R:</span>
                    <span className={`font-mono font-semibold ${getSignalColor(signals.relevance)}`}>
                      {signals.relevance}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Relevance: How well this matches your interests</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Novelty */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <Lightbulb className="h-3 w-3" />
                    <span className="text-gray-600">N:</span>
                    <span className={`font-mono font-semibold ${getSignalColor(signals.novelty)}`}>
                      {signals.novelty}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Novelty: How new or unexpected this information is</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Actionability */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    <span className="text-gray-600">A:</span>
                    <span className={`font-mono font-semibold ${getSignalColor(signals.actionability)}`}>
                      {signals.actionability}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Actionability: How easy it is to act on this</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Urgency */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span className="text-gray-600">U:</span>
                    <span className={`font-mono font-semibold ${getSignalColor(signals.urgency)}`}>
                      {signals.urgency}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Urgency: How time-sensitive this is</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {/* Score interpretation */}
        {score >= 70 && (
          <div className="text-xs font-medium text-green-700 pt-1 border-t border-green-200">
            ⭐ High-value result - worth sharing
          </div>
        )}
      </div>
    </Card>
  );
}
