# FLOW — Elite Handoff / Final Design Lock

**Snapshot:** 2026-09-04
**Status:** product direction + home UI are locked for implementation
**Source of visual truth:** `design/FLOW_FINAL_LOCKED_REFERENCE.png`

This package consolidates the prior Flow product-strategy handoff and the final UX/UI direction approved after the design exploration. It is meant to be attached to a fresh ChatGPT/Codex/agent session so the next agent can continue without re-litigating the product thesis or redesigning the home screen.

## Read in this order

1. `01_PRODUCT_MANDATE.md`
2. `02_FINAL_DESIGN_LOCK.md`
3. `03_UX_BEHAVIOR_SPEC.md`
4. `design/DESIGN_SYSTEM.md`
5. `design/tokens.css`
6. `engineering/ARCHITECTURE.md`
7. `product/SENSES_AND_INSTINCTS.md`
8. `product/TIME_TRAVEL_WEATHER_OUTFIT.md`
9. `product/MASCOT_BEHAVIOR.md`
10. `engineering/IMPLEMENTATION_SEQUENCE.md`
11. `qa/ACCEPTANCE_AND_QA.md`
12. `agents/AGENT_PROMPTS.md`
13. `13_RUNBOOK.md`

## Hard lock

Do **not** generate a new visual direction. Do **not** replace the palette. Do **not** add a sidebar. Do **not** reintroduce a scenic/photo background. Do **not** duplicate weather in the header. Do **not** add generic motivational handwriting, “AI” slogans, mode tiles, or persistent live/status chrome.

The reference image is the visual source of truth. If prose and pixels ever conflict, the reference image wins unless this handoff explicitly calls out a behavior that is not visually representable in a static mock.

## Final home composition

The home is one calm voice-first scene with five context lenses:

**Today → Focus → Weather & Outfit → People → Good to know**

Under them:

**Mascot → single proactive prompt → persistent command bar → Today / Tomorrow / This Week time control**

This is not a five-card dashboard in the product sense. These are five stable semantic zones inside one Flow world. Their content may adapt, but their spatial positions remain stable enough to build user memory.

## North-star reaction

> “It noticed the small thing I was about to think about myself.”

The product should feel futuristic because it is context-aware, immediate, voice-native, reversible, calm and coherent—not because it contains sci-fi decoration or constant generative AI.
