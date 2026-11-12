import type { BookInfo, EditionReference } from '../types';
import { editionReferences, validEditionReference } from '../utils/editionReferences';

const names = { amazon: 'Amazon', google_books: 'Google Books', curitiba: 'Distribuidora Curitiba' };
export default function EditionReferenceLinks({ book, references, compact = false }: {
  book?: Partial<BookInfo>; references?: EditionReference[]; compact?: boolean;
}) {
  const links = book ? editionReferences(book) : (Array.isArray(references) ? references : []).filter(validEditionReference);
  if (!links.length) return null;
  return <section aria-label="Referência da obra" className={compact ? 'px-3 pb-3 text-xs' : 'rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm'}>
    {!compact && <h3 className="mb-2 font-semibold text-slate-700">Referência da obra</h3>}
    <ul className="flex flex-wrap gap-x-5 gap-y-2">{links.map(reference => <li key={`${reference.source}:${reference.id}`}>
      <span className="text-slate-600">{names[reference.source]} · {reference.id}</span>{' '}
      <a href={reference.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
        aria-label={`Abrir produto na fonte — ${names[reference.source]} — ${reference.id}`}
        className="font-medium text-blue-700 underline underline-offset-2">Abrir produto na fonte</a>
    </li>)}</ul>
  </section>;
}
