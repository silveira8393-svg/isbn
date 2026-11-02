# Consulta ISBN oficial com refresh token no servidor

Este é o fluxo vigente da PR #1. `GET /api/amazon/spapi/catalog?isbn=...` usa `AMAZON_SPAPI_REFRESH_TOKEN`, Client ID e Client Secret LWA protegidos no servidor. Não consulta `amazon_spapi_authorizations`, não exige AES, service role, APP_ID ou execução do script de provisionamento. Nenhuma tabela ou dado foi removido. OAuth e provisionamento históricos continuam independentes, sem serem iniciados pela pesquisa.

## Fluxo existente

O mesmo formulário ISBN consulta BrasilAPI e Curitiba com a prioridade anterior, e inicia a Amazon em paralelo quando o usuário é Desenvolvimento ativo da loja de homologação Silveira Lab. A Amazon preenche somente campos ausentes: título, autores, editora, data/ano, idioma, acabamento, edição, páginas, ISBNs, medidas físicas e capa. Imagens Amazon adicionais entram na galeria existente sem substituir uma capa válida das outras fontes. Não substitui dados válidos das outras fontes nem escolhe automaticamente entre múltiplos ASINs correspondentes. Falha/timeout da fonte preserva as outras fontes e o cadastro manual. Não há novos botões, telas, consentimento, escrita de catálogo, preços ou estoque.

O servidor normaliza e valida ISBN-10/13 com dígito verificador, consulta Catalog Items v2022-04-01 no marketplace Brasil e filtra o resultado pelos identificadores retornados pela Amazon. ISBN-10 e sua equivalência 978 são aceitos. A ficha identifica a origem dos campos complementados. Histórico e auditoria mantêm o fluxo já existente, sem gravações administrativas adicionais. Troca de conta/loja/perfil descarta o complemento Amazon tardio.

## Extração ampliada na mesma consulta — 02/11/2026

A mesma operação `searchCatalogItems` solicita `summaries,attributes,identifiers,dimensions,images`, sem chamada adicional por ASIN, paginação automática ou retry. Os conjuntos são opcionais na resposta: solicitá-los não garante que todo ASIN tenha todos os campos. São usados somente grupos do marketplace Brasil e atributos globais ou desse marketplace, com preferência para os atributos específicos do Brasil. Nenhum dado da página HTML é usado como fallback.

| Campo | Localização suportada na resposta oficial | Tratamento no ISBN |
| --- | --- | --- |
| Título | `summaries[].itemName`, `attributes.item_name[].value` | Complementa título ausente |
| Autores | `attributes.author[].name/value`, `summaries[].contributors[]` com `role.value=author` | Deduplica; editor/ator não vira autor |
| Editora | `attributes.publisher[].value/name`, `attributes.publisher_name[].value/name` | Aceita atributos globais e alias explícito; fabricante/marca não são presumidos como editora |
| Publicação e ano | `attributes.publication_date[].value`, `attributes.street_date[].value` | Data de calendário e ano de quatro dígitos; preserva data/ano prioritários |
| Idioma | `attributes.language[].value/type` | Prefere original, depois publicado; traduz nomes/códigos conhecidos, por exemplo `english` → `Inglês`; desconhecidos são preservados |
| Formato | `attributes.binding[].value` | Por exemplo `paperback` → `Capa comum`; desconhecidos são preservados |
| Edição | `attributes.edition[].value` | Texto ou número inteiro positivo; não infere edição |
| Páginas | `attributes.number_of_pages[].value` | Inteiro positivo, aceitando valor numérico ou string numérica; não soma volumes nem inventa total |
| Peso | `dimensions[].item.weight`, `attributes.item_weight[]` | Preserva valor/unidade originais em `physical.item`/`amazonPhysical.item`; converte unidades conhecidas para o campo existente em gramas |
| Dimensões | `dimensions[].item.height/width/length`, `attributes.item_dimensions[]` | Preserva valor/unidade originais; converte unidades conhecidas para cm; `length` corresponde a `depth`, sem ordenar ou trocar eixos |
| Embalagem | `dimensions[].package`, `attributes.item_package_dimensions[]`, `attributes.item_package_weight[]` | Preservada separadamente em `physical.package`/`amazonPhysical.package`; não substitui as medidas do item nem é exportada como metadado de embalagem |
| ISBNs | `identifiers[].identifiers[]`, atributos explícitos `externally_assigned_product_identifier`, `isbn`, `isbn_10`, `isbn_13` | Mantém somente ISBNs válidos e equivalentes ao consultado; expõe ISBN-10/13 e identificadores efetivamente retornados; não deduz ISBN de ASIN |
| Imagens | `images[].images[]` | Preserva `imageMetadata` e projeta URLs públicas HTTPS com variante/dimensões em `images`; cliente escolhe a maior `MAIN` e uma resolução por identidade de arquivo, preservando as variantes |
| Descrição | Atributos como `product_description` | Conteúdo descartado; `synopsis=null` permanece no contrato |

