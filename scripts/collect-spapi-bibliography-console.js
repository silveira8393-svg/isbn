// Coleta assistida temporária. Executar UMA VEZ no Console do Preview exato abaixo.
// Usa a sessão somente na página; não imprime, grava ou exporta credenciais.
(async () => {
  const expectedOrigin = 'https://isbn-pw79nj55v-silveira8393-svgs-projects.vercel.app';
  if (location.origin !== expectedOrigin) return console.log('Interrompido: abra o Preview de diagnóstico exato.');
  if (window.__isbnSpapiRecovery) return console.log('Coleta já iniciada nesta página. Não execute novamente.');
  let session;
  try { session = JSON.parse(localStorage.getItem('sb-jcxdkrpmrfbrhzwbzhph-auth-token') || 'null'); }
  catch { return console.log('Interrompido: sessão não disponível. Não envie credenciais.'); }
  if (!session?.access_token || !session?.user?.id || !Number.isFinite(session.expires_at)
    || session.expires_at * 1000 < Date.now() + 90000)
    return console.log('Interrompido: autentique-se novamente e avise antes de tentar a coleta. Nenhum GET foi enviado.');
  const token = session.access_token;
  session = null;
  const output = { queries: [], status: 'running' };
  window.__isbnSpapiRecovery = output; // Apenas resultados factuais; nenhum dado de sessão.
  for (const isbn of ['9798276439839', '9798286828647']) {
    if (output.queries.length) await new Promise(resolve => setTimeout(resolve, 15000));
    const result = { isbn, http: null, status: 'sent' };
    output.queries.push(result);
    try {
      const response = await fetch(`${expectedOrigin}/api/amazon/spapi/catalog?${new URLSearchParams({ isbn, diagnostic: 'bibliography' })}`, {
        method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000),
      });
      result.http = response.status;
      if (!response.headers.get('content-type')?.includes('application/json')) { result.status = 'unexpected_response'; break; }
      const body = await response.json();
      if (!response.ok) {
        result.status = 'stopped'; result.code = /^[a-z_]+$/.test(body.code || '') ? body.code : 'http_error'; break;
      }
      if (!body.diagnostics || body.isbn !== isbn) { result.status = 'diagnostic_unavailable'; break; }
      result.status = 'received'; result.diagnostics = body.diagnostics;
      result.contentPolicy = body.contentPolicy; result.hasMore = body.hasMore;
    } catch { result.status = 'network_or_timeout_stopped'; break; } // Sem repetição, inclusive em 403/429.
  }
  output.status = output.queries.length === 2 && output.queries.every(q => q.status === 'received') ? 'completed' : 'stopped';
  console.log(JSON.stringify(output, null, 2));
})();
