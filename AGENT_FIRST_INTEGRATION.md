# Agent-First UI Integration Guide

## Files Created

### Layouts (`client/src/layouts/`)
- `DesktopSplitLayout.tsx` - 40/60 desktop split screen
- `MobileAgentLayout.tsx` - Mobile-first with bottom nav
- `ResponsiveAgentLayout.tsx` - Auto-switches between desktop/mobile
- `SplitLayout.tsx` - Original split layout
- `MobileLayout.tsx` - Original mobile layout
- `AgentFirstLayout.tsx` - Combined responsive layout
- `index.ts` - Exports all layouts

### Agent Components (`client/src/components/agent/`)
- `AgentChatPanel.tsx` - Left panel chat interface with status, quick actions
- `AgentWorkspace.tsx` - Right panel default view with metrics and activity
- `index.ts` - Exports

### Mobile Components (`client/src/components/mobile/`)
- `AgentMobileHome.tsx` - Mobile home screen
- `CRMPreview.tsx` - Mobile CRM preview with desktop prompt
- `index.ts` - Exports

### Pages
- `client/src/pages/agent-home.tsx` - New home page using AgentWorkspace
- `client/src/pages/activity.tsx` - Activity timeline page
- `client/src/pages/settings.tsx` - Settings page
- `client/src/pages/crm-preview.tsx` - Mobile CRM preview page

### Context
- `client/src/contexts/AgentFirstContext.tsx` - Feature flag for toggling new UI

### Styles
- Updated `client/src/index.css` with agent-first CSS classes

---

## Integration Steps for App.tsx

### Option 1: Feature Flag Toggle (Recommended)

Add these imports at the top of `App.tsx`:

```typescript
import { AgentFirstProvider, useAgentFirst } from "@/contexts/AgentFirstContext";
import { ResponsiveAgentLayout } from "@/layouts";
import AgentHomePage from "@/pages/agent-home";
import ActivityPage from "@/pages/activity";
import SettingsPage from "@/pages/settings";
import CrmPreviewPage from "@/pages/crm-preview";
```

Wrap your app with the provider (add inside the existing providers):

```typescript
function App() {
  return (
    <UserProvider>
      <VerticalProvider>
        <DemoModeProvider>
          <OnboardingTourProvider>
            <SidebarFlashProvider>
              <AgentStatusProvider>
                <AgentFirstProvider>  {/* ADD THIS */}
                  <AppContent />
                  <OnboardingTour />
                </AgentFirstProvider>  {/* ADD THIS */}
              </AgentStatusProvider>
            </SidebarFlashProvider>
          </OnboardingTourProvider>
        </DemoModeProvider>
      </VerticalProvider>
    </UserProvider>
  );
}
```

### Option 2: Add New Routes for Agent-First Views

In your Router component, add these routes:

```typescript
function Router({ ... }) {
  const { isAgentFirstEnabled } = useAgentFirst();
  
  // If agent-first is enabled, use new layout
  if (isAgentFirstEnabled) {
    return (
      <ResponsiveAgentLayout>
        <Switch>
          <Route path="/" component={AgentHomePage} />
          <Route path="/activity" component={ActivityPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/crm-preview" component={CrmPreviewPage} />
          <Route path="/auth/crm" nest component={CrmLayout} />
          <Route path="/leads" component={LeadsPage} />
          <Route path="/nudges" component={NudgesPage} />
          {/* ... other routes */}
        </Switch>
      </ResponsiveAgentLayout>
    );
  }
  
  // Original routing (fallback)
  return (
    <Switch>
      {/* existing routes */}
    </Switch>
  );
}
```

---

## Quick Test

1. Start dev server:
```bash
npm run dev
```

2. Open browser to `http://localhost:5173`

3. Toggle feature flag in browser console:
```javascript
localStorage.setItem('wyshbone_agent_first_ui', 'true');
location.reload();
```

4. To disable:
```javascript
localStorage.setItem('wyshbone_agent_first_ui', 'false');
location.reload();
```

---

## Component Usage Examples

### Using ResponsiveAgentLayout directly:

```tsx
import { ResponsiveAgentLayout } from "@/layouts";

function MyPage() {
  const handleSendMessage = (message: string) => {
    console.log("User sent:", message);
    // Send to your chat API
  };

  return (
    <ResponsiveAgentLayout onSendMessage={handleSendMessage}>
      <div>Your page content here</div>
    </ResponsiveAgentLayout>
  );
}
```

### Using AgentChatPanel standalone:

```tsx
import { AgentChatPanel } from "@/components/agent";

function ChatSection() {
  return (
    <div className="h-full">
      <AgentChatPanel 
        onSendMessage={(msg) => console.log(msg)} 
      />
    </div>
  );
}
```

### Using AgentWorkspace standalone:

```tsx
import { AgentWorkspace } from "@/components/agent";

function WorkspaceSection() {
  return <AgentWorkspace />;
}
```

---

## CSS Classes Available

```css
/* Desktop split layout */
.desktop-split-layout { }
.left-panel { }
.right-panel { }

/* Mobile layout */
.mobile-agent-layout { }
.mobile-header { }
.mobile-content { }
.mobile-nav { }

/* Agent chat */
.agent-chat-panel { }
.chat-messages { }
.message { }
.agent-message { }
.user-message { }

/* Responsive utilities */
.desktop-only { }  /* Hidden on mobile */
.mobile-only { }   /* Hidden on desktop */
```

---

## Terminology Changes Made

| Old | New |
|-----|-----|
| CRM System | Agent's Workspace |
| Brewery CRM | Agent's Brewery Workspace |
| Generic CRM | Standard Workspace |

---

## Rollback

To revert all changes:

```bash
git checkout -- client/src/
# Or if you created a branch:
git checkout main
```

---

## Next Steps

1. ✅ Components created
2. ✅ Styles added
3. ⏳ Integrate into App.tsx (manual step)
4. ⏳ Wire up chat to actual API
5. ⏳ Connect activity metrics to real data
6. ⏳ Test on mobile devices


