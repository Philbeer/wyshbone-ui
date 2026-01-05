/**
 * Profile Progress Widget
 * Shows user's profile completion percentage and missing fields
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { calculateProfileCompletion, getCompletionMessage, type UserProfile, type CrmSettings } from "@/lib/profile-completion";
import { Link } from "wouter";

interface ProfileProgressWidgetProps {
  user: UserProfile;
  crmSettings?: CrmSettings;
  className?: string;
}

export function ProfileProgressWidget({ user, crmSettings, className }: ProfileProgressWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const completion = calculateProfileCompletion(user, crmSettings);
  const message = getCompletionMessage(completion.percentage);

  // Don't show widget if profile is 100% complete
  if (completion.percentage === 100) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Profile {completion.percentage}% complete</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 w-8 p-0"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <Progress value={completion.percentage} className="h-2" />
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>

        {/* Missing fields (collapsible) */}
        {isExpanded && completion.missingFields.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <h4 className="text-sm font-medium">Missing information:</h4>
            <ul className="space-y-1">
              {completion.missingFields.map((field) => (
                <li key={field} className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                  {field}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTA button */}
        <Link href="/account">
          <Button variant="outline" className="w-full" size="sm">
            Complete Your Profile →
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
