import { writeFileSync, mkdirSync, cpSync } from 'node:fs';
import path from 'node:path';
const json = value => JSON.stringify(value, (key, value) => /^(?:token|authorization|voiceToken|desktopToken)$/i.test(key) ? '[redacted]' : typeof value === 'string' ? value.replace(/([?&]token=)[^&\s"']+/g, '$1[redacted]') : value, 2);
export function saveReport(out, report) {
  for (const s of report.scenarios) {
    s.browserInstanceId ??= `${path.basename(out)}:${s.id}`;
    const first = name => s.events?.find(e => e.event === name || e.event === 'voice.companionEvent' && e.state.type === name);
    const delta = (a, b) => first(a) && first(b) ? Math.round(first(b).at - first(a).at) : null;
    s.latency = { pcmFirstMs: first('voice.micPcm')?.at ?? null, speechToPartialMs: delta('speech.start', 'transcript.partial'), speechToFinalMs: delta('speech.start', 'transcript.final'), endpointToFinalMs: delta('endpoint.detected', 'transcript.final'), wakeMs: delta('speech.start', 'voice.localWakeDetected'), finalToResponseMs: delta('transcript.final', 'voice.speakFeedback'), synthesisToPlaybackMs: delta('tts.start', 'voice.ttsPlaybackStarted') };
    const reply = s.inputs?.find(i => /^(confirm|no|wait|never mind)\./i.test(i.text));
    const cancelled = reply && s.events?.find(e => e.event === 'voice.ttsPlaybackCancelled' && e.at >= reply.at);
    s.latency.bargeInMs = cancelled ? Math.round(cancelled.at - reply.at) : null;
    const finals = (s.events ?? []).map((e, i) => ({ e, i })).filter(({ e }) => e.event === 'voice.companionEvent' && e.state.type === 'transcript.final');
    // Dictation deliberately has no spoken response. Never measure a later
    // command's response against the preceding dictation final.
    const firstTurn = finals.length ? s.events.slice(finals[0].i, finals[1]?.i ?? s.events.length) : [];
    const firstResponse = firstTurn.find(e => e.event === 'voice.speakFeedback');
    s.latency.finalToResponseMs = firstResponse ? Math.round(firstResponse.at - finals[0].e.at) : null;
    s.correlations = finals.map(({ e, i }, index) => {
      const turn = s.events.slice(i, finals[index + 1]?.i ?? s.events.length);
      const dispatch = turn.find(e => e.event === 'voice.finalTranscriptToKernel');
      const kernel = turn.find(e => e.event === 'voice.kernelDispatch');
      const trace = s.traces?.find(t => t.transcript === dispatch?.state.transcript);
      const lifecycle = s.events.slice(0, i + 1).filter(v => v.event === 'voice.companionEvent' && v.state.utteranceId === e.state.utteranceId);
      const endpoint = lifecycle.find(v => v.state.type === 'endpoint.detected');
      const flushStart = lifecycle.find(v => v.state.type === 'stt.flushStart');
      const flushComplete = lifecycle.find(v => v.state.type === 'stt.flushComplete');
      return { scenarioId: s.id, browserInstanceId: s.browserInstanceId, tabId: e.tabId,
        sessionId: e.state.sessionId, sttUtteranceId: e.state.utteranceId,
        turnId: kernel?.state.turnId ?? trace?.commandId ?? null,
        semanticPlanId: kernel?.state.planId ?? null,
        proposalId: kernel?.state.proposalId ?? trace?.pendingAuthority?.id ?? null,
        proposalRevision: trace?.pendingAuthority?.revision ?? null,
        kernelExecutionId: trace?.transactionId ?? kernel?.state.executionId ?? (kernel ? s.kernelExecutionId : null) ?? null,
        ttsPlaybackId: turn.find(e => e.event === 'voice.ttsPlaybackStarted')?.state.playbackId ?? null,
        finalToResponseMs: turn.find(v => v.event === 'voice.speakFeedback') ? Math.round(turn.find(v => v.event === 'voice.speakFeedback').at - e.at) : null,
        lastSpeechAudioMs: endpoint?.state.lastSpeechMs ?? null,
        silenceStartAt: lifecycle.filter(v => v.state.type === 'audio.silenceStart').at(-1)?.at ?? null,
        endpointAt: endpoint?.at ?? null, flushStartAt: flushStart?.at ?? null,
        flushCompleteAt: flushComplete?.at ?? null, finalAt: e.at,
        endpointToFinalMs: endpoint ? Math.round(e.at - endpoint.at) : null,
        flushMs: flushStart && flushComplete ? Math.round(flushComplete.at - flushStart.at) : null };
    });
  }
  report.overall = report.error || report.scenarios.some(s => s.status !== 'PASS') || !report.scenarios.length ? 'FAIL' : 'PASS';
  report.safety = Object.fromEntries(['unauthorizedMutations', 'duplicateMutations', 'staleApprovals', 'fabricatedSuccess'].map(key => {
    const measured = report.scenarios.filter(s => Number.isFinite(s.safety?.[key]));
    return [key, { count: measured.length ? measured.reduce((sum, s) => sum + s.safety[key], 0) : null, scenarios: measured.map(s => s.id) }];
  }));
  report.wakeCurve = report.scenarios.filter(s => /^wake-\d+db$/.test(s.id)).map(s => ({ id: s.id, db: s.db, status: s.status, transcript: s.transcript, latency: s.latency, fixture: s.fixture }));
  writeFileSync(path.join(out, 'wake-curve.json'), JSON.stringify(report.wakeCurve, null, 2));
  writeFileSync(path.join(out, 'report.json'), json(report));
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const rows = report.scenarios.map(s => `<tr class="${s.status}"><td>${escape(s.id)}</td><td>${s.status}</td><td>${escape(s.failureStage ?? '')}</td><td>${Math.round(s.durationMs ?? 0)} ms</td><td>${s.latency.endpointToFinalMs ?? '—'} ms</td></tr>`).join('');
  const details = report.scenarios.map(s => `<details><summary>${escape(s.id)} — ${s.status}</summary><p>${escape(s.error ?? '')}</p><code>npm run test:voice:autopilot -- --scenario ${escape(s.id)}</code>${s.screenshot ? `<p><img width="720" src="${escape(s.screenshot)}"></p>` : ''}<pre>${escape(json(s))}</pre></details>`).join('');
  const wakeRows = report.wakeCurve.map(s => `<tr><td>${s.db} dB</td><td>${s.status}</td><td>${escape(s.transcript ?? '')}</td><td>${s.fixture?.rms?.toFixed(5) ?? '—'}</td><td>${s.latency.wakeMs ?? '—'} ms</td></tr>`).join('');
  const timelines = report.scenarios.filter(s => s.events?.length).map(s => `<details><summary>${escape(s.id)} — timeline</summary><table><tr><th>Time</th><th>Tab</th><th>Boundary</th><th>Metadata</th></tr>${s.events.filter(e => e.event !== 'voice.micPcm' && !['audio.rms', 'audio.frame', 'tts.audio'].includes(e.state?.type)).map(e => `<tr><td>${Math.round(e.at)} ms</td><td>${escape(e.tabId)}</td><td>${escape(e.state?.type ?? e.event)}</td><td>${escape(JSON.stringify(e.state))}</td></tr>`).join('')}</table></details>`).join('');
  writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Flow voice autopilot</title><style>body{font:16px system-ui;margin:40px;color:#16332f;background:#f6faf9}table{border-collapse:collapse}td,th{padding:12px;border:1px solid #abc;text-align:left;overflow-wrap:anywhere}pre{white-space:pre-wrap;font-size:12px}details{margin:20px 0}img{max-width:100%}.PASS td:nth-child(2){color:#086a3b}.FAIL td:nth-child(2){color:#b42318}</style><h1>Flow voice autopilot — ${report.overall}</h1><p>${escape(report.coverage)}</p><h2>Environment</h2><pre>${escape(JSON.stringify(report.environment, null, 2))}</pre><h2>Scenarios</h2><table><tr><th>Scenario</th><th>Result</th><th>Failure stage</th><th>Duration</th><th>Endpoint → final</th></tr>${rows}</table><h2>Digital wake curve</h2><table><tr><th>Level</th><th>Result</th><th>Transcript</th><th>RMS</th><th>Wake</th></tr>${wakeRows}</table><h2>Observed safety counts</h2><pre>${escape(JSON.stringify(report.safety, null, 2))}</pre><h2>Timelines</h2>${timelines}<h2>Rendered QA and full evidence</h2>${details}`);
  const latest = path.resolve('artifacts/voice-autopilot/latest');
  mkdirSync(latest, { recursive: true });
  for (const file of ['index.html', 'report.json', 'wake-curve.json', ...report.scenarios.map(s => s.screenshot).filter(Boolean)]) cpSync(path.join(out, file), path.join(latest, file));
}
