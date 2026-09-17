# Motion ownership

Flow uses one animation owner per element.

| Surface | Owner | Contract |
| --- | --- | --- |
| live DOM layout, event cards, route shells, reward wash/outline | Motion for React | transform/opacity-first, semantic tokens, interruptible |
| Home lens ↔ world header continuity | `WorldContinuitySurface` with Motion shared layout | aria-hidden paper only; text/content is outside anisotropic scaling and remains readable |
| measured cross-world flight clone | existing `SharedFlightLayer` | one aria-hidden fixed clone, geometry captured once, removed at settle/cancel |
| mascot | `MascotRenderer` adapter | static Motion fallback because no valid `.riv` asset exists |
| sound | native Web Audio | synthesized local envelopes after explicit consent |
| state | `applyLifeTransaction` + scheduler | never owned or delayed by animation |
| reward selection | `RewardDirector` | presentation only; no document/history capability |

GSAP/Flip was not added. The existing Motion layout engine plus the measured transform flight produced understandable source/destination continuity without another runtime or double-transform risk. Rive was not added because the repository contains no production `.riv` file. There is no canvas, Three.js, WebGL, shader, image-generation, or particle runtime.

Semantic timing comes from `src/shared/motion/motion-presets.ts`: reduced confirmation, micro acknowledgment, meaningful Bloom, and ceremony settle recipes. Random component-local springs are avoided. Calendar event geometry remains owned by the timeline; reward presentation draws a noninteractive fixed outline over the resolved target and never transforms the live event.

Cancellation order is domain-safe: a new intention cancels the prior shared flight and RewardDirector presentation synchronously, then the normal serialized transaction path proceeds. Undo cancels first, persists the exact restored document, and emits a short neutral inverse. Redo is capped at Level 2. The result is correct if the browser skips, reduces, interrupts, or never paints an animation.

At rest there are zero reward targets/washes, zero transition clones, zero active frame loops, and no stale reward transform. Hidden tabs cancel presentation immediately.
