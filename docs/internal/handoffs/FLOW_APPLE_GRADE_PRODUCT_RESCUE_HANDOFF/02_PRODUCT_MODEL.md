# 02 — Product Model

## Home

Home is not a menu. It is the user's current situation.

It must answer, in this order:

1. What is happening now?
2. What is next?
3. Is the day still viable?
4. What one unresolved thing needs a decision?
5. What outcome lacks time?
6. What commitment is becoming risky?

Only meaningful state is shown. Empty categories do not occupy equal space.

## Today

Today combines Calendar and Now.

It answers:

> Can the remaining day still work?

It includes:

- current event;
- next event;
- day boundary;
- fixed/protected/flexible events;
- breathing room;
- creation and direct editing;
- automatic Tide recovery;
- finish-early handling;
- what-if preview;
- conflict explanations;
- global voice and pointer parity.

## Capture

Capture answers:

> What did I just remember, and where should it go?

It accepts:

- event requests;
- tasks;
- ideas;
- outcomes;
- commitments;
- shopping/reference notes.

It must route high-confidence requests immediately instead of storing duplicates.

Examples:

- “Book dinner tomorrow at eight” → CalendarEvent
- “I need to renew my passport before Senegal” → Outcome
- “I promised Maya the proposal by Friday” → Commitment
- “Idea: use Tide in my portfolio intro” → unresolved Capture

## Outcomes

Outcomes answers:

> What am I trying to make happen, and what is the next executable step?

Every active outcome must expose:

- result;
- target date/condition;
- progress;
- next step;
- whether that next step has reserved time;
- blockers/dependencies where present.

An outcome without a next step is incomplete. A next step without time should be surfaced as a gap.

## Commitments

Commitments answers:

> Who is waiting on whom, and what should happen next?

Use three simple lenses:

- **I owe**
- **Waiting on**
- **Next conversation**

Do not build a CRM. Do not show empty sections as content.

## Now behavior

Now is not a route. It is a state shown on Home and Today.

When useful time exists, show at most three realistic actions. When only a few minutes exist, say “Keep it free” rather than navigating to a dead-end page.

## One-world behavior

A user may issue any valid global command from any route.

The current route changes presentation, not capability.
