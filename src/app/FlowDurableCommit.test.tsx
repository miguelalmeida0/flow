import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FlowEnvironmentProvider, useFlowEnvironment } from "./FlowEnvironmentProvider";
import { LIFE_STORAGE_KEY, readLifeSnapshot } from "../domain/life-storage";
import { interpretTurn } from "../kernel/llm/modelClient";
import type * as ModelClient from "../kernel/llm/modelClient";
import type { LifeLockManager } from "../domain/life-synchronization";

vi.mock("../kernel/llm/modelClient", async (original) => ({ ...await original<typeof ModelClient>(), interpretTurn: vi.fn() }));
vi.mock("../features/voice/useKyutaiVoiceSession", () => ({ useKyutaiVoiceSession: () => ({ available: false, sttReady: false, ttsReady: false, speak: vi.fn(), stop: vi.fn() }) }));
let env: ReturnType<typeof useFlowEnvironment>;
function Probe() { env = useFlowEnvironment(); return null; }
const now = () => new Date("2026-10-02T10:00:00Z");
const read = () => readLifeSnapshot("2026-10-02")!;
beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/"); vi.mocked(interpretTurn).mockReset(); });
afterEach(() => { vi.restoreAllMocks(); Object.defineProperty(navigator, "locks", { configurable: true, value: undefined }); });

it("does not publish success after a failed save and retries the same command exactly once", async () => {
  render(<FlowEnvironmentProvider now={now}><Probe /></FlowEnvironmentProvider>);
  const before = read();
  const original = localStorage.setItem.bind(localStorage);
  const save = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => { if (key === LIFE_STORAGE_KEY) throw new DOMException("full", "QuotaExceededError"); original(key, value); });
  await act(async () => { env.runCommand("Remember I prefer interviews before lunch", "type", "retry-command"); });
  expect(read()).toEqual(before);
  expect(env.feedback.phase).toBe("error");
  expect(env.feedback.title).toMatch(/save/i);
  expect(window.__FLOW_COMMAND_TRACE__?.committedAt).toBeUndefined();
  save.mockRestore();
  await act(async () => { env.runCommand("Remember I prefer interviews before lunch", "type", "retry-command"); });
  expect(read().document.personalMemoryFacts).toHaveLength(1);
  expect(read().past).toHaveLength(before.past.length + 1);
  await act(async () => { env.runCommand("Remember I prefer interviews before lunch", "type", "retry-command"); });
  expect(read().past).toHaveLength(before.past.length + 1);
});

it.each(["type", "voice"] as const)("exact %s recovery controls retry once and discard only retained failed requests", async (source) => {
  render(<FlowEnvironmentProvider now={now}><Probe /></FlowEnvironmentProvider>);
  const original = localStorage.setItem.bind(localStorage);
  const fail = () => vi.spyOn(localStorage,"setItem").mockImplementation((key,value)=>{if(key===LIFE_STORAGE_KEY)throw new DOMException("full","QuotaExceededError");original(key,value);});
  let save=fail();
  await act(async()=>env.runCommand("Remember I like morning walks",source,"failed-save"));
  expect(env.hasUnsavedChanges).toBe(true);save.mockRestore();
  await act(async()=>env.runCommand("Retry save",source,"explicit-retry"));
  expect(env.hasUnsavedChanges).toBe(false);expect(read().document.personalMemoryFacts).toHaveLength(1);
  save=fail();await act(async()=>env.runCommand("Remember I like quiet rooms",source,"second-failure"));save.mockRestore();
  await act(async()=>env.runCommand("Discard unsaved request",source,"explicit-discard"));
  expect(env.hasUnsavedChanges).toBe(false);expect(read().document.personalMemoryFacts).toHaveLength(1);
});

