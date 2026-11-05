# Galeria Distribuidora Curitiba — implementação e limites

Data: 05/11/2026. Branch isolada `fix/curitiba-product-gallery`, criada diretamente de `6b5c4f8e5aad0936b0d58ac0682f40ce4b1421a3` (PR #6). A nova PR é empilhada sobre `feat/amazon-bibliographic-complement`; não modifica a branch da PR #6 nem incorpora suas alterações locais pendentes do diagnóstico HTTP 503.

## Resultado e impedimento externo

Com o JSON e o HTML de Gravity Falls servidos em memória, a integração recupera uma capa e quatro adicionais distintas. As cinco referências sobrevivem ao merge, à consolidação Amazon, à falha controlada do Lab e à abertura da Consulta/Cadastro NOVO, menu Cadastro e USADO com App/React reais.

**A homologação com a fonte real no Preview permanece pendente de CORS.** Uma única leitura controlada do índice público retornou HTTP 200, `text/html;charset=UTF-8`, 1733 bytes e cinco links de produto, mas sem `Access-Control-Allow-Origin` para a origem Vercel de teste enviada. Não se demonstrou autorização CORS para o novo alias do Preview. HTTP 200 em Node não comprova que o navegador possa ler o documento. A implementação usa `mode: cors`, sem proxy, `no-cors`, credenciais, mudança de origem ou mecanismo de contorno. Se a fonte rejeitar a leitura, a capa e os dados existentes continuam disponíveis, sem repetição automática.

Não se afirma que as quatro adicionais estejam atualmente disponíveis no Preview real. O critério de cinco imagens foi comprovado em ambiente isolado, condicionado à leitura permitida do índice. Qualquer habilitação na fonte depende de seu responsável; nenhuma configuração externa foi alterada.

## Alterações

Único arquivo de execução alterado: `src/services/distribuidoraCuritiba.ts`.

- Reconhece somente o diretório HTTPS explicitamente informado em `urlFoto`, no host exato `conteudo.livrariascuritiba.com.br`, caminho `/images/lv/lvndd/<produto>/`, com correspondência entre os códigos do produto selecionado e da ficha. Não gera um endereço de índice a partir do ISBN.
- No máximo um GET do índice por pesquisa elegível, com `credentials: omit`, `redirect: error`, `referrerPolicy: no-referrer`, limite de 4 segundos, 64 KiB efetivamente lidos e 32 imagens do índice. Sem tentativas adicionais, leitura de outras pastas ou sondagem de arquivos.
- Exige resposta HTML válida. Extrai apenas `href` de links e `src` de imagens presentes no documento, sem criar DOM, executar scripts ou carregar recursos. Ignora comentários/scripts/estilos, ícones, subpastas, URLs de outros hosts/produtos, credenciais, queries, fragmentos, caminhos codificados e formatos fora da lista permitida.
- Usa a miniatura identificada da ficha como capa quando ela pertence ao mesmo produto. Une referências diretas e referências efetivamente listadas, preservando ordem e deduplicação.
- Acrescenta diagnóstico opcional `gallery` em memória: estado, contagem e código HTTP ou categoria de falha. Não registra sessão, URLs privadas, HTML, tokens ou credenciais. Uma falha da galeria não transforma uma ficha bibliográfica válida em indisponível.
- O merge passa a combinar referências existentes e entrantes, preservando a capa válida escolhida, as imagens anteriores e sua ordem. Capa/miniatura selecionadas não são repetidas como adicionais; uma capa distinta de outra fonte pode ser conservada na galeria. Não altera campos bibliográficos/comerciais nem modifica os objetos de entrada.

Sem mudanças em App, componentes, CSS/layout, BrasilAPI, Amazon SP-API, Laboratório Amazon, contratos de persistência, Magazord, Supabase, autenticação, permissões, variáveis ou dependências.

## Evidências e fixtures

### Gravity Falls — 9788550303628 / LV434083

A projeção da ficha contém `urlFoto` apontando para um índice e `urlFotoMiniatura` apontando para `lv434083_1.jpg`. O HTML real capturado contém links explícitos para cinco arquivos distintos, terminados em `_1.jpg` a `_5.jpg`. Esses nomes foram lidos do documento; não houve geração/probing de URLs nem download de imagens.

| Etapa controlada | Resultado |
|---|---|
| Ficha + índice real em memória | Uma capa + quatro adicionais |
| Merge com galeria existente | Mantém imagens anteriores e incorpora as referências distintas |
| Consolidação Amazon com referências repetidas | Cinco imagens Curitiba conservadas, sem duplicatas |
| Lab respondendo 503 | Galeria anterior preservada |
| Consulta real renderizada | As cinco referências presentes |
| Cadastro NOVO/menu Cadastro/USADO | Capa + quatro adicionais presentes |
| Índice negado por CORS/HTTP/timeout/limite | Dados e imagens diretas anteriores preservados; sem retry |

### Tarô — 9788531521621 / LV488040

Foi realizada uma única sequência pública de bootstrap/pesquisa/ficha, três POSTs pelo mecanismo existente, sem identificadores de sessão nos registros. A projeção sanitizada também contém somente diretório e miniatura. Não foi consultado o índice desse produto nem obtida a URL da segunda imagem histórica.

O teste usa a ficha real e uma adicional explicitamente sintética em `fixtures.invalid` para comprovar que duas imagens preexistentes não são perdidas quando o índice falha. Isso é teste de preservação, **não homologação da recuperação real da segunda imagem Curitiba**, nem prova de sua fonte histórica.

As projeções públicas e o HTML estão em `tests/fixtures/curitiba/`, com sua origem e limitações descritas no README. Não são envelopes JSON completos ou dados autenticados.

## Validação

| Verificação | Resultado |
|---|---|
| `node --test tests/curitibaGallery.test.mjs` | 27/27 aprovados |
| `node scripts/test-curitiba-gallery-browser.mjs` | Quatro cenários aprovados com App real, React StrictMode e Edge isolado |
| `npm run typecheck` | Aprovado |
| `npm run lint` | Aprovado; neste projeto executa TypeScript |
| `npm run build` | Aprovado; avisos preexistentes de bundle e importações estática/dinâmica |
| `npm test` | 746 testes: 743 aprovados, três falhas preexistentes |
| `git diff --check` | Aprovado |

As três falhas da suíte geral são `settings gates infrastructure navigation and forced mount` para admin/operator/developer em `tests/infrastructureUi.test.mjs:58`, pelo mock sem `React.lazy`. Constam também na base da PR #6. Não foram corrigidas fora deste escopo.

O ensaio de navegador executa o fluxo completo de pesquisa somente no bundle local com respostas interceptadas: quatro pesquisas, 24 chamadas em memória, quatro tentativas automáticas de auditoria recusadas, zero requisições externas do aplicativo e zero erros de página. Não simula sucesso de persistência. CDP responde às cinco URLs de imagens com um pixel local, conservando os atributos `src`; isso verifica transporte/renderização, não disponibilidade ou conteúdo real do CDN. O perfil do navegador é temporário, sem sessão pessoal. O primeiro ensaio foi impedido pela execução do navegador no sandbox; outro ensaio com downloads bloqueados produziu erros esperados de imagens. O teste final intercepta esses recursos e passou, sem alterar a aplicação.

Cobertura: estrutura real do índice, ficha parcial, URLs repetidas, galeria vazia, origem/pasta/produto inválidos, corpo/tipo/URL de resposta inválidos, limite anunciado e efetivo de bytes, limite de imagens, timeout, CORS/rede, HTTP 403/404/429/503, ausência de retry, preservação de fonte prioritária, imutabilidade, união de fontes, Tarô com galeria anterior e componentes reais de Consulta/Cadastro.

## Publicação e homologação

A PR é criada em rascunho, tendo a branch da PR #6 como base. Somente um Preview do projeto ISBN é autorizado; commit, URL e estado READY serão conferidos pela Vercel e informados na entrega/descrição da PR. Nenhuma promoção ou merge é realizado.

Pendências: autorização/acessibilidade CORS do índice no navegador do Preview, validação real das cinco imagens de Gravity Falls e captura autorizada da galeria real do Tarô. Não é necessário refazer a pesquisa publicada para provar os testes offline; ela gravaria operação automaticamente e não foi acionada nesta execução.
