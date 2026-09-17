/** Future aspirations are not completed actions or implicit new objects.
 * An explicit imperative request may use an “I need to” politeness frame,
 * but goal narrative cannot acquire mutation authority from one inner verb. */
export function isUncommittedGoalStatement(source: string) {
  const text = source.trim().replace(/[.!?]+$/, "");
  const goal = text.match(/^i\s+(?:need|want|have)\s+to\s+([\s\S]+)$/i);
  if (!goal) return false;
  const body = goal[1]!;
  // §28 explicitly treats a named-recipient delivery obligation as a promise,
  // not an Outcome or a catch-all goal. Missing recipients remain unresolved.
  if (/^send\s+[\p{L}][\p{L}'’-]*\s+\S.+$/iu.test(body)) return false;
  if (/^(?:journal|write|talk(?: for a while)?|record something|write something(?: down)?|get (?:this|something) out)$/i.test(body)) return false;
  if (/^(?:move|relocate) to\b/i.test(body)) return true;
  return !/^(?:open|go|see|show|take|bring|scroll|page|move|shift|push|reschedule|rename|edit|change|make|add|create|schedule|book|block|protect|unprotect|delete|remove|cancel|capture|bookmark|pause|resume|stop|undo|redo|save|play|mute)\b/i.test(body);
}
