import type { LifeContext, LifeRoute } from "../../../domain/life-model";
import type { AtmosphereLayerId, StudioSurfaceId } from "../../../domain/studio-model";
import { numberToken, parseNumberWords } from "../../day-planner/interpretation/numbers";
import { normalizeTranscript } from "../../day-planner/interpretation/normalize";
import { parseNavigationIntent } from "../../voice-navigation/parseNavigationIntent";
import { parseJournalCapability, type JournalEditingIntent } from "./journalCapabilities";
import { outsideQuotedRanges } from "../../day-planner/interpretation/sourceClauses";
import { literalValue } from "../../../shared/command/literalValue";
import { parseStudioSelection, type StudioSelectionIntent } from "./studioSelection";
import { parseNativeStudioCapability, type NativeStudioIntent } from "../nativeStudioCapability";
import { parseRitualConfiguration, type RitualConfigurationIntent } from "../ritualConfiguration";
import { parseJournalPlayback, type JournalPlaybackIntent } from "./journalPlayback";
import { parseLinkedJournal } from "./linkedJournal";
import { parseMemoryEditing } from "./memoryEditing";
import { parseAtmosphereRoleFrame } from "./atmosphereRoleFrames";
import { atmosphereLayerPattern, atmosphereLayerReference as layerFor } from "./atmosphereLayerReference";
import { atmospherePlaybackQuery } from "./atmospherePlaybackQuery";
import { journalBookmarkAnchor } from "../journalBookmark";

export type StudioPlanStep = StudioIntent | { type: "navigate"; route: LifeRoute };

export type StudioIntent =
  | JournalPlaybackIntent
  | NativeStudioIntent
  | RitualConfigurationIntent
  | JournalEditingIntent
  | StudioSelectionIntent
  | { type: "studio-compound"; steps: StudioPlanStep[] }
  | { type: "journal-create"; initialText?: string; beginRecording: boolean }
  | { type: "journal-recording"; mode: "start" | "pause" | "resume" | "stop" | "discard" }
  | { type: "journal-append"; text: string }
  | { type: "journal-bookmark"; anchor: "current" | "recent" | "selection" | "last-sentence" }
  | { type: "journal-save" }
  | { type: "journal-rename"; title: string }
  | { type: "atmosphere-play"; query: string }
  | { type: "atmosphere-playback"; mode: "pause" | "resume" | "stop" | "mute" }
  | { type: "atmosphere-adjust"; layerId?: AtmosphereLayerId; property: "volume" | "rate" | "enabled"; operation: "increase" | "decrease" | "remove" | "restore"; preserveAudibleLayerIds?: AtmosphereLayerId[]; excludedLayerIds?: AtmosphereLayerId[] }
  | { type: "atmosphere-set"; layerId: AtmosphereLayerId; property: "volume" | "rate"; value: number }
  | { type: "atmosphere-save"; name?: string; mode: "save" | "duplicate" | "rename" | "delete" }
  | { type: "memory-create"; source?: "photo" | "bookmark" | "passage" | "photo-bookmark" }
  | { type: "memory-source"; source: "photo" | "bookmark" | "passage" | "photo-bookmark" }
  | { type: "memory-audio-trim"; edge: "in" | "out"; deltaMs: number }
  | { type: "memory-update"; property: "textScale" | "showDate" | "audioEnabled" | "photo" | "textY" | "dateCorner"; operation: "increase" | "decrease" | "show" | "hide" | "up" | "down"; requireAudioEnabled?: boolean }
  | { type: "memory-playback"; mode: "play" | "pause" | "restart" }
  | { type: "memory-save" }
  | { type: "memory-edit"; property: "passage"; value: string }
  | { type: "memory-composition"; composition: "still" | "page" | "voice" }
  | { type: "workspace"; operation: "primary" | "secondary" | "put-away" | "restore" | "show-less" | "show-more"; surface?: StudioSurfaceId }
  | { type: "ritual-home" };

const fillers = /^(?:(?:okay|ok|hey|um|uh|actually|just|please)\s+)*(?:(?:can|could|would) you\s+)?(?:(?:i d|i would) like to\s+)?(?:(?:go ahead and)\s+)?/;

