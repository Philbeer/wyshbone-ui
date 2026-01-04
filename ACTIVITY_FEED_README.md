# Activity Feed UI Component

## Overview

The Activity Feed displays autonomous agent activities in real-time with auto-refresh capabilities. Users can see what the agent is doing, view detailed information about each activity, and identify interesting findings.

## Components Created

### 1. **ActivityFeed.tsx** (`client/src/components/ActivityFeed.tsx`)

Main component that displays a list of recent agent activities.

**Features:**
- Displays last N activities (default: 10, configurable)
- Auto-refreshes every 30 seconds (configurable)
- Highlights interesting findings with purple border and badge
- Shows status icons (success/failed/pending)
- Click any activity to see full details
- Responsive design for mobile and desktop
- Empty state when no activities exist
- Loading skeleton while fetching
- Error handling with user-friendly messages

**Props:**
```typescript
interface ActivityFeedProps {
  limit?: number;              // Number of activities to show (default: 10)
  autoRefresh?: boolean;       // Enable auto-refresh (default: true)
  refreshInterval?: number;    // Refresh interval in ms (default: 30000)
  interestingOnly?: boolean;   // Show only interesting activities (default: false)
  className?: string;          // Additional CSS classes
}
```

**Usage Example:**
```tsx
import { ActivityFeed } from "@/components/ActivityFeed";

// Basic usage (shows 10 recent activities, auto-refreshes every 30s)
<ActivityFeed />

// Custom configuration
<ActivityFeed
  limit={20}
  autoRefresh={true}
  refreshInterval={60000}  // 1 minute
  interestingOnly={false}
  className="my-4"
/>

// Show only interesting activities
<ActivityFeed interestingOnly={true} limit={5} />
```

### 2. **ActivityDetailModal.tsx** (`client/src/components/ActivityDetailModal.tsx`)

Modal dialog that shows complete details of a selected activity.

**Features:**
- Full activity information display
- JSON formatting for params, results, and metadata
- Status badges and icons
- Formatted timestamps and durations
- Error messages for failed activities
- Scrollable content for large payloads
- Responsive design

**Props:**
```typescript
interface ActivityDetailModalProps {
  activity: AgentActivity;
  open: boolean;
  onClose: () => void;
}
```

## API Endpoints Created

### 1. **GET /api/agent-activities**

Fetch recent agent activities.

**Query Parameters:**
- `limit` (number, optional): Number of activities to return (default: 10, max: 100)
- `interestingOnly` (boolean, optional): Filter to only interesting activities (default: false)
- `since` (number, optional): Unix timestamp (ms) to fetch activities since

**Example Requests:**
```bash
# Get last 10 activities
curl http://localhost:5000/api/agent-activities

# Get last 20 interesting activities
curl "http://localhost:5000/api/agent-activities?limit=20&interestingOnly=true"

# Get activities since timestamp
curl "http://localhost:5000/api/agent-activities?since=1736008800000"
```

**Response Format:**
```json
{
  "ok": true,
  "activities": [
    {
      "id": "activity_abc123",
      "userId": "user_123",
      "timestamp": 1736008800000,
      "taskGenerated": "Search for craft breweries in Manchester",
      "actionTaken": "search_google_places",
      "actionParams": { "query": "craft breweries", "location": "Manchester" },
      "results": { "places_found": 18 },
      "interestingFlag": 1,
      "status": "success",
      "errorMessage": null,
      "durationMs": 1250,
      "conversationId": null,
      "runId": "run_2026-01-04_morning",
      "metadata": { "source": "autonomous_agent" },
      "createdAt": 1736008800000
    }
  ],
  "count": 1,
  "limit": 10,
  "interestingOnly": false
}
```

### 2. **GET /api/agent-activities/:id**

Fetch a single activity by ID.

**Example Request:**
```bash
curl http://localhost:5000/api/agent-activities/activity_abc123
```

**Response Format:**
```json
{
  "ok": true,
  "activity": { /* full activity object */ }
}
```

