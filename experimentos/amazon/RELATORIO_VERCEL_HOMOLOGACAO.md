# Amazon em Vercel Functions — preparação para homologação

Data: 27/10/2026, America/Sao_Paulo.

**Implementação preparada para deploy de homologação.** As seções de preparação
e revisão registram as respectivas etapas; consultar a retomada ao final.
Não houve commit, push, merge em `main`, deploy remoto, consulta à Amazon/CDN
ou leitura/gravação de dados reais do Supabase nesta etapa.

## Git e separação das funcionalidades

O workspace inicial tinha alterações Amazon e alterações operacionais ainda não
versionadas. Todas foram preservadas. Foram criadas duas branches locais:

- `feature/amazon-vercel`: workspace original, com todas as alterações anteriores.
- `homologacao/amazon-vercel`: worktree isolada em
  `C:\Desenvolv\isbn\.worktrees\amazon-vercel`, baseada em `main` no commit
  `792966956bb62798c17920f9ac72c41d1fb10aa4`.

`main` e a ponta remota consultada permaneceram nesse commit. A configuração
Vercel foi lida, sem alteração: projeto `isbn`, Node `24.x`, integração GitHub,
`productionBranch=main`, deployments automáticos habilitados e associação
automática de domínios. **Não publicar indiscriminadamente o workspace original.**

A árvore de homologação contém somente os seguintes grupos:

1. Base Amazon TypeScript: extrator, HTML local, avaliação/normalização,
   servidor e supervisores locais, fixtures sanitizadas, testes, documentação
   e evidências históricas do laboratório.
2. Apresentação Amazon: cliente, painel, galeria compartilhada já existente e
   entrada da aba em Configurações. O card operacional não foi substituído.
3. Adaptação Vercel: entrypoint, autorização, handler, testes de acesso/runtime
   e este relatório.

Na worktree isolada, `src/App.tsx`, `src/types.ts`, `src/utils/draft.ts`,
`src/utils/registrationSnapshot.ts`, `src/components/BookDetailsCard.tsx`,
componentes/serviços Magazord, BrasilAPI, Curitiba e arquivos Supabase permanecem
iguais à base `main`. O gerenciador de modelos de condição e alterações comerciais/SEO
do workspace original não foram copiados. Os testes de normalização de rascunhos
dessas alterações também permanecem somente no workspace original.

O manifesto `relatorios/vercel/publicacao.json` registra os arquivos incluídos
e os caminhos operacionais conferidos. A worktree reutiliza as dependências
instaladas por uma junction local `node_modules`, ignorada pelo Git; ela não
faz parte da publicação. Não foram instaladas novas dependências.

## Implementação e arquivos alterados

| Arquivo | Responsabilidade |
|---|---|
| `api/amazon.ts` | Entry point Web Standard Node da Vercel; `maxDuration: 45`; sem `listen`, subprocesso ou porta 8765. |
| `server/amazonAuthorization.ts` | Verifica Bearer no Auth e lê perfil/vínculo/loja existentes sob RLS; não escreve no banco. |
| `server/amazonFunction.ts` | Rotas, validação de corpo/ISBN, chamada ao transporte e ao extrator existentes, respostas e diagnóstico sanitizado. |
| `experimentos/amazon/consulta_amazon.ts` | Transporte HTTPS e validação de consulta extraídos do serviço local para reutilização. |
| `experimentos/amazon/servidor_laboratorio.ts` | Importa o transporte/validação compartilhados; preserva porta local, fixtures, rotas e comandos existentes. |
| `src/services/amazonLabClient.ts` | Em DEV usa proxy local sem token; em build publicado usa `/api/amazon` com a sessão existente, sem cookies ou URL externa de API. |
| `src/components/SettingsView.tsx` | Disponibiliza a aba em builds publicados somente para Desenvolvimento ativo. |
| `src/components/AmazonLab.tsx` | Mantém os nove campos, proveniência e galeria; explica o modo publicado e mostra diagnóstico da Function. |
| `package.json` | Fixa Node `24.x`, correspondente ao projeto Vercel consultado; comandos locais e dependências preservados. |
| `tests/amazonVercel.test.mjs` | Testes de acesso, isolamento, contrato, respostas HTTP, CAPTCHA, falhas e logs sem dados sensíveis. |
| `tests/amazonLab.test.mjs` | Verifica cliente publicado autenticado, identidade do painel e manutenção do cliente local. |
| `tests/amazonGallery.test.mjs` | Mantém regressão da galeria e aceita o título acessível do card operacional da base, sem alterar o card. |
| `tests/bibliographicContract.test.mjs` | Define o modo Vite no compilador de ensaio; regras bibliográficas preservadas. |
| `experimentos/amazon/tests/verificar_runtime_vercel.mjs` | Compila e inicializa localmente o artefato do builder oficial já instalado. |
| `.gitignore` | Mantém arquivos locais/credenciais fora do Git e ignora a worktree auxiliar. |

