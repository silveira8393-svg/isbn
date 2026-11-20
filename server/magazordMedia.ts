import { createHash } from 'node:crypto';
import { authorizeAmazonSearch, AmazonAccessError, readLimitedJson } from './amazonAuthorization.js';
import { resolveMagazordBaseUrl } from './magazordBaseUrl.js';
import { serviceHeaders } from './spapi/supabaseHeaders.js';
import { PRICE_HOMOLOGATION, priceUuid } from '../shared/magazordPrice.js';
import { buildMagazordImageUpload, buildMagazordMediaRelation, validatedMagazordMediaId,
 MAGAZORD_MEDIA_MAX_BYTES, type MediaImageFormat, type MediaImage } from '../shared/magazordMedia.js';
import { validateMediaImage } from './magazordMediaImage.js';
import { mediaRuntime, timedOut, safeRemoteCode, type MediaRuntime, type MediaDiagnostic } from './magazordMediaRuntime.js';

type Stage = 'prepared'|'upload_started'|'uploaded'|'link_started'|'linked';
type Job={id:string;registration_id:string;store_id:string;actor_id:string;environment:'homologation';
 parent_code:string;child_code:string;image_position:number;image_reference:string;fingerprint:string;
 stage:Stage;media_id:number|null};
class MediaError extends Error{constructor(public code:string,public status=409){super(code)}}
const fail=(code:string,status=409):never=>{throw new MediaError(code,status)};
const formats:Record<string,MediaImageFormat>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const storageOrigin='https://jcxdkrpmrfbrhzwbzhph.supabase.co';
const STORAGE=/^\/storage\/v1\/object\/authenticated\/isbn-registration-images\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f]{64})\.(jpg|png|webp)$/;
const EXTERNAL_HOSTS=new Set(['m.media-amazon.com','images-na.ssl-images-amazon.com',
 'images-eu.ssl-images-amazon.com','books.google.com','books.googleusercontent.com']);
