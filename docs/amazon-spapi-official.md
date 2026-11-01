# Amazon SP-API oficial — preparação para revisão

Branch: `feat/amazon-spapi-official`, baseada em `origin/main` no commit `84b6e76`.
Nenhum deploy, autorização real, acesso ao Supabase remoto ou migração foi realizado.
A integração fica desligada por padrão. A Amazon experimental e a integração Magazord não são modificadas.

## Análise da referência ZIP

`ISBN_SPAPI_OAuth_preparacao.zip` foi lido como proposta não aprovada. Seus comentários e instruções não substituem as restrições do pedido.
Foram aproveitados o domínio proposto, os caminhos OAuth, o uso de LWA e a ideia de cifrar refresh tokens. A implementação foi reescrita:

- As rotas mantêm os caminhos públicos propostos, com módulos novos independentes em `server/spapi/` e compilação das quatro entradas nos testes.
- O segredo bootstrap foi substituído por verificação de sessão Supabase no Auth e perfil/vínculo Desenvolvimento ativo na loja configurada.
- Cookie assinado sozinho não impedia replay. Agora há estado aleatório de 256 bits, hash SHA-256 no banco, vínculo ao navegador, validade de dez minutos e consumo transacional por `DELETE ... RETURNING`.
- Login intermediário gira o estado e mantém o prazo original. O callback direto do consentimento também é aceito. Callback simultâneo/repetido falha antes de trocar o código novamente, inclusive em instâncias serverless distintas, quando o SQL preparado estiver instalado.
- Refresh token usa AES-256-GCM, IV aleatório e AAD vinculada a loja/vendedor/versão. Access token existe apenas em memória na requisição de consulta. Nenhum token LWA é devolvido ao navegador.
- Foram adicionados bloqueio por classificação, associação explícita de um vendedor a uma loja, consulta Catalog Items e testes inteiramente sintéticos.

## URLs OAuth definitivas a cadastrar na Amazon

| Finalidade | URL |
| --- | --- |
| Login URI | `https://isbn.silveiralab.com.br/api/amazon/oauth/login` |
| Redirect URI | `https://isbn.silveiralab.com.br/api/amazon/oauth/callback` |
| Início interno autenticado | `POST https://isbn.silveiralab.com.br/api/amazon/oauth/start` |
| Consulta bibliográfica autenticada | `GET https://isbn.silveiralab.com.br/api/amazon/spapi/catalog?isbn=9788535914849` |

São os endereços preparados, ainda não publicados por esta alteração. Não cadastrar wildcard nem uma URL de Preview aleatória como callback definitivo.
Para homologação futura, usar origem HTTPS estável separada, cadastrar suas duas URIs exatas na Amazon e definir `AMAZON_SPAPI_ORIGIN` com essa origem (sem barra final).

O início exige Bearer de sessão válida, `Origin` exato e perfil Desenvolvimento ativo da loja indicada em `AMAZON_SPAPI_STORE_ID`. Retorna `authorization_url` e cookie `__Host-isbn_spapi` (Secure, HttpOnly, SameSite=Lax, Path=/).
Um cliente autenticado deve fazer o POST de mesma origem com `credentials: 'same-origin'` e navegar para a URL retornada. Não enviar tokens Supabase por query string, não incluir segredos administrativos no cliente e não usar um link GET público para iniciar consentimento.
Nenhum botão de autorização foi adicionado à interface existente.

O Login URI aceita somente continuação com cookie emitido por início autenticado. Fluxo iniciado diretamente pelo Appstore sem esse início é recusado. A URI de confirmação Amazon precisa usar host de uma lista exata, HTTPS e `/apps/authorize/confirm/<APP_ID>` exato, sem credenciais, porta customizada, query ou fragmento. `amazon_state` é preservado; o `state` local é renovado.
O callback consome o estado antes de qualquer troca LWA ou persistência. Recusa de consentimento e falhas posteriores também exigem reinício, sem retry automático de código.

## Variáveis da Vercel (exclusivas do servidor)

Usar a tela Environment Variables do projeto correto. Nunca usar prefixo `VITE_` para as variáveis abaixo. Valores reais não devem ir para Git, exemplos, logs, capturas de tela ou corpo da PR.

