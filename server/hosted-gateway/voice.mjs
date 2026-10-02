import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { decodeVoiceFrame, encodeVoiceFrame, UUID_PATTERN, PCM_FRAME_BYTES, PCM_WINDOW_BYTES, FRAME_HEADER_BYTES, VOICE_VERSION } from '../../shared/hosted-voice-protocol.mjs';

/** Credit is returned only after browser playback. Cumulative ACKs cannot
 * manufacture credit, and every generation owns a fresh instance. */
export class PlaybackCredit {
  constructor({stallMs=5000}={}) {
    this.stallMs=stallMs; this.outstanding=0; this.totalSent=0;
    this.sequence=0; this.acknowledged=0; this.frames=new Map(); this.waiter=null; this.closed=false;
  }
  async take(bytes) {
    if(this.closed)throw new Error('playback cancelled');
    if(bytes<1||bytes>PCM_WINDOW_BYTES)throw new Error('invalid playback size');
    while(this.outstanding+bytes>PCM_WINDOW_BYTES) {
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.waiter=null;reject(new Error('playback stalled'));},this.stallMs);
        this.waiter={resolve:()=>{clearTimeout(timer);this.waiter=null;resolve();},reject:()=>{clearTimeout(timer);this.waiter=null;reject(new Error('playback cancelled'));}};
      });
      if(this.closed)throw new Error('playback cancelled');
    }
  }
  sent(bytes) {
    if(this.outstanding+bytes>PCM_WINDOW_BYTES)throw new Error('playback overflow');
    this.outstanding+=bytes; this.totalSent+=bytes;
    this.frames.set(++this.sequence,bytes); return this.sequence;
  }
  ack(sequence) {
    if(!Number.isSafeInteger(sequence)||sequence>this.sequence||sequence<0)throw new Error('invalid playback ACK');
    if(sequence<=this.acknowledged)return;
    for(const [id,bytes] of this.frames)if(id<=sequence){this.outstanding-=bytes;this.frames.delete(id);}
    this.acknowledged=sequence; this.waiter?.resolve();
  }
  close(){this.closed=true;this.waiter?.reject();this.frames.clear();}
}

