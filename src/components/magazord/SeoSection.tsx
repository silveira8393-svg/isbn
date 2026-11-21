import type { RegistrationDraft } from '../../types';

interface SeoSectionProps {
  draft: RegistrationDraft;
  onChange: (updates: Partial<RegistrationDraft>) => void;
}

export default function SeoSection({ draft, onChange }: SeoSectionProps) {
  const value = draft.metaDescription ?? '';
  const short = draft.shortDescription ?? '';
  return <section id="registration-seo" aria-label="SEO do produto" className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
    <div>
      <h3 className="text-sm font-bold text-slate-900">SEO do produto</h3>
      <p className="text-xs text-slate-500">Resumo da obra para os mecanismos de busca, separado da sinopse e das observações do exemplar.</p>
    </div>
    <div className="space-y-2 border-b border-slate-100 pb-4">
      <label htmlFor="short-description" className="block text-xs font-bold text-slate-700">Descrição resumida (comercial)</label>
      <textarea id="short-description" rows={3} maxLength={1000} value={short}
        onChange={event => onChange({ shortDescription: event.target.value })}
        placeholder="Resumo breve da obra, separado das condições do exemplar e do SEO."
        className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600" />
      <p className="text-xs text-slate-500">{short.length} caracteres. Sugestão automática editável; não inclui o estado de conservação do livro usado. Limite preventivo do ISBN: 1.000 caracteres (a confirmar na API).</p>
    </div>
    <label htmlFor="meta-description" className="block text-xs font-bold text-slate-700">Meta description (SEO)</label>
    <textarea id="meta-description" rows={3} value={value} onChange={event => onChange({ metaDescription: event.target.value })}
      aria-describedby="meta-description-help"
      placeholder="Sugestão gerada a partir dos dados bibliográficos disponíveis."
      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600" />
    <p id="meta-description-help" className="text-xs text-slate-500">{value.length} caracteres. Recomendado: até 160. Você pode editar ou apagar o texto; sua edição será preservada.</p>
  </section>;
}