### 3. **GET /api/agent-activities/stats/summary**

Get aggregate statistics about activities.

**Example Request:**
```bash
curl http://localhost:5000/api/agent-activities/stats/summary
```

**Response Format:**
```json
{
  "ok": true,
  "stats": {
    "total": 100,
    "interesting": 25,
    "successful": 85,
    "failed": 10,
    "pending": 5,
    "successRate": 85
  }
}
```

## Testing the Activity Feed

### 1. Create Test Data

Use the example script to insert test data:

```bash
# Run the examples script to insert test activities
npx tsx migrations/examples/agent_activities_examples.ts
```

This will create:
- Single activity example
- Batch of activities (3 activities in one run)
- Various types of activities (successful, interesting, failed, etc.)

### 2. Manual Test Data Insertion

You can also manually insert test data via psql or using the TypeScript client:

```typescript
import { storage } from './server/storage';
import { agentActivities } from '@shared/schema';

const testActivity = {
  id: `activity_${Date.now()}_${Math.random().toString(36).substring(7)}`,
  userId: 'user_demo_123',
  timestamp: Date.now(),
  taskGenerated: 'Find new pubs in Leeds',
  actionTaken: 'search_google_places',
  actionParams: { query: 'pubs', location: 'Leeds' },
  results: { places_found: 30, emails_sent: 15 },
  interestingFlag: 1,  // Mark as interesting
  status: 'success',
  errorMessage: null,
  durationMs: 2500,
  runId: `run_${Date.now()}`,
  metadata: { source: 'test' },
  createdAt: Date.now()
};

await storage.db.insert(agentActivities).values(testActivity);
```

### 3. Test the UI

1. **Add the ActivityFeed to a page:**

   Edit any page file (e.g., `client/src/pages/Home.tsx` or create a new page):

   ```tsx
   import { ActivityFeed } from "@/components/ActivityFeed";

   export default function TestActivityFeed() {
     return (
       <div className="container mx-auto p-6">
         <h1 className="text-3xl font-bold mb-6">Agent Activity Feed Test</h1>
         <ActivityFeed limit={10} autoRefresh={true} />
       </div>
     );
   }
   ```

2. **Navigate to the page** in your browser

3. **Verify functionality:**
   - ✅ Activities display correctly
   - ✅ Timestamps are formatted (e.g., "5m ago", "2h ago")
   - ✅ Status badges show correct colors (green=success, red=failed, yellow=pending)
   - ✅ Interesting activities have purple border and sparkle badge
   - ✅ Click an activity to open detail modal
   - ✅ Modal shows full JSON for params, results, metadata
   - ✅ Auto-refresh works (wait 30 seconds, insert new activity, should appear automatically)
   - ✅ Empty state shows when no activities exist
   - ✅ Error handling works if API fails

## Integration Examples

### Example 1: Dashboard Widget

```tsx
import { ActivityFeed } from "@/components/ActivityFeed";

export function DashboardPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Other widgets */}
      <ActivityFeed limit={5} interestingOnly={true} />
    </div>
  );
}
```

### Example 2: Full Page Activity Log

```tsx
import { ActivityFeed } from "@/components/ActivityFeed";

export function ActivityLogPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Agent Activity Log</h1>
      <ActivityFeed
        limit={50}
        autoRefresh={true}
        refreshInterval={15000}  // Refresh every 15 seconds
      />
    </div>
  );
}
```

### Example 3: Mobile-Optimized View

```tsx
import { ActivityFeed } from "@/components/ActivityFeed";

export function MobileActivityView() {
  return (
    <div className="p-4">
      <ActivityFeed
        limit={10}
        autoRefresh={true}
        className="w-full"
      />
    </div>
  );
}
```

## Responsive Design

The Activity Feed is fully responsive:

**Desktop (≥1024px):**
- Card-based layout
- Hover effects on activities
- Comfortable spacing