O dataset `dimensions` tem preferência por medida sobre os atributos equivalentes. Unidades desconhecidas são preservadas nos metadados físicos, mas não são rotuladas como g/cm. Peso e unidade são complementados juntos; medidas válidas das fontes prioritárias e suas unidades não são reinterpretadas. `amazonPhysical` não integra a exportação do rascunho.

Para o ISBN `9780515154559` / ASIN `0515154555`, o [teste real anterior](amazon-spapi-validation-2026-11-02.md) comprovou título, autor, data, idioma e formato na resposta projetada. **Não foi guardado o JSON original da Amazon. Esta ampliação foi validada com fixtures sintéticas e o JSON projetado já fornecido; não houve nova consulta real ou diagnóstico nesta etapa.** Portanto, não se afirma que os novos campos já foram retornados para esse ASIN.

| Campo | Página Amazon, conforme informação do usuário | Resposta projetada já confirmada | Distinção entre ausência e descarte anterior |
| --- | --- | --- | --- |
| Título | Jack Reacher Boxed Set | Jack Reacher Boxed Set | Retornado e aproveitado |
| Autor | Lee Child | Child, Lee | Retornado e aproveitado, preservando a grafia fornecida |
| Editora | Jove Books | `null` | JSON original indisponível; não prova ausência na Amazon. Agora são aceitos atributos globais, `name` e alias de editora |
| Publicação/ano | 07/05/2013 | `2013-05-07T00:00:01Z` | Retornado; normalização de ano já homologada para `2013` |
| Idioma/formato | Inglês / Capa comum | `english` / `paperback` | Retornados; agora traduzidos no cliente |
| Edição/páginas | Não informadas pelo usuário | `null` / `null` | JSON original indisponível; não se conclui ausência. Inteiros numéricos e páginas em string passam a ser aceitos |
| Peso | 1,89 kg | Não projetado | Código ignorava medidas; disponibilidade real ainda depende da resposta ampliada |
| Dimensões | 19,7 × 10,8 × 19,4 cm | Não projetadas | Dataset não era solicitado e atributos físicos eram ignorados; não se infere ordem de eixos da página |
| ISBN-10 | 0515154555 | Não preservado como ISBN-10 | Identificadores eram usados apenas para conferir a edição; ASIN coincidente não comprova identificador retornado |
| ISBN-13 | 9780515154559 | 9780515154559 | Consulta/edição confirmadas; ambos os formatos efetivamente retornados passam a ser preservados |
| Imagens/descrição | Disponíveis na página | `[]` / `null` | Imagens não eram solicitadas; URLs e descrição eram descartadas deliberadamente. Isso não comprova ausência no catálogo |

Não foram criados módulos, ferramentas, scripts, diagnósticos ou rotas adicionais. A autenticação existente e a configuração protegida do Preview permanecem as mesmas.

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

## Imagens autorizadas no cadastro existente

O responsável pelo projeto confirmou a autorização de utilização das imagens, conforme solicitação desta etapa. A implementação usa as referências já presentes na mesma resposta de `searchCatalogItems`, sem consultas adicionais à SP-API para imagens. Não cria autenticação, configuração, rota, script, diagnóstico ou proxy.

O backend devolve `images[]` com `variant`, `link`, `width` e `height`, além dos metadados anteriores. São aceitas referências HTTPS sem credenciais na URL, porta não padrão, query string, fragmento, diretório ou página HTML. Referências inválidas são ignoradas sem impedir a pesquisa. O backend não baixa nem copia os arquivos. `contentPolicy` agora informa `synopsis_omitted`; sinopses, descrições HTML e atributos brutos continuam descartados.

O cliente escolhe a `MAIN` de maior área em pixels, com desempate pela largura. As variantes das referências escolhidas por identidade são preservadas em `BookInfo.amazonImages`, inclusive ao complementar BrasilAPI/Curitiba, sem exportar essa classificação ao rascunho Magazord. Referências `MAIN` são candidatas de capa, e apenas a melhor é projetada como capa Amazon; outras `MAIN` não são promovidas a fotos adicionais. Fotografias distintas `PT01`, `PT02` etc. continuam preservadas, inclusive quando compartilham a mesma variante. A deduplicação usa a URL normalizada e reconhece redimensionamentos do mesmo arquivo nos hosts Amazon CDN conhecidos; outras URLs mantêm sua identidade completa, incluindo parâmetros. Nenhum endereço de resolução é inventado. `imageMetadata` continua fora de `BookInfo`/rascunho; apenas as referências escolhidas entram nos campos de imagem já existentes.

