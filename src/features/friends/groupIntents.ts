import type { FriendGroup } from "../../domain/friends-model";
import type { LifeContext } from "../../domain/life-model";

export type GroupIntent = { type: "friend-group"; operation: "create" | "open" | "ask" | "replies" | "decision" | "finalize" | "record-reply"; query?: string; name?: string; members?: string[]; memberIds?: string[]; groupId?: string; planId?: string; value?: string; dateKey?: string; personId?: string; personQuery?: string; response?: "in" | "maybe" | "cant" | "alternative" };
const key = (value: string) => value.toLocaleLowerCase().trim().replace(/[.!?]$/, "");
export function matchingGroups(groups: readonly FriendGroup[], query: string) { return groups.filter(({ name }) => key(name) === key(query)); }
export function parseGroupIntent(text: string, context: LifeContext, groups: readonly FriendGroup[]): GroupIntent | undefined {
  const create = text.match(/^(?:create|make|start) (?:a )?(?:private )?group (?:called |named )?(.+?) with (.+?)[.!]?$/i);
  if (create) return { type: "friend-group", operation: "create", name: create[1]!, members: create[2]!.split(/\s*(?:,|\band\b)\s*/i).filter(Boolean) };
  const open = text.match(/^(?:open|show(?: me)?) (?:the )?(.+?) group[.!]?$/i) ?? text.match(/^(?:open|show(?: me)?) (.+?)[.!]?$/i);
  if (open && (matchingGroups(groups, open[1]!).length || / group[.!]?$/i.test(text))) return { type: "friend-group", operation: "open", query: open[1]! };
  const ask = text.match(/^ask (.+?) (?:who['’]s|who is|whether (?:people|everyone) (?:is|are)) free (.+?)[.!?]?$/i);
  if (ask) return { type: "friend-group", operation: "ask", query: ask[1]!, value: ask[2]! };
  if (!context.focusedGroupId) return undefined;
  const reply = text.match(/^record (.+?)['’]s reply\s*:\s*([\s\S]+)$/i);
  if (reply) return { type: "friend-group", operation: "record-reply", personQuery: reply[1]!, value: reply[2]!, response: /^i['’]m in|^in[.!]?$/i.test(reply[2]!) ? "in" : /^maybe\b/i.test(reply[2]!) ? "maybe" : /^(?:i )?can['’]t\b/i.test(reply[2]!) ? "cant" : "alternative" };
  if (/^(?:who replied|who can (?:come|make it)|show (?:the )?replies)[.!?]?$/i.test(text)) return { type: "friend-group", operation: "replies" };
  const decision = text.match(/^what did we decide(?: about (.+?))?[.!?]?$/i);
  if (decision) return { type: "friend-group", operation: "decision", value: decision[1] };
  if (context.activeGroupPlanId && /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|at )\b/i.test(text)) return { type: "friend-group", operation: "finalize", value: text.replace(/\s+then[.!]?$/i, ""), planId: context.activeGroupPlanId };
  return undefined;
}
