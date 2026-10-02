// Browser observation clock only. Worker monotonic clocks are retained in
// events, never subtracted from performance.now() across clock domains.
export const metrics = {
  wakeMs: 'Legacy speech.start → wake (after decoder setup)',
  speechToPartialMs: 'Legacy speech.start → first partial',
  speechToUsefulPartialMs: 'Legacy speech.start → first useful partial',
  detectedToWakeMs: 'Worker PCM detection → wake accepted',
  detectedToUsefulPartialMs: 'Worker PCM detection → first useful partial',
  endpointToFinalMs: 'Endpoint decision → final',
  finalToResponseMs: 'Final → response text',
  synthesisToPlaybackMs: 'TTS start → playback scheduled (legacy)',
  bargeInMs: 'Fixture start → cancel requested (legacy)',
  ttsToAudibleMs: 'TTS request → physical audible start',
  bargeInToPhysicalStopMs: 'Speech onset → physical playback stop',
  workerDetectionToUsefulMs: 'Detection → useful partial (same worker epoch)',
  micSpeechToUsefulMs: 'Digital speech frame sent → useful partial',
  speechEndToFinalMs: 'Digital last voiced frame sent → final',
  closedReplyEndToDecisionMs: 'Closed reply last voiced frame → action result',
  finalToDecisionMs: 'Final → action result',
  responseToPlayableMs: 'Response ready → first playable AudioBuffer',
  bargeSpeechToStoppedMs: 'Digital barge speech frame → all source-ended callbacks',
  bargeDetectedToStoppedMs: 'Detection observed → all source-ended callbacks',
  cancelToStoppedMs: 'Cancel requested → all source-ended callbacks',
  speechEndToPlayableMs: 'Digital last voiced frame → first playable response',
  playbackEndToListeningMs: 'Playback complete → listening state',
};

// A lone decoder fragment such as "F" is not a useful word. Require a
// lexical word followed by an observed delimiter, without predicting text.
export const hasUsefulPartial = text => /[\p{L}\p{N}][\p{L}\p{M}\p{N}'’]*(?:\s|[,.!?;:])/u.test(text.trimStart());

export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = p => sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null;
  return { min: sorted[0] ?? null, p50: percentile(.5), p95: percentile(.95), max: sorted.at(-1) ?? null, count: sorted.length };
}

export function summarizeLatency(report) {
  return Object.fromEntries(Object.keys(metrics).map(key => [key, distribution(report.scenarios.map(s => s.latency?.[key]))]));
}

export function observationClocks(events) {
  const tabs = new Map(), groups = [];
  for (const event of events) {
    const tab = event.tabId ?? 'main';
    let group = tabs.get(tab);
    if (!group || event.at < group.events.at(-1).at) {
      group = { tab, events: [] };
      tabs.set(tab, group);
      groups.push(group);
    }
    group.events.push(event);
  }
  return groups;
}

export function latencyHtml(report, escape) {
  const current = summarizeLatency(report);
  const before = report.latencyBaseline ? summarizeLatency(report.latencyBaseline) : null;
  const cell = value => Number.isFinite(value) ? `${Math.round(value)} ms` : 'NOT MEASURED';
  const rows = Object.entries(metrics).map(([key, title]) => {
    const a = before?.[key], b = current[key];
    const delta = p => Number.isFinite(a?.[p]) && Number.isFinite(b[p]) ? b[p] - a[p] : null;
    return `<tr><td>${escape(title)}</td><td>${b.count}</td><td>${report.scenarios.length - b.count}</td><td>${cell(a?.p50)}</td><td>${cell(b.p50)}</td><td>${cell(delta('p50'))}</td><td>${cell(a?.p95)}</td><td>${cell(b.p95)}</td><td>${cell(delta('p95'))}</td></tr>`;
  }).join('');
  const waterfalls = report.scenarios.flatMap(s => observationClocks(s.events ?? []).map((group, index) => {
    const events = group.events.filter(e => !['voice.micPcm', 'voice.micFrameSent', 'voice.feedback', 'voice.available'].includes(e.event) && !['audio.frame', 'audio.rms', 'tts.audio'].includes(e.state?.type));
    if (!events.length) return '';
    const start = events[0].at, duration = Math.max(1, events.at(-1).at - start);
    return `<details><summary>${escape(s.id)} / ${escape(group.tab)} / document ${index + 1} — latency waterfall</summary><p>One browser observation clock; physical speaker output is NOT MEASURED. Correlation metadata remains in the full trace.</p>${events.map(e => `<div style="display:grid;grid-template-columns:280px 1fr 100px;gap:8px;font-size:12px"><span>${escape(e.state?.type ?? e.event)}</span><span style="background:#e1e9e6"><i style="display:block;margin-left:${100 * (e.at - start) / duration}%;width:2px;height:16px;background:#086a3b"></i></span><span>${Math.round(e.at - start)} ms</span></div>`).join('')}</details>`;
  })).join('');
  const turns = report.scenarios.flatMap(s => s.observedTurns ?? []);
  const stages = [...new Set(turns.flatMap(t => Object.keys(t.budget ?? {})))];
  const budgets = stages.map(stage => ({ stage, ms: distribution(turns.map(t => t.budget?.[stage]?.ms)), share: distribution(turns.map(t => t.budget?.[stage]?.percentOfAcquisitionToPlayable)) })).sort((a, b) => (b.ms.p50 ?? -1) - (a.ms.p50 ?? -1));
  const budgetRows = budgets.map(b => `<tr><td>${escape(b.stage)}</td><td>${b.ms.count}</td><td>${cell(b.ms.p50)}</td><td>${cell(b.ms.p95)}</td><td>${Number.isFinite(b.share.p50) ? b.share.p50.toFixed(1) + '%' : 'NOT MEASURED'}</td></tr>`).join('');
  return `<h2>Latency — before / after</h2><p>${report.scenarios.filter(s => s.status !== 'PASS').length} failed scenarios. Percentiles describe observed timings only; missing or timed-out boundaries are not zero and can bias observed percentiles downward. Missing includes not-applicable boundaries. Scheduling and cancellation-request timings are not physical audible-output measurements.</p><table><tr><th>Boundary</th><th>N</th><th>Missing</th><th>Before p50</th><th>After p50</th><th>Delta p50</th><th>Before p95</th><th>After p95</th><th>Delta p95</th></tr>${rows}</table><h2>Critical-path budget</h2><p>Sorted by measured median contribution. Percentages use each turn's digital speech acquisition → first playable response. Streaming stages overlap speech and cannot be added as a serial sum. Worker durations use one explicit worker epoch; browser durations use one document. Missing transport and physical sensors remain unknown. Stack temperature is recorded separately; first browser turn does not prove a cold model.</p><table><tr><th>Stage</th><th>N</th><th>p50</th><th>p95</th><th>Median share of whole turn</th></tr>${budgetRows}</table><h2>Waterfalls</h2>${waterfalls}`;
}
