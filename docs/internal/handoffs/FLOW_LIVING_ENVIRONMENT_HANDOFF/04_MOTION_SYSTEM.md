# 04 — Motion System

## Motion thesis

Flow motion should feel like calm guided breathing: soft acceleration, clear direction, no nervous bouncing, and a complete return to stillness.

It must answer four questions:

1. What changed?
2. Why did it change?
3. Where did it go?
4. What stayed fixed?

## Implementation stack

Use only:

- semantic HTML/React;
- SVG for paths, waves, outlines, and small transformation particles;
- the existing Motion React package;
- browser geometry (`getBoundingClientRect`) for measured transitions;
- `requestAnimationFrame` only during an active transition;
- Tailwind token classes for appearance.

Do not use:

- Three.js;
- WebGL or GLSL;
- a persistent canvas renderer;
- a physics engine;
- external animation timelines when Motion is sufficient;
- CSS keyframe files;
- animated background video;
- generated visual assets.

## Hierarchy of motion

### Level 1 — Micro response

Purpose: acknowledgement.

Examples:

- focus ring;
- pressed state;
- icon state;
- transcript appears.

Target duration: **100–180ms**.

### Level 2 — Object edit

Purpose: one entity changes property or position.

Examples:

- recolor;
- protect;
- resize;
- complete;
- move.

Target duration: **260–520ms**.

### Level 3 — Cross-space transformation

Purpose: the meaning or projection of an entity changes.

Examples:

- Capture → Plan;
- Plan step → Calendar;
- Promise → scheduled preparation.

Target duration: **780–1250ms**.

### Level 4 — Whole-surface reflow

Purpose: Tide repairs several relationships.

Target duration: **700–1400ms**, with independent objects settling as soon as their destinations are known.

The domain mutation commits immediately after validation. Motion must never block subsequent input.

## Motion presets

Use centralized presets from `reference/motion-presets.reference.ts`.

Recommended character:

- **quiet:** crisp focus and dock transitions;
- **float:** objects entering a new projection;
- **tide:** multi-object flow;
- **anchor:** protected/committed objects;
- **settle:** final small damping.

Avoid under-damped springs and visible overshoot on productivity data.

## Shared transition architecture

Use a single application-level `SharedFlightLayer`.

### Process

1. Measure source bounds.
2. Commit domain transaction.
3. Navigate or reveal destination.
4. Measure destination bounds.
5. Render an `aria-hidden` transition clone in a fixed portal layer.
6. Hide only the visual source/destination surfaces while preserving their semantic DOM.
7. Animate transform and size through FLIP.
8. Reveal destination and remove the clone.

### Fallback

If either measurement is unavailable:

- crossfade source/destination;
- still record the domain transaction;
- never block the operation.

## Tide paths

Draw paths as SVG cubic Bézier curves from measured source/destination anchor points.

Use two or three layers at most:

- primary 1–2px teal line;
- diffuse 6–10px low-opacity halo;
- optional moving nucleus.

Animate `pathLength` from 0 to 1. Do not morph arbitrary path shapes frame by frame.

If a moving nucleus is used:

- cache total path length once;
- sample `getPointAtLength` only while the transition is active;
- use one nucleus and at most 12–18 tiny dust points;
- stop the frame loop immediately on completion, cancellation, reduced motion, or hidden tab.

## Ambient motion policy

The app should feel alive without continuously moving.

Allowed:

- one short settling drift after a state change;
- a subtle voice-active opacity pulse;
- a Breathing Room wave that moves for several seconds after creation and then becomes still.

Forbidden:

- permanent particle fields;
- multiple infinite glows;
- events floating endlessly;
- parallax that moves under the pointer;
- constant background noise.

## Action choreography

### Focus

- translateY: -2px;
- border becomes teal;
- surrounding items reduce opacity by no more than 12%;
- 140ms.

### Recolor

Use an internal overlay that scales horizontally from the event's semantic origin edge. Do not instantly replace the background.

- preview opacity: 0.55;
- commit opacity: 1;
- 300–380ms.

### Protect

- anchor icon settles into the time spine;
- event translation stops;
- amber line draws once;
- 320–450ms.

### Move

- show origin ghost;
- live object follows a curved transform path;
- ghost fades after destination settles;
- 420–760ms depending on distance.

### Resize

- height/width transition follows actual time geometry;
- adjacent flexible items preview their displacement;
- labels reflow without crossfade when possible;
- 260–480ms.

### Create Breathing Room

- free interval opens first;
- nearby flexible events move second;
- wave line draws last;
- 600–1000ms.

### Split

- one surface creates a seam;
- halves separate 8–16px;
- second surface travels to destination;
- 500–800ms.

### Merge

- surfaces align;
- repeated metadata crossfades away;
- shared container forms;
- 500–800ms.

### Complete

- event contracts toward the time spine;
- completed mark remains briefly;
- released time becomes visible;
- Tide may reflow afterward as a separate causally connected beat.

### Undo

Reverse the stored motion plan when possible. If exact geometry no longer exists, animate the current entity to restored geometry and reveal origin ghosts.

## Interruption

Every animation controller must support:

- immediate cancellation;
- resolving to current committed state;
- starting a new transition from the current visual position;
- no orphaned portal clone;
- no stale hidden source/destination.

## Reduced motion

When `prefers-reduced-motion` is enabled:

- no long travel;
- no moving particles;
- no wave oscillation;
- use 100–160ms opacity and outline changes;
- retain source/destination labels so causality remains understandable.

## Performance gates

- no forced layout read/write/read cycles inside one frame;
- geometry reads batched before writes;
- transform and opacity preferred;
- no more than one active full-surface transition;
- no animation work while `document.hidden`;
- stable 60 FPS target on a normal laptop;
- no sustained main-thread task above 50ms during the signature morph;
- no memory growth across 20 repeated morph/undo cycles.
