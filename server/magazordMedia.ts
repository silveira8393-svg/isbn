import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { authorizeAmazonSearch, AmazonAccessError, readLimitedJson } from './amazonAuthorization.js';
import { resolveMagazordBaseUrl } from './magazordBaseUrl.js';
import { serviceHeaders } from './spapi/supabaseHeaders.js';
import { PRICE_HOMOLOGATION, priceUuid } from '../shared/magazordPrice.js';
import { buildMagazordImageUpload, buildMagazordMediaRelation, validatedMagazordMediaId,
 MAGAZORD_MEDIA_MAX_BYTES, type MediaImageFormat } from '../shared/magazordMedia.js';

type Stage = 'prepared'|'upload_started'|'uploaded'|'link_started'|'linked';
type Job={id:string;registration_id:string;store_id:string;actor_id:string;environment:'homologation';
 parent_code:string;child_code:string;image_position:number;image_reference:string;fingerprint:string;
 stage:Stage;media_id:number|null};
class MediaError extends Error{constructor(public code:string,public status=409){super(code)}}
const fail=(code:string,status=409):never=>{throw new MediaError(code,status)};
const formats:Record<string,MediaImageFormat>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const BUCKET='isbn-registration-images';
const storageOrigin='https://jcxdkrpmrfbrhzwbzhph.supabase.co';
const STORAGE=/^\/storage\/v1\/object\/authenticated\/isbn-registration-images\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f]{64})\.(jpg|png|webp)$/;
const EXTERNAL_HOSTS=new Set(['m.media-amazon.com','images-na.ssl-images-amazon.com',
 'images-eu.ssl-images-amazon.com','books.google.com','books.googleusercontent.com']);