A cadeia Node usa extensões `.js` nos imports relativos de TypeScript, incluindo
os imports do extrator, cliente e avaliador compartilhado. Essa foi a correção
necessária para ESM no artefato compilado. **Nenhuma regra de extração, seletor,
ISBN, unidade, campo bibliográfico ou proveniência foi alterada.** Os componentes
`AmazonLabImageGallery` e `BookImageGallery` foram mantidos sem alterações.

## Rotas e autorização

| Rota publicada | Método | Resultado |
|---|---|---|
| `/api/amazon?acao=health` | GET | Confere autenticação/autorização, informa disponibilidade da Function e não consulta a Amazon. |
| `/api/amazon?acao=search` | POST | Recebe somente `{ "isbn": "9788501014863", "modo": "http" }`; executa uma consulta. |

Sem `acao`, GET equivale a health e POST a search. Outros métodos retornam 405;
ações, parâmetros e rotas desconhecidos não são executados. Não há CORS público.
Origin divergente e requisições marcadas cross-site são recusados.

O cliente publicado obtém o access token da sessão Supabase já existente e o envia
somente para a rota relativa do próprio aplicativo. Não envia papel, usuário,
URL Amazon, loja ou chave administrativa no payload.

A Function verifica o token por GET em `/auth/v1/user`. Depois verifica perfil
ativo em `profiles`, primeiro vínculo ativo em `store_users`, ordenado por loja,
e existência da loja em `stores`, como no UserContext atual. Exige papel exatamente
`developer`. Não confia em claims editáveis, `user_metadata` ou headers de papel.
Todas essas leituras usam o token do chamador e a chave publicável sob RLS.
Tokens inválidos/expirados, admin, operator, perfil inativo, usuário anônimo ou
vínculo removido são recusados antes de acessar a Amazon. Falhas na validação
de identidade também recusam a consulta.

O serviço local conserva seu limite de confiança anterior: loopback, Host/origem
local e cabeçalho próprio. O cliente DEV não transmite a sessão ao serviço local.
Fixtures permanecem locais; a Function publicada aceita somente HTTP real.

## Variáveis de ambiente

| Nome | Uso |
|---|---|
| `VITE_SUPABASE_URL` | Configuração existente do frontend. Também é fallback da Function. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publicável existente do frontend. Também é fallback da Function. |
| `SUPABASE_URL` | Opcional: origem HTTPS explícita para a Function, do mesmo projeto do frontend. |
| `SUPABASE_PUBLISHABLE_KEY` | Opcional: chave publicável explícita da Function, do mesmo projeto do frontend. |

Conferir esses valores no ambiente **Preview** antes do deploy. Não foi feito pull
de variáveis ou leitura de valores secretos na Vercel. Não utilizar `service_role`,
`sb_secret_*` ou chave administrativa. A Function rejeita configuração com chave
secreta ou JWT de papel diferente de `anon`. Não há nova variável de liberação de
imagens, confirmação por consulta ou flag de autorização de uso.

## Limites e tratamento de falhas

- Corpo JSON de até 1 KiB, inclusive quando Content-Length está ausente ou falso.
- Validação de ISBN-10/13 com dígito verificador. `/dp/` converte somente ISBN-13
  com prefixo 978; não transforma ISBN-979 em ASIN por suposição.
- Host Amazon fixo, um GET HTTPS por consulta, sem cookies, login, proxy de saída,
  redirects, retries, lote, rotação de IP ou contorno de restrições.
- Até 5 segundos para as leituras de autorização, 5 segundos para receber JSON,
  25 segundos no transporte Amazon e 45 segundos de duração máxima da Function.
- HTML até 8 MiB em memória; resposta JSON limitada a 4 MiB, abaixo do limite
  de payload da Vercel. Não há escrita de HTML, imagens ou dados bibliográficos.
- Respostas não 200, CAPTCHA, MIME inesperado, limite de leitura, timeout e falhas
  de transporte são identificados. HTML de bloqueio nunca é devolvido ao cliente.
- Exclusão de concorrência por instância da Function, sem fila. Não é um limite
  global entre instâncias/deployments; a homologação deve ser individual e espaçada.

## Diagnóstico preparado para homologação online

Cada resposta inclui `diagnostico` com ID aleatório, duração, status da Function,
status HTTP Amazon quando recebido e código controlado. A interface mostra esses
dados em um diagnóstico recolhível; falhas do cliente mostram a referência da
consulta quando disponível. `X-ISBN-Request-Id` repete essa referência.

