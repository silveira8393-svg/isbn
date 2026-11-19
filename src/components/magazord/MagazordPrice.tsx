import { useRef, useState } from 'react';
import type { User } from '../../types';
import type { PricePreview } from '../../../shared/magazordPrice';
import { previewMagazordPrice, submitMagazordPrice } from '../../services/magazordPrice';

export default function MagazordPrice({ registrationId, parentCode, childCode, price, user }: {
  registrationId: string; parentCode: string; childCode: string; price: string; user: User;
}) {
  const identity = `${user.id}:${user.storeId}:${registrationId}:${price}`;
  const current = useRef(identity); current.current = identity;
  const lock = useRef(false);
  const attempted = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{ identity: string; preview?: PricePreview; message?: string } | null>(null);
  const visible = view?.identity === identity ? view : null;
  const labels = { ready_for_local_review: 'Ausência de preço confirmada para revisão local.',
    existing_price_review_required: 'Preço ou preço antigo existente: gravação bloqueada para revisão.',
    ambiguous_price_response: 'Resposta de preço ambígua: gravação bloqueada.' };
  async function review() {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const result = await previewMagazordPrice(registrationId, price, user);
      if (current.current !== identity) return;
      if (result.childCode !== childCode || result.parentCode !== parentCode) throw new Error('O produto confirmado diverge desta revisão.');
      setView({ identity, preview: result });
    } catch (error) {
      if (current.current === identity) setView({ identity, message: error instanceof Error ? error.message : 'Revisão indisponível.' });
    } finally { lock.current = false; setBusy(false); }
  }
  async function submit(reconcile = false) {
    const preview = visible?.preview;
    if (lock.current || !user.active || !preview?.writesEnabled || !preview.operationId
      || (!reconcile && (!preview.eligible || attempted.current === preview.operationId))) return;
    lock.current = true; setBusy(true);
    if (!reconcile) attempted.current = preview.operationId;
    try {
      const result = await submitMagazordPrice(registrationId, price, preview.operationId, user, reconcile);
      if (result.childCode !== childCode || result.tableId !== preview.tableId) throw new Error('Preço não confirmado para este Filho e tabela.');
      attempted.current = preview.operationId;
      if (current.current === identity) setView({ identity, preview, message: 'Preço confirmado na Magazord por consulta.' });
    } catch (error) {
      if (current.current === identity) setView({ identity, preview, message: error instanceof Error ? error.message : 'Preço não confirmado. Consulte o estado sem reenviar.' });
    } finally { lock.current = false; setBusy(false); }
  }
  return <section className="space-y-2 rounded border p-3" aria-label="Preço separado em homologação">
    <h4 className="font-bold">Preço de venda — revisão separada</h4>
    <p>Filho: {childCode}. Preço informado: R$ {price || 'não informado'}.</p>
    <p>A revisão consulta somente dados. O envio exige liberação explícita e diário de preço no backend.</p>
    <button type="button" disabled={busy || !user.active} onClick={() => void review()} className="rounded border px-3 py-2">{busy ? 'Consultando...' : 'Revisar preço (somente leitura)'}</button>
    {visible?.preview && <p role="status">Tabela: {visible.preview.tableName} (ID {visible.preview.tableId}). {labels[visible.preview.state]}</p>}
    {visible?.message && <p role="status">{visible.message}</p>}
    <button type="button" disabled={busy || !user.active || !visible?.preview?.writesEnabled || !visible.preview.eligible || attempted.current === visible.preview.operationId}
      onClick={visible?.preview?.writesEnabled ? () => void submit() : undefined} className="rounded border px-3 py-2">Enviar preço — confirmar na homologação</button>
    {visible?.preview?.writesEnabled && <button type="button" disabled={busy || !user.active} onClick={() => void submit(true)} className="rounded border px-3 py-2">Consultar estado do preço (sem reenvio)</button>}
  </section>;
}
