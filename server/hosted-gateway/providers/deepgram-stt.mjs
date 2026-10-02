import WebSocket from 'ws';
import { PCM_WINDOW_BYTES } from '../../../shared/hosted-voice-protocol.mjs';
export const DEEPGRAM_MODEL = 'nova-3-general';
export const DEEPGRAM_VERSION = '2025-04-17.21547';
export function deepgramUrl() {
  const url = new URL('wss://api.deepgram.com/v1/listen');
  const parameters = {model:DEEPGRAM_MODEL,version:DEEPGRAM_VERSION,language:'en',encoding:'linear16',sample_rate:'24000',channels:'1',interim_results:'true',endpointing:'700',utterance_end_ms:'1000',vad_events:'true',punctuate:'true',mip_opt_out:'true'};
  for (const [key,value] of Object.entries(parameters)) url.searchParams.set(key,value);
  return url;
}

/** Segment finality and utterance finality are different provider events. */
export class TranscriptAssembler {
  constructor(emit) {
    this.emit=emit; this.segments=[]; this.seen=new Set(); this.turn=0; this.active=false;
    this.inputMode='command'; this.nextInputMode='command'; this.lastEnd=0; this.finalizedEnd=-1; this.characters=0;
  }
  setInputMode(mode) { this.nextInputMode=mode; if(!this.active)this.inputMode=mode; }
  start() {
    if(this.active)return;
    this.active=true; this.turn++; this.emit({type:'speech.start',utteranceId:String(this.turn)});
  }
  finish() {
    const text=this.segments.join(' ').trim();
    if(text)this.emit({type:'transcript.final',text,utteranceId:String(this.turn)});
    if(this.active)this.emit({type:'speech.end',utteranceId:String(this.turn)});
    this.finalizedEnd=this.lastEnd; this.active=false; this.segments=[]; this.characters=0; this.inputMode=this.nextInputMode;
  }
  accept(message) {
    if(message.type==='SpeechStarted') { this.start(); return; }
    if(message.type==='UtteranceEnd') {
      const boundary=Number(message.last_word_end);
      if(Number.isFinite(boundary)&&boundary>this.finalizedEnd&&boundary>=this.lastEnd)this.finish();
      return;
    }
    if(message.type!=='Results')return;
    const text=message.channel?.alternatives?.[0]?.transcript?.trim() ?? '';
    if(text.length>8000)throw new Error('transcript too large');
    const start=Number(message.start), duration=Number(message.duration);
    if(!Number.isFinite(start)||!Number.isFinite(duration)||start<0||duration<0)throw new Error('invalid transcript timing');
    const key=start+':'+duration;
    // Keep timing identity across utterance boundaries so replayed finals cannot reopen a turn.
    if(message.is_final && this.seen.has(key))return;
    if(text) {
      this.start();
      if(message.is_final) {
        const words=message.channel?.alternatives?.[0]?.words;
        const wordEnd=Array.isArray(words)?words.at(-1)?.end:undefined;
        this.seen.add(key); this.lastEnd=Math.max(this.lastEnd,Number.isFinite(wordEnd)?wordEnd:start+duration);
        if(this.seen.size>2048)throw new Error('too many transcript segments');
        this.characters+=text.length+1;
        if(this.characters>8000)throw new Error('utterance too large');
        this.segments.push(text);
      } else {
        this.emit({type:'transcript.partial',text:[...this.segments,text].join(' '),utteranceId:String(this.turn)});
      }
    }
    // Dictation waits for the separate one-second word-gap boundary; switching
    // modes applies after this utterance, without reconnecting or losing audio.
    if(message.speech_final&&this.inputMode==='command'&&start+duration>=this.lastEnd)this.finish();
  }
}

export function createDeepgramStt({apiKey, webSocketImpl=WebSocket}={}) {
  if(!apiKey)return undefined;
  return {
    model:DEEPGRAM_MODEL, version:DEEPGRAM_VERSION,
    open({signal,onEvent,inputMode='command'}) {
      return new Promise((resolve,reject)=>{
        const socket=new webSocketImpl(deepgramUrl(),{headers:{Authorization:'Token '+apiKey},maxPayload:65536,handshakeTimeout:10000});
        let ready=false,closed=false;
        const assembly=new TranscriptAssembler(onEvent); assembly.setInputMode(inputMode);
        const stop=()=>{if(closed)return;closed=true;clearInterval(keepalive);socket.terminate();signal.removeEventListener('abort',stop);if(!ready)reject(new Error('speech cancelled'));};
        const keepalive=setInterval(()=>{if(ready&&!closed&&socket.readyState===1)socket.send(JSON.stringify({type:'KeepAlive'}));},3000);
        keepalive.unref();
        signal.addEventListener('abort',stop,{once:true});
        if(signal.aborted){stop();return;}
        socket.on('open',()=>{
          if(closed)return;
          ready=true;
          resolve({
            sendAudio(data) {
              if(closed||signal.aborted)throw new Error('speech closed');
              if(socket.bufferedAmount+data.byteLength>PCM_WINDOW_BYTES)throw new Error('speech buffer overflow');
              socket.send(data);
            },
            setInputMode:mode=>assembly.setInputMode(mode),
            close:stop,
          });
        });
        socket.on('message',raw=>{
          if(closed||signal.aborted)return;
          try { const message=JSON.parse(raw.toString()); if(message.type==='Error')throw new Error(); assembly.accept(message); }
          catch { onEvent({type:'stt.error',message:'Speech provider failed.'}); stop(); }
        });
        socket.on('error',()=>{if(!ready)reject(new Error('speech unavailable'));else if(!closed)onEvent({type:'stt.error',message:'Speech provider unavailable.'});stop();});
        socket.on('close',()=>{if(!closed)onEvent({type:'stt.error',message:'Speech provider disconnected.'});stop();});
      });
    },
  };
}
