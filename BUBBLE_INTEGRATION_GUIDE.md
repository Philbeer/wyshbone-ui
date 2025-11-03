# Bubble.io Integration Guide for Wyshbone Chat

This guide explains how to connect your Bubble.io app with the Wyshbone chat application, ensuring secure authentication and proper data flow between both systems.

## Overview

The integration works through a **session-based authentication system**:

1. **Bubble creates a session** when a user wants to access the chat
2. **Wyshbone validates the session** and authenticates the user
3. **All API calls** use the authenticated user context
4. **Data flows back to Bubble** through workflow triggers

---

## Step 1: Set Up the Shared Secret

Both apps need to share a secret key for secure authentication.

### In Your Replit App (Already Done ✅)
- You've already set `BUBBLE_SHARED_SECRET` in Replit Secrets
- This value is: `wysh_fc05ef1f39a94fc890f3c6c7b76bc5df`

### In Your Bubble App
1. Go to your Bubble app **Settings** → **API**
2. Create a new **API Key** or use an existing one
3. Store the same value: `wysh_fc05ef1f39a94fc890f3c6c7b76bc5df`
4. You'll use this in your API workflow calls

---

## Step 2: Create Session Workflow in Bubble

You need a Bubble **Backend Workflow** that creates a session when a user opens the chat.

### Create Backend Workflow: "Create Wyshbone Session"

**Workflow Name:** `create_wyshbone_session`

**Parameters:**
- `user_id` (text) - The current user's unique ID from Bubble
- `user_email` (text) - The current user's email

**Steps:**

1. **Add API Connector Call**
   - **Type:** POST
   - **URL:** `https://YOUR_REPLIT_URL.replit.app/api/create-session`
   - **Headers:**
     - `Authorization`: `Bearer wysh_fc05ef1f39a94fc890f3c6c7b76bc5df`
     - `Content-Type`: `application/json`
   - **Body Type:** JSON
   - **Body:**
     ```json
     {
       "userId": "<user_id>",
       "userEmail": "<user_email>"
     }
     ```

2. **Response Structure:**
   The API will return:
   ```json
   {
     "sessionId": "abc-123-def-456",
     "expiresAt": 1699999999999
   }
   ```

3. **Save the Session ID**
   - Store the returned `sessionId` in a Bubble database field or custom state
   - You'll pass this to the iframe URL

---

## Step 3: Set Up the Chat HTML Element in Bubble

### Create the Chat Widget

1. **Add an HTML element** to your Bubble page (bottom right corner)

2. **Position it:**
   - Fixed position: bottom-right
   - Width: 400px (or your preference)
   - Height: 600px (or your preference)

3. **HTML Code:**

```html
<iframe 
  id="wyshbone-chat"
  src=""
  style="width: 100%; height: 100%; border: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"
  allow="clipboard-read; clipboard-write"
></iframe>

<script>
  // Wait for Bubble to provide the session ID
  window.addEventListener('message', function(event) {
    // Update iframe src when session is ready
    if (event.data && event.data.type === 'wyshbone_session') {
      var iframe = document.getElementById('wyshbone-chat');
      // IMPORTANT: Always add reset=1 to clear old cached sessions
      iframe.src = 'https://YOUR_REPLIT_URL.replit.app?sid=' + event.data.sessionId + '&reset=1';
    }
  });
</script>
```

---

## Important: Session Reset for User Switching

**Why the `reset=1` parameter is critical:**

When users log out and a different user logs into Bubble, the chat iframe may still have cached data from the previous user. The `reset=1` parameter ensures:

1. **localStorage is cleared** - Removes all cached user data
2. **sessionStorage is cleared** - Removes temporary session data
3. **Fresh session validation** - Forces a new authentication check

**Always include `&reset=1` in your iframe URL:**
```
https://YOUR_REPLIT_URL.replit.app?sid=SESSION_ID&reset=1
```

This guarantees that each user sees only their own chat history and data, even if multiple users access the chat from the same browser.

---

## Step 4: Trigger Session Creation on Page Load

Create a Bubble workflow that runs when the page loads:

**When:** Page is loaded
**Actions:**

1. **Schedule API Workflow:** `create_wyshbone_session`
   - Pass: `Current User's Unique ID`
   - Pass: `Current User's Email`

2. **Run JavaScript:**
```javascript
// Get the session ID from the workflow response
var sessionId = bubble_fn_result; // The session ID returned from your backend workflow

// Send it to the iframe
window.postMessage({
  type: 'wyshbone_session',
  sessionId: sessionId
}, '*');
```

---

