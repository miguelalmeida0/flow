import test from 'node:test';
import assert from 'node:assert/strict';
import { distribution, summarizeLatency, latencyHtml, hasUsefulPartial, observationClocks } from './latency.mjs';
import { turnWaterfall } from './waterfall.mjs';
import { servesExactSource } from './stack.mjs';
import { observedTurns } from './turn-latency.mjs';

test('stale or absent frontend source maps cannot qualify a benchmark', () => {
  const compiled = `//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify({ sourcesContent: ['current source'] })).toString('base64')}`;
  assert.equal(servesExactSource(compiled, 'current source'), true);
  assert.equal(servesExactSource(compiled, 'changed source'), false);
  assert.equal(servesExactSource('no source map', 'current source'), false);
});

test('useful partial requires an observed word delimiter, not a fragment', () => {
  for (const text of ['', ' F', ' Flo', ' Flow']) assert.equal(hasUsefulPartial(text), false);
  for (const text of [' Flow,', ' This is', ' Confirm.', ' João da']) assert.equal(hasUsefulPartial(text), true);
});

test('waterfalls do not merge tab clocks or clocks reset by navigation', () => {
  const groups = observationClocks([{ tabId: 'a', at: 500 }, { tabId: 'b', at: 100 }, { tabId: 'a', at: 600 }, { tabId: 'a', at: 10 }]);
  assert.deepEqual(groups.map(g => g.events.map(e => e.at)), [[500, 600], [100], [10]]);
});

test('missing measurements never become zero or enter the denominator', () => {
  assert.deepEqual(distribution([null, undefined, NaN, Infinity]), { min: null, p50: null, p95: null, max: null, count: 0 });
  assert.deepEqual(distribution([10, 20, null, 30, 40]), { min: 10, p50: 20, p95: 40, max: 40, count: 4 });
});
test('failed scenario observations remain visible in latency distribution', () => {
  const report = { scenarios: [{ status: 'FAIL', latency: { wakeMs: 3000 } }, { status: 'PASS', latency: { wakeMs: 1000 } }] };
  assert.equal(summarizeLatency(report).wakeMs.count, 2);
  assert.equal(summarizeLatency(report).wakeMs.p95, 3000);
  assert.match(latencyHtml(report, String), /NOT MEASURED/);
});

test('turn waterfall never borrows next-turn output or mixes audio and browser clocks', () => {
  const event = (type, at, utteranceId = 'a', extra = {}) => ({ event: 'voice.companionEvent', tabId: 'main', at, state: { type, sessionId: 'session', utteranceId, ...extra } });
  const events = [event('speech.start', 100), event('endpoint.detected', 200, 'a', { lastSpeechMs: 80 }), event('transcript.final', 300), event('speech.start', 350, 'b'), { event: 'voice.speakFeedback', tabId: 'main', at: 450, state: {} }];
  const stages = turnWaterfall(events, 2, events.length);
  assert.equal(stages.find(s => s.stage === 'response text ready').at, null);
  assert.equal(stages.find(s => s.stage === 'physical playback started').at, null);
  assert.equal(stages.find(s => s.stage === 'last speech PCM').clock, 'worker-audio');
});

const measuredEvent = (type, at, extra = {}) => ({ tabId: 'a', at, event: 'voice.companionEvent', state: { type, sessionId: 's', captureId: 1, workerEpoch: 'worker-a', utteranceId: 'u', atMs: at + 10000, ...extra } });
const browserEvent = (event, at, state = {}) => ({ tabId: 'a', at, event, state });
const micFrame = (at, captureId = 1) => browserEvent('voice.micFrameSent', at, { sessionId: 's', captureId, firstSample: 0, lastSample: 1920 });

test('digital speech boundaries use correlated sample positions in one document clock', () => {
  const events = [micFrame(20, 2), micFrame(100), measuredEvent('stt.speechDetected', 150, { audioMs: 80 }), measuredEvent('endpoint.detected', 300, { lastSpeechMs: 80 }), measuredEvent('transcript.final', 450, { text: 'Confirm.' })];
  assert.equal(observedTurns(events)[0].speechEndToFinalMs, 350);
  assert.equal(observedTurns(events.filter(e => e !== events[1]))[0].speechEndToFinalMs, null);
});

test('observed partial from a failed unfinished turn is retained', () => {
  const turn = observedTurns([measuredEvent('stt.speechDetected', 100), measuredEvent('transcript.partial', 250, { text: 'Flow,' })])[0];
  assert.equal(turn.finalized, false);
  assert.equal(turn.workerDetectionToUsefulMs, 150);
  assert.equal(turn.speechEndToFinalMs, null);
});

test('worker epoch changes cannot be combined into a latency sample', () => {
  const turn = observedTurns([measuredEvent('stt.speechDetected', 100), measuredEvent('transcript.partial', 250, { workerEpoch: 'worker-b', text: 'Flow,' })])[0];
  assert.equal(turn.workerDetectionToUsefulMs, null);
});

test('cancel request is not a stopped-source measurement until every source ends', () => {
  const events = [micFrame(100), measuredEvent('stt.speechDetected', 150, { audioMs: 80 }), browserEvent('voice.bargeInDetected', 160, { utteranceId: 'u' }), browserEvent('voice.ttsPlaybackCancelled', 170, { playbackId: 5, sources: 2 }), browserEvent('voice.ttsSourceEnded', 180, { playbackId: 5, cancelled: true })];
  assert.equal(observedTurns(events)[0].bargeSpeechToStoppedMs, null);
  events.push(browserEvent('voice.ttsSourceEnded', 185, { playbackId: 5, cancelled: true }));
  assert.equal(observedTurns(events)[0].bargeSpeechToStoppedMs, 85);
  assert.equal(observedTurns(events)[0].cancelToStoppedMs, 15);
});

test('a next-turn response cannot be attributed to dictation', () => {
  const events = [measuredEvent('stt.speechDetected', 100), measuredEvent('transcript.final', 200, { text: 'Journal content.' }), measuredEvent('stt.speechDetected', 250, { utteranceId: 'next' }), measuredEvent('transcript.final', 300, { utteranceId: 'next', text: 'Confirm.' }), browserEvent('voice.speakFeedback', 320), browserEvent('voice.ttsAudioPlayable', 400, { playbackId: 1 })];
  const turns = observedTurns(events);
  assert.equal(turns[0].responseToPlayableMs, null);
  assert.equal(turns[1].responseToPlayableMs, 80);
});
