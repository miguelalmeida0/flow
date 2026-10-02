import { request } from 'node:https';
import { PCM_FRAME_BYTES, PCM_WINDOW_BYTES } from '../../../shared/hosted-voice-protocol.mjs';

/** Character-billed model: the entire request is reserved before opening it.
 * A byte/deadline abort does not reduce the billing reservation.
 */
export function createOpenAiTts({apiKey,requestImpl=request}={}) {
  if(!apiKey)return undefined;
  return {
    model:'tts-1',
    async open(text,{signal}) {
      if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>600)throw new Error('speech text too large');
      if(signal.aborted)throw new Error('speech cancelled');
      const body=JSON.stringify({model:'tts-1',voice:'alloy',input:text,response_format:'pcm',speed:1});
      return new Promise((resolve,reject)=>{
        const req=requestImpl('https://api.openai.com/v1/audio/speech',{
          method:'POST',signal,highWaterMark:16384,
          headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},
        }, response=>{
          if(response.statusCode!==200) {response.destroy();reject(new Error('speech provider rejected'));return;}
          response.pause();
          let streamError;
          // Errors may arrive while playback credit has paused reads. Keep a
          // permanent sanitized listener so that cancellation is never an
          // unhandled IncomingMessage error.
          response.on('error',()=>{streamError=new Error('speech stream failed');});
          response.on('readable',()=>{
            if(response.readableLength>PCM_WINDOW_BYTES){streamError=new Error('speech staging overflow');response.destroy();}
          });
          // Pull at most one PCM frame. The Node stream retains transport
          // backpressure; callers never accumulate an entire utterance.
          resolve({
            async read(maxBytes) {
              if(signal.aborted)throw new Error('speech cancelled');
              if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>PCM_FRAME_BYTES)throw new Error('invalid PCM pull');
              while(true) {
                if(streamError)throw streamError;
                const chunk=response.read(maxBytes);
                if(chunk)return new Uint8Array(chunk);
                if(response.readableEnded)return null;
                if(response.destroyed)throw new Error('speech provider disconnected');
                await new Promise((wake,fail)=>{
                  const cleanup=()=>{response.off('readable',ready);response.off('end',ready);response.off('error',error);response.off('close',ready);};
                  const ready=()=>{cleanup();wake();};
                  const error=()=>{cleanup();fail(new Error('speech stream failed'));};
                  response.once('readable',ready);response.once('end',ready);response.once('close',ready);response.once('error',error);
                });
              }
            },
            close(){response.destroy();req.destroy();},
          });
        });
        req.on('error',()=>reject(new Error('speech request failed')));
        req.end(body);
      });
    },
  };
}
