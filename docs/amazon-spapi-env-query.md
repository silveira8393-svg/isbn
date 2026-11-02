# Consulta ISBN oficial com refresh token no servidor

Este é o fluxo vigente da PR #1. `GET /api/amazon/spapi/catalog?isbn=...` usa `AMAZON_SPAPI_REFRESH_TOKEN`, Client ID e Client Secret LWA protegidos no servidor. Não consulta `amazon_spapi_authorizations`, não exige AES, service role, APP_ID ou execução do script de provisionamento. Nenhuma tabela ou dado foi removido. OAuth e provisionamento históricos continuam independentes, sem serem iniciados pela pesquisa.

## Fluxo existente

O mesmo formulário ISBN consulta BrasilAPI e Curitiba com a prioridade anterior, e inicia a Amazon em paralelo quando o usuário é Desenvolvimento ativo da loja de homologação Silveira Lab. A Amazon preenche somente campos bibliográficos ausentes: título, autores, editora, data, idioma, acabamento, edição e páginas. Não substitui dados das outras fontes nem escolhe automaticamente entre múltiplos ASINs correspondentes. Falha/timeout da fonte preserva as outras fontes e o cadastro manual. Não há novos botões, telas, consentimento, escrita de catálogo, preços ou estoque.

O servidor normaliza e valida ISBN-10/13 com dígito verificador, consulta Catalog Items v2022-04-01 no marketplace Brasil e filtra o resultado pelos identificadores retornados pela Amazon. ISBN-10 e sua equivalência 978 são aceitos. A ficha identifica a origem dos campos complementados. Histórico e auditoria mantêm o fluxo já existente, sem gravações administrativas adicionais. Troca de conta/loja/perfil descarta o complemento Amazon tardio.

## Limite de autorização

O token privado da Silveira Lab está limitado pelo código à loja `492af2ad-905c-42f8-90f4-aa6c1dc142f3`. A sessão Supabase é verificada no Auth e são exigidos perfil ativo e vínculo `developer` ativo nessa loja, sob RLS e com chave publishable. Operador, Proprietário, perfil inativo e usuário sem vínculo são recusados. A associação deve representar de fato a própria conta; o código não transforma o token privado em autorização do Sebo Livraria Sul.

O cliente faz a chamada automaticamente apenas nesse escopo. Membros de outras lojas seguem a consulta atual sem usar o token privado. Para atender o Sebo com sua própria conta, será necessária autorização própria, classificação adequada e adaptação revisada do vínculo. Não basta renomear uma variável de loja: o endpoint simplificado rejeita um UUID diferente do da homologação Silveira Lab.

## Preview e configuração protegida

Configurar no ambiente **Preview** correto, pelo Dashboard/gerenciador de segredos, sem ler/exportar valores existentes para o agente. Não usar prefixo `VITE_` para qualquer segredo Amazon.

| Variável | Uso |
| --- | --- |
| `AMAZON_SPAPI_ENABLED` | `true` somente no ambiente de homologação revisado; permanece desligado por padrão |
| `AMAZON_SPAPI_REFRESH_TOKEN` | Secret do servidor, gerado para a própria conta Silveira Lab |
| `AMAZON_SPAPI_CLIENT_ID` | Client ID LWA do aplicativo correspondente ao token |
| `AMAZON_SPAPI_CLIENT_SECRET` | Secret LWA do mesmo aplicativo |
| `AMAZON_SPAPI_STORE_ID` | `492af2ad-905c-42f8-90f4-aa6c1dc142f3` |
| `AMAZON_SPAPI_SELLER_ID` | ID da própria conta vendedora vinculada ao token; conferir manualmente |
| `SUPABASE_URL` | Projeto ISBN `https://jcxdkrpmrfbrhzwbzhph.supabase.co`; fallback para `VITE_SUPABASE_URL` existente |
| `SUPABASE_PUBLISHABLE_KEY` | Chave publishable/anon do mesmo projeto; fallback para `VITE_SUPABASE_PUBLISHABLE_KEY` existente |
| `AMAZON_SPAPI_EXTERNAL_AUTH_APPROVED` | Manter `false`; não participa da consulta com token privado |

Origem do endpoint: aceita os hosts exatos fornecidos pelo servidor em `VERCEL_URL` e `VERCEL_BRANCH_URL`, além de `AMAZON_SPAPI_ORIGIN` explícito. Portanto um `AMAZON_SPAPI_ORIGIN` antigo de produção não bloqueia o Preview quando as variáveis de sistema estão disponíveis. Habilitar a exposição das variáveis de sistema no projeto Vercel; alternativamente definir `AMAZON_SPAPI_ORIGIN` com a origem HTTPS exata desse Preview, sem barra final. Não usa Host/X-Forwarded-Host enviados pelo cliente como allowlist nem aceita origens arbitrárias.

