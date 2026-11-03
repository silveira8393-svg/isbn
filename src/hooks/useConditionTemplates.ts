import { useEffect, useState } from 'react';
import { loadConditionTemplates, type ConditionTemplateSnapshot, type TemplateActor } from '../services/conditionTemplatesService';

export function useConditionTemplates(actor: TemplateActor) {
  const key = [actor.id, actor.storeId, actor.role, actor.active].join(':');
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; status: 'loading' | 'ready' | 'error'; data?: ConditionTemplateSnapshot; error?: string }>({ key, status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, status: 'loading' });
    loadConditionTemplates(actor, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ key, status: 'ready', data });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ key, status: 'error', error: error.message });
    });
    return () => controller.abort();
  }, [key, revision]);
  return {
    ...(state.key === key ? state : { key, status: 'loading' as const }),
    reload: () => setRevision(value => value + 1),
    acceptSaved: (data: ConditionTemplateSnapshot) => setState(previous => previous.key === key && data.storeId === actor.storeId
      ? { key, status: 'ready', data } : previous),
  };
}
