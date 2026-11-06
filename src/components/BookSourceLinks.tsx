import type { BookInfo } from '../types';
import { bookSourceLinks } from '../utils/bookSourceLinks';
import { isImageReference } from '../utils/imageUrls';

export default function BookSourceLinks({ book }: { book: Pick<BookInfo, 'isbn13' | 'isbn10' | 'sourceLinks' | 'amazonCatalogReference' | 'googleBooksReference' | 'amazonCandidates' | 'amazonReviewRequired'> }) {
  const links = bookSourceLinks(book);
  // Ambiguous Amazon products remain individually identified; other sources retain one link.
  const available = (['curitiba', 'amazon', 'google_books'] as const).flatMap(source => source === 'amazon'
    ? links.filter(link => link.source === source)
    : [links.find(link => link.source === source && link.kind === 'info') || links.find(link => link.source === source)]).filter(Boolean);
  if (!available.length) return null;
  const names = { curitiba: 'Curitiba', amazon: 'Amazon', google_books: 'Google Books' };
  return <section aria-label="Fontes externas da obra" className="w-full text-xs">
    <h3 className="mb-1.5 font-medium text-slate-600">Fontes externas da obra</h3>
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {available.map(link => link && <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
        className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900" aria-label={`${names[link.source]}${link.reviewRequired ? ` — candidato ${link.url.split('/').pop()}` : ''} — abrir em outra aba`}>{names[link.source]}{link.reviewRequired ? ` — candidato ${link.url.split('/').pop()}` : ''}</a></li>)}
    </ul>
    {book.amazonReviewRequired && !!book.amazonCandidates?.length && <details className="mt-2 text-slate-500">
      <summary className="cursor-pointer">Candidatos Amazon para conferência opcional</summary>
      <ul className="mt-1 space-y-1">{book.amazonCandidates.map((candidate, index) => {
        const cover = candidate.images?.filter(image => image?.variant === 'MAIN' && isImageReference(image.link))
          .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];
        return <li key={`${candidate.asin}-${index}`}>{candidate.asin}: {candidate.title || 'Sem título'}
          {candidate.authors?.length ? ` — ${candidate.authors.join(', ')}` : ''}
          {cover && <> — <a href={cover.link} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="underline">Capa candidata</a></>}
        </li>;
      })}</ul>
    </details>}
  </section>;
}
