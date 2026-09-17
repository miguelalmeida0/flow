import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "../../shared/design-system/Icon";
import { tokens } from "../../shared/design-system/tokens";
import type { CalendarEvent, DayPlan, PlannerPhase, TransactionSource } from "./model";
import { useVoiceInput } from "./useVoiceInput";
import { DEFAULT_VOICE_LOCALE, type RecognitionAdapter, type VoiceLocale } from "./voice/recognition";
import type { PlannerPresentationIntent, PlannerPresentationRequest } from "../../shared/command/presentationCapability";

interface VoiceCommandBarProps {
  selected?: CalendarEvent;
  plan: DayPlan;
  onRun: (command: string, source?: TransactionSource) => void;
  onPresentation: (intent: PlannerPresentationIntent) => void;
  presentationRequest?: PlannerPresentationRequest;
  lastTranscript: string;
  pendingDestination?: boolean;
  phase: PlannerPhase;
  holdOpen?: boolean;
  recognitionAdapter?: RecognitionAdapter;
  voiceLocale?: VoiceLocale;
}

export function VoiceCommandBar({ selected, plan, onRun, onPresentation, presentationRequest, lastTranscript, pendingDestination, phase, holdOpen = false, recognitionAdapter, voiceLocale = DEFAULT_VOICE_LOCALE }: VoiceCommandBarProps) {
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(false);
  const recedeTimer = useRef<number | undefined>(undefined);
  const handledPresentation = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => { if (lastTranscript) setDraft(lastTranscript); }, [lastTranscript]);
  useEffect(() => {
    if (phase === "completed" && !holdOpen) {
      window.clearTimeout(recedeTimer.current);
      recedeTimer.current = window.setTimeout(() => setActive(false), 850);
    } else if (phase !== "ready" || holdOpen) {
      // `ready` follows completed feedback shortly after the result is clear.
      // Preserve the recede deadline across that benign phase transition; all
      // actionable states and new work cancel it immediately.
      window.clearTimeout(recedeTimer.current);
      recedeTimer.current = undefined;
    }
  }, [phase, holdOpen, lastTranscript]);
  useEffect(() => () => window.clearTimeout(recedeTimer.current), []);

  function stayOpen() {
    window.clearTimeout(recedeTimer.current);
    setActive(true);
  }

  function submit(value: string, source: TransactionSource = "type") {
    const command = value.trim();
    if (!command) return;
    setDraft(command);
    stayOpen();
    onRun(command, source);
  }

  const voice = useVoiceInput(
    (text) => { setDraft(text); submit(text, "voice"); },
    { plan, selectedId: selected?.id, selectedTitle: selected?.title, pendingDestination },
    recognitionAdapter,
    voiceLocale,
  );
  useEffect(() => { if (voice.finalTranscript) setDraft(voice.finalTranscript); }, [voice.finalTranscript]);
  useEffect(() => {
    if (!presentationRequest || presentationRequest.sequence === handledPresentation.current) return;
    handledPresentation.current = presentationRequest.sequence;
    window.clearTimeout(recedeTimer.current);
    const intent = presentationRequest.intent;
    if (intent.type === "voice-retry") { setActive(true); voice.retry(); }
    else if (intent.open) { setActive(true); window.requestAnimationFrame(() => input.current?.focus({ preventScroll: true })); }
    else setActive(false);
  }, [presentationRequest, voice]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit(draft);
  }

  function toggleVoice() {
    stayOpen();
    if (!voice.listening && !voice.processing) setDraft("");
    voice.toggle();
  }

  function retryVoice() {
    onPresentation({ type: "voice-retry" });
  }

  const expanded = active || voice.listening || voice.processing || Boolean(voice.issue);
  if (!expanded) {
    return (
      <motion.footer
        animate={{ opacity: 1, scale: 1 }}
        className={tokens.command.collapsedShell}
        data-command-expanded="false"
        initial={reducedMotion ? false : { opacity: 0, scale: 0.92, y: 8 }}
        transition={reducedMotion ? { duration: 0.15 } : { type: "spring", stiffness: 360, damping: 30 }}
      >
        <button data-action-id="command.open-composer"
          aria-label="Open Flow command"
          className={tokens.command.open}
          data-flow-action="Open Flow command"
          onClick={() => onPresentation({ type: "command-surface", surface: "composer", open: true })}
          title="Tell Flow what changed"
          type="button"
        ><Icon name="spark" size={17} /></button>
        <motion.button data-action-id="session.control"
          aria-label="Start voice command"
          className={tokens.command.mic}
          disabled={!voice.supported || voice.processing}
          data-reduced-motion={reducedMotion ? "true" : "false"}
          data-flow-action="Start voice command"
          onClick={toggleVoice}
          title={voice.supported ? "Speak a command" : "Voice input is unavailable. Type instead."}
          type="button"
        ><Icon name="mic" size={19} /></motion.button>
      </motion.footer>
    );
  }
  return (
    <motion.footer
      animate={{ opacity: expanded ? 1 : 0.72, y: 0, scale: expanded ? 1 : 0.985 }}
      className={tokens.command.shell}
      data-command-expanded={String(expanded)}
      transition={reducedMotion ? { duration: 0.15 } : { duration: 0.24 }}
    >
      <form className="flex min-h-12 items-center gap-2" onSubmit={onSubmit}>
        <span className={`ml-1 hidden size-7 place-items-center rounded-full border sm:grid ${tokens.command.spark}`}><Icon name="spark" size={14} /></span>
        <input data-action-id="command.submit"
          ref={input}
          aria-label="Tell Flow what to change"
          className={tokens.command.input}
          data-flow-action="Flow command text"
          onBlur={() => { if (!draft && !voice.listening) setActive(false); }}
          onChange={(event) => { setDraft(event.target.value); stayOpen(); }}
          onFocus={stayOpen}
          placeholder={voice.listening ? "Listening…" : "Tell Flow what changed…"}
          value={voice.interim || draft}
        />
        <motion.button data-action-id="session.control"
          aria-label={voice.listening ? "Stop listening" : "Start voice command"}
          className={tokens.command.mic}
          disabled={!voice.supported || voice.processing}
          animate={voice.listening && !reducedMotion ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          data-reduced-motion={reducedMotion ? "true" : "false"}
          data-flow-action="Toggle voice command"
          transition={{ repeat: voice.listening && !reducedMotion ? Infinity : 0, duration: reducedMotion ? 0 : 1.15 }}
          onClick={toggleVoice}
          title={voice.supported ? "Speak a command" : "Voice input is unavailable. Type instead."}
          type="button"
        ><Icon name={voice.listening ? "pause" : "mic"} size={19} /></motion.button>
      </form>

      {!voice.listening && !voice.processing && !voice.issue && (
        <button data-action-id="legacy.command.hide"
          aria-label="Hide Flow command"
          className={`absolute -top-12 right-0 min-h-11 rounded-full border px-3 text-[11px] font-semibold ${tokens.command.dismiss}`}
          data-flow-action="Hide Flow command"
          onClick={() => onPresentation({ type: "command-surface", surface: "composer", open: false })}
          type="button"
        >Done</button>
      )}

      {(expanded && (voice.message || voice.issue || voice.listening || voice.processing)) && (
        <div aria-live="polite" className={`flex min-h-5 items-center justify-center gap-2 px-3 pb-1 text-center text-[11px] sm:absolute sm:left-0 sm:right-0 sm:top-full sm:pt-2 ${tokens.command.helper}`}>
          <span>{voice.issue === "unclear" ? "Didn't catch that" : voice.issue === "incomplete" ? "One detail needed" : voice.issue ? "Not supported yet" : voice.message || (voice.listening ? `Listening in ${voice.language}` : "Understanding…")}</span>
          {voice.issue && voice.message && <span>{voice.message}</span>}
          {voice.finalTranscript && voice.issue && <span className={`max-w-[45%] truncate ${tokens.command.heard}`}>“{voice.finalTranscript}”</span>}
          {voice.issue && <button data-action-id="legacy.voice.retry" className={`font-semibold underline underline-offset-2 ${tokens.command.retry}`} data-flow-action="Retry voice command" onClick={retryVoice} type="button">Try again</button>}
        </div>
      )}
    </motion.footer>
  );
}
