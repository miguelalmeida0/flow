# Flow Tide — Design System and UI Direction

## Chosen visual direction

Use `assets/breathing-day-reference.png` as the primary art-direction reference.

The reference succeeds because:

- the calendar is dark and quiet
- time is a thin structural spine, not a heavy grid
- events feel suspended in space
- empty time is visible
- the protected event is meaningful without dominating
- the breathing gap is an object, not a blank row
- teal light communicates life and flow
- the interface does not look like a productivity dashboard

Do not copy its generated-image inaccuracies. Rebuild the idea as a precise, accessible product UI.

## Layout

### Desktop

- App fills the viewport.
- Content width: fluid; cap at roughly 1180–1280px.
- No permanent left rail or right inspector.
- Top bar: 56px.
- Timeline content: full remaining height.
- Time spine: 56–72px from the left content edge.
- Event lane uses most horizontal space.
- Command surface floats at bottom center only while active.
- Undo/redo and “Today” remain quiet in the top bar.

### Mobile

- Preserve one vertical day.
- Time spine remains visible.
- Events occupy the width beside it.
- No horizontally scrolling desktop canvas.
- Command surface sits above the safe area.
- Density state collapses to one word.
- Drag handles meet 44px pointer targets without visually becoming large.

## Visual hierarchy

1. Current event / current time.
2. Fixed and protected commitments.
3. Active command or proposal.
4. Remaining events.
5. Decorative ambient motion.

Ambient decoration must never compete with calendar data.

## Semantic color tokens

Use these values as the source of truth. Minor adjustment is allowed only for verified contrast.

### Foundation

| Token | Value | Use |
|---|---:|---|
| `canvas` | `#061015` | Page background |
| `canvasRaised` | `#081820` | Elevated canvas region |
| `surface` | `#0D2028` | Neutral event |
| `surfaceRaised` | `#122A33` | Hover/focus event |
| `surfaceQuiet` | `#0A1A21` | Inactive/secondary |
| `line` | `#15313A` | Grid/time structure |
| `lineStrong` | `#24505A` | Active connection |
| `textPrimary` | `#F3F7F6` | Primary text |
| `textSecondary` | `#A9BBC0` | Time and metadata |
| `textMuted` | `#6E878E` | Quiet labels |

### Product signals

| Token | Value | Use |
|---|---:|---|
| `tide` | `#67DDCB` | Breathing room, current time, safe flow |
| `tideBright` | `#8CF1E1` | Small active highlight |
| `tideSurface` | `#0D302F` | Teal tinted event/gap |
| `protected` | `#F1C75B` | Protected marker |
| `protectedSurface` | `#2E2815` | Protected tint |
| `success` | `#67D99A` | Completion only |
| `danger` | `#FF6D75` | Destructive/error only |
| `dangerSurface` | `#34171B` | Destructive tint |
| `focus` | `#83B8FF` | Keyboard focus and fixed marker |

### User event colors

These are visual classifications and remain independent of importance/protection.

| Color | Surface | Border | Text/accent |
|---|---|---|---|
| neutral | `#0D2028` | `#21404A` | `#DDE8E9` |
| red | `#32171D` | `#A54858` | `#FFD6DC` |
| orange | `#322016` | `#A86135` | `#FFE0C9` |
| yellow | `#302815` | `#9A7B2F` | `#FBEAB4` |
| green | `#142A21` | `#3E8969` | `#CFF4DF` |
| cyan | `#0F2C2F` | `#338C94` | `#C8F5F1` |
| blue | `#142437` | `#3E6FA8` | `#D5E7FF` |
| indigo | `#1C2238` | `#596BAA` | `#DCE2FF` |

No default purple.

## Event surface

An event remains immediately recognizable as a calendar item.

Required anatomy:

```text
[small status/label marker] Event title
                            2:00–3:00
                     optional state label
```

Rules:

