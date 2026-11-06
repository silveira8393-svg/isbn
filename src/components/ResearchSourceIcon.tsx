import type { ResearchSource } from '../utils/researchSources';

/** Local vector marks following the approved source cards; no external image request. */
export default function ResearchSourceIcon({ source }: { source: ResearchSource }) {
  if (source === 'brasil_api') return <svg viewBox="0 0 36 28" aria-hidden="true"><rect width="36" height="28" rx="4" fill="#009739" /><path d="M18 3 33 14 18 25 3 14Z" fill="#ffdf00" /><circle cx="18" cy="14" r="7" fill="#163b91" /><path d="M11.5 11.8q7-1 12.7 5" fill="none" stroke="white" strokeWidth="1.5" /></svg>;
  if (source === 'curitiba') return <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="6" fill="#1670d5" /><path d="M24 8a11 11 0 1 0 0 16l-3.7-4a5.7 5.7 0 1 1 0-8Z" fill="#f5f9ff" /></svg>;
  if (source === 'amazon') return <svg viewBox="0 0 36 36" aria-hidden="true"><text x="8" y="25" fontFamily="Georgia,serif" fontSize="33" fontWeight="bold" fill="#f4f6fa">a</text><path d="M4 29q13 7 27-1m-5-.6 5.5.2-1.4 4" fill="none" stroke="#ffac22" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7.2 10.8A10 10 0 0 1 23 8.9" fill="none" stroke="#ea4335" strokeWidth="5.5" /><path d="M7.2 10.8a10 10 0 0 0 0 10.4" fill="none" stroke="#fbbc05" strokeWidth="5.5" /><path d="M7.2 21.2A10 10 0 0 0 23 23" fill="none" stroke="#34a853" strokeWidth="5.5" /><path d="M23 23q4-3.6 3-9H16" fill="none" stroke="#4285f4" strokeWidth="5.5" /></svg>;
}
