import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CloudVoiceConsent } from "./CloudVoiceConsent";
import { useHostedAccess } from "./useHostedAccess";

const voice = { active: false, status: "stopped" as const, start: vi.fn(), stop: vi.fn() };
function Surface() { const access = useHostedAccess(true, voice.stop); return <CloudVoiceConsent access={access} voice={voice} recording={false} />; }
const guest = { authenticated:false, inferenceEnabled:true, reasoningEnabled:true, speechEnabled:true, consentVersion:"beta-v1" };
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("requires consent and invite, never starts audio on redemption, and discloses typed context and origin storage", async () => {
  const request = vi.fn(async (_url: unknown, options?: RequestInit) => new Response(JSON.stringify(options?.method === "POST" ? {...guest, authenticated:true,csrf:"c".repeat(43), expiresAt:Date.now()+60000} : guest), {status:200}));
  vi.stubGlobal("fetch", request);
  render(<Surface />);
  fireEvent.click(screen.getByText(/Cloud features ·/));
  await screen.findByLabelText("Invitation code");
  expect(screen.getByRole("button", {name:"Enable cloud access"})).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Invitation code"), {target:{value:"one-use-code"}});
  fireEvent.click(screen.getByLabelText("I agree to cloud processing"));
  fireEvent.click(screen.getByRole("button", {name:"Enable cloud access"}));
  await screen.findByRole("button", {name:"Log out of cloud access"});
  expect(voice.start).not.toHaveBeenCalled();
  expect(request.mock.calls.filter(([, options])=>options?.method === "POST")).toHaveLength(1);
  expect(screen.getByText(/recent commands and replies/)).toBeVisible();
  expect(screen.getByRole("link", {name:"Previous Flow version"})).toHaveAttribute("href", "https://miguelalmeida0.github.io/flow/");
  expect(screen.getByText(/AI-generated/)).toBeVisible();
});
it("stops immediately on logout, keeps access inactive when the request fails, and offers explicit refresh", async () => {
  let rejectLogout!: (reason: Error) => void;
  vi.stubGlobal("fetch", vi.fn((_url:unknown, options?:RequestInit) => options?.method === "DELETE" ? new Promise<Response>((_resolve,reject)=>{ rejectLogout=reject; }) : Promise.resolve(new Response(JSON.stringify({...guest,authenticated:true,csrf:"c".repeat(43),expiresAt:Date.now()+60000}),{status:200}))));
  render(<Surface />);
  fireEvent.click(screen.getByText(/Cloud features ·/));
  fireEvent.click(await screen.findByRole("button", {name:"Log out of cloud access"}));
  expect(voice.stop).toHaveBeenCalled();
  await act(async ()=>{ rejectLogout(new Error("offline")); });
  await waitFor(()=>expect(screen.queryByRole("button",{name:"Log out of cloud access"})).not.toBeInTheDocument());
  expect(screen.getByRole("button",{name:"Refresh cloud access"})).toBeEnabled();
});