const exactReference=(v:unknown):v is string=>{
 if(typeof v!=='string'||v.length>2048)return false;
 try{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return false;
   if(u.origin===storageOrigin)return !u.search&&STORAGE.test(u.pathname);
   return !u.search&&EXTERNAL_HOSTS.has(u.hostname)&&u.pathname.length>1&&!u.pathname.endsWith('/');
 }catch{return false}
};
function uuidFor(registrationId:string,position:number){
 const hex=createHash('sha256').update('isbn-magazord-media:v1:').update(registrationId.toLowerCase()).update(':').update(String(position)).digest('hex').slice(0,32).split('');
 hex[12]='4';hex[16]='89ab'[parseInt(hex[16],16)%4];const h=hex.join('');
 return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
function db(env:NodeJS.ProcessEnv, fetcher:typeof fetch){
 let base:URL;try{base=new URL((env.SUPABASE_URL||env.VITE_SUPABASE_URL)!)}catch{return fail('media_persistence_unavailable',503)}
 const key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||base.origin!==storageOrigin||base.pathname!=='/'||base.search||base.hash||base.username||base.password)
   return fail('media_persistence_unavailable',503);
 return async(table:'magazord_registration_jobs'|'magazord_media_jobs',method:'GET'|'POST'|'PATCH',q:Record<string,string>,payload?:unknown):Promise<any[]>=>{
   if(table==='magazord_registration_jobs'&&method!=='GET')return fail('media_persistence_unavailable',503);
   const url=new URL('/rest/v1/'+table,base);url.search=new URLSearchParams(q).toString();
   const signal=AbortSignal.timeout(5000);
   const response=await fetcher(url,{method,signal,redirect:'error',credentials:'omit',cache:'no-store',
     headers:{...serviceHeaders(key),Prefer:'return=representation'},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
   if(!response.ok||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||'')){
     void response.body?.cancel().catch(()=>{});return fail('media_persistence_unavailable',503)}
   const rows=await readLimitedJson(response.body,65536,signal);
   if(!Array.isArray(rows))return fail('media_persistence_unavailable',503);
   return rows;
 };
}
async function binary(response:Response,max:number){
 if(!response.ok||!response.body)return fail('media_source_unavailable',409);
 const length=Number(response.headers.get('content-length'));
 if(Number.isFinite(length)&&length>max)return fail('media_source_too_large',413);
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let total=0;
 try{while(true){const{done,value}=await reader.read();if(done)break;total+=value.byteLength;
   if(total>max)return fail('media_source_too_large',413);parts.push(value)}
 }finally{void reader.cancel().catch(()=>{});reader.releaseLock()}
 return new Uint8Array(Buffer.concat(parts));
}
async function getImage(reference:string,actor:string,store:string,env:NodeJS.ProcessEnv,fetcher:typeof fetch){
 const u=new URL(reference);let bytes:Uint8Array;let contentType:string|undefined;
 if(u.origin===storageOrigin){
   const parsed=STORAGE.exec(u.pathname);
   if(!parsed||parsed[1]!==store||parsed[2]!==actor)return fail('media_source_denied',403);
   const key=env.SUPABASE_SERVICE_ROLE_KEY;
   if(!key)return fail('media_source_unavailable',503);
   const client=createClient(storageOrigin,key,{auth:{persistSession:false,autoRefreshToken:false},
     global:{fetch:fetcher}});
   const result=await client.storage.from(BUCKET).download(parsed[1]+'/'+parsed[2]+'/'+parsed[3]+'.'+parsed[4]);
   // Use exact path, never signed/persisted URLs.
   if(result.error||!result.data)return fail('media_source_unavailable');
   bytes=new Uint8Array(await result.data.arrayBuffer());contentType=result.data.type;
 }else{
   // Host allowlist and no redirects avoid user-controlled URLs reaching internal hosts.
   const response=await fetcher(u,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
     signal:AbortSignal.timeout(15000),headers:{Accept:'image/jpeg,image/png,image/webp'}});
   contentType=response.headers.get('content-type')?.split(';')[0].toLowerCase();
   bytes=await binary(response,MAGAZORD_MEDIA_MAX_BYTES);
 }
 if(bytes.byteLength<12||bytes.byteLength>MAGAZORD_MEDIA_MAX_BYTES)return fail('media_source_invalid');
 const extension=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpg':
   bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'?'png':
   String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'?'webp':undefined;
 if(!extension||!contentType||formats[contentType]!==extension)return fail('media_source_invalid');
 const name=createHash('sha256').update(bytes).digest('hex').slice(0,32)+'.'+extension;
 return {bytes,format:extension,name};
}
/** Each media position uses its own persistent journal, no replays after upload/link began.
 * Homologation only, no additional Magazord reads of parent or child.
 */