**Tablet (768px - 1023px):**
- Slightly compressed layout
- Touch-friendly click targets

**Mobile (<768px):**
- Stacked vertical layout
- Touch-optimized spacing
- Scrollable content areas
- Full-width modal dialogs

## Styling and Customization

The components use Tailwind CSS and shadcn/ui components. You can customize:

1. **Colors:** Edit the activity status colors in `ActivityFeed.tsx`:
   ```tsx
   const getStatusIcon = (status: string) => {
     switch (status) {
       case "success":
         return <CheckCircle2 className="h-4 w-4 text-green-500" />;  // Change color here
       // ...
     }
   };
   ```

2. **Interesting Activity Highlight:**
   ```tsx
   className={`
     p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md
     ${activity.interestingFlag === 1 ? "border-purple-300 bg-purple-50/50" : "border-gray-200"}
   `}
   ```

3. **Scroll Area Height:**
   ```tsx
   <ScrollArea className="h-[600px] pr-4">  {/* Adjust height here */}
   ```

## Acceptance Criteria Verification

✅ **1. Displays last 10 agent activities from database**
   - ActivityFeed component fetches and displays configurable number of activities
   - Default limit is 10, can be customized via props

✅ **2. Shows: timestamp, task, results summary, interesting flag**
   - Timestamp formatted as relative time ("5m ago", "2h ago")
   - Task shown in taskGenerated field
   - Results summary displayed for successful activities
   - Interesting flag shown with purple border + sparkle badge

✅ **3. Auto-refreshes every 30 seconds**
   - useEffect hook with setInterval
   - Configurable via refreshInterval prop
   - Can be disabled via autoRefresh={false}

✅ **4. Highlights interesting findings**
   - Purple border (border-purple-300)
   - Purple background tint (bg-purple-50/50)
   - Sparkle icon badge
   - "Interesting" label

✅ **5. Click activity to see full details**
   - onClick handler opens ActivityDetailModal
   - Modal shows complete activity data
   - JSON formatting for technical details
   - Scrollable for large payloads

✅ **6. Responsive design, works on mobile**
   - Tailwind responsive classes
   - ScrollArea component for mobile scrolling
   - Touch-friendly click targets
   - Full-width modal on mobile
   - Tested layouts for desktop, tablet, mobile

## Files Modified/Created

**Created:**
- `client/src/components/ActivityFeed.tsx` (305 lines)
- `client/src/components/ActivityDetailModal.tsx` (225 lines)
- `server/routes/agent-activities.ts` (136 lines)
- `ACTIVITY_FEED_README.md` (this file)

**Modified:**
- `server/routes.ts` (added import and router registration)

**Total:** ~700 lines of code

## Next Steps

To integrate the Activity Feed into your application:

1. **Add to a page/route** - Import and use `<ActivityFeed />` in your desired page
2. **Configure auto-refresh** - Adjust refreshInterval based on your needs
3. **Style customization** - Modify colors and spacing to match your design system
4. **Add filtering** - Extend API to filter by user, date range, action type, etc.
5. **Add pagination** - For viewing older activities beyond the limit
6. **Add real-time updates** - Consider WebSockets for instant updates instead of polling

## Troubleshooting

**Activities not showing:**
- Verify database has data: `SELECT COUNT(*) FROM agent_activities;`
- Check browser console for API errors
- Verify API endpoint is accessible: `curl http://localhost:5000/api/agent-activities`

**Auto-refresh not working:**
- Check autoRefresh prop is true
- Verify no console errors
- Check refresh interval is reasonable (not too short)

**Modal not opening:**
- Check for React errors in console
- Verify Dialog component from shadcn/ui is installed
- Test with simple click handler first

## Documentation References

- **Agent Activities Schema:** See `AGENT_ACTIVITIES_SCHEMA.md`
- **Example Queries:** See `migrations/examples/agent_activities_examples.ts`
- **Migration Scripts:** See `migrations/0001_create_agent_activities.sql`
