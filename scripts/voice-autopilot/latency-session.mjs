import assert from 'node:assert/strict';
import { browserContext, observe, until, event } from './native.mjs';
import { installAudioInput } from './browser-audio.mjs';
import { speech } from './speech.mjs';

// Finish fixture synthesis before opening the live STT websocket: a cache miss
// must never create a competing companion owner during a measured conversation.
export async function prepareLatencyFixtures(definitions) {
  for (const def of definitions) {
    if (def.text) {
      await speech(def.text, def.systemVoice);
      for (const segment of def.segments ?? []) await speech(segment.text, segment.voice);
    } else {
      const texts = ['Flow, add new friend called Anita.', 'This is the first sentence.', 'This is the second sentence.',
        def.deleteText ?? 'Delete entry.', 'Confirm.', 'Undo that.', 'No.', 'Wait.', 'Never mind.', def.replyText, def.redoAfterUndo ? 'Redo that.' : null];
      for (const text of texts.filter(Boolean)) await speech(text, ['Confirm.', 'Yes.', 'No.', 'Wait.', 'Cancel.', 'Never mind.'].includes(text) ? 'Samantha' : undefined);
    }
  }
}

export async function openLatencySession(services) {
  const session = await browserContext(services);
  try {
    // Harness-only exposure of existing public lifecycle controls. No reducer,
    // recognition, dispatch, PCM, model response or production file is changed.
    await session.context.route('**/src/features/voice/useKyutaiVoiceSession.ts', async route => {
      const response = await route.fetch();
      const source = await response.text();
      const anchor = 'return { state, available, wake, sleep, cancel, speak };';
      assert.equal(source.split(anchor).length, 2, 'Public voice controls instrumentation anchor must be unique');
      await route.fulfill({ response, body: source.replace(anchor,
        `window.voiceLabSessionControl = { sleep, cancel, state: () => stateRef.current };\n  ${anchor}`) });
    });
    await session.context.addInitScript(installAudioInput);
    session.page = await session.context.newPage();
    const startup = { id: 'startup', events: [], errors: [] };
    const unobserve = observe(session.page, startup);
    await session.page.clock.setFixedTime(new Date('2026-09-20T12:00:00+02:00'));
    await session.page.goto('http://localhost:5173/?flowVoiceDebug=1');
    await until(() => event(startup, 'voice.micLive') && event(startup, 'voice.micPcm'), 'persistent microphone PCM');
    session.startup = startup;
    unobserve();
    const baseline = await session.page.evaluate(() => JSON.parse(localStorage.getItem('flow.life.v3')));
    const identity = await session.page.evaluate(() => window.voiceLabIdentity());
    session.identity = identity;
    session.reset = async () => {
      assert.equal(session.context.pages().length, 1, 'Latency must retain exactly one page');
      await until(() => session.page.evaluate(() => window.voiceLabActiveInputs === 0), 'previous fixture drained');
      await session.page.evaluate(baseline => {
        const control = window.voiceLabSessionControl;
        if (!control) throw new Error('Harness lifecycle controls unavailable');
        control.cancel();
        control.sleep();
        const key = 'flow.life.v3';
        const oldValue = localStorage.getItem(key);
        const next = structuredClone(baseline);
        next.revision = JSON.parse(oldValue).revision + 1;
        const newValue = JSON.stringify(next);
        localStorage.setItem(key, newValue);
        window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, storageArea: localStorage }));
        window.voiceLabInput = []; window.voiceLabOutput = []; window.voiceLabEndedInputs = [];
        window.__FLOW_COMMAND_TRACES__ = [];
      }, baseline);
      await until(() => session.page.evaluate(() => window.voiceLabSessionControl.state() === 'SLEEPING'), 'sleep reset without capture restart');
      assert.deepEqual(await session.page.evaluate(() => window.voiceLabIdentity()), identity, 'AudioContext and microphone stream must survive resets');
    };
    return session;
  } catch (error) { await session.close(); throw error; }
}

// One resource owner, regardless of N or scenario outcome. Tests exercise this
// exact loop with a launch spy; real runs additionally assert global counters.
export async function runLongLivedSamples({ definitions, samples, openSession, runSample, onResult }) {
  const session = await openSession();
  console.log(`[VOICE LAB] reusing browser for ${samples} samples`);
  try {
    for (let index = 0; index < samples; index++) {
      await session.reset();
      const result = await runSample(definitions[index % definitions.length], index, session);
      await onResult(result, index);
      // A failed turn may leave synthesis or approval in flight. Stop safely;
      // never mask it by relaunching or contaminating the next measurement.
      if (result.status !== 'PASS') break;
    }
  } finally { await session.close(); }
}