- 12–16px radius.
- 1px semantic border.
- No heavy shadow.
- Use a soft inner highlight or subtle ambient shadow only when moving/focused.
- Duration remains readable from vertical geometry.
- Title is never truncated before its time metadata on normal desktop widths.
- Important state adds an icon/label and movement weight; it does not automatically recolor.
- Protected state adds a small amber anchor/shield and a mooring to the time spine.
- Fixed state uses a blue/focus marker.
- User color tints the entire event surface while preserving text contrast.
- Selection/focus should look like depth and border clarity, not a giant glow.

## Time spine

- 1px vertical line.
- Hour labels use muted text.
- Current time uses a small teal point and a hairline across the lane.
- Fixed/protected events may have a restrained connector to the spine.
- Do not render a heavy spreadsheet grid.

## Breathing Room

Breathing Room is a semantic scheduled object.

Visual treatment:

- thin low-amplitude teal wave through the gap
- one bright point near the leading edge
- label aligned to the right:
  - `Breathing room`
  - `20m`
- subtle low-frequency motion while idle
- expanding/contracting wave during schedule changes
- never use a loud neon waveform

## Density chip

Top-right or top-center:

```text
Afternoon density: Calm
```

On mobile:

```text
Calm
```

The chip is informational, not a toggle.

States:

- Open: teal
- Calm: teal
- Tight: amber
- Overloaded: red

## Command surface

Hidden by default.

It appears when the user:

- begins typing
- presses the microphone
- presses `/` or `Command+K`
- invokes a visible quick recovery action

Anatomy:

```text
Tell Flow what changed…                          [mic]
```

During speech:

```text
Move the 2 PM meeting to four…
```

After success it remains for roughly 800–1200ms, then recedes.

Errors remain compact:

```text
Didn't catch that
“movement view”
Try again
```

Clarification:

```text
Which 2 PM event?
Design review     Interview
```

No right sidebar. No chatbot bubble.

## Typography

Prefer the system stack for performance and native quality:

- `ui-sans-serif`
- `-apple-system`
- `BlinkMacSystemFont`
- `"SF Pro Display"`
- `"SF Pro Text"`
- `"Segoe UI"`
- `sans-serif`

Suggested scale:

| Role | Size | Weight | Line |
|---|---:|---:|---:|
| Day heading | 24–28 | 600 | 1.15 |
| Current event | 16 | 650 | 1.25 |
| Event title | 14 | 600 | 1.25 |
| Event time | 12 | 500 | 1.3 |
| Meta/status | 11–12 | 500 | 1.3 |
| Hour label | 11 | 500 | 1 |

Use tabular numbers for times.

## Spacing and radii

- Base grid: 4px.
- Event internal padding: 12–14px.
- Event gap: determined by actual time; minimum visual separation 6px.
- Radius:
  - event: 14px
  - command: 999px
  - density chip: 999px
  - inline popover: 14px
- Avoid nesting many rounded containers.

## Shadows

Use sparingly.

- idle event: none or almost invisible
- hover/focus: shallow dark ambient shadow
- moving event: slightly deeper soft shadow
- no frosted glass
- no white glow
- no floating dashboard-card stack

## Tailwind and tokens

- Raw values may live only in `tokens.ts` or an equivalent central design-token module.
- Components consume semantic class bundles.
- No handwritten `.css`, CSS modules, styled-components, or CSS-in-JS.
- Existing Tailwind entry setup may remain.
- Inline `style` is limited to computed timeline geometry.

Use `reference/design-tokens.reference.ts` as a shape reference, then adapt to the current codebase.

## Accessibility

- Minimum AA contrast for all meaningful text.
- Color is never the only signal.
- Visible keyboard focus.
- 44px interactive hit target.
- Event time/title readable at 200% zoom.
- Reduced-motion mode replaces travel animation with immediate state change plus restrained highlight.
- Screen-reader labels include title, start, end, importance, protection, and mobility.
