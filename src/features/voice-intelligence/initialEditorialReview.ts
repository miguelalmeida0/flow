/** Independent root editorial metadata review; not corpus admission. */
export const initialEditorialReview = [
  {
    "ids": [
      1,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      24,
      25,
      26,
      27,
      28,
      29,
      30,
      33,
      37,
      38,
      39
    ],
    "family": "calendar-update",
    "languageFeature": "literal-title-preservation",
    "reviewNote": "Original title payload preserves conjunctions, punctuation, accents and command-like words. One specified stable event changes; no incidental actions."
  },
  {
    "ids": [
      15,
      16
    ],
    "family": "calendar-update",
    "languageFeature": "spoken-title-correction",
    "reviewNote": "Explicit correction outside a quoted value replaces the prior proposed title atomically."
  },
  {
    "ids": [
      17
    ],
    "family": "calendar-update",
    "languageFeature": "property-self-correction",
    "reviewNote": "Only final blue applies; no intermediate green transaction."
  },
  {
    "ids": [
      18,
      34
    ],
    "family": "calendar-move",
    "languageFeature": "destination-self-correction",
    "reviewNote": "Final four resolves to specified16:00 destination with unchanged duration and one history entry."
  },
  {
    "ids": [
      21,
      22,
      23,
      36,
      40
    ],
    "family": "calendar-compound",
    "languageFeature": "atomic-multi-edit-reference",
    "reviewNote": "Explicit ordered edits use independently declared E1/E2 targets and final properties; whole compound is one commit."
  },
  {
    "ids": [
      35
    ],
    "family": "calendar-resize",
    "languageFeature": "duration-self-correction",
    "reviewNote": "Final one hour replaces thirty minutes, exact E1 end750 and one history entry."
  },
  {
    "ids": [
      19
    ],
    "family": "navigation-motion",
    "languageFeature": "destination-self-correction",
    "reviewNote": "Journal replaces Calendar navigation; no document or history changes."
  },
  {
    "ids": [
      20
    ],
    "family": "temporal-relative",
    "languageFeature": "date-self-correction",
    "reviewNote": "Friday September11 replaces Tomorrow from independently fixed September8 clock; no document/history mutation."
  },
  {
    "ids": [
      31,
      32
    ],
    "family": "calendar-clarification",
    "languageFeature": "missing-value-or-reference",
    "reviewNote": "Missing title or absent event reference produces focused clarification with no mutation/history."
  },
  {
    "ids": [
      81,
      82,
      83,
      84,
      86,
      87,
      88
    ],
    "family": "unsupported-safety",
    "languageFeature": "narrative-no-creation-authority",
    "reviewNote": "Goal-like, hypothetical, quoted or negative intent in command mode never implicitly creates Outcomes, Journal entries, captures or destructive actions."
  }
];