## Step 5: Update Batch API Calls to Use Authenticated User

Currently, your batch workflow API calls are hardcoded to `phil@listersbrewery.com`. Here's how to fix that:

### Current Issue:
In `server/monitor-executor.ts`, line 46:
```javascript
const recipientEmail = monitor.emailAddress || userEmail || 'phil@listersbrewery.com';
```

### Solution:
The email will now be automatically pulled from the **authenticated session** when API calls are made.

### How It Works:

1. **Frontend includes session ID:**
   - All API requests from the chat app include the `x-session-id` header
   - This is handled automatically by the frontend

2. **Backend validates session:**
   - Every protected API endpoint calls `getAuthenticatedUserId(req)`
   - This validates the session and extracts `userId` and `userEmail`
   - The email is no longer hardcoded

3. **Your API endpoints automatically use the correct user:**
   - Chat messages are saved to the authenticated user
   - Monitors are created for the authenticated user
   - Batch jobs are triggered for the authenticated user

---

## Step 6: Communication from Wyshbone to Bubble

When Wyshbone needs to send data back to Bubble (e.g., batch results, monitor completions):

### Option A: Webhooks (Recommended)

1. **Create a Bubble Backend Workflow API endpoint:**
   - Go to **Settings → API → Backend workflows**
   - Create endpoint: `wyshbone_batch_results`
   - Parameters: `user_email`, `batch_id`, `results` (JSON)

2. **Store the webhook URL in Wyshbone:**
   - Add to your Replit Secrets: `BUBBLE_WEBHOOK_URL`
   - Value: `https://your-bubble-app.bubbleapps.io/version-test/api/1.1/wf/wyshbone_batch_results`

### Option B: Database Sync

Set up a scheduled workflow in Bubble that:
1. Polls Wyshbone API for updates
2. Uses `GET /api/jobs` with authenticated user context
3. Processes new results

---

## Step 7: Testing the Integration

### Test Session Creation:

1. **Open your Bubble app** as a logged-in user
2. **Check browser console** for the iframe src to verify session ID is passed
3. **Verify in Wyshbone** that the session was created (check server logs)

### Test Chat Authentication:

1. Send a message in the chat
2. Verify it's saved under the correct user email
3. Check conversation history is user-specific

### Test Batch Workflows:

1. Trigger a batch job from the chat
2. Verify the API call uses the authenticated user's email
3. Check results are sent to the correct Bubble user

---

## Security Best Practices

✅ **Always use HTTPS** for both Bubble and Replit apps
✅ **Keep the shared secret private** - never expose in client-side code
✅ **Sessions expire after 30 minutes** - implement refresh if needed
✅ **Validate all incoming data** in both Bubble and Wyshbone
✅ **Use Bubble's privacy rules** to protect user data

---

## Troubleshooting

### Session Not Created
- Check that `BUBBLE_SHARED_SECRET` matches in both apps
- Verify the Authorization header is correctly formatted
- Check Replit logs for errors

### Chat Not Loading
- Verify the iframe src includes `?sid=SESSION_ID`
- Check browser console for CORS errors
- Ensure Replit app is running

### Wrong User Data
- Verify session validation is working (check logs)
- Ensure `x-session-id` header is being sent
- Check that user email matches in both systems

---

## API Endpoint Reference

### Create Session
```
POST /api/create-session
Headers: Authorization: Bearer <BUBBLE_SHARED_SECRET>
Body: { 
  "userId": "...", 
  "userEmail": "...",
  "default_country": "US" (optional - ISO country code like "US", "GB", "FR", etc.)
}
Response: { "sessionId": "...", "expiresAt": 123456789 }
```

**Note:** The `default_country` field is optional. When provided, it sets the default country for location-based searches in the chat.

### Validate Session
```
GET /api/validate-session/:sessionId
Response: { 
  "userId": "...", 
  "userEmail": "...", 
  "defaultCountry": "US" (if provided during session creation),
  "expiresAt": 123456789 
}
```

### All Protected Endpoints
All endpoints automatically use the authenticated user from the session when the `x-session-id` header is present.

---

## Next Steps

1. ✅ Set up the shared secret (DONE)
2. ⬜ Create Bubble backend workflow for session creation
3. ⬜ Add HTML iframe element to Bubble page
4. ⬜ Test session creation and chat loading
5. ⬜ Configure webhook for results (optional)
6. ⬜ Test end-to-end batch workflow with authenticated users

---

## Support

If you encounter issues:
1. Check the Replit console logs
2. Check Bubble's server logs
3. Verify all environment variables are set correctly
4. Test with browser developer tools open to see network requests