| Variável | Configuração |
| --- | --- |
| `AMAZON_SPAPI_ENABLED` | `false` por padrão; só habilitar após revisão e preparação do banco |
| `AMAZON_SPAPI_EXTERNAL_AUTH_APPROVED` | `false`; somente `true` após regularização e aprovação explícita da classificação para atender a loja externa |
| `AMAZON_SPAPI_ORIGIN` | Origem HTTPS exata; padrão `https://isbn.silveiralab.com.br` |
| `AMAZON_SPAPI_DRAFT` | `true` adiciona `version=beta` ao consentimento/continuação; `false` para app publicado |
| `AMAZON_SPAPI_APP_ID` | ID SP-API `amzn1.sellerapps.app...` do aplicativo registrado |
| `AMAZON_SPAPI_CLIENT_ID` | Client ID LWA do mesmo aplicativo |
| `AMAZON_SPAPI_CLIENT_SECRET` | **Secret**: segredo LWA |
| `AMAZON_SPAPI_TOKEN_KEY` | **Secret**: 32 bytes aleatórios, codificados em 64 caracteres hexadecimais |
| `AMAZON_SPAPI_STORE_ID` | UUID da única loja habilitada neste deployment |
| `AMAZON_SPAPI_SELLER_ID` | ID do único vendedor autorizado para essa loja; nunca recebido do cliente para escolher tokens |
| `SUPABASE_URL` | URL HTTPS raiz do projeto revisado |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publishable (ou anon legada), usada somente para validar sessão no Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret**: chave privilegiada, exclusiva das Functions; nunca a chave do frontend |

Não são necessários `AMAZON_SPAPI_BOOTSTRAP_KEY`, `AMAZON_SPAPI_STATE_KEY`, credenciais AWS IAM, SigV4 ou RDT para esta consulta bibliográfica. O estado fica no servidor; a API usa `x-amz-access-token` LWA.

Separar integralmente valores e projetos de Preview e Production. Manter ambos os bloqueios em `false` nos ambientes reais enquanto as pendências existirem. Não usar `vercel env pull` para copiar credenciais reais para testes. Os testes não carregam `.env.local` nem usam a rede Amazon/Supabase.
Uma futura publicação de Preview deve manter Deployment Protection; a sessão dessa proteção é distinta do Bearer da aplicação. Não publicar em produção como parte desta PR.

## Supabase: SQL preparado, não executado

Revisar `supabase/setup/amazon_spapi_official.sql`. É um script de preparação manual, fora do diretório de migrations e não é executado pelo build. Ele cria somente duas tabelas novas e uma RPC nova, com RLS e privilégios revogados de `PUBLIC`, `anon` e `authenticated`; a RPC é `SECURITY INVOKER`, com `search_path` vazio e execução exclusiva de `service_role`.
O adaptador continua verificando o vínculo ativo e o perfil a cada início/consulta e novamente na continuação/callback. `user_metadata` e cabeçalhos de função enviados pelo cliente não concedem acesso. As leituras privilegiadas são filtradas por usuário e loja; tokens são filtrados por loja e vendedor.

Antes de aplicar futuramente, confirmar projeto, tabelas `auth.users`, `public.stores`, `profiles`, `store_users`, acesso restrito às chaves de serviço e ausência de objetos homônimos (inclusive eventual instalação do SQL do ZIP). O script deliberadamente não usa `IF NOT EXISTS` para mascarar schema incompatível.
Depois de revisão e autorização separadas, validar em banco descartável: privilégios de tabela/RPC, RLS negando clientes, persistência cifrada, consumo concorrente e expiração. Os testes atuais verificam SQL estaticamente e usam transporte/armazenamento simulados; não substituem execução no Postgres/PostgREST real.
Preparar manutenção administrativa para excluir estados vencidos (`expires_at <= now()`). Um job desse tipo não foi criado no projeto remoto.

Desligar a integração antes de rotação de chave. A versão inicial de envelope é `key_version=1`: trocar a chave isoladamente torna os tokens existentes ilegíveis. Recriptografar com procedimento administrativo revisado que leia com a chave anterior e escreva com a nova, ou remover a autorização cifrada e refazer consentimento permitido. Não há rotação automática, painel de revogação nem suporte a várias lojas nesta etapa.
Para desconectar: desabilitar o recurso, revogar o consentimento no Seller Central e excluir administrativamente apenas a linha correspondente da nova tabela. Em rollback, desligar o recurso e reverter os arquivos da PR; remover somente os novos objetos SQL após avaliar os tokens, sem tocar nos dados operacionais.

## Consulta por ISBN

Valida dígito verificador ISBN-10/ISBN-13 e normaliza espaços/hífens. Usa somente `GET /catalog/2022-04-01/items`, `identifiersType=ISBN`, marketplace Brasil `A2Q3Y263D00KWC`, endpoint NA fixo e conjuntos `summaries,attributes,identifiers,images`. Nenhum endpoint de escrita de catálogo, oferta, preço ou estoque é usado.
O refresh token é decifrado somente no servidor, trocado em `https://api.amazon.com/auth/o2/token` e o access token é enviado somente à Amazon. Transportes usam destino fixo, recusam redirects, timeout e limite de resposta. Respostas de erro expõem códigos controlados, sem corpo upstream ou exceção bruta. Não há retries automáticos; HTTP 429 informa `Retry-After`.
Só entram resultados com identificador ISBN/EAN/GTIN correspondente no marketplace correto (ISBN-10 pode equivaler ao ISBN-13 com prefixo 978). A resposta projeta título, autores, editora, data, idioma, acabamento, páginas, sinopse e referências de imagens quando disponíveis; dados ausentes ficam vazios/null. Formatos/atributos incompletos da Amazon podem exigir ajustes após homologação real. Não se promete ficha completa nem seleção automática entre ASINs. A primeira página traz até 20 itens e `hasMore` indica outras páginas; a etapa não percorre páginas adicionais.
`requiresReview=true` exige revisão humana. Não há aplicação automática dos dados ao cadastro, nem alteração de `BookInfo`, histórico ou serviços de consulta existentes. Não há cache ou persistência das fichas retornadas.