Os logs próprios da Function contêm somente evento, ID, duração, status e código.
Não contêm ISBN, usuário, token, chave, URL, cookies, stack de erro externo ou HTML.
São emitidos códigos como `completed`, `amazon_http`, `amazon_captcha`,
`amazon_unexpected`, `amazon_transport`, `timeout`, `developer_required` e
`auth_unavailable`. Resposta 200 da API com `status: interrompida` não representa
sucesso da consulta; o status/código Amazon deve ser conferido separadamente.
Cache de navegador/CDN é desabilitado e há `Vary: Authorization`.

## Verificações realizadas

| Verificação | Resultado |
|---|---|
| Suíte Amazon, cliente/galeria, Function e contrato bibliográfico na worktree isolada | 49 testes aprovados. |
| `npm.cmd run lint` | Aprovado no workspace original e na árvore isolada. |
| `npm.cmd run build` | Aprovado na árvore isolada. Avisos de bundle acima de 500 kB e import dinâmico do cliente Supabase, sem erro. |
| Builder oficial `@vercel/node` 10.0.0 já instalado | Artefato `nodejs24.x`, duração máxima 45 s; sem servidor local ou Python. |
| Inicialização real do artefato compilado no Node 24.19.0 | Aprovada; chamada anônima recusada com HTTP 401 e zero chamadas externas. |
| Isolamento Git | Caminhos operacionais da worktree conferidos contra `main`; nenhuma alteração. |

O primeiro ensaio abrangente incluiu testes ligados a mudanças operacionais
deliberadamente ausentes da árvore isolada. O teste da galeria foi ajustado para
o título acessível do card da base, e testes de rascunho/edição manual dessas
outras funcionalidades ficaram fora da publicação Amazon. Seus originais foram
preservados no workspace principal.

Na preparação, três testes de inicialização ficaram pendentes porque as portas
3000/8765 estavam ocupadas. Na revisão de homologação abaixo, os processos foram
identificados e os 11 testes de inicialização foram aprovados. Não há dependência
dessas portas na Function.

A verificação do artefato, além da compilação, encontrou e corrigiu imports ESM
sem extensão. Ajustes intermediários do coletor local de arquivos do builder
trataram streams legados e a junction de node_modules; não são código da Function.
A execução final inicializou o artefato real e aprovou a resposta 401.

Evidências: `relatorios/vercel/runtime.json` e `relatorios/vercel/publicacao.json`.

## Antes de publicar e homologar

1. Revisar somente o diff/index da worktree `homologacao/amazon-vercel`, com o
   manifesto de arquivos. Não usar `git add .` no workspace original.
2. Confirmar variáveis **Preview**, Node 24, acesso do usuário Desenvolvimento e
   políticas RLS existentes para ler o próprio perfil/vínculo/loja. Não aplicar
   migrações ou alterar policies para esta entrega.
3. Publicar somente um deployment Preview da árvore isolada após aprovação.
   Confirmar o alvo antes de qualquer push/CLI. `main` continua publicando produção.
4. No Preview, confirmar que visitante recebe 401 e admin/operator recebem 403,
   incluindo chamadas diretas à API. Nunca usar contas/credenciais alheias no teste.
5. Com Desenvolvimento, consultar o health e depois executar **uma** consulta HTTP
   por ISBN, aguardando a conclusão e um intervalo antes de uma próxima tentativa.
   Conferir referência, duração, HTTP Amazon, correspondência ISBN, nove campos,
   proveniência e a galeria. Não fazer carga ou repetir automaticamente bloqueios.
6. Se houver CAPTCHA/403/429/503, registrar somente os diagnósticos sanitizados e
   interromper a sequência. Uma resposta local aprovada não garante disponibilidade
   da Amazon a partir do IP da Vercel.

A prontidão técnica local está demonstrada. A autorização com sessão real/RLS,
a disponibilidade da Amazon a partir da Vercel e a renderização remota completa
continuam sendo verificações do futuro deploy de homologação, não executadas aqui.

