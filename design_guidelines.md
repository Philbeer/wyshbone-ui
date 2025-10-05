# Wyshbone Chat Agent - Design Guidelines

## Design Approach: Modern AI Chat Interface

**Selected Framework:** Material Design principles with inspiration from ChatGPT, Linear, and Slack
**Rationale:** Utility-focused chat interface prioritizing clarity, efficiency, and professional polish for AI-powered conversations

---

## Core Design Elements

### A. Color Palette

**Dark Mode (Primary)**
- Background: 217 33% 10% (deep navy-slate)
- Surface: 217 28% 14% (elevated panels)
- Surface Elevated: 217 25% 18% (chat input, buttons)
- Border: 217 20% 24% (subtle dividers)
- Text Primary: 220 14% 96% (main content)
- Text Secondary: 220 10% 70% (timestamps, labels)
- Accent Primary: 217 91% 60% (Wyshbone brand - vibrant blue)
- Accent Hover: 217 91% 65%
- Success: 142 71% 45% (tool confirmations)
- AI Message Background: 217 25% 16% (slightly lighter than surface)
- User Message Background: 217 91% 60% (accent color)

**Light Mode (Secondary)**
- Background: 0 0% 100%
- Surface: 220 14% 98%
- Surface Elevated: 0 0% 100%
- Border: 220 13% 91%
- Text Primary: 217 33% 17%
- Text Secondary: 217 20% 45%
- Accent Primary: 217 91% 50%
- AI Message Background: 220 14% 96%
- User Message Background: 217 91% 50%

### B. Typography

**Font Families**
- Primary: 'Inter', system-ui, sans-serif (all UI text)
- Monospace: 'JetBrains Mono', 'Fira Code', monospace (code snippets if needed)

**Scale**
- Display: 32px, 700 weight (page header "Wyshbone AI")
- H1: 24px, 600 weight (section headers)
- Body: 15px, 400 weight (chat messages)
- Small: 13px, 400 weight (timestamps, helper text)
- Label: 13px, 500 weight (input labels, buttons)

**Line Height**
- Headings: 1.2
- Body: 1.6 (optimal for chat readability)
- Small text: 1.4

### C. Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16 (p-2, m-4, gap-6, h-8, etc.)

**Grid Structure**
- Container: max-w-4xl centered (optimal chat width)
- Chat area: Full width with 6-8 units padding
- Message bubbles: max-w-3xl to prevent excessive line length
- Sidebar (if added): 280px fixed width

**Vertical Rhythm**
- Message spacing: 4 units between messages
- Section spacing: 8 units between major sections
- Header/footer padding: 6 units

### D. Component Library

**Navigation/Header**
- Fixed header: h-16, backdrop blur with 90% opacity background
- Logo + "Wyshbone AI" wordmark (left aligned)
- Theme toggle icon button (right aligned)
- Subtle bottom border: 1px in border color

**Chat Interface**
- Main chat container: Flexbox column, h-screen layout
- Message area: flex-1, overflow-y-auto, smooth scrolling
- Messages aligned left (AI) and right (User)
- AI messages: avatar icon (robot/sparkle), rounded-lg bubble with p-4
- User messages: rounded-lg bubble with p-4, accent color background, white text
- Timestamps: text-xs, secondary color, positioned below bubbles

**Chat Input Section**
- Fixed bottom position with 6 unit padding
- Input wrapper: Surface elevated background, rounded-xl, border
- Textarea: auto-expanding (min 48px height), max 200px
- Send button: Accent color, rounded-lg, px-6 py-3, positioned right
- Focus state: 2px accent color ring

**Tool Action Button**
- Secondary button style: outline variant
- Icon + label (e.g., "📝 Add Note to Bubble")
- Positioned in header or as floating action button
- Success feedback: inline green checkmark + text in chat

**Loading States**
- Typing indicator: Three animated dots in AI message bubble
- Skeleton screens: Subtle pulse animation on surface color

**Empty State**
- Centered content in chat area
- Icon (💬 or similar), heading, description text
- Suggested actions or prompts

### E. Interaction Patterns

**Message Flow**
- Smooth scroll-to-bottom on new message (behavior: 'smooth')
- Fade-in animation for new messages (200ms duration)
- Input clears immediately on send
- Disabled send button while waiting for response

**Tool Feedback**
- Success notification appears as system message in chat
- 3-second auto-dismiss or manual close option
- Green accent with checkmark icon

**Micro-interactions**
- Button hover: Slight brightness increase (5%)
- Input focus: Border color transition (150ms)
- Theme toggle: 300ms color transition across all elements

### F. Accessibility & Quality

**Contrast Requirements**
- WCAG AA minimum (4.5:1 for normal text)
- Form inputs maintain consistent dark/light mode styling
- Focus indicators: 2px visible outline on all interactive elements

**Responsive Behavior**
- Mobile (< 640px): Full width, reduced padding (p-4)
- Tablet (640-1024px): max-w-3xl
- Desktop (> 1024px): max-w-4xl
- Touch targets: Minimum 44x44px on mobile

**Performance**
- No heavy animations
- Efficient re-renders (virtualize long chat histories if needed)
- Optimistic UI updates (show user message immediately)

---

## Images

**No hero image required** - This is a utility chat interface, not a marketing page.

**Optional decorative elements:**
- Subtle background pattern/texture (10% opacity grid or dots) on main background
- Brand logo/icon in header (32x32px)
- AI avatar icon (24x24px) - simple robot or sparkle symbol

---

## Implementation Notes

- Prioritize chat message clarity and readability
- Maintain consistent message bubble styling for scanability
- Keep UI minimal and distraction-free - focus is on conversation
- Ensure smooth, instant feeling interactions (optimistic UI patterns)
- Professional, trustworthy aesthetic suitable for UK business context