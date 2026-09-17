# Time Travel, Weather & Outfit

## Time travel

Time is part of the environment, not a separate calendar page.

Voice examples:

- “Today.”
- “Tomorrow.”
- “Friday.”
- “Tonight.”
- “Next weekend.”
- “This week.”
- “Go back.”

On temporal navigation, update together:

- greeting/date
- Today lens
- Focus availability
- weather/outfit
- relevant people
- instincts
- mascot context

Never update only the date label.

## Visual time scope

Keep the bottom-right state indicator:

`Today | Tomorrow | This Week`

This remains visually present even if changed by voice so the user never loses orientation.

## Forecast

Target approximately **14 days** when the provider supports it.

At minimum ingest:

- min/max/current temperature
- feels-like if available
- precipitation probability
- weather condition
- wind
- UV if available
- sunrise/sunset

The provider may expose lower-confidence data farther into the future; the UI should not imply false precision.

## Outfit engine

The output is a short recommendation, not a weather report.

Inputs:

- temperature
- feels-like
- precipitation
- wind
- UV
- time of day

Example rule families:

```text
<= 5°C                → warm coat
6–10°C + wind         → proper jacket / layer up
8–14°C + rain         → jacket + umbrella
15–19°C               → light layers
20–25°C               → light clothing
>= 26°C               → very light clothing; surface UV guidance if relevant
rainProbability high  → umbrella if user is likely outside
high UV               → sunscreen/sunglasses suggestion
```

These thresholds are configurable policy, not medical advice.

## Copy standard

Good:

- “Light layers should be enough.”
- “Cold and wet. Jacket + umbrella.”
- “It’ll be cooler when you come home.”
- “UV is moderate. Sunglasses optional.”

Bad:

- “Based on the current meteorological conditions, I recommend…”
- “Temperature: 14°C. Humidity: 62%. Wind…”

The user should get the decision first.