export function attachHostedVoice({server,config,authenticate,beginWork,speechReady,providers}) {
  const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
  const connections=new Set(),pendingSockets=new Set(); let closing=false;
  const rejectUpgrade=(socket)=>{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');};
  const upgrade=async(req,socket,head)=>{
    if(closing||pendingSockets.size>=16||req.url!=='/api/voice'||req.headers.origin!==config.origin){rejectUpgrade(socket);return;}
    pendingSockets.add(socket);
    socket.once('close',()=>pendingSockets.delete(socket));
    try {
      await authenticate(req);
      if(!await speechReady()||socket.destroyed){rejectUpgrade(socket);return;}
      wss.handleUpgrade(req,socket,head,ws=>connect(ws,req));
    } catch {rejectUpgrade(socket);}
  };
  server.on('upgrade',upgrade);
  function connect(ws,req) {
    let terminal=false,handshaking=false,epoch,session,work,stt,tts=null;
    let inputSequence=0,inputBytes=0,generation=0,sessionId=randomUUID(),expiresAt=0;
    let messages=0,rateWindow=Date.now();
    const send=event=>{
      if(!terminal&&ws.readyState===1)ws.send(JSON.stringify({...event,version:VOICE_VERSION,sessionId,captureEpoch:epoch,captureId:1}));
    };
    const cancelOutput=()=>{
      const old=tts; tts=null;
      if(old){old.controller.abort();old.credit.close();old.stream?.close();old.work?.abort('speech cancelled');void old.work?.release();}
    };
    const stop=(reason='Voice session stopped.')=>{
      if(terminal)return;
      send({type:'stt.error',message:reason}); terminal=true;
      clearTimeout(handshakeTimer); cancelOutput();stt?.close();work?.abort(reason);void work?.release();
      connections.delete(stop);ws.close(1000,reason.slice(0,100));
      const force=setTimeout(()=>ws.terminate(),1000);force.unref();ws.once('close',()=>clearTimeout(force));
    };
    connections.add(stop);
    const handshakeTimer=setTimeout(()=>stop('Voice handshake timed out.'),5000);
    ws.on('close',()=>stop('Voice disconnected.'));
    ws.on('error',()=>stop('Voice connection failed.'));

    async function synthesize(message) {
      if(!Number.isSafeInteger(message.generation)||message.generation<=generation||message.generation>0xffffffff||typeof message.text!=='string'||!message.text.trim()||Buffer.byteLength(message.text)>600)throw new Error('invalid speech request');
      cancelOutput(); generation=message.generation;
      const output={generation,controller:new AbortController(),credit:new PlaybackCredit(),work:null,stream:null};tts=output;
      const current=()=>!terminal&&tts===output&&!output.controller.signal.aborted;
      const workAborted=()=>{
        if(current()){
          send({type:'tts.error',message:'Speech authorization ended. Start again.',generation:output.generation,requestId:output.generation});
          cancelOutput();
        }else{output.controller.abort();output.credit.close();output.stream?.close();}
      };
      try {
        output.work=await beginWork(session,{costMicros:config.ttsCostMicros,requests:1,deadlineMs:30000});
        if(!current()){output.work.abort();return;}
        output.work.signal.addEventListener('abort',workAborted,{once:true});
        if(output.work.signal.aborted)throw new Error('speech cancelled');
        output.stream=await providers.tts.open(message.text,{signal:output.controller.signal});
        if(!current()){output.stream.close();return;}
        send({type:'tts.start',requestId:generation,generation});
        let tail=null,total=0;
        while(current()) {
          // Do not read provider bytes while the consumer has exhausted credit.
          await output.credit.take(PCM_FRAME_BYTES);
          const chunk=await output.stream.read(PCM_FRAME_BYTES-(tail===null?0:1));
          if(!current())return;
          if(chunk===null){if(tail!==null)throw new Error('incomplete PCM sample');break;}
          if(!(chunk instanceof Uint8Array)||!chunk.length||chunk.length>PCM_FRAME_BYTES)throw new Error('invalid provider PCM');
          let bytes=chunk;
          if(tail!==null){bytes=new Uint8Array(chunk.length+1);bytes[0]=tail;bytes.set(chunk,1);tail=null;}
          if(bytes.length%2){tail=bytes[bytes.length-1];bytes=bytes.slice(0,-1);}
          if(!bytes.length)continue;
          total+=bytes.length;
          if(total>1440000||ws.bufferedAmount+bytes.length+FRAME_HEADER_BYTES>PCM_WINDOW_BYTES)throw new Error('speech output overflow');
          const sequence=output.credit.sent(bytes.length);
          ws.send(encodeVoiceFrame({kind:2,epoch,generation:output.generation,sequence,data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}));
        }
        if(current())send({type:'tts.done',generation:output.generation,requestId:output.generation});
      } catch {
        if(current()){send({type:'tts.error',message:'Speech playback failed. Try again.',generation:output.generation,requestId:output.generation});cancelOutput();}
      } finally {
        output.work?.signal.removeEventListener('abort',workAborted);
        output.stream?.close();output.work?.abort('speech completed');await output.work?.release();
      }
    }

    ws.on('message',(data,binary)=>{
      if(terminal)return;
      try {
        if(Date.now()-rateWindow>1000){rateWindow=Date.now();messages=0;}
        if(++messages>100)throw new Error('voice rate exceeded');
        if(binary) {
          if(!stt||!work||work.signal.aborted||Date.now()>=work.expiresAt)throw new Error('voice not ready');
          const frame=decodeVoiceFrame(data);
          if(frame.kind!==1||frame.epoch!==epoch||frame.generation!==0||frame.sequence!==inputSequence+1)throw new Error('invalid microphone frame');
          inputSequence=frame.sequence;inputBytes+=frame.data.byteLength;
          if(inputBytes>14400000)throw new Error('audio duration exceeded');
          stt.sendAudio(frame.data);return;
        }
        if(data.length>4096)throw new Error('voice control too large');
        const message=JSON.parse(data.toString());
        if(!epoch) {
          if(handshaking||message.type!=='hello'||message.version!==VOICE_VERSION||!UUID_PATTERN.test(message.captureEpoch)||!['command','dictation'].includes(message.inputMode)||typeof message.csrf!=='string')throw new Error('invalid voice handshake');
          handshaking=true;
          void (async()=>{
            session=await authenticate(req,{csrf:true,csrfToken:message.csrf});
            if(terminal)return;
            work=await beginWork(session,{voice:true,costMicros:config.sttSessionCostMicros,audioMs:300000,deadlineMs:300000});
            expiresAt=work.expiresAt;
            if(terminal){work.abort();await work.release();return;}
            work.signal.addEventListener('abort',()=>stop('Voice authorization ended.'),{once:true});
            if(work.signal.aborted){stop();return;}
            epoch=message.captureEpoch;
            stt=await providers.stt.open({signal:work.signal,inputMode:message.inputMode,onEvent:event=>{
              if(terminal||work.signal.aborted)return;
              if(Date.now()>=work.expiresAt){stop('Voice authorization ended.');return;}
              const utteranceId=event.utteranceId?sessionId+':'+event.utteranceId:undefined;
              send({...event,utteranceId,audioMs:inputBytes/48,workerEpoch:sessionId});
              if(event.type==='stt.error')stop('Speech provider unavailable.');
            }});
            if(terminal){stt.close();return;}
            clearTimeout(handshakeTimer);
            send({type:'ready',sttReady:true,ttsReady:true,expiresAt,startup:{sttModel:providers.stt.model,sttVersion:providers.stt.version,ttsModel:providers.tts.model,ttsStatus:'configured'}});
          })().catch(()=>stop('Voice access unavailable.'));
          return;
        }
        if(!stt||message.captureEpoch!==epoch)throw new Error('invalid voice authority');
        if(message.type==='stop'){stop('Voice stopped.');return;}
        if(message.type==='input.mode'&&['command','dictation'].includes(message.inputMode)){stt.setInputMode(message.inputMode);return;}
        if(message.type==='tts.request'){void synthesize(message).catch(()=>stop('Invalid speech request.'));return;}
        if(message.type==='tts.cancel') {
          if(!Number.isSafeInteger(message.generation)||message.generation<generation||message.generation>0xffffffff)throw new Error('invalid cancellation');
          generation=message.generation;cancelOutput();send({type:'tts.cancelled',generation,requestId:generation});return;
        }
        if(message.type==='tts.played') {
          if(tts&&message.generation===tts.generation)tts.credit.ack(message.sequence);
          return;
        }
        throw new Error('unknown voice control');
      } catch {stop('Voice protocol failed.');}
    });
  }
  return {close(){closing=true;server.off('upgrade',upgrade);for(const stop of connections)stop('Service restarting.');for(const socket of pendingSockets)socket.destroy();wss.close();}};
}
