import type { LanguageCase } from "./languageDatabase";
import { acceptanceFixture } from "./acceptanceFixtures";

/** Build only independently declared preconditions; never inspect expected results. */
export function declaredLanguageFixture(row: LanguageCase) {
  if (!row.fixtureId) throw new Error(`Missing declared fixture: ${row.id}`);
    const snapshot = acceptanceFixture(row.fixtureId).snapshot;
    if (row.fixtureSpec?.collections) Object.assign(snapshot.document, structuredClone(row.fixtureSpec.collections));
    const target = row.fixtureSpec?.calendarTarget;
    if (target) {
      const plan = snapshot.document.calendars[target.dateKey];
      if (!plan || Object.values(snapshot.document.calendars).some((day) => day.events.some(({ id }) => id === target.id))) throw new Error(`Invalid independent target fixture: ${row.id}`);
      plan.events.push(structuredClone(target)); plan.events.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
      snapshot.document.calendar = structuredClone(snapshot.document.calendars[snapshot.document.calendar.dateKey]!);
    }
    const preset = row.fixtureSpec?.playingPreset;
    if (preset) {
      const studio = snapshot.document.studio;
      if (!studio.atmospherePresets.some(({ id }) => id === preset.id)) studio.atmospherePresets.push(structuredClone(preset));
      studio.activeAtmosphere = { presetId: preset.id, playing: true, muted: false, masterVolume: preset.masterVolume, layers: structuredClone(preset.layers) };
    }
    return snapshot;
}
