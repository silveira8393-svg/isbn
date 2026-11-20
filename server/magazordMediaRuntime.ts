import { randomUUID } from 'node:crypto';

export type MediaPhase = 'auth'|'request'|'journal'|'source'|'preparation'|'reserve'|'upload'|'response'|'persistence'|'link';
type Outcome = 'ok'|'transport'|'timeout'|'http_rejected'|'invalid_response'|'persistence_failed'|'invalid_image'|'budget_exhausted'|'conflict';
export type MediaDiagnostic = { event:'magazord_media'; requestId:string; phase:MediaPhase; durationMs:number;
  outcome:Outcome; httpStatus?:number; imageType?:'jpg'|'png'|'webp'; imageBytes?:number; payloadBytes?:number; remoteCode?:string };
export function mediaRuntime(now=()=>performance.now(), logger:(event:MediaDiagnostic)=>void=event=>console.info(JSON.stringify(event))) {
  const start=now(),requestId=randomUUID();
  const remaining=()=>Math.max(0,28_000-(now()-start)); // 2 seconds below the existing Vercel/client limit.
  const signal=(cap:number,reserve=0)=>{
    const ms=Math.floor(Math.min(cap,remaining()-reserve));
    if(ms<=0)throw new DOMException('Budget exhausted','TimeoutError');
    return AbortSignal.timeout(ms);
  };
  const emit=(phase:MediaPhase,began:number,outcome:Outcome,fields:Partial<Pick<MediaDiagnostic,'httpStatus'|'imageType'|'imageBytes'|'payloadBytes'|'remoteCode'>>={})=>{
    // Only fixed fields. Never serialize errors, requests, bodies, URLs or user identifiers.
    try{logger({event:'magazord_media',requestId,phase,durationMs:Math.max(0,Math.round(now()-began)),outcome,...fields});}catch{/* Logging cannot change an operation outcome. */}
  };
  return {now,remaining,signal,emit};
}
export type MediaRuntime=ReturnType<typeof mediaRuntime>;
export const timedOut=(error:unknown,signal?:AbortSignal)=>signal?.aborted ||
  error instanceof DOMException && ['TimeoutError','AbortError'].includes(error.name);
// Untrusted strings are never logged, even if they look like machine codes.
const REMOTE_CODES=new Set(['invalid_file','invalid_image','file_too_large','unsupported_media_type','unauthorized','forbidden','validation_error']);
export function safeRemoteCode(body:any):string|undefined {
  const code=body?.code??body?.error?.code;
  return typeof code==='string'&&REMOTE_CODES.has(code)?code:undefined;
}
