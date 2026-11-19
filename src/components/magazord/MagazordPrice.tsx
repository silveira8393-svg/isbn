import { useEffect, useRef, useState } from 'react';
import type { User } from '../../types';
import { priceCents, priceUuid } from '../../../shared/magazordPrice';
import { prepareMagazordPrice, submitMagazordPrice } from '../../services/magazordPrice';

export default function MagazordPrice({ registrationId, parentCode, childCode, price, user, onBusy }: {
  registrationId: string; parentCode: string; childCode: string; price: string; user: User; onBusy?: (busy: boolean) => void;
}) {
  const identity = JSON.stringify([user.id, user.storeId, user.active, registrationId, parentCode, childCode, price]);
  const current = useRef(identity); current.current = identity;
  const lock = useRef(false);
  const attempted = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{ identity: string; message: string } | null>(null);
  const visible = view?.identity === identity ? view : null;

  async function process(reconcile = false) {
    if (lock.current || !user.active || current.current !== identity) return;
    lock.current = true; setBusy(true); onBusy?.(true);
    try {
      const cents = priceCents(price);
      // Keep the exact intent across reloads. A previous attempt may only be reconciled.
      const key = `isbn-magazord-price:v1:${user.id}:${user.storeId}:${registrationId}`;
      const saved = sessionStorage.getItem(key);
      let operationId: string;
      if (saved) {
        const intent = JSON.parse(saved);
        if (intent.identity !== identity || !priceUuid(intent.operationId)) throw new Error('A operação preservada possui dados diferentes. Preserve o preço e consulte o responsável.');
        operationId = intent.operationId;
        reconcile = true;
      } else {
        const preview = await prepareMagazordPrice(registrationId, price, user);
        if (current.current !== identity) return;
        if (preview.parentCode !== parentCode || preview.childCode !== childCode || preview.tableId !== 1 || preview.cents !== cents)
          throw new Error('Produto, preço ou tabela Padrão divergente. Envio bloqueado.');
        if (!preview.writesEnabled || !preview.operationId) throw new Error('Envio de preço bloqueado no backend.');
        if (!reconcile && !preview.eligible) throw new Error('Preço existente ou resposta ambígua. Envio bloqueado para revisão.');
        operationId = preview.operationId;
        // If storage fails, no request capable of sending a price is made.
        sessionStorage.setItem(key, JSON.stringify({ identity, operationId }));
      }
      if (current.current !== identity) return;
      if (!reconcile && attempted.current === identity) return;
      attempted.current = identity;
      const result = await submitMagazordPrice(registrationId, price, operationId, user, reconcile);
      if (result.childCode !== childCode || result.tableId !== 1 || result.cents !== cents)
        throw new Error('Preço não confirmado para este Filho e tabela Padrão.');
      if (current.current === identity) setView({ identity, message: 'Preço confirmado na Magazord. Tabela Padrão (ID 1).' });
    } catch (error) {
      if (current.current === identity) setView({ identity, message: error instanceof Error ? error.message : 'Preço não confirmado. Consulte o estado sem reenviar.' });
    } finally { lock.current = false; setBusy(false); onBusy?.(false); }
  }

  // Mounted only after the registration is verified. No automatic retry on failure.
  useEffect(() => {
    current.current = identity;
    void process();
    return () => { current.current = ''; };
  }, [identity]);

  return <section className="space-y-2 rounded border p-3" aria-label="Preço em homologação">
    <h4 className="font-bold">Preço de venda</h4>
    <p>Filho: {childCode}. Preço informado: R$ {price || 'não informado'}. Tabela Padrão (ID 1).</p>
    <p role="status">{busy ? 'Processando e confirmando o preço...' : visible?.message}</p>
    <button type="button" disabled={busy || !user.active} onClick={() => void process(true)} className="rounded border px-3 py-2">Consultar estado do preço (sem reenvio)</button>
  </section>;
}
