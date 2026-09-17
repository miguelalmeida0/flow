# 01 — Current State Audit

## Stop-ship failures visible in the current build

### Voice is visually global but logically local

The microphone stays visible across routes, but requests are interpreted by the current screen's narrow parser. Examples observed:

- “open the inbox area” is rejected as an unknown calendar action;
- “book dinner at a pizzeria tomorrow at 8pm” fails from Plans, Now, and People;
- valid navigation language can be stored as an Inbox capture;
- follow-up language loses context after route changes;
- “Live listening” can remain visible while the product is not usefully acting on speech.

### The current routes are not complete products

- **Calendar** has some working operations but still exposes parser errors and broken motion.
- **Inbox** is a list of strings with “turn into plan / archive / delete,” which forces manual classification.
- **Plans** is an empty destination waiting for Inbox content; it cannot create or advance outcomes directly.
- **People** exposes multiple empty taxonomic sections before demonstrating value.
- **Now** can spend an entire route saying that four minutes are free and nothing fits.
- **Home** uses equal cards even when the user's actual priorities are not equal.

### Motion is below release quality

The reclaimed-time path currently looks like debug telemetry:

- multiple thin intersecting segments;
- no clear source, travel, or destination;
- labels collide with the path;
- the line persists after the action;
- geometry breaks at different widths;
- the effect feels like an observability graph, not calm life software.

### Trust is at risk

A voice-first product cannot claim intelligence while:

- interpreting commands differently by route;
- storing failed navigation commands as data;
- presenting false “listening” confidence;
- requiring the user to understand the app's internal taxonomy;
- creating empty objects or duplicated representations;
- reporting synthetic transcript tests as physical microphone success.

## Root product diagnosis

The implementation is page-first. The product must become intent-first and entity-first.

The current implied flow is:

```text
route → local parser → local state → local UI
```

The required flow is:

```text
voice / typing / pointer / automation
                ↓
          global intent router
                ↓
       typed LifeAction transaction
                ↓
       unified state + invariants
                ↓
   affected projections update together
```
