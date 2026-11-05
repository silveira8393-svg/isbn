import { request } from 'node:https';
import { lookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';
import { Readable } from 'node:stream';
import { GALLERY_ORIGIN } from '../src/utils/curitibaGallery.js';

const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
  ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],
  ['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)
  blocked.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::',3,'ipv6');
blocked.addSubnet('2001:db8::',32,'ipv6'); blocked.addSubnet('2001::',32,'ipv6');

export function isPublicGalleryAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address,'ipv4') : family === 6 && globalV6.check(address,'ipv6') && !blocked.check(address,'ipv6');
}

/** Exact-host HTTPS only; DNS is checked at connection time, without a second unchecked resolution. */
export const fetchCuritibaIndex: typeof fetch = (input: string | URL | Request, init: RequestInit = {}) => new Promise<Response>((resolve, reject) => {
  const url = new URL(String(input));
  if (url.origin !== GALLERY_ORIGIN || url.username || url.password || url.search || url.hash || init.method !== 'GET') {
    reject(new Error('invalid_gallery_target')); return;
  }
  const connection = request(url, { method:'GET', headers:{Accept:'text/html'}, signal:init.signal || undefined,
    // No forwarding of caller headers, cookies, tokens, Referer or credentials. Normal TLS verification.
    lookup: ((hostname: string, options: {all?: boolean}, callback: (...args: any[]) => void) => {
      if (hostname !== new URL(GALLERY_ORIGIN).hostname) { callback(new Error('invalid_gallery_host')); return; }
      lookup(hostname,{all:true},(error,addresses) => {
        if (error || !addresses.length || addresses.some(entry => !isPublicGalleryAddress(entry.address))) {
          callback(new Error('gallery_dns_denied')); return;
        }
        if (options.all) callback(null,addresses);
        else callback(null,addresses[0].address,addresses[0].family);
      });
    }) as typeof lookup,
  }, response => {
    const headers = new Headers();
    for (const [key,value] of Object.entries(response.headers)) if (value !== undefined)
      headers.set(key,Array.isArray(value) ? value.join(', ') : value);
    const status = response.statusCode || 502;
    if ([204,205,304].includes(status)) { response.resume(); resolve(new Response(null,{status,headers})); return; }
    resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>,{status,headers}));
  });
  connection.once('error',reject); connection.end();
});
