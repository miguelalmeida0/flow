# 05 — Inbox to Plan Choreography

References:

- `assets/reference/inbox-plan-animation-reference.png`
- `assets/boards/motion-reference-annotated.png`
- `assets/boards/inbox-to-plan-storyboard.png`

## User intention

The user focuses a capture and says or types:

> “Turn that into a plan.”

The operation must create a real plan linked to the original capture and remain one undoable transaction.

## Six beats

### Beat 1 — Focus source

**0–160ms**

- target row rises 2px;
- teal outline reaches full opacity;
- other Inbox rows reduce prominence slightly;
- no destination yet.

Interim recognition may preview this focus, but must not mutate data.

### Beat 2 — Release Tide

**120–360ms**

- a restrained horizontal current grows from the source row;
- the row remains fully readable;
- a short status line appears: “Turning this into a plan…”;
- the current bends toward the destination region.

### Beat 3 — Establish transfer path

**280–620ms**

- a vertical/curved SVG rail connects source to destination anchor;
- one light nucleus travels along the path;
- source row begins to de-emphasize only after the destination shell is guaranteed.

### Beat 4 — Materialize destination shell

**460–780ms**

- the plan container outline and surface appear;
- title and origin metadata resolve first;
- no full-card scale bounce;
- the destination is interactive only after semantic content exists.

### Beat 5 — Resolve plan content

**650–1050ms**

- steps appear in ordered 60–90ms intervals;
- use a deterministic template only when one exists;
- otherwise create a valid plan shell with one explicit first step such as “Define the next action.”
- never invent authoritative life instructions while presenting them as facts.

A progress nucleus may reflect known stages:

```text
capture resolved
plan created
steps attached
relationships committed
```

Do not display arbitrary percentages.

### Beat 6 — Settle

**950–1250ms**

- path halo fades;
- source row shows a subtle resolved/origin state or leaves the unresolved Inbox projection;
- destination reaches final contrast;
- surrounding content returns to full prominence;
- one transaction is written to history;
- focus moves to the plan title or first actionable step.

## Domain transaction

The visual sequence follows a single transaction similar to:

```text
CreatePlan
LinkCaptureToPlan
ResolveCapture
CreateInitialPlanSteps
```

It must commit atomically. If any invariant fails, nothing persists.

## Failure behavior

If validation fails before commit:

- stop the Tide at the source;
- reverse focus cleanly;
- show one concise reason beside the row;
- do not leave a partial plan shell.

If the UI transition fails after a valid commit:

- keep the valid domain state;
- fall back to destination reveal;
- log the visual failure in development;
- never roll back valid user data solely because animation failed.

## Undo

Undo should visually bring the plan identity back toward the Inbox origin when both projections are available. Domain correctness takes priority over reproducing every decorative frame.

## Accessibility

- announce: “Created plan [title] from Inbox capture.”
- move keyboard focus to the destination after settlement;
- transition clone is `aria-hidden`;
- source and destination DOM remain semantically valid;
- reduced motion uses focus → crossfade → destination.
