import type { RegistrationDraft } from '../../types';
import { formatRegistrationPrice } from '../../utils/draft';
import { BookOpen } from 'lucide-react';

/** Derived display only. The existing review and confirmation still own every operation. */
export default function RegistrationSummary({ draft }: { draft: RegistrationDraft }) {
  const rows: [string, unknown][] = [
    ['Título', draft.title], ['Autor', draft.authors?.join('; ')], ['Editora', draft.publisher],
    ['Categoria', draft.category], ['Condição', draft.condition === 'usado' ? 'Usado (Sebo)' : 'Novo'],
    ['Preço', formatRegistrationPrice(draft.price)], ['Estoque', Number.isFinite(draft.quantity) ? `${draft.quantity} un.` : 'Não informado'],
    ['Código Pai', draft.parentCode], ['Código Filho', draft.childCode], ['Localização', draft.location],
  ];
  return <section className="isbn-registration-summary rounded-lg" aria-label="Resumo do cadastro">
    <h3><BookOpen className="h-5 w-5" aria-hidden="true" />Resumo do cadastro</h3>
    <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value == null || value === '' ? 'Não informado' : String(value)}</dd></div>)}</dl>
    <p className="mt-3 text-xs text-slate-500">Cadastro no simulador. Revise os dados antes de confirmar; nenhuma publicação real na Magazord.</p>
  </section>;
}
