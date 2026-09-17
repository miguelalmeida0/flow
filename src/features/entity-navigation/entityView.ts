export type EntityViewKind = "capture" | "step" | "commitment" | "recommendation";
export type EntityViewSelector = { id: string } | { query: string; person?: string } | { ordinal: number } | { contextual: true };
export type EntityViewIntent = { type: "entity-view"; kind: EntityViewKind; operation: "select" | "open" | "edit"; target: EntityViewSelector; inToday?: boolean }
  | { type: "editor-close" };
export interface EntityEditor { kind: "capture" | "step"; id: string; session: number }

export function entityViewDescription(intent: EntityViewIntent) {
  if (intent.type === "editor-close") return "Cancel editing";
  return `${intent.operation === "edit" ? "Edit" : intent.operation === "open" ? "Open" : "Select"} ${intent.kind}`;
}
