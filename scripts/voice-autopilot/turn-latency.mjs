import { hasUsefulPartial, observationClocks } from './latency.mjs';

const gap = (start, end) => Number.isFinite(start?.at) && Number.isFinite(end?.at) && end.at >= start.at ? end.at - start.at : null;
const closed = text => /^(?:confirm|yes|no|wait|cancel|never mind|undo(?: that)?|redo(?: that)?)[.!?]*$/i.test(text?.trim() ?? '');

// Correlate sample positions across the transport, then measure exclusively in
// one browser document clock. A worker restart or capture restart is a new epoch.
export function observedTurns(events) {
  return observationClocks(events).flatMap((group, document) => {
    const onsets = group.events.filter(e => ['stt.speechDetected', 'speech.start'].includes(e.state?.type));
    const unique = [];
    const identity = e => JSON.stringify([e.state?.sessionId, e.state?.captureId, e.state?.workerEpoch, e.state?.utteranceId]);
    const seen = new Set();
    for (const onset of onsets) {
      if (!onset.state?.utteranceId || seen.has(identity(onset))) continue;
      seen.add(identity(onset)); unique.push(onset);
    }
    return unique.map((onset, index) => {
      const start = group.events.indexOf(onset);
      const end = unique[index + 1] ? group.events.indexOf(unique[index + 1]) : group.events.length;
      const window = group.events.slice(start, end);
      const lifecycle = window.filter(e => e.event === 'voice.companionEvent' && identity(e) === identity(onset));
      const find = type => lifecycle.find(e => e.state.type === type);
      const final = find('transcript.final');
      const partial = lifecycle.find(e => e.state.type === 'transcript.partial' && hasUsefulPartial(e.state.text ?? ''));
      const endpoint = find('endpoint.detected');
      const frame = audioMs => {
        if (!Number.isFinite(audioMs) || !Number.isFinite(onset.state.captureId) || !onset.state.sessionId) return undefined;
        const sample = Math.round(audioMs * 24);
        return group.events.find(e => e.event === 'voice.micFrameSent' && e.state.sessionId === onset.state.sessionId
          && e.state.captureId === onset.state.captureId && e.state.firstSample < sample && e.state.lastSample >= sample);
      };
      const speechFrame = frame(onset.state.audioMs);
      const lastVoicedFrame = frame(endpoint?.state.lastSpeechMs);
      const afterFinal = final ? window.slice(window.indexOf(final)) : [];
      const dispatch = afterFinal.find(e => e.event === 'voice.finalTranscriptToKernel');
      const commandId = dispatch?.state.commandId;
      const result = commandId ? afterFinal.find(e => ['voice.commandExecutionCompleted', 'voice.kernelDispatch'].includes(e.event) && e.state.commandId === commandId) : undefined;
      const response = afterFinal.find(e => e.event === 'voice.speakFeedback');
      const output = response ? afterFinal.slice(afterFinal.indexOf(response)) : [];
      const playable = output.find(e => e.event === 'voice.ttsAudioPlayable');
      const complete = playable && output.find(e => e.event === 'voice.ttsPlaybackComplete' && e.state.playbackId === playable.state.playbackId);
      const listening = complete && output.find(e => e.at >= complete.at && e.event === 'voice.state' && e.state.to === 'LISTENING' && e.state.event === 'speakDone');
      const barge = window.find(e => e.event === 'voice.bargeInDetected' && e.state.utteranceId === onset.state.utteranceId);
      const cancel = barge && window.find(e => e.at >= barge.at && e.event === 'voice.ttsPlaybackCancelled');
      const ended = cancel ? window.filter(e => e.event === 'voice.ttsSourceEnded' && e.state.cancelled && e.state.playbackId === cancel.state.playbackId && e.at >= cancel.at) : [];
      const stopped = cancel && ended.length === cancel.state.sources ? ended.at(-1) : undefined;
      const authority = afterFinal.find(e => e.event === 'voice.finalAuthorityAccepted');
      const workerGap = (a, b) => a?.state.workerEpoch && a.state.workerEpoch === b?.state.workerEpoch
        ? gap({ at: a.state.atMs }, { at: b.state.atMs }) : null;
      const routing = afterFinal.find(e => e.event === 'voice.routingStarted' && e.state.commandId === commandId);
      const route = afterFinal.find(e => e.event === 'voice.routeSelected' && e.state.commandId === commandId);
      const requested = output.find(e => e.event === 'voice.ttsRequested');
      const received = output.find(e => e.event === 'voice.ttsAudioReceived');
      const scheduled = output.find(e => e.event === 'voice.ttsPlaybackStarted');
      const synthesis = output.find(e => e.state?.type === 'tts.start');
      const generated = output.find(e => e.state?.type === 'tts.chunkGenerated' && e.state.chunkIndex === 0
        && e.state.workerEpoch === synthesis?.state.workerEpoch && e.state.requestId === synthesis?.state.requestId);
      const total = gap(speechFrame, playable);
      const budget = {
        'Browser mic → worker PCM': null, // no shared clock or transport timestamp echo
        'Worker PCM → speech detection': onset.state.workerEpoch ? gap({ at: onset.state.pcmReceivedAtMs }, { at: onset.state.atMs }) : null,
        'Detection → decoder ready': workerGap(onset, find('stt.decoderReady')),
        'Decoder ready → first token': workerGap(find('stt.decoderReady'), find('stt.firstToken')),
        'First token → useful partial': workerGap(find('stt.firstToken'), partial),
        'Useful partial → wake accepted': gap(partial, window.find(e => e.event === 'voice.localWakeDetected')),
        'Last voiced PCM sent → endpoint observed': gap(lastVoicedFrame, endpoint),
        'Endpoint → flush complete': workerGap(endpoint, find('stt.flushComplete')),
        'Flush complete → final': workerGap(find('stt.flushComplete'), final),
        'Final → route selected': gap(final, route),
        'Route → action result': gap(route ?? routing, result),
        'Action result → response ready': gap(result, response),
        'Response ready → TTS request': gap(response, requested),
        'Worker TTS request → first generated samples': generated?.state.requestToSamplesMs ?? null,
        'First samples → browser receive': null,
        'Browser receive → scheduled': gap(received, scheduled),
        'Scheduled → physical playback start': null,
        'Barge speech observed → cancel requested': barge ? gap(onset, cancel) : null,
        'Cancel requested → all source-ended callbacks': gap(cancel, stopped),
        'Playback complete → listening ready': gap(complete, listening),
      };
      return {
        tabId: group.tab, document, sessionId: onset.state.sessionId, captureId: onset.state.captureId,
        workerEpoch: onset.state.workerEpoch, utteranceId: onset.state.utteranceId, commandId,
        proposalId: authority?.state.proposalId ?? null, proposalRevision: authority?.state.proposalRevision ?? null,
        kernelExecutionId: result?.state.executionId ?? null, ttsPlaybackId: playable?.state.playbackId ?? null,
        ttsRequestId: synthesis?.state.requestId ?? null, ttsWorkerEpoch: synthesis?.state.workerEpoch ?? null,
        ttsQueueWaitMs: synthesis?.state.queueWaitMs ?? null, ttsFirstSamplesMs: generated?.state.requestToSamplesMs ?? null,
        finalized: Boolean(final), reply: closed(final?.state.text) ? final.state.text : null,
        acquisitionToPlayableMs: total,
        budget: Object.fromEntries(Object.entries(budget).map(([stage, ms]) => [stage, { ms, percentOfAcquisitionToPlayable: Number.isFinite(ms) && total > 0 ? 100 * ms / total : null }])),
        evidence: 'Digital voiced-frame send boundaries have 80 ms PCM resolution. Source-ended is a browser audio callback, not a physical speaker measurement.',
        workerDetectionToUsefulMs: onset.state.type === 'stt.speechDetected' ? workerGap(onset, partial) : null,
        micSpeechToUsefulMs: gap(speechFrame, partial),
        speechEndToFinalMs: gap(lastVoicedFrame, final),
        closedReplyEndToDecisionMs: closed(final?.state.text) ? gap(lastVoicedFrame, result) : null,
        finalToDecisionMs: gap(final, result),
        responseToPlayableMs: gap(response, playable),
        bargeSpeechToStoppedMs: gap(speechFrame, stopped),
        bargeDetectedToStoppedMs: gap(onset, stopped),
        cancelToStoppedMs: gap(cancel, stopped),
        speechEndToPlayableMs: gap(lastVoicedFrame, playable),
        playbackEndToListeningMs: gap(complete, listening),
        decoderSetupMs: find('stt.decoderReady')?.state.durationMs ?? null,
        modelDrainMs: find('stt.flushComplete')?.state.durationMs ?? null,
        presentationWaitMs: gap(afterFinal.find(e => e.event === 'voice.presentationWaitStarted' && e.state.commandId === commandId), afterFinal.find(e => e.event === 'voice.commandExecutionStarted' && e.state.commandId === commandId)),
      };
    });
  });
}
