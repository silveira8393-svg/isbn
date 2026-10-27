# Amazon Brasil — viabilidade de acesso por ISBN

Data: 26/10/2026. ISBN diagnóstico: **9788584390670 — O Alquimista**.

**Resultado: caminho oficial documentado, mas consulta real ainda não comprovada.**
Nenhuma requisição bibliográfica foi enviada ao site ou à SP-API. Foram consultados
documentos oficiais e verificada a disponibilidade de configuração, sem expor valores.

## 1. É possível consultar a Amazon diretamente por ISBN?

**Pela SP-API, sim, documentalmente.** Catalog Items API **v2022-04-01** oferece
`searchCatalogItems` com `identifiersType=ISBN`. O Brasil usa o marketplace
`A2Q3Y263D00KWC` e o endpoint norte-americano. Isso não comprova que o ISBN desta
amostra retornará um produto nem os nove campos. Fontes: [modelo oficial](https://github.com/amzn/selling-partner-api-models/blob/main/models/catalog-items-api-model/catalogItems_2022-04-01.json),
[marketplaces](https://developer-docs.amazon.com/sp-api/docs/marketplace-ids) e
[endpoints](https://developer-docs.amazon.com/sp-api/docs/sp-api-endpoints).

**Página pública:** não foi estabelecida autorização para extração automatizada.
A tentativa de ler as [condições de uso do varejo](https://www.amazon.com.br/gp/help/customer/display.html?nodeId=GLSBYFE9MGKKQXXM)
retornou HTTP 503 pela ferramenta; o link oficial no rodapé do Portal de Associados
também não pôde ser lido. Portanto, o texto vigente do varejo não foi confirmado
integralmente nesta sessão, e a página do livro não foi consultada.
As [políticas brasileiras de Associados](https://associados.amazon.com.br/help/operating/policies)
restringem coleta por robôs e destinam sua licença à promoção de vendas da Amazon.
São regras desse programa, não uma autorização geral nem substituto das condições
do varejo. Não se presume permissão porque a página é pública.

## 2. Qual mecanismo foi efetivamente testado?

Somente **acesso documental e pré-verificação de configuração**. Não houve GET de
produto, chamada de autenticação LWA, chamada de catálogo, sandbox ou teste na Vercel.

- Nenhuma variável Amazon/SP-API/LWA correspondente foi encontrada no ambiente do processo.
- `.env.local` contém somente as duas variáveis públicas de configuração do Supabase;
  seus valores não foram exibidos. `.env.example` não forneceu credenciais Amazon.
- A busca por referências de integração SP-API/LWA em `src/`, `docs/` e
  `experimentos/` não encontrou configuração utilizável.
- A listagem Vercel por nome `isbn`, no escopo conectado, retornou zero projetos.
  Não foram lidas variáveis remotas. Isso não exclui credenciais em outros nomes,
  equipes ou ambientes inacessíveis nesta sessão.

## 3. A consulta retornou informações bibliográficas?

**Não houve consulta bibliográfica; nenhum campo novo foi retornado.** A comparação
com o protótipo não se aplica nesta etapa. Os resultados anteriores e as
classificações `valido`, `ausente` e `inconsistente` permanecem intactos; nenhum
teste local foi repetido ou ampliado.

Documentalmente, `includedData=identifiers,summaries,attributes` solicita
identificadores, resumo cadastral e atributos. **`summaries` não significa sinopse
literária.** A presença de título, autores, editora, ano, edição, idioma, formato,
páginas e sinopse depende dos atributos efetivamente disponíveis; não há garantia
de 9/9. Uma descrição devolvida pela API continua sujeita à classificação de
qualidade e à revisão humana. Fonte: [referência da operação](https://developer-docs.amazon.com/sp-api/reference/searchcatalogitems).

## 4. Quais limitações técnicas e de autorização existem?

**Acesso/autorização:** a operação requer aplicativo registrado, autorização de um
Selling Partner e função **Product Listing** aprovada e selecionada. LWA exige
`client_id`, `client_secret` e, para obter o token de acesso por renovação, o
`refresh_token` da autorização. Nada disso foi localizado de forma utilizável.
Fontes: [pré-requisitos da busca](https://developer-docs.amazon.com/sp-api/docs/search-catalog-items)
e [conexão/autenticação](https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api).

**Escopo contratual:** a [AUP](https://sellercentral.amazon.com/solution-provider/policy?policyType=AUP&locale=pt_BR),
seções 1.1, 3.8, 4.3–4.6 e definição de uso permitido, limita atividades, obtenção
e compartilhamento de informações em favor de usuários autorizados. O
[contrato do provedor](https://sellercentral.amazon.com/solution-provider/agreement?locale=pt_BR),
seção 6, limita exploração fora dos fins contemplados. **Inferência para este
projeto:** credenciais válidas, por si só, não autorizam uma base bibliográfica
independente ou republicação de sinopses em outra loja. A finalidade concreta
precisa estar coberta. As traduções consultadas informam que a versão inglesa
prevalece; sua leitura não ficou disponível pela ferramenta nesta sessão.

**Técnica:** o 503 observado ocorreu na leitura de condições, não no endpoint do
livro; não demonstra CAPTCHA nem indisponibilidade da SP-API. Não há diagnóstico
de rede/autenticação do catálogo porque a consulta não foi enviada. A Amazon
[alerta que ISBN e ASIN não têm correspondência necessariamente única](https://developer-docs.amazon.com/sp-api/docs/search-catalog-items):
podem existir múltiplos resultados, exigindo conferência da edição.

**Vercel:** uma chamada HTTPS autenticada é compatível, em princípio, com
[Vercel Functions em Node.js](https://vercel.com/docs/functions/runtimes/node-js).
Credenciais devem permanecer no backend, sem prefixo público `VITE_`. É avaliação
arquitetural, não execução comprovada; não houve deploy.

## 5. O que falta para realizar uma consulta real autorizada?

Confirmar que a finalidade do Projeto ISBN está coberta pelo uso permitido;
confirmar conta de vendedor/fornecedor e aplicativo com Product Listing; e dispor
da autorização LWA no ambiente de execução. Se não existir esse vínculo, será
necessário o processo oficial de cadastro/aprovação ou autorização específica da
Amazon. Não foram solicitadas novas credenciais, usados cookies nem acessadas
sessões do navegador.

## 6. Qual é o próximo passo mais curto?

**Verificar no cadastro já existente de Seller/Vendor/Solution Provider se há
aplicativo autorizado e finalidade compatível.** Se houver, executar uma única
busca de produção, sem paginação automática, imagens ou chamadas adicionais de
produto. Requisição prevista, **não executada**, com autenticação fornecida apenas
em memória pelo ambiente autorizado:

```http
GET https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items?identifiers=9788584390670&identifiersType=ISBN&marketplaceIds=A2Q3Y263D00KWC&includedData=identifiers,summaries,attributes&locale=pt_BR&pageSize=20
```

Se houver resposta, registrar somente evidências bibliográficas necessárias e
conferir os nove campos, a edição e a sinopse contra a referência já validada.
Múltiplos candidatos ou dados insuficientes devem permanecer inconclusivos no
limite dessa única consulta. O sandbox desta API é estático e não substituiria
essa prova de catálogo real. Fonte: [visão geral da Catalog Items API](https://developer-docs.amazon.com/sp-api/docs/catalog-items-api).

Arquivo criado nesta etapa: somente este relatório. Extrator, fixtures, testes,
fluxo operacional, banco e integrações existentes não foram modificados. Sem
instalação de dependências, scraping, imagens, deploy ou commit.
