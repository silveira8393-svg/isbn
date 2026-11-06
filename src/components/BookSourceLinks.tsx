import type { BookInfo } from '../types';
import { bookSourceLinks } from '../utils/bookSourceLinks';

export default function BookSourceLinks({ book }: { book: Pick<BookInfo, 'isbn13' | 'isbn10' | 'sourceLinks' | 'amazonCatalogReference' | 'googleBooksReference'> }) {
  const links = bookSourceLinks(book);
  // One product link per source; preview is used when the API returned no info page.
  const available = (['curitiba', 'amazon', 'google_books'] as const).map(source =>
    links.find(link => link.source === source && link.kind === 'info') || links.find(link => link.source === source)).filter(Boolean);
  if (!available.length) return null;
  const names = { curitiba: 'Curitiba', amazon: 'Amazon', google_books: 'Google Books' };
  return <section aria-label="Fontes externas da obra" className="w-full text-xs">
    <h3 className="mb-1.5 font-medium text-slate-600">Fontes externas da obra</h3>
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {available.map(link => link && <li key={link.source}><a href={link.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
        className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900" aria-label={`${names[link.source]} — abrir em outra aba`}>{names[link.source]}</a></li>)}
    </ul>
  </section>;
}