Quando a consolidação ainda não possui imagens adicionais distintas da capa/miniatura e das referências `MAIN`, a pesquisa normal reaproveita `searchAmazonLab` e a rota existente do Laboratório Amazon para uma única tentativa HTTP, somente no ambiente Desenvolvimento, com perfil ativo `developer` da Silveira Lab. A quantidade total de URLs não determina a existência de galeria: duas `MAIN`, ou uma capa prioritária junto de uma capa Amazon, permitem o fallback. Um `PT01` que seja apenas redimensionamento de `MAIN` também não bloqueia o complemento. O cliente usa a sessão existente, verifica a identidade esperada e limita a espera a dez segundos, sem consulta de saúde, retry, proxy ou tratamento de CAPTCHA. O transporte e o extrator existentes permanecem responsáveis pela consulta limitada e por interromper bloqueios. ISBNs sem equivalente ISBN-10 não acionam esse extrator, que consulta por ISBN-10.

O fallback aceita apenas imagens públicas HTTPS de um resultado concluído com ISBN equivalente verificado. Dados bibliográficos, sinopse e HTML do Laboratório não são incorporados. A capa já escolhida é preservada; a referência `principal` do Laboratório só preenche uma capa ausente e não vira foto adicional. A galeria recebe referências `adicional`, excluindo identidades conhecidas das capas e seus redimensionamentos, inclusive miniaturas identificadas pelo Laboratório. Se a galeria já existe, nenhuma consulta ao Laboratório é feita. Falha, bloqueio, ausência de imagens ou resposta incompatível preservam o resultado anterior; sem imagens de qualquer fonte, o cadastro manual continua disponível. Uma troca de usuário, loja, perfil ou ambiente durante a espera descarta o complemento Amazon. A consolidação termina antes de disponibilizar o rascunho ao operador, sem sobrescrever edições manuais posteriores.

Se BrasilAPI/Curitiba já forneceram uma capa válida, ela permanece principal e a Amazon aparece entre as adicionais. Sem capa válida, a maior `MAIN` da Amazon preenche `coverUrl` automaticamente. As demais imagens das fontes prioritárias permanecem na galeria. Sem `MAIN`, o fallback existente pode usar outra referência disponível; sem qualquer imagem, o cadastro continua normalmente.

`createRegistrationDraft` reaproveita `coverUrl`, `thumbnailUrl` e `additionalImages` nos campos `mainImageUrl`/`additionalImageUrls`. A galeria existente mostra a capa, permite adicionar URL própria, remover imagens e tornar uma adicional a capa principal. A troca preserva a capa anterior entre as adicionais e impede URLs duplicadas, inclusive ao colar a URL da capa atual. O formulário envia os valores atuais, incluindo uma eventual substituição manual.

O formulário atual chama `magazordMockService.createProduct` com o rascunho completo. As URLs estão disponíveis nesse payload e no snapshot de cadastro existente. **Esse serviço é um simulador local; esta alteração não cria um conector HTTP real, upload de arquivos ou publicação na Magazord.** O envio real dependerá do conector correspondente, quando for executado e autorizado. Não foi alterado o serviço Magazord, preços, estoque ou registros existentes.

Os testes reais de metadados informados pelo usuário confirmaram:

| ISBN | Entradas `MAIN` / links presentes | Resoluções em pixels | Maior resolução |
| --- | --- | --- | --- |
| `9780515154559` | 3 / todas `hasUrl=true` | 1400×1900, 368×500, 55×75 | 1400×1900 |
| `9780593984215` | 3 / todas `hasUrl=true` | 1435×2560, 280×500, 42×75 | 1435×2560 |

Esses números são metadados reais reportados pelo usuário, não URLs ou arquivos guardados no repositório. Os testes automatizados usam as mesmas dimensões com referências sintéticas. A exibição online do novo mapeamento ainda requer disponibilizar e conferir um Preview do novo commit. A autorização de utilização das imagens não altera o vínculo privado Desenvolvimento/Silveira Lab nem autoriza outra conta/loja.

## Homologação do mapeamento ampliado