function normalizedClause(source: string) {
  return normalizeTranscript(source).replace(/(?<!\d)\.|\.(?!\d)|[!?]+/g, " ").replace(/\s+/g, " ").replace(fillers, "").trim();
}

function surfaceFor(value: string): StudioSurfaceId | undefined {
  if (/\bjournal|writing|entry\b/.test(value)) return "journal";
  if (/\batmosphere|music|sound|rain\b/.test(value)) return "atmosphere";
  if (/\bmemor(?:y|ies)|piece|keepsake\b/.test(value)) return "memories";
  return undefined;
}

function requestedMemorySource(value: string): Extract<StudioIntent, { type: "memory-create" }>["source"] {
  const photo = /\bphoto(?:graph)?\b/.test(value);
  const bookmark = /\bbookmark(?:ed)?\b|\bmarked part\b/.test(value);
  if (photo && bookmark) return "photo-bookmark";
  if (photo) return "photo";
  if (bookmark) return "bookmark";
  if (/\b(?:passage|sentence|selection|words|line)\b/.test(value)) return "passage";
  return undefined;
}

/** Journal dictation is opt-out only for this bounded whole-utterance control
 * vocabulary. Product/domain verbs inside prose never escape to another
 * interpreter while long-form recording owns the session. */
function journalInterruption(source: string): StudioIntent | null {
  const text = normalizedClause(source);
  if (/^retry saving (?:the )?recording$/.test(text)) return { type: "journal-recording", mode: "stop" };
  if (/^(?:bookmark|mark) (?:that|this|here|that part|this part|that bit|this bit|that moment|this moment|what i just said|the last sentence|that exact line|that line)$/.test(text)
    || /^(?:save|remember|keep) (?:that part|this part|that bit|this bit|that moment|this moment|what i just said|the last sentence|that exact line|that line)$/.test(text)) {
    return { type: "journal-bookmark", anchor: journalBookmarkAnchor(text) };
  }
  if (/^(?:pause|hold)(?: (?:the )?(?:journal )?(?:recording|journal))?$/.test(text)) return { type: "journal-recording", mode: "pause" };
  if (/^(?:resume|continue|keep recording)(?: (?:the )?(?:journal )?(?:recording|journal))?$/.test(text)) return { type: "journal-recording", mode: "resume" };
  if (/^(?:stop|finish|end|i am done|i m done|that's it|that s it)(?: (?:the |this )?(?:journal )?(?:recording|journal|entry))?$/.test(text)) return { type: "journal-recording", mode: "stop" };
  if (/^save (?:this|entry|this entry|the entry|journal|this journal)$/.test(text)) return { type: "journal-save" };
  if (/^(?:discard|delete) (?:the |this )?(?:journal )?(?:recording|audio)$/.test(text)) return { type: "journal-recording", mode: "discard" };
  return null;
}

function parseClause(source: string, context: LifeContext): StudioPlanStep | null {
  const text = normalizedClause(source);
  if (!text) return null;
  const linkedJournal = parseLinkedJournal(source);
  if (linkedJournal) return linkedJournal;
  const memoryEdit = parseMemoryEditing(source, context);
  if (memoryEdit) return memoryEdit;
  const atmosphereEdit = parseAtmosphereRoleFrame(text, context);
  if (atmosphereEdit) return atmosphereEdit;
  const native = parseNativeStudioCapability(text);
  if (native) return native;
  const playback = parseJournalPlayback(text, context);
  if (playback) return playback;
  const ritualConfiguration = parseRitualConfiguration(text);
  if (ritualConfiguration) return ritualConfiguration;
  const selection = parseStudioSelection(source, context);
  if (selection) return selection;
  if (context.route === "memories" || context.topic === "memory") {
    const memoryText = source.trim().match(/^(?:make (?:the |its )?(?:text|words) say|replace (?:the )?(?:memory )?(?:text|words|passage) with)\s+([\s\S]+)$/i);
    if (memoryText) return { type: "memory-edit", property: "passage", value: literalValue(memoryText[1]!) };
    const composition = text.match(/^(?:(?:use|make this) (?:a )?)?(still|page|voice)(?: (?:composition|memory))?$/);
    if (composition) return { type: "memory-composition", composition: composition[1] as "still" | "page" | "voice" };
  }
  const journalCapability = parseJournalCapability(source, context);
  if (journalCapability) return journalCapability;
  if (/^remove (?:the )?(?:voice|audio) from (?:the |this )?journal(?: entry)?$/.test(text)) return { type: "journal-recording", mode: "discard" };
  if (/^retry saving (?:the )?recording$/.test(text)) return { type: "journal-recording", mode: "stop" };
  // “Memory” is also a navigable world name. Keep an explicit creation verb
  // authoritative before destination recovery so “make a memory” can never be
  // mistaken for a route reference.
  if (/^make (?:a )?(?:memory|little piece)(?: from .+)?$/.test(text) || /^make something(?: from .+)?$/.test(text)) {
    const source = requestedMemorySource(text);
    return { type: "memory-create", ...(source ? { source } : {}) };
  }
  const navigation = parseNavigationIntent(source);
  const hasNavigationShape = /^(?:journal|atmosphere|memories|memory|open|go|take|bring|show|switch|return|come|i want|can i see)\b/.test(text);
  if (navigation?.kind === "navigate" && hasNavigationShape) {
    const route: LifeRoute = navigation.target.world === "today" ? "calendar"
      : navigation.target.world === "capture" ? "inbox"
        : navigation.target.world === "outcomes" ? "plans"
          : navigation.target.world;
    return { type: "navigate", route };
  }

  if (/^(?:i am|i m) home$/.test(text)) return { type: "ritual-home" };

  const journalContext = context.topic === "journal" || context.route === "journal" || Boolean(context.activeJournalEntryId && context.voiceMode === "journal-longform");
  const explicitBookmark = /^(?:bookmark|mark) (?:that|this|here|that part|that bit|that moment|what i just said|the last sentence|that exact line|that line)$/.test(text);
  const contextualBookmark = journalContext && /^(?:save|remember|keep) (?:that|this|here|that part|that bit|that moment|what i just said|the last sentence|that exact line|that line)$/.test(text);
  if (explicitBookmark || contextualBookmark) {
    return { type: "journal-bookmark", anchor: journalBookmarkAnchor(text) };
  }
  if (/^(?:bookmark|mark|keep) (?:the )?(?:selected|selection|selected lines?)$/.test(text)) return { type: "journal-bookmark", anchor: "selection" };

  if (/^(?:pause|hold) (?:the )?(?:journal )?(?:recording|journal)$/.test(text)) return { type: "journal-recording", mode: "pause" };
  if (/^(?:resume|continue) (?:the )?(?:journal )?(?:recording|journal)$/.test(text)) return { type: "journal-recording", mode: "resume" };
  if (/^(?:stop|finish|end) (?:the |this )?(?:journal )?(?:recording|journal|entry)$/.test(text)) return { type: "journal-recording", mode: "stop" };
  if (/^(?:discard|delete) (?:the |this )?(?:journal )?(?:recording|audio)$/.test(text)) return { type: "journal-recording", mode: "discard" };
  if (/^(?:start|begin|record) (?:the |a |this )?(?:journal )?(?:recording|audio)$/.test(text) || /^record me$/.test(text)) return { type: "journal-recording", mode: "start" };
  if (/^(?:start with|use) (?:my |the )?voice$/.test(text)) {
    return context.activeJournalEntryId
      ? { type: "journal-recording", mode: "start" }
      : { type: "journal-create", beginRecording: true };
  }
  if (/^keep recording$/.test(text) && journalContext) return { type: "journal-recording", mode: "resume" };
  if (/^resume$/.test(text) && journalContext) return { type: "journal-recording", mode: "resume" };
  if (/^(?:stop|i m done|that s it)$/.test(text) && journalContext && context.voiceMode === "journal-longform") return { type: "journal-recording", mode: "stop" };

  const journalText = text.match(/^(?:journal this|write this down|take this down|keep this for me|capture (?:this |a )?thought)\s+(.+)$/);
  if (journalText) return { type: "journal-create", initialText: journalText[1], beginRecording: false };
  if (/^(?:new journal entry|new entry|open a new journal(?: i just want to talk)?|make a new journal entry|make a journal entry|make a new entry|create (?:a |an )?(?:journal )?entry|another entry|write a new entry|start writing|start a journal|start journaling|start a new (?:journal|entry)|(?:let me|i want to) talk(?: for (?:a bit|a while))?|let me get something down|get (?:something|this) out|i need to get (?:something|this) out|i need somewhere to (?:think|write|get this down)|i want to record something|i want to write something|write something down|i need to write something down|i want to capture a thought|write this down)$/.test(text)) {
    return { type: "journal-create", beginRecording: /\b(?:talk|record)\b/.test(text) };
  }
  if (/^(?:(?:start|make|open) a )?new one$/.test(text) && (context.topic === "journal" || context.route === "journal" || context.activeJournalEntryId)) return { type: "journal-create", beginRecording: false };
  if (/^(?:i want to journal|i want to write|i want to remember something|open (?:a |my )?journal|take me to my journal)$/.test(text)) return { type: "journal-create", beginRecording: false };
  const journalRename = text.match(/^(?:rename|call) (?:this |the )?(?:journal|entry) (?:to |)(.+)$/);
  if (journalRename?.[1]) return { type: "journal-rename", title: journalRename[1] };
  if (/^(?:save|keep) (?:this |the )?(?:journal|entry)$/.test(text)) return { type: "journal-save" };

  const atmosphereQuery = atmospherePlaybackQuery(source, text);
  const explicitAtmosphereRequest = /\b(?:atmosphere|music|sound|rain|tone|tonal|piano|pulse|sunday evening)\b/.test(text)
    || context.topic === "atmosphere"
    || context.route === "atmosphere";
  if (atmosphereQuery && explicitAtmosphereRequest && !/\b(?:journal|recording|memory|roadmap|meeting|event)\b/.test(atmosphereQuery)) {
    return { type: "atmosphere-play", query: atmosphereQuery };
  }
  const leavePresetPlaying = text.match(/^(?:leave|keep) (?:my |the )?(.+?) playing$/);
  if (leavePresetPlaying?.[1]
    && !/^(?:the )?(?:atmosphere|music|sound)$/.test(leavePresetPlaying[1])
    && /\b(?:atmosphere|music|sound|rain|tone|piano|sunday evening)\b/.test(text)) {
    return { type: "atmosphere-play", query: leavePresetPlaying[1].replace(/\s+atmosphere$/, "") };
  }
  if (/^enter (?:the )?atmosphere$/.test(text) && (context.route === "atmosphere" || context.topic === "atmosphere")) return { type: "atmosphere-play", query: "sunday evening" };
  if (/^(?:pause|stop|resume|mute) (?:the )?(?:atmosphere|music|sound)$/.test(text)) {
    const mode = text.startsWith("pause") ? "pause" : text.startsWith("resume") ? "resume" : text.startsWith("mute") ? "mute" : "stop";
    return { type: "atmosphere-playback", mode };
  }
  if (/^(?:pause|resume|mute)$/.test(text) && (context.topic === "atmosphere" || context.route === "atmosphere")) {
    return { type: "atmosphere-playback", mode: text as "pause" | "resume" | "mute" };
  }
  if (/^leave (?:the )?(?:atmosphere|music|sound) playing$/.test(text)) return { type: "atmosphere-playback", mode: "resume" };
  const restoreSound = text.match(/^bring (?:the )?(.+?) back$/);
  const restoredLayer = restoreSound?.[1] ? layerFor(restoreSound[1]) : undefined;
  if (restoredLayer) return { type: "atmosphere-adjust", layerId: restoredLayer, property: "enabled", operation: "restore" };
  if (/^(?:make|turn) everything quieter$/.test(text) && (context.topic === "atmosphere" || context.route === "atmosphere")) return { type: "atmosphere-adjust", property: "volume", operation: "decrease" };
  const setSound = text.match(/^set (?:the )?(.+?) (volume|presence|pace|rate) to (\d+(?:\.\d+)?)(?:\s*(percent|%))?$/);
  if (setSound) {
    const layerId = layerFor(setSound[1]!);
    const property = /pace|rate/.test(setSound[2]!) ? "rate" : "volume";
    const value = Number(setSound[3]) / (setSound[4] ? 100 : 1);
    if (layerId) return { type: "atmosphere-set", layerId, property, value };
  }
  const exclusion = text.match(new RegExp(`,?\\s+(?:not (?:the )?(${atmosphereLayerPattern})|but leave (?:the )?(${atmosphereLayerPattern}) alone)$`));
  const excluded = exclusion ? layerFor((exclusion[1] ?? exclusion[2])!) : undefined;
  const exclusionGuard = excluded ? { excludedLayerIds: [excluded] } : {};
  const soundText = (exclusion ? text.slice(0, exclusion.index) : text)
    .replace(/^i only want (?:the )?(.+?) layer turned off$/, "remove $1")
    .replace(/^take (?:the )?(.+?) out$/, "remove $1")
    .replace(/^bring (?:the )?(.+?) up(?: a notch)?$/, "raise $1")
    .replace(/^give (?:the )?(.+?) (?:a little )?more presence$/, "raise $1")
    .replace(/^leave out (?:the )?(.+?)(?: entirely)?$/, "remove $1")
    .replace(/^soften\s+/, "lower ")
    .replace(/\s+(?:a notch|a little|a bit|a touch)$/, "")
    .replace(/\s+(?:a touch|a little|a bit)\s+(?=softer|quieter|louder|slower|faster)/, " ");
  if (/^quiet all (?:the )?layers(?: a little)?$/.test(soundText) && (context.route === "atmosphere" || context.topic === "atmosphere")) return { type: "atmosphere-adjust", property: "volume", operation: "decrease", ...exclusionGuard };
  const soundAdjustment = soundText.match(/^(less|more|remove|bring back|restore|slow|make|turn|lower|raise|nudge)\s+(?:the )?(.+?)(?:\s+(softer|quieter|louder|slower|faster|down|up))?$/);
  if (soundAdjustment) {
    const layerId = layerFor(soundAdjustment[2] ?? "");
    const explicitlyAudible = /\b(?:rain(?:fall)?|piano|music|tone|tonal|melody|pulse|rhythm|beat|texture|noise|atmosphere|sound)\b/.test(soundText);
    if (layerId && (explicitlyAudible || context.topic === "atmosphere" || context.route === "atmosphere")) {
      const words = `${soundAdjustment[1]} ${soundAdjustment[3] ?? ""}`;
      const property = /slow|fast/.test(words) ? "rate" : /remove|bring back|restore/.test(words) ? "enabled" : "volume";
      const operation = /remove/.test(words) ? "remove" : /bring back|restore/.test(words) ? "restore" : /more|louder|up|raise|faster/.test(words) ? "increase" : "decrease";
      return { type: "atmosphere-adjust", layerId, property, operation, ...exclusionGuard };
    }
  }
  const atmosphereName = text.match(/^(?:save this as|call this|rename this to)\s+(.+)$/);
  if (atmosphereName && (context.topic === "atmosphere" || context.route === "atmosphere")) {
    const authoredName = source.trim().replace(/[.!?]+$/, "").match(/(?:save this as|call this|rename this to)\s+(.+)$/i)?.[1]?.trim();
    return { type: "atmosphere-save", name: authoredName || atmosphereName[1], mode: text.startsWith("rename") || text.startsWith("call") ? "rename" : "save" };
  }
  if (/^save this atmosphere$/.test(text)) return { type: "atmosphere-save", mode: "save" };
  if (/^(?:save this|save)$/.test(text) && (context.topic === "atmosphere" || context.route === "atmosphere")) return { type: "atmosphere-save", mode: "save" };
  if (/^duplicate this atmosphere$/.test(text)) return { type: "atmosphere-save", mode: "duplicate" };
  if (/^duplicate$/.test(text) && (context.topic === "atmosphere" || context.route === "atmosphere")) return { type: "atmosphere-save", mode: "duplicate" };
  if (/^delete this atmosphere$/.test(text)) return { type: "atmosphere-save", mode: "delete" };
  const deletePreset = text.match(/^delete (?:the )?original (.+?) preset$/);
  if (deletePreset) return { type: "atmosphere-save", mode: "delete", name: deletePreset[1] };

  if (/^use (?:this|that|the|selected) photo and (?:this|that|the) bookmark(?:ed part)?$/.test(text)) return { type: "memory-source", source: "photo-bookmark" };
  if (/^use (?:this|that|the|selected) photo$/.test(text)) return { type: "memory-source", source: "photo" };
  if (/^use (?:this|that|the) (?:bookmark|bookmarked part|marked part)$/.test(text)) return { type: "memory-source", source: "bookmark" };
  if (/^use (?:this|that|the|selected|last) (?:sentence|passage|line|selection)$/.test(text)) return { type: "memory-source", source: "passage" };
  if (/^keep (?:this|the) photo unchanged$/.test(text)) return { type: "memory-source", source: "photo" };
  const audioTrim = text.match(new RegExp(`^(?:move|start|set) (?:the )?(?:voice|audio) (start|end|in|out)(?: point)?\\s+(${numberToken})\\s+seconds?\\s+(earlier|later)$`));
  if (audioTrim?.[1] && audioTrim[2] && audioTrim[3]) {
    const direction = audioTrim[3] === "earlier" ? -1 : 1;
    const seconds = parseNumberWords(audioTrim[2]);
    if (seconds === null) return null;
    return { type: "memory-audio-trim", edge: /end|out/.test(audioTrim[1]) ? "out" : "in", deltaMs: seconds * 1000 * direction };
  }
  if (/^(?:remove|hide) (?:the )?(?:voice|audio)$/.test(text)) return { type: "memory-update", property: "audioEnabled", operation: "hide" };
  if (/^(?:bring|put) (?:the )?(?:voice|audio) back$/.test(text)) return { type: "memory-update", property: "audioEnabled", operation: "show" };
  if (/^(?:remove|hide) (?:the )?(?:photo|photograph|image)$/.test(text)) return { type: "memory-update", property: "photo", operation: "hide" };
  if (/^(?:bring|put) (?:the )?(?:photo|photograph|image) back$/.test(text)) return { type: "memory-update", property: "photo", operation: "show" };
  if (/^restore photo$/.test(text) && (context.topic === "memory" || context.route === "memories")) return { type: "memory-update", property: "photo", operation: "show" };
  if (/^hide the date$/.test(text)) return { type: "memory-update", property: "showDate", operation: "hide" };
  if (/^show (?:the )?date$/.test(text)) return { type: "memory-update", property: "showDate", operation: "show" };
  if (/^put the date in the corner$/.test(text)) return { type: "memory-update", property: "dateCorner", operation: "show" };
  if (/^date in corner$/.test(text) && (context.topic === "memory" || context.route === "memories")) return { type: "memory-update", property: "dateCorner", operation: "show" };
  if (/^date below (?:the )?words$/.test(text) && (context.topic === "memory" || context.route === "memories")) return { type: "memory-update", property: "dateCorner", operation: "hide" };
  if (/^(?:make the )?(?:words|text) (larger|bigger|smaller)$/.test(text)) return { type: "memory-update", property: "textScale", operation: /smaller/.test(text) ? "decrease" : "increase" };
  if (/^(?:larger|bigger|smaller)$/.test(text) && (context.topic === "memory" || context.route === "memories")) return { type: "memory-update", property: "textScale", operation: text === "smaller" ? "decrease" : "increase" };
  if (/^move the text (up|down)$/.test(text)) return { type: "memory-update", property: "textY", operation: text.endsWith("up") ? "up" : "down" };
  if (/^move (up|down)$/.test(text) && (context.topic === "memory" || context.route === "memories")) return { type: "memory-update", property: "textY", operation: text.endsWith("up") ? "up" : "down" };
  if (/^(?:play it|play this memory)$/.test(text)) return { type: "memory-playback", mode: "play" };
  if (/^(?:pause it|pause this memory)$/.test(text)) return { type: "memory-playback", mode: "pause" };
  if (/^(?:start it again|restart this memory)$/.test(text)) return { type: "memory-playback", mode: "restart" };
  if (/^(?:play|pause|restart)$/.test(text) && (context.topic === "memory" || context.route === "memories")) return { type: "memory-playback", mode: text as "play" | "pause" | "restart" };
  if (/^(?:save (?:this )?memory|keep this|keep that)$/.test(text) && (context.topic === "memory" || context.route === "memories")) return { type: "memory-save" };

  if (/^show less$/.test(text)) return { type: "workspace", operation: "show-less" };
  if (/^(?:show more|show everything again)$/.test(text)) return { type: "workspace", operation: "show-more" };
  if (/^(?:go back to|return to) what i was doing$/.test(text)) return { type: "workspace", operation: "restore" };
  const surface = surfaceFor(text);
  if (surface && /^restore (?:the )?(?:journal|atmosphere|memories)(?: surface)?$/.test(text)) return { type: "workspace", operation: "restore", surface };
  if (surface && /\b(?:bring|open|move).+\b(?:closer|forward|front)\b/.test(text)) return { type: "workspace", operation: "primary", surface };
  if (surface && /\b(?:leave|keep|open).+\b(?:beside|next to|alongside)\b/.test(text)) return { type: "workspace", operation: "secondary", surface };
  if (surface && /^(?:leave|keep) .+ open$/.test(text)) return { type: "workspace", operation: "secondary", surface };
  if (/^(?:put|hide|minimize) (?:these|this|everything|it|(?:the )?(?:journal|atmosphere|memories)) away$/.test(text)) return { type: "workspace", operation: "put-away", ...(surface ? { surface } : {}) };

  const explicitCrossDomainCommand = /^(?:move|shift|push|reschedule|add|schedule|block|fit|protect|lock|cancel|delete|remove|defer|resize|extend|shorten|make room|capture|create an? outcome|i promised|i am waiting|what needs me)\b/.test(text);
  if (context.voiceMode === "journal-longform" && context.activeJournalEntryId && text.length > 1 && !explicitCrossDomainCommand) return { type: "journal-append", text: source.trim() };
  return null;
}

export function interpretStudioCommand(source: string, context: LifeContext): StudioIntent | null {
  const literalCapability = parseJournalCapability(source, context);
  if (literalCapability && ["journal-rename", "journal-text-edit", "journal-tags", "journal-delete"].includes(literalCapability.type)) return literalCapability;
  // Named values are complete literal slots, not a list of command fragments.
  const whole = parseClause(source, { ...context, voiceMode: "command" });
  if (whole && ["journal-playback", "atmosphere-save", "journal-create", "memory-source", "memory-edit", "memory-composition", "studio-select"].includes(whole.type)) return whole as StudioIntent;
  const boundaries = [...source.matchAll(/,?\s+(?:and then|then|and|but)\s+/gi)].filter((match) => outsideQuotedRanges(source, match.index));
  let offset = 0;
  const clauses = [...boundaries.map((match) => { const clause = source.slice(offset, match.index).trim(); offset = match.index! + match[0].length; return clause; }), source.slice(offset).trim()].filter(Boolean);
  if (context.voiceMode === "journal-longform" && context.activeJournalEntryId) {
    const interruptions = clauses.map(journalInterruption);
    if (clauses.length > 1 && interruptions.every((step): step is StudioIntent => Boolean(step))) {
      return { type: "studio-compound", steps: interruptions };
    }
    return parseJournalCapability(source, context) ?? journalInterruption(source) ?? { type: "journal-append", text: source.trim() };
  }
  if (clauses.length > 1) {
    const steps = clauses.map((clause) => parseClause(clause, context));
    if (steps.every((step): step is StudioPlanStep => Boolean(step)) && steps.some((step) => step.type !== "navigate" || ["journal", "atmosphere", "memories"].includes(step.route))) {
      return { type: "studio-compound", steps };
    }
  }
  const intent = parseClause(source, context);
  return intent && intent.type !== "navigate" ? intent : null;
}

/** Only a whole request is eligible. Exposing independently parsed prefixes
 * allowed a valid first clause to escape an invalid compound and mutate data. */
export function interpretStudioCommandCandidates(source: string, context: LifeContext): StudioIntent[] {
  const combined = interpretStudioCommand(source, context);
  return combined ? [combined] : [];
}
