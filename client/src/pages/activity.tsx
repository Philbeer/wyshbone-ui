/**
 * Activity Page - Shows agent's recent activity
 * Displays real-time autonomous agent activities from database
 */

import { ActivityFeed } from "@/components/ActivityFeed";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ActivityPage() {
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agent Activity</h1>
          <p className="text-sm text-muted-foreground">
            What your AI agent has been doing
          </p>
        </div>

        {/* Real-time Activity Feed */}
        <ActivityFeed
          limit={10}
          autoRefresh={true}
          refreshInterval={30000}
          className="w-full"
        />
      </div>
    </ScrollArea>
  );
}
