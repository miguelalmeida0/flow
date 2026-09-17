# 02 — Information Architecture

## Primary spaces

### Home

Orientation and global command surface.

The Home screen contains four glanceable containers:

- Calendar
- Inbox
- Plans
- People

Each shows real, current data and is fully clickable. Saying the container name opens it.

### Calendar

Projection by time. Existing Breathing Day + Tide behavior remains authoritative.

### Inbox

Projection by unresolved state. Captures can be resolved, archived, deleted, or transformed.

### Plans

Projection by outcome. Plans contain ordered steps and scheduling relationships.

### People

Projection by commitment. It answers what the user promised, what others promised, and what is waiting.

### Now

Projection by immediate feasibility. It evaluates existing entities; it does not own separate task data.

## Recommended routes

```text
/                 Living Home
/calendar         Breathing Day + Tide
/inbox            Captures
/plans            Plan overview
/plans/:planId    Plan detail
/people           Promises and waiting
/now              What fits right now
```

Use the existing router if present. Do not introduce a router merely to satisfy this outline if the app has a simpler proven navigation model; preserve deep-linkability and browser history either way.

## Navigation model

### Home

No permanent sidebar. The four containers are the navigation.

### Detail spaces on desktop

Use a restrained rail only where it improves orientation. It must not dominate the Calendar surface.

Recommended behavior:

- compact by default;
- labels remain visible at large widths;
- collapses at medium widths;
- never overlays essential content;
- current space indicated with one teal edge, not a filled neon block.

### Mobile

Use a calm bottom navigation with five destinations:

- Calendar
- Inbox
- Plans
- People
- Now

Home is reached through the Flow mark or back affordance. The command dock sits above the bottom navigation.

## Global command model

The command dock is available in every space.

It handles:

- voice activation/session state;
- interim transcript;
- typed command;
- current command result only when needed;
- keyboard shortcut.

It is not a chat history.

## Cross-space routing

A command may begin in one view and finish in another:

- “Turn that into a plan” from Inbox opens or reveals the new plan after the morph.
- “Schedule this Friday at ten” from Plan detail creates a Calendar relationship and may briefly preview Calendar.
- “What fits right now?” opens Now regardless of current route.
- “Calendar” opens Calendar without an intermediate confirmation.

## Shared entity lineage

The UI should allow the user to understand source and destination relationships without showing a database graph.

Examples:

- Capture → Plan
- Plan step → Calendar event
- Promise → Person + deadline + optional plan
- Now recommendation → source plan step or capture

Use small origin labels and reversible transitions, not permanent connector lines across every screen.

## Empty states

Empty states should be actionable and quiet.

- Inbox: “Nothing unresolved.” + Capture
- Plans: “No active plans.” + Turn a capture into one
- People: “No open promises.” + Add a promise
- Now: “Nothing useful fits this gap.” + Keep the space free

No illustrations are required.
