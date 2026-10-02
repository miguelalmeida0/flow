import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { browserContext, observe, until, event, pass } from './native.mjs';
import { installAudioInput } from './browser-audio.mjs';
import { speech } from './speech.mjs';
import { padWav } from './wav.mjs';
import { trimWav, wav } from './wav.mjs';
import assert from 'node:assert/strict';

export const reactiveDefinitions = ['reactive-mic', 'journal-dictation', 'journal-delete-undo', 'confirm-barge-in', 'no-barge-in', 'wait-barge-in', 'never-mind-barge-in', 'self-echo'].map(id => ({ id, reactive: true }));
async function command(page, text) {
  const field = page.getByRole('textbox', { name: 'Tell Flow what to change' });
  if (!await field.isVisible()) await page.getByRole('button', { name: 'Open Flow command', exact: true }).click();
  await field.fill(text); await field.press('Enter');
}

export async function reactive(def, services, out, shared) {
  const behavior = def.behavior ?? def.id;
  const s = { id: def.id, lane: 'B — headed reactive microphone', status: 'FAIL', checks: [], events: [], errors: [] };
  if (def.measuredReply) s.benchmarkReply = def.measuredReply;
  let launch, page, unobserve; const start = performance.now();
  try {
    console.log(`[RUN] ${s.id}`);
    const undoText = 'Undo that.';
    const deleteText = def.deleteText ?? 'Delete entry.';
    const texts = ['Flow, add new friend called Anita.', 'This is the first sentence.', 'This is the second sentence.', deleteText, 'Confirm.', undoText, 'No.', 'Wait.', 'Never mind.'];
    for (const extra of [def.replyText, def.redoAfterUndo ? 'Redo that.' : null]) if (extra && !texts.includes(extra)) texts.push(extra);
    const fixtures = new Map();
    for (const text of texts) fixtures.set(text, await speech(text, ['Confirm.', 'Yes.', 'No.', 'Wait.', 'Cancel.', 'Never mind.'].includes(text) ? 'Samantha' : undefined));
    if (def.replySegments) {
      const segments = [];
      for (const text of def.replySegments) segments.push(await speech(text, 'Samantha'));
      fixtures.set(def.replyText, { bytes: wav(Buffer.concat(segments.flatMap((p, i) => [...(i ? [Buffer.alloc(Math.round((def.replyPauseMs ?? 350) * 48))] : []), trimWav(p.bytes)]))),
        fixture: { text: def.replyText, segments: segments.map(p => p.fixture), separationMs: def.replyPauseMs ?? 350 } });
    }
    s.fixtures = [...fixtures.values()].map(f => f.fixture);
    launch = shared ?? await browserContext(services);
    if (!shared) await launch.context.addInitScript(installAudioInput);
    page = shared?.page ?? await launch.context.newPage(); unobserve = observe(page, s);
    if (shared) { s.browserInstanceId = shared.session; s.lane = 'B — long-lived reactive digital benchmark'; }
    else {
      await page.goto('http://localhost:5173/?flowVoiceDebug=1');
      s.failureStage = 'reactive mic live';
      await until(() => event(s, 'voice.micLive'), s.failureStage);
    }
    const play = async (text, trailing = 2, at) => {
      const count = s.events.filter(e => e.event === 'voice.companionEvent' && e.state.type === 'transcript.final').length;
      const injected = await page.evaluate(({ bytes, at }) => window.voiceLabPlay(bytes, 1, at), { bytes: [...padWav(fixtures.get(text).bytes, 0, trailing)], at });
      (s.inputs ??= []).push({ text, ...injected });
      return async () => until(() => s.events.filter(e => e.event === 'voice.companionEvent' && e.state.type === 'transcript.final')[count], `STT final: ${text}`);
    };
    if (behavior !== 'reactive-mic') {
      await command(page, 'Open journal');
      await page.locator('[data-action-id="journal.create"]').click();
      await page.locator('#journal-title').fill('Voice lab');
      await page.locator('#journal-title').blur();
      await page.locator('[data-action-id="journal.record-start"]').click();
      await page.locator('[data-action-id="journal.record-stop"]').waitFor();
      const first = trimWav(fixtures.get(texts[1]).bytes), second = trimWav(fixtures.get(texts[2]).bytes);
      const combined = wav(Buffer.concat([first, Buffer.alloc(Math.round((def.pauseMs ?? 500) * 48)), second, Buffer.alloc(96000)]));
      s.failureStage = 'Journal dictation';
      const requestsBeforeDictation = s.capabilities?.length ?? 0;
      await page.evaluate(bytes => window.voiceLabPlay(bytes), [...combined]);
      const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('flow.life.v3')));
      const expected = 'This is the first sentence. This is the second sentence.';
      const entry = await until(async () => (await stored()).document.studio.journalEntries.find(e => e.text === expected), 'exact Journal text');
      s.entryId = entry.id; pass(s, 'exact dictation persisted without duplicated partials');
      assert(!(s.capabilities ?? []).slice(requestsBeforeDictation).some(r => r.capability?.startsWith('ai.') && r.capability !== 'ai.status'), 'Dictation must not call assistant reasoning');
      await page.locator('[data-action-id="journal.record-stop"]').click();
      await page.locator('[data-action-id="journal.save"]').click();
      if (behavior === 'journal-dictation') {
        if (!shared) await page.reload();
        assert.equal((await stored()).document.studio.journalEntries.find(e => e.id === entry.id).text, expected);
        pass(s, 'save/reopen preserves exact text and identity');
      } else {
        s.failureStage = 'spoken delete proposal';
        const before = s.events.length;
        const beforeDelete = await stored();
        const deleted = await play(deleteText); await deleted();
        await until(() => s.events.slice(before).find(e => e.event === 'voice.ttsPlaybackStarted'), 'proposal playback');
        assert((await stored()).document.studio.journalEntries.some(e => e.id === entry.id), 'Delete occurred without approval');
        if (behavior === 'self-echo') {
          await until(() => s.events.slice(before).find(e => e.event === 'voice.companionEvent' && e.state.type === 'tts.done'), 'complete synthesized assistant echo');
          assert.match(s.events.slice(before).find(e => e.event === 'voice.speakFeedback').state.text, /confirm/i);
          assert(!s.events.slice(before).some(e => e.event === 'voice.ttsPlaybackComplete'), 'Echo starts while assistant playback is active');
          const ownPcm = await page.evaluate(() => window.voiceLabOutput);
          assert(ownPcm.length > 0);
          const beforeEcho = s.events.length;
          const echoInput = await page.evaluate(bytes => window.voiceLabPlay(bytes), [...padWav(wav(Buffer.from(ownPcm)), 0, 2)]);
          await until(() => s.events.slice(beforeEcho).find(e => e.event === 'voice.selfEchoRejected'), 'assistant echo rejected');
          await until(() => page.evaluate(id => window.voiceLabEndedInputs.includes(id), echoInput.id), 'complete echo fixture PCM played');
          const checkpoint = s.events.filter(e => e.event === 'voice.micFrameSent').at(-1)?.state;
          assert(checkpoint, 'Echo has an observed microphone PCM cursor');
          await until(() => s.events.slice(beforeEcho).some(e => e.state?.type === 'audio.frame'
            && e.state.sessionId === checkpoint.sessionId && e.state.captureId === checkpoint.captureId
            && e.state.audioMs * 24 >= checkpoint.lastSample), 'worker consumed complete echo PCM');
          assert(!s.events.slice(beforeEcho).some(e => e.event === 'voice.finalTranscriptToKernel'), 'No sentence of assistant echo dispatches');
          assert((await stored()).document.studio.journalEntries.some(e => e.id === entry.id));
          pass(s, 'actual assistant audio rejected; zero approvals or mutations');
        }
        const reply = def.replyText ?? (behavior === 'no-barge-in' ? 'No.' : behavior === 'wait-barge-in' ? 'Wait.' : behavior === 'never-mind-barge-in' ? 'Never mind.' : 'Confirm.');
        let replyAt;
        if (def.replyOffsetMs !== undefined) {
          await until(() => s.events.slice(before).some(e => e.state?.type === 'tts.done'), 'proposal synthesis completed for scheduled overlap');
          const chunks = s.events.slice(before).filter(e => e.event === 'voice.ttsPlaybackStarted');
          const first = chunks[0], last = chunks.at(-1);
          assert(first && last, 'Real proposal output has scheduled sources');
          const predictedEndAt = first.at + (last.state.startAt - first.state.startAt) * 1000 + last.state.durationMs;
          replyAt = predictedEndAt + def.replyOffsetMs;
          s.turnTaking = { offsetMs: def.replyOffsetMs, predictedPlaybackEndAt: predictedEndAt,
            evidence: 'Browser scheduling relative to observed source start, not physical speaker timing' };
        }
        s.failureStage = `spoken ${reply} during playback`;
        const interrupted = s.events.length;
        const final = await play(reply, 2, replyAt); const recognizedReply = await final();
        if (def.replySegments) assert(recognizedReply.state.text.trim(), 'Natural reply produced a real final');
        else assert.equal(recognizedReply.state.text.toLowerCase().replace(/[.!?]/g, '').trim(), reply.toLowerCase().replace(/[.!?]/g, ''), 'Real STT reply text');
        if (behavior !== 'self-echo' && def.replyOffsetMs === undefined) {
          const cancelled = await until(() => s.events.slice(interrupted).find(e => e.event === 'voice.ttsPlaybackCancelled'), 'playback cancellation requested');
          await until(() => s.events.slice(interrupted).filter(e => e.event === 'voice.ttsSourceEnded' && e.state.cancelled && e.state.playbackId === cancelled.state.playbackId).length === cancelled.state.sources, 'all interrupted audio sources ended');
          pass(s, 'all interrupted AudioBufferSource nodes emitted ended callbacks');
        }
        pass(s, `${reply} recognized from real browser microphone PCM`);
        if (def.replyOffsetMs !== undefined) {
          assert.equal(new Set(s.events.filter(e => e.event === 'voice.micFrameSent').map(e => e.state.captureId)).size, 1, 'Listening capture stays live across the output boundary');
          assert(!s.events.slice(interrupted).some(e => e.event === 'voice.localWakeDetected'), 'Reply needs no new wake');
          pass(s, `reply at ${def.replyOffsetMs} ms has no capture or wake dead zone`);
        }
        if (reply === 'Confirm.' || reply === 'Yes.') {
          await until(async () => !(await stored()).document.studio.journalEntries.some(e => e.id === entry.id), 'confirmed deletion');
          const deletionIds = state => [...state.past.map(h => h.lastTransaction), state.lastTransaction].filter(t => t?.actionTypes?.includes('journal.delete')).map(t => t.id);
          const priorDeletes = new Set(deletionIds(beforeDelete));
          s.deletionExecutionIds = [...new Set(deletionIds(await stored()))].filter(id => !priorDeletes.has(id));
          assert.equal(s.deletionExecutionIds.length, 1, 'Exactly one deletion transaction');
          s.safety = { unauthorizedMutations: 0, duplicateMutations: 0 };
          pass(s, 'exact entry deleted after spoken approval');
          await until(() => s.events.slice(interrupted).find(e => e.event === 'voice.ttsPlaybackComplete'), 'delete response completed');
          s.failureStage = 'spoken undo restore';
          const undoStart = s.events.length;
          const undone = await play(undoText); const undoFinal = await undone();
          s.undoTranscript = undoFinal.state.text;
          assert.match(s.undoTranscript, /^undo that[.!?,]*$/i, 'Real STT Undo reply');
          pass(s, `real STT Undo: ${JSON.stringify(s.undoTranscript)}`);
          await until(async () => (await stored()).document.studio.journalEntries.some(e => e.id === entry.id && e.text === expected), 'undo restores same entity');
          pass(s, 'undo restores identical entity and text');
          await until(() => s.events.slice(undoStart).some(e => e.event === 'voice.ttsPlaybackComplete'), 'undo response playback complete');
          await until(() => s.events.slice(undoStart).some(e => e.event === 'voice.state' && e.state.to === 'LISTENING' && e.state.event === 'speakDone'), 'listening after undo playback');
          pass(s, 'next turn playback completes and listening resumes');
          if (def.redoAfterUndo) {
            const redoStart = s.events.length;
            const redone = await play('Redo that.');
            const redoFinal = await redone();
            assert.match(redoFinal.state.text, /^redo(?: that)?[.!?,]*$/i, 'Real STT Redo reply');
            await until(async () => !(await stored()).document.studio.journalEntries.some(e => e.id === entry.id), 'redo reapplies the same deletion');
            await until(() => s.events.slice(redoStart).some(e => e.event === 'voice.ttsPlaybackComplete'), 'redo playback complete');
            pass(s, 'spoken redo reapplies the approved deletion once');
          }
        } else {
          assert((await stored()).document.studio.journalEntries.some(e => e.id === entry.id));
          {
            await until(() => s.events.slice(interrupted).find(e => e.event === 'voice.ttsPlaybackComplete'), 'cancellation response completed');
            const late = await play('Confirm.'); await late();
            assert((await stored()).document.studio.journalEntries.some(e => e.id === entry.id), 'Stale approval deleted cancelled entry');
            pass(s, 'late confirm cannot approve the cancelled proposal');
            s.safety = { unauthorizedMutations: 0, staleApprovals: 0 };
          }
        }
      }
      s.persisted = await stored(); s.status = 'PASS'; delete s.failureStage; return s;
    }
    const final = await play(texts[0]);
    s.failureStage = 'reactive PCM';
    await until(() => event(s, 'voice.micPcm'), s.failureStage); pass(s, 'headed virtual microphone PCM');
    s.failureStage = 'real STT final';
    await final(); pass(s, 'real STT final');
    s.status = 'PASS'; delete s.failureStage;
  } catch (e) { s.error = e.message; console.log(`[FAIL] ${s.id}: ${s.error}`); }
  finally {
    if (page && !page.isClosed()) {
      s.persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('flow.life.v3'))).catch(() => null);
      s.traces = await page.evaluate(() => window.__FLOW_COMMAND_TRACES__ ?? []).catch(() => []);
      const input = await page.evaluate(() => window.voiceLabInput ?? []).catch(() => []);
      writeFileSync(path.join(out, `${s.id}-captured.wav`), wav(Buffer.concat(input.map(c => Buffer.from(c)))));
      s.screenshot = `${s.id}.png`;
      await page.screenshot({ path: path.join(out, s.screenshot) }).catch(() => { delete s.screenshot; });
    }
    unobserve?.();
    if (!shared) await launch?.close(); s.durationMs = performance.now() - start;
  }
  return s;
}
