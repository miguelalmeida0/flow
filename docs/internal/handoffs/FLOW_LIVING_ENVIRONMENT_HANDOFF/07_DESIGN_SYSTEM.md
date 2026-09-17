# 07 — Design System

## Character

Flow should feel like a calm nighttime instrument: deep, legible, spacious, and alive only when something meaningful changes.

The reference images use luminance and teal motion. Production must keep this restrained. Do not turn the app into neon glassmorphism.

## Color system

Centralize all values in TypeScript token bundles. Raw values must not be scattered through feature components.

### Foundations

| Token | Value | Use |
|---|---:|---|
| canvas | `#061015` | application background |
| canvas-deep | `#030B0F` | edge depth |
| surface | `#0A171D` | main panels |
| surface-raised | `#0E2027` | active/focused objects |
| surface-hover | `#12272E` | hover/pressed surfaces |
| border | `#17343A` | default outlines |
| border-strong | `#28535A` | focused structural edge |

### Typography

| Token | Value |
|---|---:|
| text-primary | `#F4F7F5` |
| text-secondary | `#A6B3B1` |
| text-tertiary | `#70817F` |
| text-inverse | `#061015` |

### Semantic accents

| Token | Value | Use |
|---|---:|---|
| flow | `#5DE6D4` | active Tide, focus, transfer |
| flow-bright | `#8AF5E7` | small nucleus/highlight only |
| flow-deep | `#2A9E93` | borders and low emphasis |
| protected | `#F6C453` | protected/anchored commitments |
| danger | `#FF6675` | destructive state and explicit red label |
| info | `#71A8FF` | neutral information label |
| success | `#67D49B` | completed state |

Primary and secondary text meet strong contrast against the canvas. Tertiary text is for nonessential metadata only.

## Event/user label colors

Color is user-owned and independent from importance/protection.

Provide a limited accessible palette:

- neutral graphite;
- teal;
- blue;
- amber;
- red;
- green.

Do not use purple as the default Flow identity.

## Typography

Use zero-network system stacks.

- UI/body: `font-sans` with the system UI stack.
- View titles/outcome titles: restrained `font-serif` only where the references use editorial hierarchy.
- Calendar event titles remain sans-serif for scanning.

Recommended scale:

- display: 40–48px desktop / 30–36px mobile;
- section title: 24–30px;
- event title: 15–17px;
- body: 15–16px;
- metadata: 12–14px;

Use generous line height. Do not use tiny low-contrast type to simulate sophistication.

## Spacing

Base unit: 4px.

Primary rhythm:

- 8px micro;
- 12px compact;
- 16px internal surface;
- 24px component gap;
- 32px section gap;
- 48–64px major breathing space.

## Radii

- small control: 10px;
- event/capture row: 12–14px;
- primary panel: 16–18px;
- command dock: fully rounded only because it is a transient command surface.

Avoid giant 28–40px card radii across the product.

## Borders and depth

Depth comes from:

- contrast between canvas and surface;
- 1px borders;
- subtle inner luminance;
- spatial separation.

Avoid large drop shadows. Use a low-opacity teal halo only during active Flow transformations.

## Luminance policy

At rest:

- no visible glow around ordinary cards;
- no animated gradient backgrounds;
- no particles.

During a transformation:

- one active path may glow;
- source and destination may receive a restrained halo;
- the glow fades fully on settlement.

## Iconography

Use the existing icon system or one consistent line icon set already installed.

- 1.5–1.75px stroke;
- 16–20px typical size;
- icons never replace essential labels without accessible names.

## Home layout

- desktop max width should use the viewport rather than a narrow centered column;
- two-column grid with balanced asymmetry;
- no hero panel;
- containers are fully clickable;
- avoid dense card-within-card nesting.

## Command dock

Resting state:

- low-contrast border;
- placeholder: “Tell Flow what changed…”;
- mic/session state;
- keyboard shortcut.

Active state:

- accent follows current intent when useful;
- transcript remains large enough to read;
- no chat bubble tail or message history.

## Accessibility

- visible focus state independent of color;
- semantic states use text/icon plus color;
- minimum 44px pointer targets;
- no required hover interaction;
- motion never carries the only explanation;
- all reference visuals must be reinterpreted for actual contrast and responsive behavior.
