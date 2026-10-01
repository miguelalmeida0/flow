import assert from 'node:assert/strict';
import path from 'node:path';
import { browserContext, observe, until, pass } from './native.mjs';
import { installAudioInput } from './browser-audio.mjs';
import { speech } from './speech.mjs';
import { padWav } from './wav.mjs';

export async function ownership(def, services, out) {
  const s = { id: def.id, lane: 'C — asynchronous browser ownership', status: 'FAIL', checks: [], events: [], errors: [] };
  const start = Date.now(); let browser;
  try {
    console.log(`[RUN] ${s.id}`);
    const fixture = await speech('Flow, add a new friend named Anita.');
    s.fixtures = [fixture.fixture];
    const launch = await browserContext(services); browser = launch.browser;
    await launch.context.addInitScript(installAudioInput);
    let owner = await launch.context.newPage(); observe(owner, s, 'owner-0');
    await owner.goto(`${process.env.FLOW_VOICE_APP_URL ?? 'http://localhost:5173/'}?flowVoiceDebug=1`);
    for (let round = 0; round < 3; round++) {
      s.failureStage = `ownership round ${round}`;
      await until(() => s.events.some(e => e.tabId === `owner-${round}` && e.event === 'voice.micLive'), 'owner capture');
      const waiting = await launch.context.newPage(); observe(waiting, s, `owner-${round + 1}`);
      await waiting.goto(`${process.env.FLOW_VOICE_APP_URL ?? 'http://localhost:5173/'}?flowVoiceDebug=1`);
      const locks = await until(async () => { const q = await waiting.evaluate(() => navigator.locks.query()); s.lastLocks = q; return q.pending.filter(l => l.name === 'flow.local-voice').length === 1 && q; }, 'one waiting tab after StrictMode cleanup');
      assert.equal(locks.held.filter(l => l.name === 'flow.local-voice').length, 1, 'exclusive lock count');
      assert(!s.events.some(e => e.tabId === `owner-${round + 1}` && e.event === 'voice.micLive'));
      const before = s.events.length;
      await owner.evaluate(bytes => window.voiceLabPlay(bytes), [...padWav(fixture.bytes, 0, 2)]);
      await until(() => s.events.slice(before).some(e => e.event === 'voice.finalTranscriptToKernel'), 'owner dispatch');
      await until(() => s.events.slice(before).some(e => e.event === 'voice.ttsPlaybackComplete'), 'owner response');
      assert.equal(s.events.slice(before).filter(e => e.event === 'voice.finalTranscriptToKernel').length, 1, 'owner turn count');
      assert(s.events.slice(before).filter(e => e.event === 'voice.kernelDispatch').length <= 1, 'at most one owner kernel execution');
      const stored = await owner.evaluate(() => JSON.parse(localStorage.getItem('flow.life.v3')));
      assert.equal(stored.document.people.filter(p => p.name === 'Anita').length, 1, 'persisted Anita count');
      assert.equal(stored.document.people.length, 1, 'no additional person mutations across owners');
      (s.persistedRounds ??= []).push({ round, person: stored.document.people.find(p => p.name === 'Anita'), lastTransaction: stored.lastTransaction });
      pass(s, `round ${round}: one owner, one turn, no duplicate person`);
      await owner.close(); owner = waiting;
    }
    await until(() => s.events.some(e => e.tabId === 'owner-3' && e.event === 'voice.micLive'), 'final takeover');
    pass(s, 'three automatic ownership transfers');
    const beforeReconnect = s.events.length;
    const closedSockets = await owner.evaluate(() => {
      const sockets = window.voiceLabSockets.filter(ws => ws.readyState === WebSocket.OPEN && new URL(ws.url).pathname === '/voice');
      sockets.forEach(ws => ws.close(4000, 'automated reconnect fault'));
      return sockets.length;
    });
    assert.equal(closedSockets, 1, 'one authenticated socket receives the reconnect fault');
    await until(() => s.events.slice(beforeReconnect).some(e => e.event === 'voice.micLive'), 'real socket reconnect and microphone restart');
    await owner.evaluate(bytes => window.voiceLabPlay(bytes), [...padWav(fixture.bytes, 0, 2)]);
    await until(() => s.events.slice(beforeReconnect).some(e => e.event === 'voice.ttsPlaybackComplete'), 'reconnected owner response');
    assert.equal(s.events.slice(beforeReconnect).filter(e => e.event === 'voice.finalTranscriptToKernel').length, 1);
    assert(s.events.slice(beforeReconnect).filter(e => e.event === 'voice.kernelDispatch').length <= 1);
    const reconnectedState = await owner.evaluate(() => JSON.parse(localStorage.getItem('flow.life.v3')));
    assert.equal(reconnectedState.document.people.filter(p => p.name === 'Anita').length, 1);
    assert.equal(reconnectedState.document.people.length, 1);
    pass(s, 'real WebSocket reconnect: one turn and no duplicate person');
    s.safety = { duplicateMutations: 0 };
    s.screenshot = `${s.id}.png`; await owner.screenshot({ path: path.join(out, s.screenshot) });
    s.status = 'PASS'; delete s.failureStage;
  } catch (e) { s.error = e.message; console.log(`[FAIL] ${s.id}: ${s.error}`); }
  finally { await browser?.close(); s.durationMs = Date.now() - start; }
  return s;
}