A autenticação LWA e a consulta real já foram comprovadas no Preview, conforme o [relatório da validação anterior](amazon-spapi-validation-2026-11-02.md). Esta ampliação reutiliza a mesma configuração; não exige novas variáveis, credenciais, tabelas, migrações ou provisionamento.

A homologação visual deve usar o Preview do novo commit e a mesma sessão Desenvolvimento/Silveira Lab. `vercel.json` desabilita deployments Git automáticos desta branch; o Preview precisa ser criado explicitamente a partir do commit revisado, usando as variáveis protegidas já configuradas. Produção permanece fora do escopo. A presença de novos campos no schema ou nas fixtures não comprova sua disponibilidade real para o livro consultado.

A utilização de imagens foi autorizada pelo responsável; descrições/sinopses continuam fora desta etapa. A autorização própria para atender outra loja permanece independente. O token privado da Silveira Lab continua limitado à homologação autorizada.

Fontes: [Catalog Items API](https://developer-docs.amazon/sp-api/docs/catalog-items-api-v2022-04-01-reference), [LWA e conexão SP-API](https://developer-docs.amazon/sp-api/docs/connecting-to-the-selling-partner-api), [políticas Amazon](https://developer-docs.amazon/sp-api/docs/policies-and-agreements), [variáveis de sistema Vercel](https://vercel.com/docs/environment-variables/system-environment-variables).

## Validação desta etapa

Node 24.19.0: `npm.cmd run test:spapi` com **73/73 testes aprovados**, TypeScript, lint (`tsc --noEmit`) e build aprovados. Regressão de galeria, Laboratório cliente/servidor, consulta de cadastros, isolamento Magazord e operações: **91/91 aprovados**. Suíte geral: **588 testes, 584 aprovados e as mesmas quatro falhas preexistentes** (três mocks de React.lazy nos testes de infraestrutura e um marcador de fonte ausente no teste Magazord). Permanecem os avisos conhecidos de tamanho do bundle e import Supabase estático/dinâmico.

Os testes exercitam o handler real com Auth/LWA/Catalog simulados, ausência completa de AES/tabela/service role/APP_ID, host Preview diferente de produção, bloqueio de outra loja e perfis, ISBN correspondente/incompatível e dígitos verificadores inválidos, supressão de sinopses, cliente com sessão, ambiguidade e o formulário ISBN existente até o rascunho. A ampliação cobre editora global/alias, autores por função, páginas numéricas/string, edição, peso/dimensões por dataset e atributos, conversão g/cm com preservação das unidades originais e separação da embalagem. Os novos testes de imagens cobrem maior `MAIN` nos dois ISBNs, variantes/URLs repetidas, referências inseguras, entrada automática no formulário, renderização da galeria real, substituição manual e payload entregue ao serviço Magazord atual, inclusive sem imagens. As outras fontes mantêm seus valores e unidades; falhas e respostas tardias não transferem complemento Amazon entre contas. O bundle frontend não contém módulos de servidor nem entradas de segredos Amazon.

Os testes adicionais usam respostas controladas para capa única, galeria com variantes distintas, diferentes arquivos na mesma variante, resizes do mesmo arquivo, complemento automático limitado, ISBN divergente, CAPTCHA/bloqueios, falhas, troca de sessão/ambiente, substituição manual e payload com galeria no serviço Magazord existente. Não dependem de encontrar um livro real com várias fotos. O cliente do Laboratório foi reutilizado com uma verificação opcional da identidade da sessão; transporte, extrator e rota existentes não foram reconstruídos.

A regressão do ISBN `9781419762109` usa o formulário ISBN, handler oficial e cliente HTTP real do Laboratório, com respostas controladas e referências sintéticas. Duas URLs `MAIN` distintas, inclusive uma também rotulada `PT01` em outra resolução, resultam em uma consulta oficial e um POST à rota existente do Laboratório por pesquisa. As fotografias internas entram no rascunho sem a capa alternativa, a capa principal do Laboratório ou resizes repetidos. O cenário cobre também capa prioritária com miniatura, `PT01` realmente distinto (sem fallback), CAPTCHA, HTTP 403 e resultado vazio (sem novas tentativas). Não representa uma nova consulta real a esse livro; a confirmação visual deve usar o Preview do novo commit.

Nenhuma credencial real foi lida, impressa ou usada nos testes. Nenhuma chamada real à Amazon, migração, registro de produto, alteração do serviço Magazord ou publicação em produção foi feita. O diff de `supabase/`, `experimentos/`, backend experimental Amazon e serviço Magazord nesta etapa é vazio. Somente a galeria existente do formulário recebeu ajuste de deduplicação.
