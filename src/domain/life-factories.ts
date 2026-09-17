import type { EntityLink, LifeDocument } from "./life-model";
import { allCalendarEvents, allCalendarPlans } from "./life-calendar-world";

function slug(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
  if (normalized.length <= 38) return normalized;
  let hash = 2_166_136_261;
  for (const character of normalized) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  return `${normalized.slice(0, 30).replace(/-+$/g, "")}-${(hash >>> 0).toString(36).padStart(7, "0").slice(-7)}`;
}

export function uniqueLifeId(document: LifeDocument, prefix: string, title: string) {
  const ids = new Set([
    ...document.captures, ...document.plans, ...document.steps, ...document.people, ...document.commitments, ...document.links,
    ...document.studio.journalEntries, ...document.studio.atmospherePresets, ...document.studio.memories, ...document.studio.rituals, ...document.studio.mediaAssets,
    ...document.studio.journalEntries.flatMap((entry) => [...entry.transcriptSegments, ...entry.bookmarks, ...entry.drawings]),
    ...allCalendarEvents(document), ...allCalendarPlans(document).flatMap((plan) => plan.breathingRooms ?? []),
  ].map(({ id }) => id));
  const base = `${prefix}-${slug(title)}`;
  if (!ids.has(base)) return base;
  let index = 2;
  while (ids.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

export function createLifeLink(document: LifeDocument, type: EntityLink["type"], fromId: string, toId: string, at: string): EntityLink {
  return { id: uniqueLifeId(document, "link", `${type}-${fromId}-${toId}`), type, fromId, toId, createdAt: at };
}

export function initialPlanSteps(title: string) {
  if (/passport|senegal/i.test(title)) return [
    { title: "Documents", estimatedMinutes: 25 },
    { title: "Passport photos", estimatedMinutes: 20 },
    { title: "Book appointment", estimatedMinutes: 15 },
  ];
  if (/\b(?:trip|travel|holiday|vacation|flight)\b/i.test(title)) return [
    { title: "Confirm dates and constraints", estimatedMinutes: 20 },
    { title: "Book the critical reservation", estimatedMinutes: 30 },
    { title: "Prepare the essentials", estimatedMinutes: 25 },
  ];
  if (/\b(?:job|role|application|interview)\b/i.test(title)) return [
    { title: "Review the role requirements", estimatedMinutes: 25 },
    { title: "Tailor the application", estimatedMinutes: 45 },
    { title: "Submit and record follow-up", estimatedMinutes: 15 },
  ];
  if (/\b(?:appointment|doctor|dentist|clinic)\b/i.test(title)) return [
    { title: "Gather questions and records", estimatedMinutes: 20 },
    { title: "Confirm the appointment details", estimatedMinutes: 10 },
  ];
  if (/\b(?:buy|purchase|return|refund|exchange)\b/i.test(title)) return [
    { title: "Check requirements and options", estimatedMinutes: 20 },
    { title: "Complete the purchase or return", estimatedMinutes: 30 },
  ];
  if (/\b(?:move house|moving home|relocate|relocation)\b/i.test(title)) return [
    { title: "Choose the next move milestone", estimatedMinutes: 30 },
    { title: "Book the essential service", estimatedMinutes: 25 },
    { title: "Pack the first zone", estimatedMinutes: 45 },
  ];
  if (/\b(?:presentation|report|deck|brief)\b/i.test(title)) return [
    { title: "Define the audience and outcome", estimatedMinutes: 20 },
    { title: "Draft the structure", estimatedMinutes: 35 },
    { title: "Review and deliver", estimatedMinutes: 30 },
  ];
  return [{ title: "Define the next action", estimatedMinutes: 20 }];
}
