# Responsive Specification

The locked reference is desktop-first, but responsiveness must preserve hierarchy rather than shrink five columns until unreadable.

## Large desktop ≥ 1440px

Use the full five-lens row.

Order:

Today | Focus | Weather & Outfit | People | Good to know

Command bar remains bottom-center. Time scope remains bottom-right. Mascot remains bottom-left.

## Standard desktop / laptop 1100–1439px

Keep five semantic zones but allow two-row composition if necessary:

Top row priority:

Today | Focus | Weather & Outfit

Second row:

People | Good to know

Do not horizontally scroll the entire home just to preserve five columns.

## Tablet 768–1099px

Use situation-first vertical flow:

1. greeting/context
2. Today
3. Focus
4. Weather & Outfit
5. Good to know
6. People if relevant

Command bar becomes sticky bottom control. Time scope stays visible near it.

## Mobile < 768px

The mobile experience is not a miniature desktop dashboard.

Prioritize:

1. current free window / next anchor
2. Today timeline
3. weather + outfit recommendation
4. single top instinct
5. relevant person

Keep cards full-width and readable without zooming.

The mascot may reduce to a smaller presence and should not consume prime vertical real estate.

## Responsive non-negotiables

- no 10–12px body text
- no horizontal overflow for core content
- no collapsing the calendar into unreadable mini rows
- command bar remains easy to reach
- voice status remains inside the command bar
- preserve marfim background and token system