it("an exact Retry save command cannot revive a model request after authority cancellation", async()=>{
  vi.mocked(interpretTurn).mockResolvedValueOnce(modelResponse({kind:"plan",summary:"note",conditions:[],steps:[{capabilityId:"journal.create",args:{title:"old request"}}]})).mockResolvedValue(modelResponse({verdict:"accept"}));
  render(<FlowEnvironmentProvider now={now}><Probe /></FlowEnvironmentProvider>);
  const original=localStorage.setItem.bind(localStorage);
  const save=vi.spyOn(localStorage,"setItem").mockImplementation((key,value)=>{if(key===LIFE_STORAGE_KEY)throw new DOMException("full","QuotaExceededError");original(key,value);});
  await act(async()=>env.runCommand('Write a note saying "old request".',"type","old-model"));
  await waitFor(()=>expect(env.hasUnsavedChanges).toBe(true));save.mockRestore();
  await act(async()=>{env.invalidateAsyncAuthority("logout");env.runCommand("Retry save","type","retry-old-model");});
  expect(read().document.studio.journalEntries).toHaveLength(0);expect(env.hasUnsavedChanges).toBe(true);
});
it.each(["dictation", "quoted"] as const)("does not interpret %s prose as a discard control",async(mode)=>{
  render(<FlowEnvironmentProvider now={now}><Probe /></FlowEnvironmentProvider>);
  const original=localStorage.setItem.bind(localStorage);
  const save=vi.spyOn(localStorage,"setItem").mockImplementation((key,value)=>{if(key===LIFE_STORAGE_KEY)throw new DOMException("full","QuotaExceededError");original(key,value);});
  await act(async()=>env.runCommand("Remember I prefer fresh air","type","retained-request"));save.mockRestore();
  vi.mocked(interpretTurn).mockResolvedValue({ok:false,reason:"unavailable",message:"fixture unavailable"});
  await act(async()=>env.runCommand(mode==="quoted"?'"Discard unsaved request"':"Discard unsaved request","voice","prose",mode==="dictation"?{context:{...env.conversationContext,voiceMode:"journal-longform"},scope:env.temporalScope,confirmationAuthority:env.confirmationAuthority}:undefined));
  expect(env.hasUnsavedChanges).toBe(true);expect(env.feedback.title).not.toBe("Unsaved request discarded");
});

function modelResponse(content: unknown): Awaited<ReturnType<typeof interpretTurn>> {
  return { ok: true, response: { content: JSON.stringify(content), model: "test", totalDurationMs: 1, loadDurationMs: null, evalCount: 1 } };
}

it("persists every domain of an accepted local compound plan in one undo entry", async () => {
  vi.mocked(interpretTurn).mockResolvedValueOnce(modelResponse({ kind: "plan", summary: "Create both", conditions: [], steps: [
    { capabilityId: "journal.create", args: { title: "Trip journal" } },
    { capabilityId: "memory.store", args: { text: "I prefer train travel" } },
  ] })).mockResolvedValue(modelResponse({ verdict: "accept" }));
  render(<FlowEnvironmentProvider now={now}><Probe /></FlowEnvironmentProvider>);
  const before = read();
  await act(async () => { env.runCommand('Create a journal called "Trip journal" and remember I prefer train travel.', "type", "compound"); });
  await waitFor(() => expect(read().document.personalMemoryFacts, JSON.stringify(env.feedback)).toHaveLength(1));
  expect(read().document.studio.journalEntries).toHaveLength(1);
  expect(read().past).toHaveLength(before.past.length + 1);
  await act(async () => { env.undo(); });
  expect(read().document.personalMemoryFacts).toEqual(before.document.personalMemoryFacts);
  expect(read().document.studio.journalEntries).toEqual(before.document.studio.journalEntries);
});

