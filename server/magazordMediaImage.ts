import { inflateSync } from 'node:zlib';
import { MAGAZORD_MEDIA_MAX_BYTES, type MediaImageFormat } from '../shared/magazordMedia.js';

// Structural validation, not an image transcoder. Bound decompression and pixel work.
const MAX_PIXELS = 16_000_000;
function dimensions(w: number, h: number) {
  if (!w || !h || w * h > MAX_PIXELS) throw new Error('invalid_image_dimensions');
}
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function validateMediaImage(bytes: Uint8Array, format: MediaImageFormat) {
  const b = Buffer.from(bytes);
  const invalid = (): never => { throw new Error('invalid_image_structure'); };
  if (b.length < 12 || b.length > MAGAZORD_MEDIA_MAX_BYTES) invalid();
  if (format === 'png') {
    if (b.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') invalid();
    let p = 8, width = 0, height = 0, depth = 0, color = 0, interlace = 0, ended = false;
    const data: Buffer[] = [];
    while (p + 12 <= b.length) {
      const n = b.readUInt32BE(p), type = b.toString('ascii',p+4,p+8);
      if (n > b.length-p-12 || crc32(b.subarray(p+4,p+8+n)) !== b.readUInt32BE(p+8+n)) invalid();
      if (p === 8 && type !== 'IHDR') invalid();
      if (type === 'IHDR') {
        if (p !== 8 || n !== 13) invalid();
        width=b.readUInt32BE(p+8); height=b.readUInt32BE(p+12); dimensions(width,height);
        depth=b[p+16]; color=b[p+17]; interlace=b[p+20];
        const depths: Record<number, number[]> = {0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
        if (!depths[color]?.includes(depth) || b[p+18] || b[p+19] || interlace>1) invalid();
      }
      if (type === 'IDAT') data.push(b.subarray(p+8,p+8+n));
      p += n+12;
      if (type === 'IEND') { if(n || p !== b.length) invalid(); ended=true; break; }
    }
    if (!ended || !data.length) invalid();
    const channels: Record<number,number>={0:1,2:3,3:1,4:2,6:4};
    const passes = interlace ? [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]] : [[0,0,1,1]];
    const rows: {length:number; count:number}[]=[];
    for(const [x,y,dx,dy] of passes) {
      const w=Math.max(0,Math.ceil((width-x)/dx)), h=Math.max(0,Math.ceil((height-y)/dy));
      if(w && h) rows.push({length:1+Math.ceil(w*channels[color]*depth/8),count:h});
    }
    const expected=rows.reduce((n,r)=>n+r.length*r.count,0);
    const compressed=Buffer.concat(data);
    // Node returns {buffer, engine} with info:true; older @types/node omits this overload.
    const decoded=inflateSync(compressed,{maxOutputLength:expected+1,info:true}) as unknown as {buffer:Buffer;engine:{bytesWritten:number}};
    if(decoded.buffer.length!==expected || decoded.engine.bytesWritten!==compressed.length) invalid();
    let offset=0;
    for(const row of rows) for(let y=0;y<row.count;y++){if(decoded.buffer[offset]>4) invalid();offset+=row.length;}
    return;
  }
  if (format === 'jpg') {
    if (b[0]!==255 || b[1]!==216) invalid();
    let p=2, frame=false, scan=false;
    while(p<b.length) {
      if(b[p++]!==255) invalid();
      while(b[p]===255)p++;
      const marker=b[p++];
      if(marker===217){if(!frame||!scan||p!==b.length)invalid();return;}
      if(!marker||marker===216||marker===undefined)invalid();
      if(marker===1 || (marker>=208&&marker<=215))continue;
      if(p+2>b.length)invalid();
      const n=b.readUInt16BE(p); if(n<2||p+n>b.length)invalid();
      if([192,193,194].includes(marker)) {
        if(n<11 || n!==8+3*b[p+7])invalid();
        dimensions(b.readUInt16BE(p+5),b.readUInt16BE(p+3));frame=true;
      }
      if(marker===218){if(!frame||n<6||n!==6+2*b[p+2])invalid();scan=true;}
      p+=n;
      if(marker===218) {
        const start=p;
        while(p<b.length) {
          if(b[p]!==255){p++;continue;}
          if(b[p+1]===0 || (b[p+1]>=208&&b[p+1]<=215)){p+=2;continue;}
          break;
        }
        if(p===start)invalid();
      }
    }
    invalid();
  }
  if(format==='webp') {
    if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WEBP'||b.readUInt32LE(4)!==b.length-8)invalid();
    let p=12, image=false;
    while(p+8<=b.length){
      const type=b.toString('ascii',p,p+4),n=b.readUInt32LE(p+4),s=p+8;
      if(n>b.length-s)invalid();
      if(type==='VP8 '){
        if(image||n<11||b[s]&1||b.toString('hex',s+3,s+6)!=='9d012a')invalid();
        dimensions(b.readUInt16LE(s+6)&16383,b.readUInt16LE(s+8)&16383);
        if((b.readUIntLE(s,3)>>>5)>n-10)invalid();image=true;
      }else if(type==='VP8L'){
        if(image||n<6||b[s]!==47||b[s+4]>>>5)invalid();
        const bits=b.readUInt32LE(s+1);dimensions((bits&16383)+1,((bits>>>14)&16383)+1);image=true;
      }else if(type==='VP8X'){
        if(p!==12||n!==10||b[s]&2)invalid(); // Animated covers require a decoder; fail before reservation.
        dimensions(b.readUIntLE(s+4,3)+1,b.readUIntLE(s+7,3)+1);
      }else if(!['ALPH','ICCP','EXIF','XMP '].includes(type))invalid();
      p=s+n+(n%2);
    }
    if(!image||p!==b.length)invalid();return;
  }
  invalid();
}
