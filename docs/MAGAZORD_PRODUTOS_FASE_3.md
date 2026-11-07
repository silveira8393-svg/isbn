# Magazord — reconhecimento Pai/Filho, somente leitura

Base `d2b79c0ab4027fbe489ab95c63e4f63b5f64fb65`, descendente direto de
`fe06f92bca387b2cd06c03e6df74d97d49b96ee9`. Categorias reais e limpeza visual
do Laboratório Amazon permanecem presentes.
Branch: `feature/magazord-produtos-leitura`.

## Fluxo

Na Consulta ou no formulário existente, **Verificar na Magazord** solicita
`GET /api/magazord/products?kind=child|parent|ean&value=...`.
No cadastro, o identificador disponível prioriza Filho, depois Pai, depois EAN/ISBN;
o operador pode escolher explicitamente outro tipo. Não há consulta por digitação.
Editar o identificador oculta resultados anteriores e cancela a requisição do cliente.

O painel é evidência somente de leitura: não preenche rascunhos, não determina
condição NOVO/USADO, não seleciona exemplares e não participa das ações do simulador.
Falhas não bloqueiam o formulário e nunca se tornam ausência de produto.

## Consultas oficiais utilizadas

- `GET /v2/site/produtoDerivacoes?codigo=...&limit=20&page=1`: Filho exato.
- `GET /v2/site/produto/{codigoPai}`: metadados do Pai e verificação do agrupador.
- `GET /v2/site/produto/{codigoPai}/derivacao`: derivações relacionadas ao Pai.
- `GET /v2/site/produto?ean=...&limit=5&page=1`: candidatos bibliográficos.

Referências: https://docs-v2.api.magazord.com.br/api/list-produtos/,
https://docs-v2.api.magazord.com.br/api/get-produto-derivacao-list-yaml/,
https://docs-v2.api.magazord.com.br/api/get-produto-yaml/ e
https://docs-v2.api.magazord.com.br/api/get-produto-derivacao-yaml/.
Filtros e formatos também conferidos no OpenAPI oficial disponível em
https://docs-v1.api.magazord.com.br/schemas/openapi.yaml.

Os códigos comerciais são comparados exatamente, preservando caixa e separadores.
O modo bibliográfico reutiliza a normalização ISBN existente: ISBN-10 válido
consulta seu ISBN-13 equivalente, sem modificar o valor digitado nem o cadastro.
EAN principal e alternativos da derivação comprovam a correspondência; ISBN
compartilhado não identifica um exemplar comercial único.
Registros antigos armazenados exclusivamente com ISBN-10 no filtro EAN da API
não foram verificados nesta fase; não há varredura alternativa do catálogo.

Pai/Filho e suas situações são preservados. Dados insuficientes, relações
inconsistentes ou EAN sem derivação comprovável resultam em indisponibilidade.
Somente 404 da consulta direta do Pai, documentado como inexistente, indica ausência;
os demais erros HTTP são indisponibilidade.

## Limites e segurança

Somente GETs, host oficial fixo, sem redirecionamentos. Até oito chamadas por consulta,
15 segundos totais de acesso Magazord e 512 KiB por resposta. Cinco Pais candidatos
por EAN e até 200 registros na lista específica de derivações do Pai. Resultados
limitados são identificados e orientam refinar por Código Filho; não há paginação
global nem varredura. A interface mostra até 20 linhas por consulta.
Cache de 30 segundos por consulta/instância, limitado a 100 entradas; a sessão e o
vínculo são sempre revalidados antes de reutilizar resultado. Instâncias frias não
compartilham memória. Falhas não ficam no cache.

Basic Auth fica no servidor. A autorização existente verifica o token ISBN,
perfil ativo, vínculo developer/admin/operator e loja ativa sob RLS do usuário.
O cabeçalho de loja deve coincidir com `MAGAZORD_STORE_ID`. Esse UUID é da loja ISBN;
não é confundido com IDs numéricos de canais de venda da Magazord. O par de acesso
e o host pertencem à livraria vinculada. Não são usados privilégios administrativos.

Não se consultam ou movimentam estoques, não se alteram preços, imagens, categorias,
cadastros ou banco. Não há gravação real de produtos nem atualização de histórico
pela consulta. Condição NOVO/USADO nunca é inferida por título, código ou ISBN.

## Preview e evidências

Vincular na Vercel, somente Preview da branch `feature/magazord-produtos-leitura`,
as variáveis existentes `MAGAZORD_BASE_URL`, `MAGAZORD_API_USER`,
`MAGAZORD_API_PASSWORD` e `MAGAZORD_STORE_ID`, sem alterar seus escopos anteriores
nem Production. Não expor ou copiar valores para código, Git, logs ou frontend.
O desenvolvimento pode ser entregue sem essa vinculação; nesse caso a leitura real
no Preview permanece pendente. As categorias reais também dependem dessas variáveis
na nova branch. Se adicionadas após um deployment, exigem novo Preview autorizado.

Validação local real: um GET por ISBN com HTTP 200 e ausência de correspondência;
uma amostra adicional de um único registro, cinco GETs HTTP 200, reconhecida pelo
Filho e pelo Pai, com vínculo e códigos preservados. Nenhum identificador comercial
individual ou segredo foi registrado nos resultados de validação.

Fixtures sanitizadas cobrem NOVO, USADOS independentes com ISBN compartilhado,
ausência de ISBN, múltiplos, erros, timeout, autorização e ausência de escrita.
Testes de navegador exercitam o componente → sessão → backend → fixtures, incluindo
resposta obsoleta após editar identificador e preservação dos demais campos.
Os testes de categorias e cadastro manual anteriores continuam passando.

Nenhuma operação de escrita deve ser iniciada antes de homologação e autorização
específicas de uma fase posterior.
