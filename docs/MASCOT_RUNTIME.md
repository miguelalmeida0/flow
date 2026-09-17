# Mascot runtime

Flow exposes one semantic adapter:

`resting | attentive | listening | understood | thinking | resolved | focused | small-win | big-win | uncertain`

`MascotRenderer` is the only application-facing rendering boundary. The repository has no valid `.riv` asset, so this release honestly uses `StaticMotionMascotRenderer`, a local DOM/SVG-compatible soft form animated with Motion. No Rive package is installed or claimed.

Visible presence is sparse, not an automatic consequence of having a semantic state. An explicitly activated Live Session may show listening/understanding; a real active Level-3 milestone may show a bounded win. Initial hydration, resting, live-idle, focused work, normal navigation, ordinary Level-1/2 edits, unsupported input, and stale post-ceremony dwell do not summon the character. The renderer is allowed only in Home's measured lower-left safe zone: width of at least 1280 px is necessary, but not sufficient. Its actual footprint plus a 16 px motion margin must clear every Home lens and persistent control. Wrapped/short layouts suppress it; an approved moment can use the clear 1672×941 locked-reference slot. It is omitted from Today and every utility world and hidden in all smaller viewports, where domain objects and the command surface carry the meaning. Cross-space flight also suppresses it. No semantic state overrides the safe-zone rule. Minimal mode suppresses non-Level-3 reactions.

`useMascotSafeZone` remeasures on actual resize, scroll, Home animation completion, and presentation/scope changes. It uses no frame loop, never transforms a domain element, and reconnects to replacement Home content when the temporal scope changes. Its initial state is hidden so an unsafe character cannot flash before layout is measured. Hidden feature-world mascots do not compute unused Home projections.

Movement is bounded: there is no infinite bounce, breathing timer, blinking timer, random reaction, repeated entrance, or hydration celebration. The active pose finishes with the recipe; the director's longer semantic dwell does not keep the character on screen. New commands, history, visibility loss, settings changes, and unmount cancel stale presentation. Reduced motion changes expression/color/opacity locally and removes body translation and strong scaling.

The renderer is aria-hidden and never conveys the only copy, blocks input, covers the global command surface, or leaves the viewport at the four release widths. A future Rive renderer may be added behind the same props only after a production asset and state machine can be validated.
