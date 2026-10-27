// Apenas leituras no Auth e nas tabelas já usadas por UserContext, sob RLS.
export class AmazonAccessError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function readLimitedJson(stream: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal) {
  if (!stream) throw new Error('empty_body');
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let abort: () => void;
  const aborted = new Promise<never>((_, reject) => {
    abort = () => { void reader.cancel().catch(() => {}); reject(new Error('timeout')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error('body_limit');
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener('abort', abort!);
    reader.releaseLock();
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function authorizeAmazonDeveloper(request: Request, env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch) {
  const authorization = request.headers.get('authorization');
  if (!authorization || !/^Bearer [A-Za-z0-9._~-]{16,8192}$/.test(authorization)) {
    throw new AmazonAccessError(401, 'unauthenticated', 'Entre novamente para acessar o Laboratório Amazon.');
  }
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  let url: URL;
  try { url = new URL(base!); } catch { throw new AmazonAccessError(503, 'auth_configuration', 'Autenticação do laboratório não configurada.'); }
  // Não aceitar chave administrativa nem uma configuração que encaminhe o token por HTTP.
  let administrative = key?.startsWith('sb_secret_');
  if (key?.startsWith('eyJ')) {
    try { administrative ||= JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role !== 'anon'; }
    catch { administrative = true; }
  }
  if (!key || administrative || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new AmazonAccessError(503, 'auth_configuration', 'Autenticação do laboratório não configurada.');
  }
  const signal = AbortSignal.timeout(5000); // Prazo total das quatro leituras.
  async function get(path: string, query?: Record<string, string>) {
    const target = new URL(path, url);
    if (query) target.search = new URLSearchParams(query).toString();
    const response = await fetcher(target, { method: 'GET', signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
      headers: { apikey: key!, Authorization: authorization!, Accept: 'application/json' } });
    if (!response.ok) {
      void response.body?.cancel();
      throw new AmazonAccessError(response.status === 401 ? 401 : response.status === 403 ? 403 : 503,
        'authorization_failed', 'Não foi possível validar o acesso ao laboratório.');
    }
    return readLimitedJson(response.body, 64 * 1024, signal);
  }
  const denied = () => new AmazonAccessError(403, 'developer_required', 'Acesso exclusivo ao perfil Desenvolvimento ativo.');
  try {
    // O Auth verifica o token; claims enviados pelo cliente e user_metadata não concedem acesso.
    const user = await get('/auth/v1/user');
    if (!user || !uuid.test(user.id) || user.is_anonymous === true) throw denied();
    const profiles = await get('/rest/v1/profiles', { select: 'id,active', id: `eq.${user.id}`, limit: '1' });
    if (!Array.isArray(profiles) || profiles.length !== 1 || profiles[0].id !== user.id || profiles[0].active !== true) throw denied();
    // Mesma loja inicial escolhida pelo UserContext existente.
    const memberships = await get('/rest/v1/store_users', { select: 'user_id,store_id,role,active', user_id: `eq.${user.id}`,
      active: 'eq.true', order: 'store_id.asc', limit: '1' });
    const member = Array.isArray(memberships) && memberships.length === 1 ? memberships[0] : null;
    if (!member || member.user_id !== user.id || member.active !== true || member.role !== 'developer' || !uuid.test(member.store_id)) throw denied();
    const stores = await get('/rest/v1/stores', { select: 'id', id: `eq.${member.store_id}`, limit: '1' });
    if (!Array.isArray(stores) || stores.length !== 1 || stores[0].id !== member.store_id) throw denied();
  } catch (error) {
    if (error instanceof AmazonAccessError) throw error;
    throw new AmazonAccessError(503, signal.aborted ? 'auth_timeout' : 'auth_unavailable', 'Não foi possível validar o acesso ao laboratório.');
  }
}
