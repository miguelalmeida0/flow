# Flow Final Design System

## Design character

Keywords:

**marfim, quiet, editorial, breathable, kind, precise, soft, modern, trustworthy**

Avoid:

**neon, black selected pills, purple AI default, glassmorphism, scenic stock photography, large gradients, generic “AI” glows, dense dashboard chrome, heavy shadows**

## Typography

Recommended implementation pair:

- Display / editorial: `Playfair Display`, 400–500
- UI/body: `Inter`, 400–600

Fallbacks:

```css
--font-display: "Playfair Display", "Times New Roman", Georgia, serif;
--font-ui: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Do not use decorative handwritten fonts.

### Type scale

- page greeting: 56px / 1.02, weight 400
- card title: 24px / 1.2 display serif
- large metric: 42–48px / 1.0 display serif
- primary body: 16px / 1.45
- secondary body: 14px / 1.4
- eyebrow/date: 13px, uppercase, 0.08em tracking
- tiny metadata: 12px / 1.35

Desktop scaling can use `clamp()` but preserve ratios.

## Layout

Reference canvas: **1672 × 941**.

Approximate desktop structure:

- outer horizontal margin: 48–56px
- top brand area: 34–50px from top
- greeting begins around 118px from top
- main lens row begins around 244px
- main lens row height: ~460px
- inter-card gap: 12–16px
- bottom command bar y: ~798px
- bottom time switch y: ~800px

Recommended grid at reference width:

```text
Today        356px
Focus        288px
Weather      298px
People       286px
Good to know 274px
Gaps          14px x 4
```

Treat these as fidelity targets, not rigid responsive constants.

## Card anatomy

- background: warm white, slightly brighter than page
- border: 1px low-contrast warm neutral
- radius: 24px
- padding: 22–26px
- shadow: extremely restrained
- no nested card explosion
- use separators only when they improve scanning

Cards must differ internally:

- Today = timeline rail
- Focus = ring / current-time opportunity
- Weather & Outfit = decision + visual row
- People = avatars + time relevance
- Good to know = concise instinct list

This asymmetry is deliberate; it prevents the “all cards are the same calendar” failure.

## Iconography

Use simple line icons with consistent optical weight.

- 1.75–2px stroke
- rounded caps
- no filled emoji-style UI icons
- accent colors may identify semantic categories

## Shadows

Very subtle only:

```css
box-shadow:
  0 1px 2px rgba(35, 43, 55, .025),
  0 12px 32px rgba(35, 43, 55, .045);
```

Avoid floating, glowing, “hologram” treatment.

## Motion

Motion communicates state changes.

- micro feedback: 120–180ms
- card/content transition: 220–320ms
- time-travel scene transition: 420–650ms
- ease: soft cubic-bezier, no springy overshoot by default

No animation solely for decoration.