Referências oficiais consultadas: [Vercel Node.js/TypeScript](https://vercel.com/docs/functions/runtimes/node-js),
[duração das Functions](https://vercel.com/docs/functions/configuring-functions/duration),
[validação de usuário no Supabase Auth](https://supabase.com/docs/reference/javascript/auth-getuser).

## Revisão para publicação — 27/10/2026

**Publicação interrompida antes de commit, push ou deploy: faltam as variáveis
necessárias no ambiente Preview.** A lista geral da Vercel contém somente
`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, ambas com alvo exclusivo
`production`. A consulta específica da branch `homologacao/amazon-vercel` não
retornou variáveis. Não foram exibidos valores, feito pull de ambiente, copiados
segredos nem modificados escopos. O conector recusou acesso à equipe; a leitura
foi concluída pela CLI já autenticada.

Sem essas duas variáveis no Preview, o cliente Supabase existente lança erro de
configuração e impede o login; a Function também não consegue validar um token
válido. Não foi criado um Preview sabidamente sem configuração. É necessário
configurar e conferir os valores públicos apropriados em **Preview** antes de
retomar a publicação. As variáveis opcionais `SUPABASE_URL` e
`SUPABASE_PUBLISHABLE_KEY` não substituem a configuração exigida pelo frontend.

| Conferência | Resultado |
|---|---|
| Arquivos preparados | 91; conjunto do index idêntico ao manifesto, sem arquivos extras. |
| Credenciais e arquivos locais | Nenhum `.env`, cache, temporário ou credencial encontrado na conferência de caminhos e padrões do conteúdo preparado. |
| Isolamento operacional | Todos os caminhos protegidos do manifesto continuam iguais a `main`. |
| Branch local | `homologacao/amazon-vercel`; HEAD/base `792966956bb62798c17920f9ac72c41d1fb10aa4`; nenhum novo commit. |
| Git remoto | `main` permanece na base; branch de homologação ainda não publicada. |
| Vercel | Projeto `isbn`, Node 24.x, Vite, produção ligada somente a `main`. |
| Domínios | `isbn.silveiralab.com.br` e `isbn-gold.vercel.app` sem associação a branch Preview; nenhum alias ou domínio alterado. |
| Produção atual | Deployment `dpl_AN57zGKzpR85raQJsek824QEW9Gw`, SHA da base; nenhuma publicação realizada nesta revisão. |
| Autorização da Function | Suíte local confirma Desenvolvimento ativo e recusa admin/operator/inativo/anônimo/token inválido antes de acessar a Amazon. Validação com sessões reais continua pendente do Preview configurado. |
| Testes direcionados | 49 aprovados novamente; mais 11 de inicialização, total 60. |
| Lint, build e artefato Node | Aprovados na preparação documentada acima; sem alteração de código nesta revisão. |
| URL, build e logs de Preview | Não disponíveis: nenhum deployment criado por causa do impedimento. |

As portas estavam ocupadas pelo supervisor `experimentos/amazon/iniciar_online.mjs`
do workspace original, com filhos `servico_typescript.mjs` e `servico_vite.mjs`.
Command lines e vínculo ao supervisor foram conferidos antes de encerrar apenas
o serviço conhecido, permitindo que o supervisor encerrasse seu Vite. Nenhum
processo desconhecido foi encerrado. A primeira execução de testes teve 10/11
aprovados e timeout de 3 segundos no ensaio real com inicialização sem cache do
Vite. A repetição, sem mudanças de código, aprovou 11/11; durante o encerramento,
o Vite ainda emitiu aviso de varredura de dependências interrompida. Essa limitação
do ensaio rápido fica registrada, sem mascarar a primeira falha.

O laboratório original foi restaurado e confirmou prontidão em
`http://127.0.0.1:3000`. Os testes usaram somente fixtures e HTTP local/simulado:
nenhuma consulta Amazon, download de imagem, leitura de dados operacionais ou
alteração de banco foi realizada nesta revisão. Não houve mudança de código,
commit, push, merge ou deploy. A pendência que impede a publicação é o escopo
Preview das variáveis; os testes com sessões reais, consulta individual Amazon,
galeria remota e logs serão feitos somente após essa configuração e publicação.

## Retomada autorizada — 27/10/2026

O usuário autorizou explicitamente copiar os valores públicos de Production
para Preview e publicar exclusivamente `homologacao/amazon-vercel`.

Foram criados dois registros com alvo somente `preview`:
`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Os valores foram lidos e
encaminhados apenas em memória, sem arquivos de ambiente, argumentos com valores
ou impressão em logs. A configuração foi validada como URL HTTPS sem credenciais
e chave pública; os valores Preview foram conferidos contra Production. Os
registros e valores originais de Production permaneceram iguais. Nenhuma leitura
ou alteração de banco foi necessária.

O projeto `isbn` e a equipe foram reconferidos na CLI autenticada. A branch de
produção continua `main`, na base `792966956bb62798c17920f9ac72c41d1fb10aa4`, e
os domínios de produção continuam sem associação à branch de homologação.
O conjunto preparado permanece limitado aos 91 caminhos do manifesto. Os testes
já aprovados não serão repetidos; a próxima validação será do build e da rota
publicada, com seus diagnósticos e logs. A confirmação com sessão real depende
de autenticação normal no aplicativo, sem criar contas ou modificar policies.