export function createMagazordMediaFunction({env=process.env,fetcher=fetch}:{env?:NodeJS.ProcessEnv;fetcher?:typeof fetch}={}){
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 return async(request:Request):Promise<Response>=>{
 try{
   const url=new URL(request.url);
   if(request.method!=='POST'||url.pathname!=='/api/magazord/price'||url.search!=='?media=1')return fail('invalid_media_request',400);
   if((request.headers.get('origin')&&request.headers.get('origin')!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return fail('origin_denied',403);
   if(resolveMagazordBaseUrl(env.MAGAZORD_BASE_URL)!==PRICE_HOMOLOGATION)return fail('homologation_only',403);
   if(!env.MAGAZORD_API_USER||!env.MAGAZORD_API_PASSWORD)return fail('media_not_configured',503);
   const store=request.headers.get('x-isbn-store-id')||'';
   if(!priceUuid(store)||store!==env.MAGAZORD_STORE_ID)return fail('store_access_denied',403);
   await authorizeAmazonSearch(request,env,fetcher);
   const actor=JSON.parse(Buffer.from(request.headers.get('authorization')!.split('.')[1],'base64url').toString()).sub;
   if(!priceUuid(actor))return fail('store_access_denied',403);
   if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return fail('json_required',415);
   const body=await readLimitedJson(request.body,8192,AbortSignal.timeout(5000));
   if(!body||!['prepare','upload','link','status'].includes(body.action)
     || Object.keys(body).some((k:string)=>!['action','registrationId','position','reference','operationId'].includes(k))
     || !priceUuid(body.registrationId)||!Number.isInteger(body.position)||body.position<0||body.position>19
     || !exactReference(body.reference))return fail('invalid_media_request',400);
   const query=db(env,fetcher);
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
     found=await query('magazord_media_jobs','PATCH',{id:'eq.'+job.id,stage:'eq.prepared',fingerprint:'eq.'+fingerprint,
       store_id:'eq.'+store,actor_id:'eq.'+actor},{stage:'upload_started'});
     if(found.length!==1)return fail('media_operation_in_progress');
     // Outcome is permanently uncertain unless we can persist a positive ID.
     try{
       const image=await getImage(job.image_reference,actor,store,env,fetcher);
       const resp=await fetcher(PRICE_HOMOLOGATION+'/v2/site/midia/upload',{method:'POST',redirect:'error',
         credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000),
         headers:{Authorization:'Basic '+Buffer.from(env.MAGAZORD_API_USER+':'+env.MAGAZORD_API_PASSWORD).toString('base64'),
           Accept:'application/json','Content-Type':'application/json'},
         body:JSON.stringify(buildMagazordImageUpload(image))});
       if(resp.status!==201||!/^application\/json(?:;|$)/i.test(resp.headers.get('content-type')||'')){
         void resp.body?.cancel().catch(()=>{});return fail('media_outcome_uncertain')}
       const data=await readLimitedJson(resp.body,65536,AbortSignal.timeout(5000));
       const id=validatedMagazordMediaId(data);
       found=await query('magazord_media_jobs','PATCH',{id:'eq.'+job.id,stage:'eq.upload_started',fingerprint:'eq.'+fingerprint,
         store_id:'eq.'+store,actor_id:'eq.'+actor},{stage:'uploaded',media_id:id});
       if(found.length!==1)return fail('media_outcome_uncertain');
       return reply({status:'uploaded',stage:'uploaded',operationId:job.id,childCode:job.child_code,position:job.image_position});
     }catch{return fail('media_outcome_uncertain')}
   }
   if(body.action==='link'){
     if(job.stage==='link_started')return fail('media_outcome_uncertain');
     if(job.stage!=='uploaded'||!job.media_id)return fail('media_not_uploaded');
     found=await query('magazord_media_jobs','PATCH',{id:'eq.'+job.id,stage:'eq.uploaded',fingerprint:'eq.'+fingerprint,
       store_id:'eq.'+store,actor_id:'eq.'+actor},{stage:'link_started'});
     if(found.length!==1)return fail('media_operation_in_progress');
     try{
       const relation=buildMagazordMediaRelation(job.parent_code,job.child_code,[job.media_id]);
       const resp=await fetcher(PRICE_HOMOLOGATION+relation.path,{method:'POST',redirect:'error',credentials:'omit',
         cache:'no-store',signal:AbortSignal.timeout(20000),
         headers:{Authorization:'Basic '+Buffer.from(env.MAGAZORD_API_USER+':'+env.MAGAZORD_API_PASSWORD).toString('base64'),
           Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(relation.body)});
       if(resp.status!==201){void resp.body?.cancel().catch(()=>{});return fail('media_outcome_uncertain')}
       void resp.body?.cancel().catch(()=>{});
       found=await query('magazord_media_jobs','PATCH',{id:'eq.'+job.id,stage:'eq.link_started',fingerprint:'eq.'+fingerprint,
         store_id:'eq.'+store,actor_id:'eq.'+actor},{stage:'linked'});
       if(found.length!==1)return fail('media_outcome_uncertain');
       return reply({status:'linked',stage:'linked',operationId:job.id,childCode:job.child_code,position:job.image_position});
     }catch{return fail('media_outcome_uncertain')}
   }
   return fail('invalid_media_request',400);
 }catch(error){
   if(error instanceof AmazonAccessError)return reply({code:'media_access_denied'},error.status);
   if(error instanceof MediaError)return reply({code:error.code},error.status);
   return reply({code:'media_unavailable'},503);
 }
 };
}
