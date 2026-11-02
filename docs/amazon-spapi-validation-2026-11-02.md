# Validação final SP-API e correção do ano — 02/11/2026

Base inspecionada: `e18e09ff2503280c7e31015d07549273f9124488`, branch `feat/amazon-spapi-official`. A etapa altera somente normalização/exibição da data e seus testes, sem nova funcionalidade, mudança de permissões ou configuração.

## Consulta real confirmada e limites da evidência

Projeto Vercel ISBN `prj_pvcmEP52OoMKQhhvb5FJRWrGZv1e`, equipe `team_6Mb3ib4RldlG91XsfpCCDvYF`. O Preview `isbn-mkxoqaqoa-silveira8393-svgs-projects.vercel.app`, deployment `dpl_CLRN2aAdJxNkzEmgCCthtNEdsvqx`, está associado ao commit base e à branch indicados.

Registros de requisição consultados pela CLI autenticada, somente leitura e sem cabeçalhos/credenciais:

| Horário de Brasília | Rota | HTTP da Function | Request ID |
| --- | --- | --- | --- |
| 02/11/2026 13:35:00.175 | `GET /api/amazon/spapi/catalog` | 200 | `6sg6j-1793637300175-b4606f956cca` |
| 02/11/2026 13:36:06.171 | `GET /api/amazon/spapi/catalog` | 200 | `wfr7b-1793637366171-923d1bcda3f1` |

O usuário conferiu na aba Network do Chrome o corpo de `/api/amazon/spapi/catalog?isbn=9780515154559` e forneceu o JSON bibliográfico. Ele contém ISBN exato `9780515154559`, ASIN `0515154555`, título `Jack Reacher Boxed Set`, autor `Child, Lee`, idioma `english`, acabamento `paperback`, data `2013-05-07T00:00:01Z`, marketplace Brasil `A2Q3Y263D00KWC` e origem `amazon_spapi_catalog_2022-04-01`. Há um único resultado, sem outras páginas; editora/edição/páginas/sinopse estão nulas e imagens vazias.

Essa combinação confirma que a consulta oficial retornou o livro reportado. Não foi uma resposta do laboratório HTML. A identificação da Amazon como fonte complementar depende do complemento efetivamente aplicado pelo cliente, com prioridade das fontes anteriores preservada.

O código do deployment confirma o caminho obrigatório de sucesso: sessão/perfil/loja → POST `https://api.amazon.com/auth/o2/token` com `grant_type=refresh_token` → GET `https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items`, operação `searchCatalogItems`, com `identifiersType=ISBN` e marketplace Brasil. Respostas upstream não-2xx e respostas inválidas causam erro, sem gerar o HTTP 200 observado. O ISBN informado é validado por dígito verificador e o resultado só entra se os identificadores retornados pela Amazon correspondem ao ISBN ou à equivalência ISBN-10/13 da mesma edição.

**Precisão sobre HTTP:** os 200 acima são da rota ISBN/Vercel. Os logs históricos não guardaram o código numérico de LWA e Catalog Items separadamente. Pelo caminho de código e resposta válida, ambas as operações concluíram com respostas 2xx; não se atribui um HTTP upstream exato sem registro. Os requests oficiais não têm logs de aplicação nem trace ID; a consulta de trace retornou `Trace not found`. O corpo JSON foi fornecido pelo usuário, não recuperado dos logs. Nenhum token real foi lido, usado localmente, impresso ou gravado para reproduzir o teste.

Foi tentado apenas SELECT da auditoria desse ISBN na loja Silveira Lab do projeto Supabase ISBN. A conexão “Silveira Lab” foi recusada. A revisão automática bloqueou a troca de conta sem confirmação; após autorização explícita do usuário para a conexão “Primary”, o SELECT também foi recusado pelo Supabase por falta de permissão. Nenhum registro ou permissão foi alterado. Assim, não se afirma pela auditoria qual fonte preencheu individualmente cada campo prioritário; o JSON confirma quais campos vieram da SP-API, e o usuário relatou BrasilAPI HTTP 400. A resposta da Curitiba nesse teste não foi recuperada.

## Laboratório experimental independente

Às 13:37:01.342 houve `POST /api/amazon`, request `dbtn7-1793637421342-d8e0c29cd613`, também com HTTP da Function 200. O log de aplicação às 13:37:01.883 registrou `evento=amazon_lab`, `codigo=amazon_unexpected`, `status_http=200` e diagnóstico `f6d5d616-cd15-4472-890a-9971a0308247`.

Esse código é emitido por `server/amazonFunction.ts` quando a coleta HTML retorna HTTP 200, mas sem HTML utilizável (`metadata.html === null`), sem a classificação específica de CAPTCHA. Não é um erro LWA/Catalog Items. Não foi inferida uma causa mais específica para o HTML e nenhum arquivo do laboratório foi modificado. A rota oficial usa outro handler e nunca chama o laboratório como fallback.

## Correção da data

A ficha dividia o timestamp por `-` e invertia os três segmentos. Por isso `2013-05-07T00:00:01Z` virava `07T00:00:01Z/05/2013`.

A normalização compartilhada mantém a data de calendário `2013-05-07`, sem deslocamento por fuso horário, e extrai o ano `2013`. O servidor normaliza os atributos de data; o cliente também aceita a resposta antiga do Preview. O campo **Ano** na ficha e no rascunho fica com quatro dígitos. Datas inexistentes, meses inválidos e horários malformados são rejeitados. Data/ano válidos de BrasilAPI e Curitiba continuam prioritários; um ano Amazon não substitui uma data ou ano prioritário.

Imagens, sinopses, fontes prioritárias, escopo da loja Silveira Lab/perfil Desenvolvimento, Magazord, preços, estoque, tabelas e configurações Vercel/produção permanecem inalterados. Não houve nova pesquisa pelo formulário nem escrita de auditoria, cadastro ou banco por esta tarefa.

## Verificação e pendências

`npm run test:spapi`: 51/51 aprovados, com dados sintéticos e o JSON bibliográfico sem credenciais fornecido pelo usuário. Os testes cobrem timestamp ISO, offset de fuso, data parcial, calendário inválido, handler → cliente → rascunho, renderização real da ficha, preservação da prioridade e o JSON do livro reportado.

`npm run typecheck`, `npm run lint` e `npm run build`: aprovados. Permanecem os avisos existentes de chunk acima de 500 kB e import Supabase estático/dinâmico.

`npm test`: 566 testes, 562 aprovados e quatro falhas preexistentes: três mocks sem `React.lazy` em `tests/infrastructureUi.test.mjs` e a asserção de marcador de fonte em `tests/magazordMode.test.mjs`. As mesmas falhas já constam na validação da etapa anterior, sem alterações nesses testes ou nos respectivos módulos. A suíte geral não está totalmente aprovada; essas correções ficam fora desta etapa.

Não há impedimento técnico adicional identificado na consulta real reportada. Para concluir a homologação da correção, disponibilizar separadamente um Preview do novo commit e repetir o ISBN para confirmar visualmente `Ano: 2013`. A tarefa não publica o Preview nem produção. A auditoria por fonte fica limitada pela permissão da conexão Supabase; o HTTP upstream exato do teste passado não é recuperável pelos logs disponíveis. Não é necessário provisionar tokens ou executar migrações.
