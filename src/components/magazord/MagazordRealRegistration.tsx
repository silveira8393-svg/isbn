import { useEffect, useRef, useState } from 'react';
import type { RegistrationDraft, User } from '../../types';
import { registrationInput, registrationPayload } from '../../../shared/magazordRegistration';
import { submitMagazordRegistration } from '../../services/magazordRegistration';

/** Separate action in the existing review; never invokes simulator callbacks or audit-as-simulation. */
export default function MagazordRealRegistration({ draft, user, onBusy, onStarted, onDone }: {
  draft: RegistrationDraft; user?: User; onBusy: (busy: boolean) => void; onStarted: () => void; onDone: () => void;
}) {
  const identity = `${user?.id}:${user?.storeId}`;
  const currentIdentity = useRef(identity); currentIdentity.current = identity;
  const storageKey = `isbn-magazord-registration:v1:${identity}:${JSON.stringify([draft.parentCode, draft.childCode])}`;
  type Operation = { id: string; input: ReturnType<typeof registrationInput>; identity: string };
  const [saved] = useState<Operation | null>(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (value?.identity === identity && typeof value.id === 'string') { registrationPayload(value.input); return value; }
    } catch { /* Never clear a potentially partial server operation. */ }
    return null;
  });
  const [brand, setBrand] = useState(saved ? String(saved.input.brandId) : ''), [channel, setChannel] = useState(saved ? String(saved.input.channelId) : '');
  // A restored input cannot reconstruct the backend's tenant-specific derivation configuration.
  const [preview, setPreview] = useState<any>(null), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [started, setStarted] = useState(!!saved), [verified, setVerified] = useState(false);
  const lock = useRef(false);
  const operation = useRef<Operation | null>(saved);
  useEffect(() => { if (saved) onStarted(); }, []);
  const frozen = started || busy;
  async function act(action: 'preview' | 'create') {
    if (lock.current || !user || verified) return;
    lock.current = true; setBusy(true); onBusy(true); setMessage('');
    try {
      if (action === 'preview') {
        operation.current = { id: crypto.randomUUID(), input: registrationInput(draft, Number(brand), Number(channel)), identity };
      }
      const op = operation.current;
      if (!op || op.identity !== identity) throw new Error('Usuário ou loja mudou. Retorne ao cadastro e confira a sessão.');
      if (action === 'create') {
        // Persist before sending, so a reload or lost response keeps the same operation and frozen payload.
        try { sessionStorage.setItem(storageKey, JSON.stringify(op)); }
        catch { throw new Error('Não foi possível preservar a operação nesta aba. Nenhuma criação foi enviada por esta tentativa.'); }
        setStarted(true); onStarted();
      }
      const result = await submitMagazordRegistration(action, op.id, op.input, user);
      if (currentIdentity.current !== op.identity) throw new Error('A sessão ou loja mudou. O resultado da operação anterior não será exibido.');
      if (action === 'preview') setPreview(result.payload);
      else { setVerified(true); setMessage(`Pai ${result.parentCode} e Filho ${result.childCode} confirmados na homologação. Sem preço, estoque ou imagens.`); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Operação não confirmada. Preserve os dados.'); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  return <section className="space-y-3 rounded-lg border border-amber-300 p-4" aria-label="Cadastro real em homologação">
    <h3 className="font-bold">Cadastro real — somente homologação</h3>
    <p className="text-sm">Ação independente do simulador. Cria Pai e Filho inativos, sem enviar imagens, preço ou estoque. Dados opcionais fora do payload abaixo permanecem apenas no formulário.</p>
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">ID da Marca Magazord <input aria-label="ID da Marca Magazord" type="number" min="1" value={brand} disabled={frozen} onChange={e => { setBrand(e.target.value); setPreview(null); }} className="rounded border p-2" /></label>
      <label className="text-sm">ID da loja/canal Magazord <input aria-label="ID da loja/canal Magazord" type="number" min="1" value={channel} disabled={frozen} onChange={e => { setChannel(e.target.value); setPreview(null); }} className="rounded border p-2" /></label>
    </div>
    <p className="text-xs">O canal numérico não é o UUID da loja ISBN. A derivação Único é definida pela configuração da loja no backend de homologação.</p>
    {!started && <button type="button" disabled={busy || !user || !brand || !channel} onClick={() => act('preview')} className="rounded border px-4 py-2 text-sm disabled:opacity-50">Consultar códigos e revisar payload real</button>}
    {preview && <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs" aria-label="Payload real de homologação">{JSON.stringify(preview, null, 2)}</pre>}
    {(preview || started) && !verified && <button type="button" disabled={busy || operation.current?.identity !== identity} onClick={() => act('create')} className="rounded bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Consultando / confirmando...' : started ? 'Consultar estado / continuar' : 'Confirmar criação real na homologação'}</button>}
    {started && !verified && <p className="text-sm">Operação iniciada: os dados e a chave ficam preservados nesta aba, inclusive após recarregar. Em resultado incerto, consulte o estado com a mesma chave. Se a aba for encerrada, os códigos continuam reservados no backend e exigem reconciliação.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {verified && <button type="button" onClick={onDone} className="rounded border px-4 py-2 text-sm">Continuar para outro livro</button>}
  </section>;
}
