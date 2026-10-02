// Explicit evidence inventory. A missing sensor is never filled by an adjacent
// boundary (for example, scheduling is not physical output).
import { hasUsefulPartial, observationClocks } from './latency.mjs';
export function turnWaterfall(events, finalIndex, nextFinalIndex) {
  const final = events[finalIndex];
  const group = observationClocks(events).find(g => g.events.includes(final));
  const sameClock = new Set(group?.events ?? []);
  const identity = final.state.utteranceId;
  const lifecycle = identity ? events.slice(0, finalIndex + 1).filter(e => sameClock.has(e) && e.state?.utteranceId === identity && e.state?.sessionId === final.state.sessionId && e.state?.workerEpoch === final.state.workerEpoch) : [];
  const onset = lifecycle.find(e => e.state?.type === 'stt.speechDetected') ?? lifecycle.find(e => e.state?.type === 'speech.start');
  const nextOnset = events.findIndex((e, index) => index > finalIndex && e.tabId === final.tabId && ['stt.speechDetected', 'speech.start'].includes(e.state?.type));
  const end = Math.min(nextFinalIndex, nextOnset < 0 ? events.length : nextOnset);
  const window = events.filter((e, index) => sameClock.has(e) && e.at >= (onset?.at ?? final.at) && index < end);
  const find = name => window.find(e => e.event === name || e.state?.type === name);
  const point = (stage, event) => ({ stage, at: event?.at ?? null, clock: 'browser-observation', status: event ? 'MEASURED' : 'NOT MEASURED' });
  const partial = lifecycle.find(e => e.state?.type === 'transcript.partial' && hasUsefulPartial(e.state.text ?? ''));
  const endpoint = lifecycle.find(e => e.state?.type === 'endpoint.detected');
  return [
    point('mic first PCM'), point('speech detected', onset),
    point('wake candidate'), point('wake accepted', find('voice.localWakeDetected')),
    point('first PCM sent to STT'), point('first STT token', lifecycle.find(e => e.state?.type === 'stt.firstToken')),
    point('first useful partial', partial),
    { stage: 'last speech PCM', at: endpoint?.state.lastSpeechMs ?? null, clock: 'worker-audio', status: Number.isFinite(endpoint?.state.lastSpeechMs) ? 'MEASURED' : 'NOT MEASURED' },
    point('endpoint decision', endpoint), point('flush start', lifecycle.find(e => e.state?.type === 'stt.flushStart')),
    point('flush complete', lifecycle.find(e => e.state?.type === 'stt.flushComplete')), point('final transcript', final),
    point('semantic routing start'), point('semantic routing complete'), point('kernel dispatch'),
    // Existing kernelDispatch diagnostic is emitted after runKernelTurn returns.
    point('kernel result', find('voice.kernelDispatch')), point('response text ready', find('voice.speakFeedback')),
    point('TTS requested', find('voice.ttsRequested')), point('first synthesized audio'),
    point('playback scheduled', find('voice.ttsPlaybackStarted')), point('physical playback started'),
    point('barge-in speech detected', find('voice.bargeInDetected')),
    point('playback cancel requested', find('voice.ttsPlaybackCancelled')), point('physical playback stopped'),
    point('listening resumed', window.find(e => e.event === 'voice.state' && e.state.to === 'LISTENING' && e.state.event === 'speakDone')),
  ];
}
