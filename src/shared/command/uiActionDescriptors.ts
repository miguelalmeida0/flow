export interface UiActionDescriptor {
  id: string;
  label: string;
  phrase: string;
}

function descriptor(id: string, label: string, phrase: string): UiActionDescriptor {
  return { id, label, phrase };
}

/** Visible product copy and canonical command language stay together here.
 * Components never invent a hidden substitute command string. The same
 * descriptor is consumed by click handlers, the speakable manifest, and the
 * parity audit. */
export const captureUiActions = {
  turnIntoOutcome: descriptor("capture.turn-into-outcome", "Turn into outcome", "Turn that into a plan"),
  scheduleTomorrow: descriptor("capture.schedule-tomorrow", "Schedule tomorrow", "Turn this capture into a 30 minute event tomorrow at nine"),
  keepAsNote: descriptor("capture.keep-as-note", "Keep as note", "Archive this capture"),
  keepAllAsNotes: descriptor("capture.keep-all-as-notes", "Keep all as notes", "Archive all captures"),
} as const;

/** One product-owned descriptor per primary world. Dynamic builders keep the
 * visible target and the canonical command inseparable without adding a
 * second click mutation path. */
export const primaryWorldUiActions = {
  home: {
    whatNeedsMe: descriptor("home.what-needs-me", "What needs me now?", "What needs me now?"),
    seeFullDay: descriptor("home.see-full-day", "See full day", "See full day"),
    seeWeekInToday: descriptor("home.see-week-in-today", "See the week in Today", "See the week in Today"),
  },
  today: {
    openDate: descriptor("today.open-date", "Open Calendar date", "Open tomorrow"),
    protectEvent: (title: string, protectedEvent = false) => descriptor(
      "today.protect-event",
      "Protect or unprotect event",
      `${protectedEvent ? "Unprotect" : "Protect"} ${title}`,
    ),
  },
  capture: captureUiActions,
  outcomes: {
    create: (title: string) => descriptor("outcome.create", "Create outcome", `Create an outcome called ${title}`),
    complete: descriptor("outcomes.complete", "Complete outcome", "Complete this outcome"),
  },
  commitments: {
    complete: (title: string, person: string) => descriptor(
      "commitments.complete",
      "Complete commitment",
      `Mark ${title} promise to ${person} complete`,
    ),
  },
} as const;

export const importantUiActionParityDescriptors = [
  primaryWorldUiActions.today.openDate,
  primaryWorldUiActions.home.seeFullDay,
  primaryWorldUiActions.today.protectEvent("Deep work — project brief"),
  primaryWorldUiActions.capture.turnIntoOutcome,
  primaryWorldUiActions.outcomes.complete,
  primaryWorldUiActions.commitments.complete("Proposal", "Maya"),
] as const;
