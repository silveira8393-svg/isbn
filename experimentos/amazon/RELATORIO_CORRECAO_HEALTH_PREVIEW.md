# Correção do health no Preview Amazon — 27/10/2026

Deployment investigado: `dpl_2d7sf1GN7kNctC38NfFRJLVBykHQ`, commit `1fdc4c5`,
branch `homologacao/amazon-vercel`. A investigação ocorreu antes da alteração
de código e não realizou pesquisas na Amazon.

## Causa comprovada

O cliente publicado usava `credentials: 'omit'` em uma chamada relativa à
própria origem, mesmo após autenticação do navegador na proteção Vercel.
Isso excluía o cookie da proteção do Preview. A Vercel interceptava a requisição
antes da Function e o fetch, configurado com `redirect: 'error'`, resultava em
`TypeError: Failed to fetch`. O Bearer da sessão Supabase não substitui a sessão
da proteção Vercel.

No Chrome headless, o Preview original foi aberto com seu cookie de acesso,
obtido pela CLI autenticada. Credenciais permaneceram em memória e apenas
recursos da origem exata do Preview foram permitidos. A mesma chamada ao health,
com o mesmo Bearer fictício e demais opções, produziu:

| Credenciais do fetch | Resultado |
|---|---|
| `omit`, como no cliente anterior | `Failed to fetch`, antes da Function |
| `same-origin` | HTTP 403 JSON, código `authorization_failed` da Function |

Referência da chamada que atingiu a Function:
`4f7e07b7-dc81-4215-8303-db7966456cff`. O 403 é esperado para o token fictício;
não foi usado token real de usuário. A evidência sanitizada foi salva localmente
em `.vercel/diagnostico-health-cookie.json`, ignorada pelo Git. Não contém cookie,
token ou HTML.

Os logs anteriores continham somente os três acessos técnicos 401/403 da
publicação inicial, sem novo health do usuário chegando à Function. A rota
existia, o build estava Ready e a configuração de autenticação já produzia
recusas controladas. A reprodução isolou a perda do cookie no cliente, sem
indicar necessidade de alterar rota, Supabase ou cabeçalhos da Function.

## Correção limitada

- `src/services/amazonLabClient.ts`: publicado usa `credentials: 'same-origin'`
  para a Function relativa. Desenvolvimento local continua `omit`. Mantidos
  Bearer obrigatório, `redirect: 'error'`, `no-store`, cancelamento e timeout.
  Falhas de transporte agora explicam conexão/autenticação Vercel; erros JSON
  da Function mantêm mensagem e referência. Não há retries ou credencial de
  proteção incluída no código.
- `src/components/AmazonLab.tsx`: o estado de verificação inicial termina também
  em falha, mostrando conexão não confirmada em vez de ficar indefinidamente
  em "Verificando conexão". Nenhum bloqueio de pesquisa foi acrescentado.
- `tests/amazonLab.test.mjs`: regressões para cookie de mesma origem, falha de
  transporte sem retry, cancelamento, 401/403 com referência e término do health.

## Validação antes da publicação

Os testes de regressão falharam no código anterior nos três pontos esperados:
cookie omitido, mensagem bruta de transporte e verificação que nunca terminava.
Após a correção, **25 testes direcionados aprovados** (cliente/painel e Function).
`npm.cmd run lint` e `npm.cmd run build` aprovados. Permanecem os avisos conhecidos
de tamanho do bundle e import dinâmico também estático do Supabase.

Extrator, BookInfo, galeria, Function, autenticação/autorização, banco, cadastro,
Magazord e demais serviços operacionais não foram alterados. A proteção Vercel
permanece habilitada. Publicação autorizada exclusivamente na branch de
homologação, sem merge ou deploy de produção. Após o build remoto, a nova URL,
commit e resultados online serão registrados na evidência local ignorada
`.vercel/correcao-health-online.json` e na entrega. A confirmação de HTTP 200 com
perfil Desenvolvimento real exige uma sessão autenticada do aplicativo; o
ensaio com token fictício confirma transporte e recusa, não o acesso concedido.
