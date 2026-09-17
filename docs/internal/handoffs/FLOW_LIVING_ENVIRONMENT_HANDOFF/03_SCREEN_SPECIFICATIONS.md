# 03 — Screen Specifications

Use `assets/boards/screen-map.png` as the visual index.

The images establish mood, hierarchy, and key states. Production screens must remain responsive, accessible, and data-driven.

---

## 01 — Living Home

Reference: `assets/screens/01-living-home.png`

### Purpose

Provide immediate orientation without forcing navigation before speaking.

### Layout

- global Flow wordmark;
- current date/time centered quietly;
- Flow Live state top-right;
- two-by-two projection grid on desktop;
- Calendar and Inbox may occupy slightly more visual weight than Plans and People;
- command dock centered at the bottom.

### Container content

- Calendar: next events, breathing space, density state.
- Inbox: latest unresolved captures.
- Plans: active plan progress and next meaningful step.
- People: nearest open promises/waiting states.

### Interaction

- click anywhere on a container to open it;
- say “Calendar”, “Inbox”, “Plans”, or “People”;
- issue direct commands from Home without opening a space first.

### Motion

The chosen container expands from its exact Home geometry into the destination shell using shared layout. Other containers recede 4–8px and fade; they do not fly away.

---

## 02 — Breathing Calendar

Reference: `assets/screens/02-breathing-calendar.png`

### Purpose

Show a calm, spatially legible day whose empty space is meaningful.

### Required elements

- thin vertical time spine;
- current-time point;
- floating event surfaces;
- amber protected state;
- teal Breathing Room object;
- density state: Open, Calm, Tight, or Overloaded;
- no permanent right-side status panel.

### Interaction

Preserve existing create/edit/move/resize/protect/color/label/recovery/what-if capabilities.

### Motion

- Tide reflow uses curved paths and old-position ghosts;
- protected events remain visually still;
- Breathing Room opens by creating space, not by drawing a decorative wave over occupied time.

---

## 03 — Global Command Preview

Reference: `assets/screens/03-global-command-preview.png`

### Purpose

Show that Flow is actively understanding a command without converting the app into a chat UI.

### Required behavior

- command dock expands only while typing/listening/processing;
- interim transcript may preview a focus/color/buffer non-destructively;
- final validated command commits atomically;
- the dock collapses after success;
- errors appear beside the affected object or as one concise line in the dock.

### Example

> “Make the 2 PM meeting important and red.”

The target event rises while “2 PM meeting” is recognized. Importance and red color remain previews until the final transcript validates.

---

## 04 — Automatic Tide Recovery

Reference: `assets/screens/04-automatic-tide-recovery.png`

### Purpose

Explain a multi-event recovery without asking the user to inspect a verbose log.

### Layout rule

The Calendar remains dominant. A temporary details panel may appear only during inspection and must close easily. It is not a permanent sidebar.

### Required behavior

- old positions remain as low-contrast ghosts;
- moved events show destination and delta;
- protected events remain anchored;
- one concise summary appears: “Recovered 40m · Dinner unchanged.”

### Interaction

- accept is not required for safe flexible reflow if user trust policy allows auto-apply;
- Undo is always available;
- “What changed?” reveals the details temporarily.

---

## 05 — What-if Preview

Reference: `assets/screens/05-what-if-preview.png`

### Purpose

Let users experiment without mutating current state.

### Required behavior

- current events remain readable;
- proposed event receives a dashed teal outline;
- affected events show ghost destinations;
- current state, persistence, and history remain untouched until “Apply this change” or “Do it.”

### Commands

- “What if I add a workout at five?”
- “Try six instead.”
- “Do it.”
- “Cancel that preview.”

---

## 06 — Inbox → Plan Morph

Reference: `assets/screens/06-inbox-to-plan-morph.png`

### Purpose

Make cross-space transformation understandable and emotionally satisfying.

### Required behavior

- capture stays legible while the transformation occurs;
- a Tide path connects source to destination;
- plan shell materializes progressively;
- origin relationship remains stored;
- entire conversion is one undoable transaction.

Follow `05_INBOX_TO_PLAN_CHOREOGRAPHY.md` exactly.

---

## 07 — Plan Detail

Reference: `assets/screens/07-plan-detail.png`

### Purpose

Show a path to an outcome, not a Kanban board.

### Required elements

- plan title, outcome, due state;
- ordered vertical path;
- completed/current/upcoming step states;
- scheduled step shows real Calendar date/time;
- command dock available.

### Interaction

- add, rename, reorder, complete, defer, and schedule steps;
- click scheduled state to inspect Calendar relationship;
- saying “Schedule the documents step Friday at ten” uses the Calendar engine.

### Motion

When a step is scheduled, a Tide line extends from the step toward Calendar; on route change, a shared transition resolves into the actual event.

---

## 08 — People Commitments

Reference: `assets/screens/08-people-commitments.png`

### Purpose

Remember commitments, not contact metadata.

### Required views

- My promises
- Waiting on others
- No due date

### Row content

- person;
- commitment;
- due state;
- direction of responsibility;
- optional linked plan/calendar indicator.

### Motion

A promise thread animates only when created, completed, reassigned, or linked. Do not keep every row connected by permanently moving lines.

---

## 09 — Now Engine

Reference: `assets/screens/09-now-engine.png`

### Purpose

Answer: “What genuinely fits this moment?”

### Required behavior

Calculate the current usable window from Calendar. Rank candidates by:

1. duration fit;
2. hard due state;
3. dependency readiness;
4. location/context if explicitly stored;
5. minimal context-switch cost;
6. user-protected free time.

Return no more than three options.

### Interaction

- click an option to start/focus it;
- “Nothing administrative” reranks locally;
- “Why these?” shows concrete reasons;
- “Keep the time free” is always valid.

### Motion

The available-time nucleus expands once on entry, recommendations settle in staggered order, then the screen becomes still.
