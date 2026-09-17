# Flow Senses & Instinct Engine

## Mental model

**Senses answer: “What is true?”**
**Instincts answer: “What useful conclusion follows?”**

This is deterministic infrastructure, not an AI-agent framework.

## Initial senses

### TimeSense

- local date/time
- daypart
- timezone
- current time scope

### CalendarSense

- current event
- next event
- next anchor
- free windows
- overloaded periods
- requested focus duration compatibility

### WeatherSense

- temperature
- feels-like
- precipitation probability
- precipitation window
- condition
- wind
- UV
- sunrise/sunset

### DaylightSense

- sunrise
- sunset
- daylight remaining
- outdoor-plan overlap

### FocusSense

- available focus minutes
- active focus state
- interruption boundary

## Future senses

- LocationSense
- BatterySense
- RoutineSense
- PeopleSense
- TravelSense

## Instinct schema

Each instinct should expose:

```ts
type FlowInstinct = {
  id: string;
  kind: string;
  title: string;
  detail?: string;
  priority: number;
  confidence: number;
  relevanceStart?: string;
  relevanceEnd?: string;
  cooldownKey?: string;
  sourceFacts: string[];
  suggestedCommand?: string;
};
```

## Initial rules

1. **Outfit** — weather → short clothing recommendation
2. **Umbrella** — rain probability/window + likely outside period
3. **Temperature later** — meaningful temperature drop before user returns
4. **Focus fit** — requested duration > available free window
5. **Daylight** — outdoor plan overlaps sunset
6. **Good-weather free window** — free time + favorable conditions
7. **Early next event** — useful evening/morning context
8. **UV** — daytime outdoor relevance + elevated UV
9. **Laundry window** — future dry/warm period after wetter days
10. **Packing primitive** — trip duration + forecast → small checklist

## Ranking policy

Score roughly by:

`usefulness × temporal relevance × confidence × novelty`

Apply penalties for:

- duplicate information
- recently dismissed items
- repeated exposure
- low actionability

The Good to know lens should never become a feed.
