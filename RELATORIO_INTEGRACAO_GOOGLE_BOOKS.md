# Integração Google Books — Preview para homologação

Data: 05/11/2026. Branch: `feat/google-books-integration`.

Implementação preparada e validada com respostas controladas. **Homologação de cobertura real pendente de chave Google Books e resposta efetiva do catálogo.** Não declarar esta etapa homologada nem promover para produção.

## Base confirmada

- Branch remota `fix/amazon-bibliographic-recovery`: `923f9e6130480d9ae608efe11c27d3a77ca9dc47`, confirmada por `git ls-remote`.
- Tag anotada `isbn-curitiba-galeria-homologada-v1.1`: objeto `76d751da10b12ea31a2f1956353eba130b58768a`, apontando para `76261ae0b7270812c3545bba2c18075a16b5a9d9`. Commit ancestral da base Amazon, confirmado local e remotamente.
- Worktree nova, sem incorporar alterações pendentes das outras worktrees. Sem merge ou publicação em produção.

## A. Cobertura real

Uma consulta diagnóstica pública sem credenciais a `volumes.list`, com `q=isbn:9798276439839`, `maxResults=10` e `printType=books`, retornou **HTTP 429**, em **1.527 ms**, em `2026-11-05T18:46:34.376Z` (15:46:34 de Brasília). Corpo de erro descartado, sem repetição. Os demais casos não foram consultados após essa recusa. Esta consulta diagnóstica não representa execução autenticada da nova Function, que exige chave de projeto.

| ISBN | Encontrado | Dados retornados | Campos complementados | Link disponível |
|---|---|---|---|---|
| 9798276439839 | Não verificável: HTTP 429 | Sem dados bibliográficos aproveitados | Nenhum | Não verificado |
| 9798286828647 | Não consultado após 429 | Não verificados | Nenhum | Não verificado |
| 9788550303628 | Não consultado após 429 | Não verificados | Nenhum | Não verificado |

Nenhum desses casos é classificado como obra inexistente. Nenhuma informação foi preenchida com dados de outras fontes durante essa verificação.

## B. Implementação

### Fluxo e correspondência

A busca existente inicia uma consulta Google em paralelo para reduzir espera, mas consolida seus fatos **após BrasilAPI, Curitiba e Amazon SP-API**. O Laboratório Amazon mantém sua rotina separada, sem alterações. O fluxo continua no mesmo formulário e no mesmo cadastro NOVO/USADO.

A pesquisa usa o ISBN-13 canônico em `q=isbn:...`. Cada volume candidato precisa ter identificadores `ISBN_10`/`ISBN_13` válidos e todos devem corresponder ao ISBN pesquisado. A conversão ISBN-10 → ISBN-13 usa dígito verificador e prefixo 978; ISBN 979 nunca recebe ISBN-10 fabricado. Título semelhante não basta. Seleciona-se um único registro correspondente; não se unem dados de volumes diferentes. Resposta sem correspondência exata é `not_found`; resposta estruturalmente inválida é `unavailable`.

### Campos e prioridade

Mapeados: título, subtítulo, autores, editora, ano/data com precisão fornecida, idioma, páginas e identificadores. Cada preenchimento registra proveniência `Google Books`. Valores anteriores não vazios e campos com proveniência manual permanecem. Ano/data incompatíveis com a base não são incorporados. Preservados capa, miniatura, adicionais, medidas, campos comerciais e estoque anteriores.

O recurso oficial não declara campo próprio de edição ou encadernação: não se infere edição do título e `printType=BOOK` não vira formato de capa. Peso e dimensões não são estimados ou importados nesta etapa.

### Conteúdo, imagens e links

`googleBooksReference` guarda volume, ISBN, links retornados, referência remota de capa e disponibilidade de descrição. Descrição integral não é armazenada nem copiada para sinopse, descrição comercial ou meta description. Capa Google permanece referência para verificação de direitos e não entra automaticamente na galeria/cadastro comercial. Há indicação pelo mecanismo existente de `bibliographicWarnings`, sem painel novo ou etapa obrigatória adicional.

`sourceLinks` guarda links específicos `info`/`preview`, associados ao volume e ISBN, e acompanha o draft NOVO/USADO para o futuro painel. Não entra no export comercial existente. Links precisam ser de host Google Books permitido, sem credenciais, e conter o ID exato do volume. Referências HTTP retornadas são normalizadas para o mesmo recurso HTTPS. Não são fabricadas URLs por título. Nenhuma imagem, página de prévia ou galeria é buscada por scraping.

### Transporte e falhas

