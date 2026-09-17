import type { LifeContext } from "../../domain/life-model";
import type { GlobalIntent } from "../../shared/command/globalInterpreter";
import { annotatedLiteralValue, literalAssignment } from "../../shared/command/literalValue";
import { normalizeTranscript } from "../day-planner/interpretation/normalize";

/** Explicit Capture edits and their named/contextual argument roles. */
export function captureRoleFrame(source: string, context: LifeContext): GlobalIntent | null {
  const raw = source.trim(), text = normalizeTranscript(raw);
  const assignment = literalAssignment(raw);
  if (assignment && /^(?:this|that|the current) (?:note|capture)$/i.test(assignment.subject)) return { type: "capture-edit", title: assignment.value };
  if (/^keep (?:this|that|it) as a note$/.test(text)) return { type: "capture-archive" };
  if (/^clear (?:the )?remaining captures by keeping them as notes$/.test(text)) return { type: "capture-batch-archive" };
  const edit = raw.match(/^the note we just mentioned needs to read\s+([\s\S]+)$/i)
    ?? raw.match(/^the capture title should be\s+([\s\S]+)$/i)
    ?? raw.match(/^(?:this|that) capture should say\s+([\s\S]+)$/i);
  if (edit) {
    const title = annotatedLiteralValue(edit[1]!);
    return title === null ? null : { type: "capture-edit", title };
  }
  const archive = text.match(/^i am finished with (?:the )?(.+?) note; archive it$/);
  if (archive) return { type: "capture-archive", query: archive[1]! };
  if (/^archive the capture we were discussing,? without converting it to anything$/.test(text)) return { type: "capture-archive" };
  const captureContext = context.route === "inbox" || context.topic === "capture";
  const preview = text.match(/^before removing (.+?), show me exactly what will go$/);
  if (preview && captureContext) return { type: "capture-delete", query: preview[1]! };
  return null;
}