const exactReference=(v:unknown):v is string=>{
 if(typeof v!=='string'||v.length>2048)return false;
 try{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return false;
   if(u.origin===storageOrigin)return !u.search&&STORAGE.test(u.pathname);
   if(!EXTERNAL_HOSTS.has(u.hostname)||u.pathname.length<2||u.pathname.endsWith('/'))return false;
   if(!u.search)return true;
   if(u.hostname!=='books.google.com'||u.pathname!=='/books/content')return false;
   const keys=new Set(['id','printsec','img','zoom','edge','source','w','h']);
   return [...u.searchParams.keys()].every(k=>keys.has(k))&&u.searchParams.has('id');
 }catch{return false}
};
function uuidFor(registrationId:string,position:number){
 const hex=createHash('sha256').update('isbn-magazord-media:v1:').update(registrationId.toLowerCase()).update(':').update(String(position)).digest('hex').slice(0,32).split('');
 hex[12]='4';hex[16]='89ab'[parseInt(hex[16],16)%4];const h=hex.join('');
 return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
function db(env:NodeJS.ProcessEnv, fetcher:typeof fetch, runtime:MediaRuntime){
 let base:URL;try{base=new URL((env.SUPABASE_URL||env.VITE_SUPABASE_URL)!)}catch{return fail('media_persistence_unavailable',503)}
 const key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||base.origin!==storageOrigin||base.pathname!=='/'||base.search||base.hash||base.username||base.password)
   return fail('media_persistence_unavailable',503);
 return async(table:'magazord_registration_jobs'|'magazord_media_jobs',method:'GET'|'POST'|'PATCH',q:Record<string,string>,payload?:unknown):Promise<any[]>=>{
   if(table==='magazord_registration_jobs'&&method!=='GET')return fail('media_persistence_unavailable',503);
   const url=new URL('/rest/v1/'+table,base);url.search=new URLSearchParams(q).toString();
   const phase=(payload as any)?.stage?.endsWith('_started')?'reserve':
     ['uploaded','linked'].includes((payload as any)?.stage)?'persistence':'journal';
   const began=runtime.now(); let status:number|undefined;
   let signal:AbortSignal|undefined;
   try{
   signal=runtime.signal(phase==='persistence'?4000:3000);
   const response=await fetcher(url,{method,signal,redirect:'error',credentials:'omit',cache:'no-store',
     headers:{...serviceHeaders(key),Prefer:'return=representation'},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
   status=response.status;
   if(!response.ok||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||'')){
     void response.body?.cancel().catch(()=>{});return fail('media_persistence_unavailable',503)}
   const rows=await readLimitedJson(response.body,65536,signal);
   if(!Array.isArray(rows))return fail('media_persistence_unavailable',503);
   if(phase==='persistence' && rows.length && (rows.length!==1 || rows[0].id!==q.id?.slice(3)
     || rows[0].stage!==(payload as any).stage || rows[0].fingerprint!==q.fingerprint?.slice(3)
     || ((payload as any).media_id!==undefined && rows[0].media_id!==(payload as any).media_id)))
     return fail('media_persistence_unavailable',503);
   runtime.emit(phase,began,rows.length===0&&method==='PATCH'?'conflict':'ok',{httpStatus:status});
   return rows;
   }catch(error){
     runtime.emit(phase,began,timedOut(error,signal)?'timeout':'persistence_failed',{httpStatus:status});
     return fail('media_persistence_unavailable',503);
   }
 };
}
async function binary(response:Response,max:number,signal:AbortSignal){
 if(!response.ok||!response.body){void response.body?.cancel().catch(()=>{});return fail('media_source_unavailable',409);}
 const length=Number(response.headers.get('content-length'));
 if(Number.isFinite(length)&&length>max){void response.body.cancel().catch(()=>{});return fail('media_source_too_large',413);}
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let total=0;
 let abort:()=>void;
 const aborted=new Promise<never>((_,reject)=>{abort=()=>{void reader.cancel().catch(()=>{});reject(new DOMException('Source deadline','TimeoutError'));};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
 try{while(true){const{done,value}=await Promise.race([reader.read(),aborted]);if(done)break;total+=value.byteLength;
   if(total>max)return fail('media_source_too_large',413);parts.push(value)}
 }finally{signal.removeEventListener('abort',abort!);void reader.cancel().catch(()=>{});reader.releaseLock()}
 return new Uint8Array(Buffer.concat(parts));
}
async function getImage(reference:string,actor:string,store:string,env:NodeJS.ProcessEnv,fetcher:typeof fetch,runtime:MediaRuntime):Promise<MediaImage>{
 const u=new URL(reference);let bytes:Uint8Array;let contentType:string|undefined;
 const began=runtime.now(),signal=runtime.signal(8000,10_000);let status:number|undefined;
 try{
 if(u.origin===storageOrigin){
   const parsed=STORAGE.exec(u.pathname);
   if(!parsed||parsed[1]!==store||parsed[2]!==actor)return fail('media_source_denied',403);
   const key=env.SUPABASE_SERVICE_ROLE_KEY;
   if(!key)return fail('media_source_unavailable',503);
   // The exact authenticated object path is already scoped to store/actor. No signed URLs.
   const response=await fetcher(u,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',signal,
     headers:{...serviceHeaders(key),Accept:'image/jpeg,image/png,image/webp'}});
   status=response.status;contentType=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
   bytes=await binary(response,MAGAZORD_MEDIA_MAX_BYTES,signal);
 }else{
   // Host allowlist and no redirects avoid user-controlled URLs reaching internal hosts.
   const response=await fetcher(u,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
     signal,headers:{Accept:'image/jpeg,image/png,image/webp'}});
   status=response.status;contentType=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
   bytes=await binary(response,MAGAZORD_MEDIA_MAX_BYTES,signal);
 }
 if(bytes.byteLength<12||bytes.byteLength>MAGAZORD_MEDIA_MAX_BYTES)return fail('media_source_invalid');
 const extension=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpg':
   bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'?'png':
   String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'?'webp':undefined;
 if(!extension||!contentType||formats[contentType]!==extension)return fail('media_source_invalid');
 const name=createHash('sha256').update(bytes).digest('hex').slice(0,32)+'.'+extension;
 runtime.emit('source',began,'ok',{httpStatus:status,imageType:extension,imageBytes:bytes.byteLength});
 return {bytes,format:extension,name};
 }catch(error){runtime.emit('source',began,timedOut(error,signal)?'timeout':status&&status!==200?'http_rejected':error instanceof MediaError?'invalid_image':'transport',{httpStatus:status});
   if(error instanceof MediaError)throw error;return fail('media_source_unavailable');}
}
/** Each media position uses its own persistent journal, no replays after upload/link began.
 * Homologation only, no additional Magazord reads of parent or child.
 */
export function createMagazordMediaFunction({env=process.env,fetcher=fetch,now,logger}:{env?:NodeJS.ProcessEnv;fetcher?:typeof fetch;now?:()=>number;logger?:(event:MediaDiagnostic)=>void}={}){
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 return async(request:Request):Promise<Response>=>{
 const runtime=mediaRuntime(now,logger);
 // Also applies the shared deadline to authorization without changing its MFA/tenant checks.
 const boundedFetch:typeof fetch=(target,init)=>fetcher(target,{...init,signal:AbortSignal.any([
   ...(init?.signal?[init.signal]:[]),runtime.signal(28_000)])});
 try{
   const url=new URL(request.url);
   if(request.method!=='POST'||url.pathname!=='/api/magazord/price'||url.search!=='?media=1')return fail('invalid_media_request',400);
   if((request.headers.get('origin')&&request.headers.get('origin')!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return fail('origin_denied',403);
   if(resolveMagazordBaseUrl(env.MAGAZORD_BASE_URL)!==PRICE_HOMOLOGATION)return fail('homologation_only',403);
   if(!env.MAGAZORD_API_USER||!env.MAGAZORD_API_PASSWORD)return fail('media_not_configured',503);
   const store=request.headers.get('x-isbn-store-id')||'';
   if(!priceUuid(store)||store!==env.MAGAZORD_STORE_ID)return fail('store_access_denied',403);
   const authBegan=runtime.now();
   try{await authorizeAmazonSearch(request,env,boundedFetch);runtime.emit('auth',authBegan,'ok');}
   catch(error){runtime.emit('auth',authBegan,error instanceof AmazonAccessError&&error.code==='auth_timeout'?'timeout':error instanceof AmazonAccessError&&error.status<500?'http_rejected':'transport',
     error instanceof AmazonAccessError?{httpStatus:error.status}:{});throw error;}
   const actor=JSON.parse(Buffer.from(request.headers.get('authorization')!.split('.')[1],'base64url').toString()).sub;
   if(!priceUuid(actor))return fail('store_access_denied',403);
   if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return fail('json_required',415);
   const requestBegan=runtime.now();
   let body:any;
   try{body=await readLimitedJson(request.body,8192,runtime.signal(1000));}
   catch(error){runtime.emit('request',requestBegan,timedOut(error)?'timeout':'invalid_response');return fail('invalid_media_request',400);}
   runtime.emit('request',requestBegan,'ok');
   if(!body||!['lookup','prepare','upload','link','status'].includes(body.action))
     return fail('invalid_media_request',400);
   const query=db(env,boundedFetch,runtime);
   if(body.action==='lookup'){
     const code=(value:unknown)=>typeof value==='string'&&/^[\p{L}\p{N}][\p{L}\p{N}._ -]{0,24}$/u.test(value)&&value.trim()===value;
     if(Object.keys(body).some((k:string)=>!['action','parentCode','childCode'].includes(k))||
       !code(body.parentCode)||!code(body.childCode)||body.parentCode===body.childCode)
       return fail('invalid_media_request',400);
     const registrations=await query('magazord_registration_jobs','GET',{
       store_id:'eq.'+store,actor_id:'eq.'+actor,parent_code:'eq.'+body.parentCode,
       child_code:'eq.'+body.childCode,stage:'eq.verified',
       select:'id,parent_code,child_code,stage',limit:'2'});
     if(registrations.length!==1)return fail('verified_media_registration_not_found',404);
     return reply({status:'found',registrationId:registrations[0].id,
       parentCode:registrations[0].parent_code,childCode:registrations[0].child_code});
   }
   if(Object.keys(body).some((k:string)=>!['action','registrationId','position','reference','operationId'].includes(k))
     || !priceUuid(body.registrationId)||!Number.isInteger(body.position)||body.position<0||body.position>19
     || !exactReference(body.reference))return fail('invalid_media_request',400);
   const rows=await query('magazord_registration_jobs','GET',
     {id:'eq.'+body.registrationId,store_id:'eq.'+store,actor_id:'eq.'+actor,select:'id,store_id,actor_id,parent_code,child_code,stage',limit:'2'});
   const reg=rows[0];
   if(rows.length!==1||reg.stage!=='verified'||reg.parent_code===reg.child_code)return fail('registration_not_verified');
   const fields={id:uuidFor(reg.id,body.position),registration_id:reg.id,store_id:store,actor_id:actor,
     environment:'homologation' as const,parent_code:reg.parent_code,child_code:reg.child_code,
     image_position:body.position,image_reference:body.reference};
   const fingerprint=createHash('sha256').update(JSON.stringify(fields)).digest('hex');
   const expected:Job={...fields,fingerprint,stage:'prepared',media_id:null};
   const scope={registration_id:'eq.'+reg.id,store_id:'eq.'+store,actor_id:'eq.'+actor,
     image_position:'eq.'+body.position,select:'*',limit:'2'};
   let found=await query('magazord_media_jobs','GET',scope);
   if(found.length>1)return fail('media_persistence_unavailable',503);
   let job:Job|undefined=found[0];
   if(job&&(job.id!==expected.id||job.fingerprint!==fingerprint||job.image_reference!==body.reference))
     return fail('media_payload_changed');
   if(body.action==='prepare')return reply({status:'prepared',operationId:expected.id,stage:job?.stage||'not_started',
     childCode:reg.child_code,position:body.position});
   if(body.operationId!==expected.id)return fail('media_operation_mismatch',423);
   if(job?.stage==='linked')return reply({status:'linked',operationId:job.id,stage:'linked',childCode:job.child_code,position:job.image_position});
   if(body.action==='status')return reply({status:'prepared',operationId:expected.id,stage:job?.stage||'not_started',
     childCode:reg.child_code,position:body.position});
   if(!job){
     if(body.action!=='upload')return fail('media_not_uploaded');
     // Never start image N before all earlier positions were linked.
     if(body.position>0){
       const prior=await query('magazord_media_jobs','GET',{registration_id:'eq.'+reg.id,
         store_id:'eq.'+store,actor_id:'eq.'+actor,image_position:'lt.'+body.position,select:'image_position,stage',order:'image_position.asc',limit:'20'});
       if(prior.length!==body.position||prior.some((x,i)=>x.image_position!==i||x.stage!=='linked'))
         return fail('previous_media_not_linked');
     }
     try{found=await query('magazord_media_jobs','POST',{},expected);job=found[0]}
     catch(e){found=await query('magazord_media_jobs','GET',scope);if(found.length!==1)throw e;job=found[0]}
   }
   if(!job||job.fingerprint!==fingerprint)return fail('media_payload_changed');
   if(body.action==='upload'){
     if(job.stage==='uploaded'||job.stage==='link_started')return reply({status:'uploaded',stage:job.stage,operationId:job.id,
       childCode:job.child_code,position:job.image_position});
     if(job.stage!=='prepared')return fail('media_outcome_uncertain');
     // Fetch source before reserving the one-shot remote operation: a missing cover
     // must not permanently block the book when no Magazord POST was attempted.
     if(runtime.remaining()<13_000){runtime.emit('preparation',runtime.now(),'budget_exhausted');return fail('media_preparation_unavailable');}
     const image=await getImage(job.image_reference,actor,store,env,boundedFetch,runtime);
     const preparationBegan=runtime.now();let payload:string;
     try{
       validateMediaImage(image.bytes,image.format);
       payload=JSON.stringify(buildMagazordImageUpload(image));
       // The unchanged JSON contract expands Base64 by 4/3; bound the entire outbound body.
       if(Buffer.byteLength(payload)>4*Math.ceil(MAGAZORD_MEDIA_MAX_BYTES/3)+1024)throw new Error('invalid_payload_size');
       runtime.emit('preparation',preparationBegan,'ok',{imageType:image.format,imageBytes:image.bytes.byteLength,payloadBytes:Buffer.byteLength(payload)});
     }catch{runtime.emit('preparation',preparationBegan,'invalid_image');return fail('media_source_invalid');}
     // A CAS may take 3s. Require >=5s for sending, 4s for persistence, 1s slack after it.
     if(runtime.remaining()<13_000){runtime.emit('preparation',preparationBegan,'budget_exhausted');return fail('media_preparation_unavailable');}
     found=await query('magazord_media_jobs','PATCH',{id:'eq.'+job.id,stage:'eq.prepared',fingerprint:'eq.'+fingerprint,
       store_id:'eq.'+store,actor_id:'eq.'+actor},{stage:'upload_started'});
     if(found.length!==1)return fail('media_operation_in_progress');
     // Outcome is permanently uncertain unless we can persist a positive ID.
     let phase:'upload'|'response'|'persistence'='upload',began=runtime.now(),status:number|undefined,signal:AbortSignal|undefined,remoteCode:string|undefined;
     try{
       signal=runtime.signal(12_000,5000);
       const resp=await boundedFetch(PRICE_HOMOLOGATION+'/v2/site/midia/upload',{method:'POST',redirect:'error',
         credentials:'omit',cache:'no-store',signal,
         headers:{Authorization:'Basic '+Buffer.from(env.MAGAZORD_API_USER+':'+env.MAGAZORD_API_PASSWORD).toString('base64'),
           Accept:'application/json','Content-Type':'application/json'},
         body:payload});
       status=resp.status;
       if(status!==201){
         try{if(/^application\/json(?:;|$)/i.test(resp.headers.get('content-type')||''))
           remoteCode=safeRemoteCode(await readLimitedJson(resp.body,16384,AbortSignal.any([signal,runtime.signal(500,5000)])));
         else void resp.body?.cancel().catch(()=>{});}catch{/* Best effort, bounded diagnostic only. */}
         runtime.emit('upload',began,'http_rejected',{httpStatus:status,remoteCode});return fail('media_outcome_uncertain');
       }
       runtime.emit('upload',began,'ok',{httpStatus:status});phase='response';began=runtime.now();
       if(!/^application\/json(?:;|$)/i.test(resp.headers.get('content-type')||'')){
         void resp.body?.cancel().catch(()=>{});throw new Error('invalid_content_type');}
       signal=AbortSignal.any([signal,runtime.signal(1000,5000)]);
       const data=await readLimitedJson(resp.body,65536,signal);
       remoteCode=safeRemoteCode(data);
       const id=validatedMagazordMediaId(data);
       runtime.emit('response',began,'ok',{httpStatus:status});phase='persistence';began=runtime.now();
       found=await query('magazord_media_jobs','PATCH',{id:'eq.'+job.id,stage:'eq.upload_started',fingerprint:'eq.'+fingerprint,
         store_id:'eq.'+store,actor_id:'eq.'+actor},{stage:'uploaded',media_id:id});
       if(found.length!==1)return fail('media_outcome_uncertain');
       return reply({status:'uploaded',stage:'uploaded',operationId:job.id,childCode:job.child_code,position:job.image_position});
     }catch(error){
       // Persistence has its own diagnostics in query(); never expose details or retry a POST.
       if(phase!=='persistence')runtime.emit(phase,began,timedOut(error,signal)?'timeout':phase==='response'?'invalid_response':'transport',{httpStatus:status,remoteCode});
       return fail('media_outcome_uncertain');}
   }
   if(body.action==='link'){
     if(job.stage==='link_started')return fail('media_outcome_uncertain');
     if(job.stage!=='uploaded'||!job.media_id)return fail('media_not_uploaded');
     const relation=buildMagazordMediaRelation(job.parent_code,job.child_code,[job.media_id]);
     const relationPayload=JSON.stringify(relation.body);
     if(runtime.remaining()<13_000)return fail('media_preparation_unavailable');
     found=await query('magazord_media_jobs','PATCH',{id:'eq.'+job.id,stage:'eq.uploaded',fingerprint:'eq.'+fingerprint,
       store_id:'eq.'+store,actor_id:'eq.'+actor},{stage:'link_started'});
     if(found.length!==1)return fail('media_operation_in_progress');
     let linkPhase:'link'|'response'|'persistence'='link',linkBegan=runtime.now(),linkStatus:number|undefined,linkSignal:AbortSignal|undefined;
     try{
       linkSignal=runtime.signal(12_000,5000);
       const resp=await boundedFetch(PRICE_HOMOLOGATION+relation.path,{method:'POST',redirect:'error',credentials:'omit',
         cache:'no-store',signal:linkSignal,
         headers:{Authorization:'Basic '+Buffer.from(env.MAGAZORD_API_USER+':'+env.MAGAZORD_API_PASSWORD).toString('base64'),
           Accept:'application/json','Content-Type':'application/json'},body:relationPayload});
       linkStatus=resp.status;
       if(resp.status!==201){void resp.body?.cancel().catch(()=>{});runtime.emit('link',linkBegan,'http_rejected',{httpStatus:linkStatus});return fail('media_outcome_uncertain');}
       runtime.emit('link',linkBegan,'ok',{httpStatus:linkStatus});linkPhase='response';linkBegan=runtime.now();
       if(!/^application\/json(?:;|$)/i.test(resp.headers.get('content-type')||'')){
         void resp.body?.cancel().catch(()=>{});throw new Error('invalid_content_type');}
       linkSignal=AbortSignal.any([linkSignal,runtime.signal(1000,5000)]);
       const linked=await readLimitedJson(resp.body,65536,linkSignal);
       if(linked?.status!=='success')throw new Error('invalid_link_response');
       runtime.emit('response',linkBegan,'ok',{httpStatus:linkStatus});linkPhase='persistence';
       found=await query('magazord_media_jobs','PATCH',{id:'eq.'+job.id,stage:'eq.link_started',fingerprint:'eq.'+fingerprint,
         store_id:'eq.'+store,actor_id:'eq.'+actor},{stage:'linked'});
       if(found.length!==1)return fail('media_outcome_uncertain');
       return reply({status:'linked',stage:'linked',operationId:job.id,childCode:job.child_code,position:job.image_position});
     }catch(error){if(linkPhase!=='persistence')runtime.emit(linkPhase,linkBegan,timedOut(error,linkSignal)?'timeout':linkPhase==='response'?'invalid_response':'transport',{httpStatus:linkStatus});return fail('media_outcome_uncertain');}
   }
   return fail('invalid_media_request',400);
 }catch(error){
   if(error instanceof AmazonAccessError)return reply({code:'media_access_denied'},error.status);
   if(error instanceof MediaError)return reply({code:error.code},error.status);
   return reply({code:'media_unavailable'},503);
 }
 };
}