- Nova Function `GET /api/google-books?isbn=...`, usando exclusivamente o host oficial `www.googleapis.com`.
- `GOOGLE_BOOKS_API_KEY` somente no servidor; nunca prefixada por `VITE_`, enviada pelo cliente, registrada ou devolvida. Nenhuma variável existente foi alterada.
- Sem chave: `unavailable/not_configured`, sem requisição ao Google. Configuração necessária somente no Preview desta branch para continuar a homologação.
- Um GET por pesquisa válida; sem retry, redirecionamento, paginação, cookies ou encaminhamento de sessão.
- Prazo de 4 segundos no servidor, 5 segundos no cliente; leitura máxima de 1 MiB, inclusive sem Content-Length.
- HTTP 400/403/404/429/5xx do serviço são indisponibilidade, não ausência de catálogo; erros externos não são devolvidos integralmente.
- Falhas preservam o livro anterior; indisponibilidade apenas desta fonte não gera alerta adicional quando já há livro disponível.
- Respostas tardias são verificadas contra ISBN, geração, aborto, usuário, loja e ambiente. Não se faz complemento tardio sobre edições manuais.
- Middleware local do Vite atende a mesma Function em desenvolvimento; builds da aplicação não expõem a chave.

### Arquivos

- `shared/googleBooks.ts`: correspondência, validação, mapeamento e referências.
- `server/googleBooksFunction.ts`, `api/google-books.ts`: transporte oficial e Function.
- `src/services/googleBooks.ts`: cliente e complemento apenas de lacunas.
- `src/App.tsx`: conexão à pesquisa existente e diagnóstico da nova fonte.
- `src/types.ts`, `src/utils/draft.ts`: referências de fonte no livro/draft.
- `vite.config.ts`, `.env.example`: desenvolvimento local e configuração documentada.
- `tests/googleBooks.test.mjs`: casos da nova fonte.
- `tests/spapiIntegrated.test.mjs`: integração com o fluxo existente, falhas e resposta tardia.
- `tests/history.test.mjs`, `tests/operations.test.mjs`: isolamento explícito da nova dependência nas baterias existentes.
- Este relatório.

### Validação

**214 casos relevantes aprovados**, distribuídos entre Google Books, integração SP-API/App, bibliografia Amazon, galeria Curitiba, histórico e operações. Após ajustes finais em mapeamento/referências, repetidos apenas os 67 casos Google Books/SP-API afetados, aprovados.

Cobertos: ISBN-13/ISBN-10/979, inexistência, resultados semelhantes/divergentes, ausência de editora/páginas/capa, datas inválidas, referência de conteúdo, HTTP 400/403/404/429/5xx, timeout, JSON inválido, resposta grande, preservação de dados/proveniência/edições manuais, Consulta/Cadastro, NOVO/USADO, galerias Curitiba e Amazon e correção `attributes.pages` para os dois ISBNs 979 observados anteriormente.

TypeScript (`npm.cmd run typecheck`), lint (`npm.cmd run lint`, também TypeScript neste repositório) e build (`npm.cmd run build`) aprovados. Build mantém avisos de tamanho de bundle e import estático/dinâmico Supabase já presentes na estrutura do projeto; nenhuma alteração Supabase foi feita. Testes Google usam dados sintéticos e não são prova de cobertura real.

## C. Publicação e pendências

Branch isolada destinada exclusivamente a commit/PR em rascunho e Preview no projeto Vercel ISBN, conta Pessoal, `prj_pvcmEP52OoMKQhhvb5FJRWrGZv1e`. Commit, PR/comparação, URL e estado final do deployment serão entregues na resposta de conclusão operacional. Produção preservada.

Pendências: configurar chave Google Books válida/restrita à Books API somente no Preview desta branch, retomar as consultas reais controladas dos três ISBNs e homologar a cobertura e os campos efetivamente complementados. Não houve criação de credenciais, alteração de permissões, migração, escrita de banco, merge ou modificação do Laboratório Amazon.

## Documentação oficial consultada

- [Uso, busca por ISBN, identificação por chave e quotas do projeto](https://developers.google.com/books/docs/v1/using).
- [volumes.list](https://developers.google.com/books/docs/v1/reference/volumes/list).
- [Estrutura de volumeInfo, imageLinks, infoLink e previewLink](https://developers.google.com/books/docs/v1/reference/volumes).
- [Condições específicas Google Books](https://developers.google.com/books/terms).
- [Condições gerais de conteúdo e atribuição](https://developers.google.com/terms), especialmente seção 5: a disponibilidade pela API não constitui autorização geral de reprodução comercial de conteúdo de terceiros.

Não se presume uma quota numérica universal. A chave identifica o projeto para quota/restrições configuradas no Google Cloud. Não se criou autenticação OAuth, pois a consulta é de metadados públicos.