it.each(["logout", "new utterance"])("keeps a failed model request but %s prevents Retry from making it actionable", async (interruption) => {
  vi.mocked(interpretTurn).mockResolvedValueOnce(modelResponse({ kind: "plan", summary: "note", conditions: [], steps: [{ capabilityId: "journal.create", args: { title: "unsaved model draft" } }] }))
    .mockResolvedValue(modelResponse({ verdict: "accept" }));
  render(<FlowEnvironmentProvider now={now}><Probe /></FlowEnvironmentProvider>);
  const original = localStorage.setItem.bind(localStorage);
  const save = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => { if (key === LIFE_STORAGE_KEY) throw new DOMException("full", "QuotaExceededError"); original(key, value); });
  await act(async () => { env.runCommand('Write a note saying "unsaved model draft".', "type", "unsaved-model"); });
  await waitFor(() => expect(env.hasUnsavedChanges).toBe(true));
  save.mockRestore();
  await act(async () => {
    if (interruption === "logout") env.invalidateAsyncAuthority("logout");
    else env.runCommand("Where did I mention Lisbon", "type", "superseding-request");
  });
  await act(async () => { expect(await env.retrySave()).toBe(false); });
  expect(read().document.studio.journalEntries).toHaveLength(0);
  expect(env.hasUnsavedChanges).toBe(true);
  await act(async () => { env.discardUnsavedChanges(); env.runCommand("Remember I like morning walks", "type", "fresh-request"); });
  expect(read().document.personalMemoryFacts).toHaveLength(1);
  expect(env.hasUnsavedChanges).toBe(false);
});

it("requires explicit discard when another tab changes a failed draft's revision", async () => {
  render(<FlowEnvironmentProvider now={now}><Probe /></FlowEnvironmentProvider>);
  const before = read();
  const original = localStorage.setItem.bind(localStorage);
  const save = vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => { if (key === LIFE_STORAGE_KEY) throw new DOMException("full", "QuotaExceededError"); original(key, value); });
  await act(async () => { env.runCommand("Remember I prefer quiet mornings", "type", "failed-revision"); });
  save.mockRestore();
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify({ ...before, revision: before.revision + 1 }));
  await act(async () => { expect(await env.retrySave()).toBe(false); });
  expect(env.hasUnsavedChanges).toBe(true);
  await act(async () => { env.discardUnsavedChanges(); env.runCommand("Remember I prefer afternoon meetings", "type", "recovered"); });
  expect(read().document.personalMemoryFacts).toHaveLength(1);
  expect(read().document.personalMemoryFacts?.[0]?.text).toContain("afternoon");
});

it("allows a typed edit during inference and rejects the older model result", async () => {
  let tail = Promise.resolve();
  const locks: LifeLockManager = { request: (_name, _options, callback) => {
    const task = tail.then(callback); tail = task.then(() => undefined, () => undefined); return task;
  } };
  Object.defineProperty(navigator, "locks", { configurable: true, value: locks });
  let resolveModel!: (value: Awaited<ReturnType<typeof interpretTurn>>) => void;
  vi.mocked(interpretTurn).mockImplementation(() => new Promise((resolve) => { resolveModel = resolve; }));
  render(<FlowEnvironmentProvider now={now}><Probe /></FlowEnvironmentProvider>);
  await act(async () => { env.runCommand('Write a note saying "obsolete draft".', "type", "slow-model"); });
  expect(resolveModel).toBeTypeOf("function");
  let saved = false;
  await act(async () => { void Promise.resolve(env.dispatchLife([{ type: "capture.create", capture: { id: "typed-edit", kind: "capture", title: "Keep this edit", status: "unresolved", source: "typed", createdAt: now().toISOString(), updatedAt: now().toISOString() } }], "Typed edit")).then((result) => { saved = result; }); await Promise.resolve(); await Promise.resolve(); });
  expect(saved).toBe(true);
  expect(read().document.captures[0]?.id).toBe("typed-edit");
  await act(async () => { resolveModel({ ok: true, response: { content: JSON.stringify({ kind: "plan", steps: [{ capabilityId: "journal.create", args: { title: "obsolete draft" } }], summary: "note", conditions: [] }), model: "test", totalDurationMs: 1, loadDurationMs: null, evalCount: 1 } }); });
  expect(read().document.studio.journalEntries).toHaveLength(0);
});
