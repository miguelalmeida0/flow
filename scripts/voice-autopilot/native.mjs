import { chromium } from '@playwright/test';
import { existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { padWav, metadata, readWav, wav, trimWav } from './wav.mjs';
import { speech } from './speech.mjs';

export const definitions = [
  { id: 'add-anita', text: 'Flow, add new friend called Anita.', person: 'Anita', segments: [{ text: 'Flow, add new friend called' }, { text: 'Anita.' }] },
  ...[0, -3, -6, -9, -12, -18].map(db => ({ id: `wake-${Math.abs(db)}db`, text: 'Flow, open calendar.', clause: 'open calendar', db })),
  ...['The floor is clean.', 'Please go slowly.', 'Flowers bloom in spring.', 'Follow the yellow road.', 'The workflow is complete.'].map((text, i) => ({ id: `wake-negative-${i + 1}`, text, negative: true })),
  { id: 'friend-named', text: 'Flow, add a new friend named Anita.', person: 'Anita' },
  { id: 'friend-as', text: 'Flow, add Anita as a friend.', person: 'Anita', segments: [{ text: 'Flow.' }, { text: 'Add.' }, { text: 'Anita as a friend.' }] },
  { id: 'friend-joao', text: 'Flow, create a contact called João da Silva.', person: 'João da Silva', segments: [{ text: 'Flow, create a contact called' }, { text: 'João da Silva.', voice: 'Joana' }] },
  { id: 'day-query', text: "Flow, what's my day looking like?", day: true },
  { id: 'reasoner-unavailable', text: "Flow, what's my day looking like?", unavailable: true },
  { id: 'reasoner-unavailable-complex', text: "Flow, what's my day looking like if I skip optional meetings?", unavailable: true, requiresReasoner: true },
  ...['last', 'this', 'next', ''].map(relation => ({ id: `thursday-${relation || 'bare'}`, text: `Flow, open ${relation ? relation + ' ' : ''}Thursday.`, ...(relation ? {} : { segments: [{ text: 'Flow, open' }, { text: 'Thursday.' }] }), date: relation === 'last' || relation === 'this' ? '2026-09-17' : '2026-09-24' })),
];
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function until(fn, label, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await delay(50); }
  throw new Error(`${label}: deadline ${ms}ms exceeded`);
}
export const event = (s, name) => s.events.find(e => e.event === name || e.event === 'voice.companionEvent' && e.state.type === name);
export function pass(s, label) { s.checks.push(label); console.log(`[PASS] ${s.id}: ${label}`); }
export function observe(page, s, tabId = 'main') {
  page.on('request', request => {
    if (!request.url().endsWith('/capability')) return;
    try { const body = request.postDataJSON(); (s.capabilities ??= []).push({ tabId, capability: body?.capability }); } catch { /* no payload or headers recorded */ }
  });
  page.on('console', message => {
    const text = message.text();
    if (text.startsWith('[flow-voice-debug] ')) { try { s.events.push({ scenarioId: s.id, tabId, ...JSON.parse(text.slice(19)) }); } catch { /* Non-JSON diagnostics */ } }
  });
  page.on('pageerror', e => s.errors.push(e.message));
}
export async function browserContext(services, args = []) {
  const executablePath = chromium.executablePath();
  if (!existsSync(executablePath)) execFileSync(process.execPath, ['node_modules/playwright/cli.js', 'install', 'chromium'], { stdio: 'inherit' });
  const browser = await chromium.launch({ executablePath, headless: false,
    args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', ...args] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Berlin', permissions: ['microphone'] });
  // Weather refresh is unrelated to these disposable voice fixtures and
  // otherwise races persisted-state comparisons with external live data.
  await context.route('https://api.open-meteo.com/**', route => route.fulfill({ status: 503, body: 'Weather outside voice-lab coverage' }));
  await context.addInitScript(({ desktopToken, voiceToken }) => {
    localStorage.setItem('flow.desktopCompanion.token', desktopToken);
    localStorage.setItem('flow.voiceCompanion.token', voiceToken);
  }, { desktopToken: services.desktopToken, voiceToken: services.voiceToken });
  return { browser, context };
}
export async function native(def, services, out) {
  const s = { id: def.id, lane: 'A — native browser microphone', status: 'FAIL', checks: [], events: [], errors: [], db: def.db ?? 0 };
  const started = Date.now();
  let browser, page;
  try {
    console.log(`[RUN] ${s.id}`);
    s.failureStage = 'fixture';
    let audio = await speech(def.text, def.systemVoice);
    if (def.segments) {
      const pieces = [];
      for (const segment of def.segments) pieces.push(await speech(segment.text, segment.voice));
      audio = { bytes: wav(Buffer.concat(pieces.flatMap((p, i) => [ ...(i ? [Buffer.alloc(4800)] : []), trimWav(p.bytes) ]))), fixture: { text: def.text, segments: pieces.map(p => p.fixture), separationMs: 100 } };
    }
    const source = readWav(audio.bytes);
    const bytes = padWav(def.playbackRate ? wav(source.pcm, Math.round(source.sampleRate * def.playbackRate)) : audio.bytes, 1, 2, def.db ?? 0);
    const fixture = path.join(out, `${s.id}.wav`);
    writeFileSync(fixture, bytes);
    s.fixture = { ...audio.fixture, ...metadata(bytes), playbackRate: def.playbackRate ?? 1, leadingSilenceMs: 1000, trailingSilenceMs: 2000 };
    s.failureStage = 'browser';
    console.log('      launching headed Chromium; microphone: native WAV');
    const launch = await browserContext(services, [`--use-file-for-fake-audio-capture=${fixture}%noloop`]);
    browser = launch.browser;
    const context = launch.context;
    if (def.unavailable) await context.route('**/capability', async route => {
      const body = route.request().postDataJSON();
      if (body?.capability?.startsWith('ai.')) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Local reasoner unavailable', code: 'model-unavailable' }) });
      else await route.continue();
    });
    page = await context.newPage(); observe(page, s);
    await page.clock.setFixedTime(new Date('2026-09-20T12:00:00+02:00'));
    await page.goto(`${process.env.FLOW_VOICE_APP_URL ?? 'http://localhost:5173/'}?flowVoiceDebug=1`);
    const boundary = async name => { s.failureStage = name; await until(() => event(s, name), name); pass(s, name); };
    await boundary('voice.micLive');
    assert(event(s, 'voice.micLive').state.tracks.every(t => t.readyState === 'live'));
    for (const name of ['voice.micPcm', 'speech.start', 'transcript.partial', 'endpoint.detected', 'stt.flushStart', 'stt.flushComplete', 'transcript.final']) await boundary(name);
    s.transcript = event(s, 'transcript.final').state.text;
    console.log(`[PASS] STT final: ${JSON.stringify(s.transcript)}`);
    const persisted = () => page.evaluate(() => JSON.parse(localStorage.getItem('flow.life.v3')));
    if (def.negative) {
      assert.equal(s.events.filter(e => e.event === 'voice.localWakeDetected').length, 0, 'False wake activation');
      assert.equal(s.events.filter(e => e.event === 'voice.finalTranscriptToKernel').length, 0, 'False wake dispatch');
      assert.equal((await persisted()).document.people.length, 0);
      pass(s, 'no wake / no mutation');
    } else {
      await boundary('voice.finalTranscriptToKernel');
      assert.equal(s.events.filter(e => e.event === 'voice.finalTranscriptToKernel').length, 1, 'Duplicate turn');
      if (def.clause) assert.equal(event(s, 'voice.finalTranscriptToKernel').state.transcript.toLowerCase().replace(/[.!?]$/g, ''), def.clause);
      if (def.person) {
        await boundary('voice.kernelDispatch');
        assert.equal(s.events.filter(e => e.event === 'voice.kernelDispatch').length, 1);
        s.failureStage = 'persisted person';
        const state = await until(async () => { const state = await persisted(); return state.document.people.some(p => p.name === def.person) && state; }, 'persisted person', 5000);
        assert.equal(state.document.people.length, 1);
        s.person = state.document.people[0];
        assert.equal(s.person.name, def.person);
        assert.equal(s.person.avatar?.initials, def.person.split(/\s+/).slice(0, 2).map(p => p[0].toUpperCase()).join(''));
        assert(!s.person.name.startsWith('called '));
        pass(s, `persisted: ${s.person.name} (${s.person.avatar.initials})`);
        assert.equal(state.lastTransaction.source, 'voice');
        assert.deepEqual(state.lastTransaction.actionTypes, ['person.create']);
        s.kernelExecutionId = state.lastTransaction.id;
        s.safety = { duplicateMutations: 0, fabricatedSuccess: 0 };
        await until(() => page.locator(`[data-task-entity-id="${s.person.id}"]`).count(), 'person profile rendered');
        assert.equal(new URL(page.url()).pathname, `${new URL(process.env.FLOW_VOICE_APP_URL ?? "http://localhost:5173/").pathname}people/person/${s.person.id}`);
        pass(s, 'correct profile URL and rendered identity');
      }
      if (def.date) {
        s.failureStage = 'resolved date';
        await until(async () => (await persisted()).temporal.scope.dateKey === def.date, 'resolved date', 5000);
        s.expectedDate = def.date; pass(s, `full date: ${def.date}`);
      }
      await boundary('voice.speakFeedback'); s.response = event(s, 'voice.speakFeedback').state;
      if (def.unavailable && def.requiresReasoner) {
        assert.match(s.response.text ?? s.response.title, /unavailable|offline|couldn.t reach|(?:not|isn.t) responding/i);
        assert.doesNotMatch(s.response.text ?? s.response.title, /try another phrasing/i);
      }
      if (def.unavailable && !def.requiresReasoner) {
        assert.match(s.response.text, /\d+ events in your Flow calendar today/);
        assert.doesNotMatch(s.response.text, /try another phrasing/i);
        pass(s, 'grounded calendar answer remains available without a reasoner');
      }
      if (def.day || def.unavailable && !def.requiresReasoner) {
        const state = await persisted();
        const count = state.document.calendar.events.filter(e => e.dateKey === state.temporal.todayDateKey).length;
        assert(s.response.text.includes(`${count} events in your Flow calendar today`));
        s.expectedCalendarCount = count;
      }
      for (const name of ['tts.start', 'voice.ttsPlaybackStarted', 'voice.ttsPlaybackComplete']) await boundary(name);
      await until(() => s.events.some(e => e.event === 'voice.state' && e.state.to === 'LISTENING' && e.state.event === 'speakDone'), 'listening after playback completion');
      pass(s, 'listening resumed');
    }
    s.status = 'PASS'; delete s.failureStage;
  } catch (error) { s.error = error.message.replace(/token=[^\s]+/g, 'token=[redacted]'); console.log(`[FAIL] ${s.id}: ${s.error}\nReplay: npm run test:voice:autopilot -- --scenario ${s.id}`); }
  finally {
    if (page && !page.isClosed()) {
      s.persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('flow.life.v3'))).catch(() => null);
      s.traces = await page.evaluate(() => window.__FLOW_COMMAND_TRACES__ ?? []).catch(() => []);
      s.url = page.url(); s.screenshot = `${s.id}.png`;
      await page.screenshot({ path: path.join(out, s.screenshot) }).catch(() => { delete s.screenshot; });
    }
    await browser?.close(); s.durationMs = Date.now() - started;
  }
  return s;
}
