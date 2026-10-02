import { timingSafeEqual } from 'node:crypto';
import { hash } from './store.mjs';
export const COOKIE_NAME='__Host-flow_session';
export function httpError(status,message){return Object.assign(new Error(message),{status});}
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createAuth({config,store}){
 function assertOrigin(req){if(!config.origin||req.headers.origin!==config.origin)throw httpError(403,'origin rejected');}
 async function authenticate(req,{csrf=false,csrfToken}={}){
  if(csrf)assertOrigin(req);
  const cookies=(req.headers.cookie||'').split(';').map(p=>p.trim()).filter(p=>p.startsWith(`${COOKIE_NAME}=`));
  if(cookies.length!==1)throw httpError(401,'invalid session');
  const token=cookies[0].slice(COOKIE_NAME.length+1);
  if(!/^[\w-]{43}$/.test(token))throw httpError(401,'invalid session');
  if(!store)throw httpError(503,'access unavailable');
  let session;try{session=await store.getSession(hash(token),config.consentVersion);}catch(e){if(e.message.includes('invalid session'))throw httpError(401,'invalid session');throw httpError(503,'access unavailable');}
  if(csrf&&!equal(session.csrf,csrfToken??req.headers['x-flow-csrf']))throw httpError(403,'csrf rejected');
  return session;
 }
 return {
  authenticate,assertOrigin,
  async redeem(body,clientId){
   if(!store)throw httpError(503,'access unavailable');
   await store.rateLimit(clientId);
   if(!config.consentVersion||body?.consentVersion!==config.consentVersion)throw httpError(400,'consent required');
   if(Object.keys(body).some(k=>!['invite','consentVersion'].includes(k))||typeof body.invite!=='string'||! /^[\w-]{43}$/.test(body.invite))throw httpError(401,'invalid invite');
   const {token,session}=await store.redeem(body.invite,config.sessionTtlMs,config.consentVersion);
   return {session,cookie:`${COOKIE_NAME}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(config.sessionTtlMs/1000)}`};
  },
  async logout(session){await store.revokeSession(session.sessionHash);},
  clearCookie:`${COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`,
 };
}
