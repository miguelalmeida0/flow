import { describe, it, expect, vi } from 'vitest';
import { TranscriptAssembler, deepgramUrl } from './deepgram-stt.mjs';
import { createOpenAiTts } from './openai-tts.mjs';
import { PlaybackCredit } from '../voice.mjs';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';

describe('hosted provider boundaries', () => {
  it('accumulates final segments and preserves repeated words with distinct timing', () => {
    const events = [];
    const assembly = new TranscriptAssembler(event => events.push(event));
    const result = (text, start, end = false) => ({type:'Results',start,duration:1,is_final:true,speech_final:end,channel:{alternatives:[{transcript:text}]}});
    assembly.accept(result('go', 0)); assembly.accept(result('go', 0));
    expect(events.filter(e => e.type === 'transcript.final')).toHaveLength(0);
    assembly.accept(result('go', 1, true)); assembly.accept({type:'UtteranceEnd'});
    expect(events.filter(e => e.type === 'transcript.final').map(e => e.text)).toEqual(['go go']);
    expect(events.filter(e => e.type === 'speech.start')).toHaveLength(1);
  });
  it('pins provider version, PCM format and data opt-out', () => {
    const url = deepgramUrl();
    expect(url.searchParams.get('version')).toBe('2025-04-17.21547');
    expect(url.searchParams.get('mip_opt_out')).toBe('true');
    expect(url.searchParams.get('sample_rate')).toBe('24000');
  });
  it('rejects delayed old utterance boundaries and bounds accumulated text', () => {
    const events=[]; const assembly=new TranscriptAssembler(event=>events.push(event));
    const segment=(text,start,end=false)=>({type:'Results',start,duration:1,is_final:true,speech_final:end,channel:{alternatives:[{transcript:text}]}});
    assembly.accept(segment('first',0,true));assembly.accept(segment('second',2));
    assembly.accept({type:'UtteranceEnd',last_word_end:1});
    expect(events.filter(e=>e.type==='transcript.final')).toHaveLength(1);
    assembly.accept({type:'UtteranceEnd',last_word_end:3});
    expect(events.filter(e=>e.type==='transcript.final').map(e=>e.text)).toEqual(['first','second']);
    assembly.accept(segment('x'.repeat(5000),4));
    expect(()=>assembly.accept(segment('y'.repeat(4000),5))).toThrow('utterance too large');
  });
  it('waits for dictation gap boundary and applies mode changes between utterances', () => {
    const events=[];const assembly=new TranscriptAssembler(event=>events.push(event));assembly.setInputMode('dictation');
    assembly.accept({type:'Results',start:0,duration:1,is_final:true,speech_final:true,channel:{alternatives:[{transcript:'a sentence'}]}});
    expect(events.some(e=>e.type==='transcript.final')).toBe(false);
    assembly.setInputMode('command');assembly.accept({type:'UtteranceEnd',last_word_end:1});
    expect(events.filter(e=>e.type==='transcript.final')).toHaveLength(1);expect(assembly.inputMode).toBe('command');
  });
  it('handles provider errors while paused and guards staging memory', async () => {
    const response=new PassThrough({highWaterMark:16384});response.statusCode=200;
    const requestImpl=(_url,_options,callback)=>{const req=new EventEmitter();req.destroy=()=>{};req.end=()=>callback(response);return req;};
    const adapter=createOpenAiTts({apiKey:'test',requestImpl});
    const stream=await adapter.open('hello',{signal:new AbortController().signal});
    response.emit('error',new Error('private upstream details'));
    await expect(stream.read(3840)).rejects.toThrow('speech stream failed');stream.close();
    const second=new PassThrough({highWaterMark:16384});second.statusCode=200;
    const bounded=createOpenAiTts({apiKey:'test',requestImpl:(_url,_options,callback)=>{const req=new EventEmitter();req.destroy=()=>{};req.end=()=>callback(second);return req;}});
    const output=await bounded.open('hello',{signal:new AbortController().signal});
    second.write(Buffer.alloc(48001));await new Promise(resolve=>setImmediate(resolve));
    expect(second.destroyed).toBe(true);await expect(output.read(3840)).rejects.toThrow('speech staging overflow');
  });
  it('bounds speech text before making a provider request', async () => {
    const request = vi.fn();
    const adapter = createOpenAiTts({apiKey:'test',requestImpl:request});
    await expect(adapter.open('x'.repeat(601), {signal:new AbortController().signal})).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it('streams more than five seconds with a one-second playback window', async () => {
    const credit = new PlaybackCredit({stallMs:100});
    let maximum = 0;
    for (let i = 0; i < 70; i++) {
      await credit.take(3840);
      const sequence = credit.sent(3840);
      maximum = Math.max(maximum, credit.outstanding);
      credit.ack(sequence);
    }
    expect(maximum).toBeLessThanOrEqual(48000);
    expect(credit.totalSent).toBeGreaterThan(240000);
    credit.close();
  });
  it('does not invent credit from duplicate ACKs and aborts a stalled consumer', async () => {
    const credit = new PlaybackCredit({stallMs:10});
    await credit.take(48000); const sequence = credit.sent(48000);
    credit.ack(sequence); credit.ack(sequence);
    await credit.take(48000); credit.sent(48000);
    await expect(credit.take(2)).rejects.toThrow('playback stalled');
    credit.close();
  });
});
