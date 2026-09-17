import { useEffect, useRef, useState } from "react";
import type { DayPlan } from "./model";
import { buildContextPhrases } from "./voice/contextPhrases";
import { logVoiceDiagnostics } from "./voice/diagnostics";
import {
  createBrowserRecognitionAdapter,
  DEFAULT_VOICE_LOCALE,
  type RecognitionAdapter,
  type RecognitionError,
  type VoiceLocale,
} from "./voice/recognition";
import {
  looksLikeIntelligibleEnglish,
  selectBestTranscriptCandidate,
} from "./voice/transcriptCandidates";

export type VoiceStatus =
  | "idle"
  | "requesting-permission"
  | "listening"
  | "processing"
  | "success"
  | "no-speech"
  | "permission-denied"
  | "unavailable"
  | "aborted";

export type VoiceIssue = "unclear" | "unsupported" | "incomplete";

const errorMessages: Record<RecognitionError, string> = {
  "permission-denied": "Microphone access is blocked.",
  "microphone-unavailable": "I can't access a microphone.",
  "recognition-busy": "Voice recognition is already active. Stop another session, then try again.",
  "start-failed": "Voice recognition could not start. Check the microphone, then try again.",
  "no-speech": "I didn't hear anything.",
  "incomplete-utterance": "The browser ended an unfinished phrase. Nothing changed. Please repeat the complete request.",
  network: "Voice recognition is temporarily unavailable.",
  "language-not-supported": "English voice recognition isn't available in this browser.",
  unavailable: "Voice commands aren't supported here yet. You can still type commands.",
  aborted: "",
  unknown: "Voice recognition is temporarily unavailable.",
};

interface VoiceContext {
  plan: DayPlan;
  selectedId?: string;
  selectedTitle?: string;
  pendingDestination?: boolean;
}

function statusForError(error: RecognitionError): VoiceStatus {
  if (error === "permission-denied") return "permission-denied";
  if (error === "no-speech") return "no-speech";
  if (error === "aborted") return "aborted";
  return "unavailable";
}

export function useVoiceInput(
  onFinal: (text: string) => void,
  context: VoiceContext,
  provided?: RecognitionAdapter,
  locale: VoiceLocale = DEFAULT_VOICE_LOCALE,
) {
  const adapter = useRef<RecognitionAdapter>(provided ?? createBrowserRecognitionAdapter(locale));
  const latestContext = useRef(context);
  const latestOnFinal = useRef(onFinal);
  latestContext.current = context;
  latestOnFinal.current = onFinal;
  const phase = useRef<VoiceStatus>("idle");
  const active = useRef(false);
  const intentionalStop = useRef(false);
  const session = useRef(0);
  const idleTimer = useRef<number | undefined>(undefined);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [interim, setInterim] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [message, setMessage] = useState("");
  const [issue, setIssue] = useState<VoiceIssue>();

  function transition(next: VoiceStatus) {
    phase.current = next;
    setStatus(next);
  }

  function settleToIdle(delay = 700) {
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => transition("idle"), delay);
  }

  useEffect(() => () => {
    session.current += 1;
    active.current = false;
    window.clearTimeout(idleTimer.current);
    adapter.current.abort();
  }, []);

  function start() {
    if (active.current || ["requesting-permission", "listening", "processing"].includes(phase.current)) return;
    if (!adapter.current.supported) {
      transition("unavailable");
      setMessage(errorMessages.unavailable);
      return;
    }
    const currentSession = ++session.current;
    active.current = true;
    intentionalStop.current = false;
    window.clearTimeout(idleTimer.current);
    setInterim("");
    setMessage("");
    setIssue(undefined);
    transition("requesting-permission");
    adapter.current.start({
      onStart: () => {
        if (session.current !== currentSession) return;
        transition("listening");
      },
      onInterim: (text) => {
        if (session.current !== currentSession || phase.current === "processing") return;
        setInterim(text);
        transition("listening");
      },
      onFinal: (candidates) => {
        if (session.current !== currentSession || phase.current === "processing" || phase.current === "success") return;
        transition("processing");
        setInterim("");
        const selected = selectBestTranscriptCandidate(candidates, latestContext.current);
        const transcript = selected?.candidate.transcript.trim() ?? "";
        setFinalTranscript(transcript);
        if (selected?.routeToPlanner) {
          setIssue(undefined);
          setMessage("");
          logVoiceDiagnostics({ locale, candidates, selected, result: "executed through shared command pipeline" });
          latestOnFinal.current(transcript);
        } else {
          const nextIssue: VoiceIssue = selected && selected.semanticTier > 0
            ? "incomplete"
            : looksLikeIntelligibleEnglish(transcript) ? "unsupported" : "unclear";
          setIssue(nextIssue);
          setMessage(nextIssue === "incomplete"
            ? "I need one more detail."
            : nextIssue === "unsupported"
              ? "I heard you, but I can't make that kind of change yet."
              : "I didn't catch that clearly.");
          logVoiceDiagnostics({ locale, candidates, selected, result: `${nextIssue}; calendar not executed` });
        }
        transition("success");
      },
      onError: (error) => {
        if (session.current !== currentSession) return;
        active.current = false;
        if (error === "aborted" && intentionalStop.current) {
          transition("aborted");
          setMessage("");
          settleToIdle(300);
          return;
        }
        transition(statusForError(error));
        setMessage(errorMessages[error]);
      },
      onEnd: () => {
        if (session.current !== currentSession) return;
        active.current = false;
        if (phase.current === "requesting-permission" || phase.current === "listening") {
          if (intentionalStop.current) {
            transition("aborted");
            settleToIdle(300);
          } else {
            transition("no-speech");
            setMessage(errorMessages["no-speech"]);
          }
          return;
        }
        if (phase.current === "success") settleToIdle();
      },
    }, {
      locale,
      contextPhrases: buildContextPhrases(latestContext.current.plan.events.map((event) => event.title), latestContext.current.selectedTitle),
    });
  }

  function stop() {
    if (!active.current) return;
    intentionalStop.current = true;
    adapter.current.stop();
  }

  return {
    supported: adapter.current.supported,
    status,
    listening: status === "requesting-permission" || status === "listening",
    processing: status === "processing",
    interim,
    finalTranscript,
    message,
    issue,
    language: locale,
    toggle: active.current ? stop : start,
    retry: start,
    stop,
  };
}
