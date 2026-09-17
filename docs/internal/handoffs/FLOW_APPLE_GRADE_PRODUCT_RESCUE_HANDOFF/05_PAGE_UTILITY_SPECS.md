# 05 — Page Utility Specifications

## Home

### Required value

Home must help before the user navigates.

### Required modules

1. **Now** — current event or open gap;
2. **Next** — next fixed/protected commitment;
3. **Day health** — concrete conflict/recovery information;
4. **Needs attention** — one capture, outcome, or commitment requiring action;
5. **Spaces** — concise entry points for Today, Capture, Outcomes, and Commitments.

### Required actions

- Recover day
- Mark current event done
- Find time for next outcome step
- Resolve one capture
- Schedule one commitment
- Open any space by click or voice

### Empty behavior

Never show four large empty cards. Use one useful setup prompt, such as “Add your first event” or “Capture something you do not want to lose.”

## Today

### Required value

Keep the remaining day feasible.

### Required capabilities

- create event from any route;
- move by title, time, relative position, current/next reference;
- resize;
- rename;
- recolor;
- label;
- important/normal;
- protect/unprotect;
- fixed/heavy/flexible/fluid;
- confirm;
- complete;
- delete with confirmation;
- create breathing room;
- create pre/post buffers;
- move to tomorrow/weekday;
- recover lateness;
- handle early completion;
- set end-of-day boundary;
- what-if preview;
- undo/redo.

### Automatic behavior

- detect when current time has passed a planned event end;
- calculate a safe recovery proposal;
- never move shared/protected/fixed items silently;
- show ghost positions before risky changes;
- permit auto-apply only for reversible, private, flexible changes.

## Capture

### Required value

Get an idea out of the user's head without requiring taxonomy decisions.

### Required capabilities

- explicit capture by voice/type;
- classify high-confidence event/outcome/commitment requests;
- route safely without duplicate unresolved items;
- keep ambiguous items lightweight;
- convert to event/outcome/commitment;
- archive/delete;
- edit text;
- batch resolve;
- show origin and destination;
- undo exact resolution.

### Empty behavior

The empty state itself must accept input and show three useful examples. It may not be a large blank bordered box.

## Outcomes

### Required value

Turn intention into an executable next step with time.

### Required capabilities

- create outcome directly from anywhere;
- set target date/condition;
- add, rename, reorder, complete, and delete steps;
- designate next step;
- attach duration;
- schedule step into Today;
- reschedule when conflicts arise;
- pause/resume;
- complete outcome;
- link a commitment;
- show progress derived from completed steps;
- detect missing next step;
- detect next step without time;
- “find time” action.

### Initial deterministic outcome templates

Use templates only when confidence is high and keep them editable:

- passport renewal;
- simple trip preparation;
- job application;
- appointment preparation;
- purchase/return;
- house move;
- presentation/report;
- generic outcome.

Do not claim universal AI decomposition.

## Commitments

### Required value

Prevent promises and waiting states from disappearing.

### Required capabilities

- create “I owe” from natural speech;
- create “waiting on”;
- create “next conversation” note;
- parse person and date;
- link to outcome;
- reserve preparation time;
- mark complete;
- defer with reason;
- show overdue/due soon;
- group by one of three lenses;
- search by person;
- surface on Home;
- never display four empty sections.

## Cross-space commands

These must work from every route:

- “Home.”
- “Calendar.” / “Today.”
- “Inbox.” / “Capture.”
- “Plans.” / “Outcomes.”
- “People.” / “Commitments.”
- “Book dinner at Pizzeria Roma tomorrow at eight.”
- “Make it red and important.”
- “I need to renew my passport before Senegal.”
- “The first step is check the requirements.”
- “Schedule it Thursday after work.”
- “I promised Maya the proposal by Friday.”
- “I am waiting for Daniel's contract confirmation.”
- “What needs me now?”
- “Undo.”
- “Redo.”
