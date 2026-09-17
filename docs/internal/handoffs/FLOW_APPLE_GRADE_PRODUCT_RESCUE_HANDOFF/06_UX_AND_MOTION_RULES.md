# 06 — UX and Motion Rules

## Interaction principles

- Do not ask users to select an object when title, time, current position, recent context, or a unique match already resolves it.
- Speak for multi-step intent; drag for direct spatial changes; click for precise inspection.
- The same action must behave identically regardless of input method.
- One concise clarification maximum.
- Never blame the user with “try a simpler command.”
- Never make a user navigate before issuing a valid command.
- The changed object is the success message.

## Command surface

The command bar must:

- remain globally mounted;
- show listening state honestly;
- show interim transcript;
- show brief action preview;
- show final transcript briefly;
- collapse when idle if Live Session is disabled;
- avoid giant red outlines;
- avoid permanent assistant transcripts;
- expose pause/resume and keyboard fallback;
- stay clear of the browser/dock-safe area.

## Error behavior

Use local, concise feedback:

- recognition problem: “I didn't catch that clearly.”
- unsupported capability: “I heard you, but I cannot do that yet.”
- ambiguous target: “Which meeting — Roadmap or Interview?”
- protected conflict: “Dinner is protected. Move it anyway?”
- impossible schedule: show closest viable option.

No route-wide error card.

## Visual system

Preserve the dark Breathing Day atmosphere:

- canvas `#061015`;
- deep canvas `#030B0F`;
- surface `#0A171D`;
- raised surface `#0E2027`;
- border `#17343A`;
- primary text `#F4F7F5`;
- secondary text `#A6B3B1`;
- tertiary text `#70817F`;
- Flow teal `#5DE6D4`;
- teal bright `#8AF5E7`;
- protected amber `#F6C453`;
- danger red `#FF6675`;
- information blue `#71A8FF`;
- success green `#67D49B`.

Glow is forbidden at rest. It appears only during a meaningful transition and fades completely.

## Motion language

Use only three signature behaviors:

### Tide

Reallocation and movement.

- one smooth cubic Bézier path;
- no intersecting polylines;
- clear source and destination;
- one traveling point;
- sparse trail;
- path disappears after settling.

### Anchor

Protection and stability.

- protected/fixed objects settle visibly;
- surrounding flexible objects move around them;
- no bouncing or exaggerated lock animation.

### Bloom

Creation and resolution.

- small controlled expansion;
- content resolves in a clear order;
- no particle explosion;
- settles into stillness quickly.

## Broken motion explicitly forbidden

- jagged segmented telemetry lines;
- path crossings;
- persistent decorative curves;
- labels drawn on top of moving paths;
- five independent SVG segments pretending to be one flow;
- geometry calculated from hardcoded desktop pixels;
- infinite ambient loops;
- Three.js/WebGL/shaders;
- canvas-only UI;
- bouncy spring defaults;
- motion that blocks interaction.

## Motion implementation

Use DOM + SVG + Motion.

- transforms and opacity for most movement;
- shared-layout/FLIP for object continuity;
- responsive SVG `viewBox`;
- `vector-effect="non-scaling-stroke"`;
- round caps and joins;
- geometry reads batched before writes;
- animations interruptible and cancellable;
- reduced-motion fallback uses short crossfades and direct state emphasis.