## Segurança operacional e homologação pendente

- Regularizar classificação/registro/roles exigidos para catálogo e atendimento à livraria de terceiros. Não iniciar consentimento externo antes disso. Os dois bloqueios devem permanecer desligados até a revisão.
- Revisar/aplicar separadamente o SQL em ambiente de teste, validar RLS, RPC atômica e permissões com PostgREST real. Nenhuma migração remota foi feita nesta tarefa.
- Configurar segredos e URIs exatas em ambiente de homologação autorizado; testar cookies e roteamento Vercel, consentimento/recusa e consulta somente após regularização.
- Configurar redaction/retenção de logs da plataforma e proxy para URLs de callback: query strings recebidas da Amazon contêm código/state. O código da aplicação não registra URLs, códigos, tokens ou respostas upstream, mas isso não controla os logs de acesso da hospedagem.
- Avaliar retenção e termos de uso dos dados do catálogo antes de futura persistência. Segregar chaves e revisar quem pode ler a service role, que ignora RLS.
- Resolver separadamente as quatro falhas preexistentes da suíte geral, sem ampliar esta PR para alterar Magazord ou o laboratório experimental.

## Validação

Comandos Windows: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run test:spapi`, `npm.cmd test`.
O script `lint` existente é `tsc --noEmit`; o repositório não configura ESLint. O build Vite cobre o frontend; os testes SP-API também compilam as quatro entradas das Functions com esbuild.

Resultados locais (01/11/2026, Node 24.19.0, dependências já instaladas no workspace):

| Verificação | Resultado |
| --- | --- |
| `npm.cmd run typecheck` | Aprovado |
| `npm.cmd run lint` | Aprovado |
| `npm.cmd run build` | Aprovado; avisos já existentes de bundle >500 kB e import Supabase simultaneamente estático/dinâmico |
| `npm.cmd run test:spapi` | 21/21 aprovados |
| SP-API + `amazonVercel`, `amazonLab`, `magazordIsolation`, `registrationLookup` | 81/81 aprovados |
| `npm.cmd test` | 536 testes: 532 aprovados, 4 falhas preexistentes |
| `git diff --check` | Aprovado |
| Diff em `src/`, `experimentos/`, `api/amazon.ts`, `server/amazonAuthorization.ts`, `server/amazonFunction.ts` | Vazio |

As quatro falhas foram reproduzidas extraindo uma cópia intacta de `84b6e76` com `git archive`, usando as mesmas dependências: três casos em `tests/infrastructureUi.test.mjs` por mock sem `React.lazy`, e falha de compilação de `tests/magazordMode.test.mjs` por marcador de fonte esperado ausente (`assert.ok(source.includes(marker))`). Nenhum desses testes nem os módulos que eles cobrem foram modificados. A suíte geral, portanto, ainda retorna exit code 1; ela não está integralmente aprovada.

Os testes usam credenciais/IDs/respostas sintéticos e fetch injetado; não abrem consentimento ou conexão externa.
Os testes da suíte geral que iniciam o laboratório usam apenas loopback local. Nenhum teste com credencial real foi feito.

Arquivos desta alteração:

- `.env.example`, `package.json`, `README.md`.
- `api/amazon/oauth/start.ts`, `api/amazon/oauth/login.ts`, `api/amazon/oauth/callback.ts`.
- `api/amazon/spapi/catalog.ts`.
- `server/spapi/core.ts`, `server/spapi/store.ts`, `server/spapi/catalog.ts`, `server/spapi/handler.ts`.
- `supabase/setup/amazon_spapi_official.sql`.
- `tests/spapiOfficial.test.mjs`.
- `docs/amazon-spapi-official.md`.

As alterações locais preexistentes ficaram preservadas no checkout original `C:\Desenvolv\isbn`; o trabalho desta branch está isolado em `.worktrees/spapi-official`.

## Fontes oficiais consultadas

- [Amazon: Website Authorization Workflow](https://developer-docs.amazon/sp-api/docs/website-authorization-workflow)
- [Amazon: Connect to the SP-API](https://developer-docs.amazon/sp-api/docs/connecting-to-the-selling-partner-api)
- [Amazon: Catalog Items API v2022-04-01](https://developer-docs.amazon/sp-api/docs/catalog-items-api-v2022-04-01-reference)
- [Amazon: Marketplace IDs](https://developer-docs.amazon/sp-api/docs/marketplace-ids)
- [Supabase: Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase: Changelog](https://supabase.com/changelog)
- [Vercel: Config and Secret environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
