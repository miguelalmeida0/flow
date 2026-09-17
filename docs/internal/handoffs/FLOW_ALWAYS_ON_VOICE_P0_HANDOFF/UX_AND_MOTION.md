# UX and motion — immediate, calm, alive

## Home

Home remains a simple four-space surface:

- Calendar
- Inbox
- Plans
- People

`Now` is available globally and may surface as a top-level action rather than a fifth equal card.

The user can click a card or simply say its name.

Fix the header/content overlap shown in the supplied screenshot. One component owns top chrome; page content begins below it with an explicit layout contract.

## Live Session UI

The microphone icon is not the main interaction after activation.

### Off

A quiet action: `Start Live Session`.

### Listening

A small persistent pill in the shell:

```text
● Listening
```

No pulsing orb, no constant large waveform, no visual anxiety.

### Interim speech

Show a restrained one-line transcript near the bottom edge:

```text
Calendar…
```

### Understood

The target card/space begins responding before the final transition.

### Applied

The changed object itself is the confirmation. The transcript fades.

### Failed recognition

```text
Didn't catch that
“open the calender”
Try again
```

### Unsupported request

```text
I heard you, but Flow can't do that yet.
```

Do not store it. Do not show a large sidebar.

## Navigation motion

The Home card becomes the opened space through shared-element layout animation:

1. spoken space subtly gains a 1px teal edge;
2. card lifts 2px;
3. surrounding cards dim, not blur;
4. card expands into the active space in 420–560ms;
5. title and summary preserve spatial continuity;
6. navigation chrome settles after the content, not before it.

Returning Home reverses the same geometry.

Use DOM + SVG + Motion. No Three.js, canvas scene, shader, or decorative particle system.

## Domain motion

- Move: event follows a visible, short curved path.
- Recolor: pigment fills from leading edge.
- Protect: anchor/lock state settles into the time spine.
- Capture: one fragment materializes once.
- Capture → Plan: source releases a Tide thread, destination forms, then source resolves.
- Undo: exact reverse transition where feasible.

All motion is interruptible. Reduced motion uses short crossfades and immediate focus changes.

## No accidental data UI

Navigation phrases must never appear as Inbox rows. The existing rows containing `Open the calendar` and `Open the inbox` are evidence of a routing defect and must be removed from seed/demo state if they were persisted by the broken implementation.
