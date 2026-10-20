import { useEffect, useState } from 'react';

/** Load this module only when its authorized settings area is mounted. */
export default function InfrastructureEntry() {
  const [Panel, setPanel] = useState<null | (() => unknown)>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void import('./InfrastructurePanel').then(module => {
      if (!cancelled) setPanel(() => module.default);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);
  if (failed) return <p role="alert">Não foi possível carregar Infraestrutura. Reabra esta seção para tentar novamente.</p>;
  return Panel ? <Panel /> : <p role="status">Carregando Infraestrutura...</p>;
}
