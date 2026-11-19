# Diagnóstico da leitura de preços — 19/11/2026

Branch: `feature/magazord-homologacao-etapa3`.
Caso informado: Pai `LVP007`, Filho `9788535931938`, valor pretendido R$ 12,00.

## Constatação e limite da investigação

O `price_read_unavailable` original nasce em `server/magazordPriceTransport.ts`
quando um GET externo retorna HTTP fora de 200–299 ou Content-Type incompatível
com `application/json`. O HTTP 502 do endpoint interno não é o status externo.
O mesmo erro é compartilhado por cinco leituras, nesta ordem:

| Operação | Endpoint externo sanitizado |
| --- | --- |
| `read_parent` | `/api/v2/site/produto/{pai}` |
| `read_child` | `/api/v2/site/produto/{pai}/derivacao/{filho}` |
| `read_price_table` | `/api/v2/site/tabelaPreco` |
| `read_prices_inactive` | `/api/v1/listPreco` (filtro de inativos) |
| `read_prices_active` | `/api/v1/listPreco` (filtro de ativos) |

Sem metadados da resposta externa, o erro informado não identifica qual GET
falhou. Não há evidência para atribuí-lo a credenciais, permissão, rota ou filtro.
As rotas de [preços](https://docs.api.magazord.com.br/api/list-preco/) e
[tabelas](https://docs.api.magazord.com.br/api/list-tabela-preco/) coincidem com
a documentação oficial consultada; sua disponibilidade neste tenant segue pendente.

O Preview READY consultado foi `dpl_5oFyNLJWG3RFNVoLbKeAdMNnXVXU`, da branch
solicitada, commit `341fc80af8d92027a4d299ae36200a08c7d8c447`.
A consulta de logs com `price` nos últimos 30 minutos não retornou registros.
Uma consulta anterior de 1 hora foi recusada pela API por retenção do plano;
essa recusa não foi interpretada como ausência de logs.
As credenciais Secret não foram retornadas pela conexão Vercel. Nenhum segredo
foi copiado para o ambiente local e nenhum GET autenticado Magazord foi executado.

## Alteração local

- `server/magazordPriceTransport.ts`: registra o evento
  `magazord_price_read_failure`, com operação, rota estática, `httpStatus`,
  `contentType` e motivo. Distingue também falhas de rede, timeout e corpo JSON
  inválido/incompleto/excessivo. Sem resposta HTTP, o status é `null`.
- `shared/magazordPrice.ts`: define os metadados opcionais de diagnóstico.
- `server/magazordPrice.ts`: devolve os mesmos metadados seguros no erro da API.
- `tests/magazordPrice.test.mjs` e `tests/magazordPriceTransport.test.mjs`:
  verificam atribuição da falha, sanitização, ausência de novas tentativas e
  preservação das leituras válidas e das proteções existentes.

Não são registrados códigos de produtos, parâmetros de consulta, credenciais,
Authorization, outros cabeçalhos, corpos ou mensagens de exceções externas.
Content-Type conserva apenas tipos conhecidos, sem parâmetros; tipos desconhecidos
viram `other` e ausência vira `missing`. O corpo rejeitado é cancelado sem leitura.
A falha do logger não substitui o erro conhecido. Nenhum endpoint ou filtro de
consulta foi trocado por hipótese e nenhuma regra de preço foi flexibilizada.

## Validação local

- Testes direcionados de preços: **33 aprovados, 0 falhas, 1 ignorado**.
- `node node_modules/typescript/bin/tsc --noEmit`: **aprovado**.
- `node --no-experimental-webstorage --test tests/magazord*.test.mjs`:
  **185 aprovados, 1 falha, 1 ignorado**. A falha em `magazordProducts.test.mjs:63`
  compara `src/utils/draft.ts` com o commit histórico `e04d315`; o arquivo já
  difere desse marco no HEAD e não foi alterado nesta tarefa.
- `node --test tests/*.test.mjs`: **não passou**; apresentou falhas em outras
  áreas, incluindo Amazon/SP-API, validação de cadastro e comparações históricas.
  Não se afirma aprovação global. O Node disponível é 26.13.0; o projeto declara
  Node 24.x. A regressão Magazord desativou o Web Storage experimental para
  compatibilidade com os mocks existentes, sem alterar o projeto.
- O teste SQL opcional foi ignorado por ausência de `ISBN_PRICE_PGLITE_MODULE`.
  Nenhuma migration foi alterada ou executada.
- `git diff --check`: **aprovado**.

## Publicação autorizada em Preview

Em 19/11/2026, o usuário autorizou um único novo Preview desta branch, com commit
restrito ao diagnóstico, seus testes e este relatório. Publicar este
diagnóstico e executar somente `action: preview` para o cadastro confirmado e
R$ 12,00. Examinar o objeto `diagnostic` na resposta de `/api/magazord/price`
ou o evento correspondente nos logs. Isso revelará a operação, rota, status HTTP
externo e tipo de conteúdo para decidir a correção com evidência.
Não usar `send` nem `reconcile` para coletar esse diagnóstico.

A causa externa ainda não foi confirmada e a consulta real ainda não foi validada.
Até a preparação deste commit, as alterações permanecem locais. O resultado da
publicação será registrado após READY, sem segundo push documental.
Não alterar variáveis, banco ou produção; não cadastrar produtos, enviar ou
reconciliar preços, alterar estoque ou imagens.
`RELATORIO_CODEX.md` e `backups/`, já modificados/existentes no início, foram preservados.