O navegador usa URL relativa, Bearer da sessão Supabase e cookie de mesma origem para manter a proteção Vercel. LWA e Catalog Items recebem os tokens somente no servidor, em destinos HTTPS fixos, sem redirects, retry ou cache. Respostas e erros são controlados, sem tokens, corpos upstream ou exceções brutas.

`AMAZON_SPAPI_TOKEN_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AMAZON_SPAPI_APP_ID`, tabelas/RPC OAuth e `npm run spapi:provision-self` **não são requisitos para esta consulta**. Permanecem necessários somente aos caminhos históricos que os utilizam; não é preciso configurá-los para testar ISBN.

## Imagens, sinopses e condições Amazon

O fluxo simplificado não solicita o dataset de imagens, não devolve URLs de imagens/sinopses da Amazon e não as copia para ficha, rascunho, histórico ou Magazord. Conteúdo de descrição que venha no dataset de atributos é descartado. Imagens e sinopses já fornecidas pelas outras fontes são preservadas. Isso evita presumir licença de reutilização de conteúdo da Amazon fora do uso autorizado.

A [AUP oficial](https://sellercentral.amazon.com/solution-provider/policy?policyType=AUP&locale=en_US) limita o uso a atividades Amazon permitidas e a usuários que tenham autorizado o acesso, com restrições de compartilhamento (seções 1.1, 3.4, 4.6). A consulta técnica privada não comprova que a reutilização dos metadados para um cadastro externo seja permitida. Antes de usar os resultados comercialmente fora da finalidade Amazon autorizada, confirmar esse uso com a Amazon e a autorização da conta relevante. Não se confunde SP-API com uma licença genérica de catálogo, nem com regras de Product Advertising API.

## Primeira consulta real: pendências concretas

- Disponibilizar um Preview autorizado. `vercel.json` ainda desabilita deployments Git automáticos desta branch; nenhum deploy foi feito nesta tarefa. A primeira execução online exige uma publicação de Preview separada, após revisão; produção continua fora do escopo.
- Conferir as variáveis acima no Preview, inclusive token privado/clientes do mesmo aplicativo, vendedor e acesso ao Product Listing/Catalog Items do marketplace Brasil. Não foram lidos segredos nem feitas chamadas com credenciais reais para comprovar esse acesso.
- Ter sessão válida com perfil e vínculo Desenvolvimento ativos na loja Silveira Lab do projeto ISBN. Não foi consultado o banco real para comprovar esse vínculo; não são necessárias novas tabelas ou migrações.
- Para o Sebo Livraria Sul ou uso externo dos resultados, resolver autorização própria e finalidade permitida antes de usar o token/dados. O token da Silveira Lab não cobre esse impedimento.

Fontes: [Catalog Items API](https://developer-docs.amazon/sp-api/docs/catalog-items-api-v2022-04-01-reference), [LWA e conexão SP-API](https://developer-docs.amazon/sp-api/docs/connecting-to-the-selling-partner-api), [políticas Amazon](https://developer-docs.amazon/sp-api/docs/policies-and-agreements), [variáveis de sistema Vercel](https://vercel.com/docs/environment-variables/system-environment-variables).

## Validação desta etapa

Node 24.19.0: `npm.cmd run test:spapi` com **47/47 testes aprovados**, TypeScript, lint (`tsc --noEmit`) e build aprovados. Suíte geral: **562 testes, 558 aprovados e as mesmas quatro falhas preexistentes** (três mocks de React.lazy nos testes de infraestrutura e um marcador de fonte ausente no teste Magazord). Permanecem os avisos conhecidos de tamanho do bundle e import Supabase estático/dinâmico.

Os testes novos exercitam o handler real com Auth/LWA/Catalog simulados, ausência completa de AES/tabela/service role/APP_ID, host Preview diferente de produção, bloqueio de outra loja e perfis, ISBN correspondente/incompatível, supressão de imagens/sinopses, cliente com sessão, ambiguidade e o formulário ISBN existente até o rascunho. As outras fontes mantêm seus valores; falhas e respostas tardias não transferem complemento Amazon entre contas. O bundle frontend não contém módulos de servidor nem entradas de segredos Amazon.

Nenhuma credencial real foi lida, impressa ou usada nos testes. Nenhuma chamada real, migração, registro de produto, alteração Magazord ou publicação foi feita. O diff de `supabase/`, `experimentos/`, Amazon experimental e componentes/serviço Magazord nesta etapa é vazio.
