import assert from 'node:assert/strict';
import path from 'node:path';
import { browserContext, observe, until, pass } from './native.mjs';
import { installAudioInput } from './browser-audio.mjs';
import { speech } from './speech.mjs';
import { padWav } from './wav.mjs';

export async function calendar(def, services, out) {
  const s = { id: def.id, lane: 'B — reactive calendar confirmation', status: 'FAIL', checks: [], events: [], errors: [] };
  let browser, page; const started = Date.now();
  try {
    const request = await speech('Flow, cancel the dentist appointment on next Thursday.');
    const confirm = await speech('Confirm.');
    const launch = await browserContext(services); browser = launch.browser;
    await launch.context.addInitScript(installAudioInput);
    page = await launch.context.newPage(); observe(page, s);
    await page.clock.setFixedTime(new Date('2026-09-20T12:00:00+02:00'));
    await page.goto('http://localhost:5173/?flowVoiceDebug=1');
    await page.waitForFunction(() => localStorage.getItem('flow.life.v3'));
    // Disposable deterministic calendar fixture; the requested mutation still
    // runs exclusively through the application's voice/confirmation path.
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('flow.life.v3'));
      const original = state.document.calendar.events.find(e => e.id === 'dentist');
      state.document.calendars['2026-09-24'] = { ...state.document.calendar, dateKey: '2026-09-24', events: [{ ...original, id: 'dentist-lab', dateKey: '2026-09-24', start: 960, end: 1020 }], deferred: [], breathingRooms: [] };
      localStorage.setItem('flow.life.v3', JSON.stringify(state));
    });
    await page.reload(); s.events = [];
    await until(() => s.events.some(e => e.event === 'voice.micLive'), 'calendar mic ready');
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('flow.life.v3')));
    const before = await stored();
    s.failureStage = 'spoken calendar proposal';
    await page.evaluate(bytes => window.voiceLabPlay(bytes), [...padWav(request.bytes)]);
    const response = await until(() => s.events.find(e => e.event === 'voice.speakFeedback'), 'resolved-date proposal');
    assert.equal(response.state.phase, 'confirmation');
    assert.match(response.state.text, /Thursday/); assert.match(response.state.text, /24/); assert.match(response.state.text, /2026/);
    assert.match(response.state.text, /Flow.*calendar/i);
    assert.deepEqual((await stored()).document, before.document);
    pass(s, 'full resolved date and local-only semantics before any mutation');
    await until(() => s.events.some(e => e.event === 'voice.ttsPlaybackStarted'), 'calendar proposal playback');
    const turn = s.events.length;
    await page.evaluate(bytes => window.voiceLabPlay(bytes), [...padWav(confirm.bytes, 0, 2)]);
    s.failureStage = 'confirmed local removal';
    const after = await until(async () => { const v = await stored(); return !v.document.calendars['2026-09-24'].events.some(e => e.id === 'dentist-lab') && v; }, 'persisted local removal');
    assert.equal(after.revision, before.revision + 1);
    assert.deepEqual(after.document.calendars['2026-09-20'], before.document.calendars['2026-09-20']);
    assert(s.events.slice(turn).some(e => e.event === 'voice.ttsPlaybackCancelled'));
    s.persisted = after; pass(s, 'one approved removal, other date unchanged, output interrupted');
    s.status = 'PASS'; delete s.failureStage;
  } catch (e) { s.error = e.message; console.log(`[FAIL] ${s.id}: ${s.error}`); }
  finally { if (page) { s.screenshot = `${s.id}.png`; await page.screenshot({ path: path.join(out, s.screenshot) }); } await browser?.close(); s.durationMs = Date.now() - started; }
  return s;
}
