import { useEffect, useRef, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { infrastructureRequest, type CollectionResult, type InfraAction } from '../services/infrastructureService';
import { metricStatusLabels, type InfrastructureData } from '../types/infrastructure';

export function useInfrastructure() {
  const { currentUser, canViewDeveloperTools } = useUser();
  const key = `${currentUser.id}:${currentUser.storeId}:${currentUser.role}:${canViewDeveloperTools}`;
  const latestKey = useRef(key); latestKey.current = key;
  const locked = useRef(false);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{ key: string; data?: InfrastructureData; error?: string }>({ key });
  const [notice, setNotice] = useState<{ key: string; text: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  useEffect(() => {
    if (!canViewDeveloperTools) return;
    const controller = new AbortController(); let cancelled = false;
    setState({ key });
    void infrastructureRequest(currentUser.storeId ?? '', currentUser.id, { action: 'read' }, controller.signal)
      .then(data => { if (!cancelled) setState({ key, data }); })
      .catch(error => { if (!cancelled) setState({ key, error: error.message }); });
    return () => { cancelled = true; controller.abort(); };
  }, [key, reload]);

  async function act(action: InfraAction) {
    if (!canViewDeveloperTools || locked.current) return;
    locked.current = true; setBusyKey(key); setNotice(null);
    try {
      const result = await infrastructureRequest<CollectionResult>(currentUser.storeId ?? '', currentUser.id, action);
      if (latestKey.current !== key) return;
      const text = action.action === 'save' ? 'Configuração e auditoria salvas.'
        : action.action === 'initialize' ? 'Ambientes preparados. Produção Comercial permanece desativada.'
          : result.code === 'refresh_limited' ? 'Uma coleta já está em andamento ou foi realizada há menos de um minuto.'
            : result.code === 'disabled' ? 'Monitoramento desativado nesta configuração.'
              : `Resultado: ${metricStatusLabels[result.status] ?? 'Indisponível'}.`;
      setNotice({ key, text }); setReload(value => value + 1);
    } catch (error) {
      if (latestKey.current === key) setNotice({ key, text: error instanceof Error ? error.message : 'Não foi possível concluir a ação.' });
    } finally { locked.current = false; setBusyKey(previous => previous === key ? null : previous); }
  }
  return { allowed: canViewDeveloperTools, data: state.key === key ? state.data : undefined,
    error: state.key === key ? state.error : undefined, busy: busyKey === key,
    notice: notice?.key === key ? notice.text : null, act, refresh: () => setReload(value => value + 1) };
}
