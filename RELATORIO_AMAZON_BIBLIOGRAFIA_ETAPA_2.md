# Etapa 2 — Complementação bibliográfica Amazon

Implementada a complementação factual pela chamada já existente ao Laboratório, com testes de extração, consolidação, Consulta e inputs reais de NOVO/USADO. A homologação externa dos novos campos do livro de referência e o esclarecimento do alerta do Chrome continuam pendentes. Não se declara o Preview seguro para autenticação.

## Isolamento e homologação anterior

- Branch nova: `feat/amazon-bibliographic-complement`, criada de `83209ed98b2586cbf21a56e79da8a81dc00ba925`.
- Implementação: commit `70b5947075f227e157145a11ce2ef49a7ff70651`; o commit posterior acrescenta este relatório, sem alterar código.
- [PR #6 em rascunho](https://github.com/silveira8393-svg/isbn/pull/6), empilhada sobre `fix/amazon-lab-asin`. O diff da Etapa 2 não inclui a implementação anterior.
- O responsável declarou a **Etapa 1 homologada funcionalmente**, sem merge: capa e uma adicional chegaram ao Cadastro para `9798276439839` / `B0G4CS2PMG`. Declaração registrada também em [comentário na PR #5](https://github.com/silveira8393-svg/isbn/pull/5#issuecomment-6647859094). Isso documenta o teste do responsável; não equivale a aprovação de segurança do domínio.
- Base homologada de produção: `93ff20473ca68b50d42d075276e07c624772c9e0`. Tag protegida: `isbn-amazon-galeria-homologada-2026-11-04`. PR #4/branch visual preservada em `2dfa369`.
- Sem merge, publicação em produção, alteração de credenciais, variáveis, RLS, banco, permissões, Edge Functions, integrações Magazord ou código do layout azul.

## Diagnóstico e alteração mínima

O extrator TypeScript já reconhecia título, autores com papel de autor, editora, ano/data, edição, idioma, formato e páginas nos painéis de detalhes/RPI. Também extraía peso, medidas individuais, dimensão composta com eixos explícitos, subtítulo/categorias e referências de galeria. Descrição comercial era um candidato sujeito a revisão; isso não concede autorização de reprodução.

O ponto de descarte era `complementAmazonImages`: mesmo recebendo `book_info` e as avaliações por campo, consumia somente `imagens.itens`. Agora a mesma chamada também alimenta uma lista fechada de campos factuais, sem buscar novamente a SP-API, chamar `getCatalogItem`, adicionar botão ou exigir outra pesquisa.

Regras efetivas:

1. Mantidos os gates de usuário/loja, ISBN, ASIN quando fornecido e correspondência dos identificadores da Etapa 1. Um livro-base de outro ISBN não recebe o complemento.
2. Campo entrante exige `estado=valido`, `revisao_humana=false`, origem identificada e aprovação pelo avaliador bibliográfico existente. Valor ausente/inconsistente não substitui informação válida.
3. Fonte válida existente vence. Campo ausente ou comprovadamente inválido pode ser preenchido. Data e ano incompatíveis não se misturam; divergência explícita de edição impede a incorporação bibliográfica.
4. Proveniência de cada preenchimento é registrada em `BookInfo.provenance` com prefixo `amazon_lab_verified:`. Divergências/inconsistências geram avisos com campo e motivo, exibidos na Consulta. São metadados em memória; não foi criada tabela nem alterado contrato de persistência.
5. Peso exige rótulo explícito **Peso do produto** ou **Item weight**, valor positivo e unidade reconhecida. O rótulo genérico “Peso” agora exige revisão. Embalagem e envio não viram exemplar; nenhuma inferência pelo peso parecido da SP-API.
6. Medidas compostas só fornecem eixos explicitamente identificados e coerentes com a projeção do extrator. Medidas existentes são preservadas; a ordem de um trio sem rótulos não é inferida.
7. Galeria/deduplicação, host fixo, limites, parada em bloqueios e ausência de retry permanecem. Uma resposta bibliográfica parcial pode complementar mesmo sem imagem nova. Avisos isolados não transformam uma busca vazia em resultado encontrado.
8. Sinopse/descrição, HTML e Marca comercial ficam fora da lista automática. Não se infere Marca a partir de Editora. Edição só chega quando explícita e válida; nada é inventado.

`book_info` continua sendo a projeção existente do Lab. O consumo automático utiliza as avaliações e origens, sem promover indiscriminadamente todo o objeto. A indicação experimental de que validade local sozinha não autoriza atribuição continua pertinente: autorização do usuário/loja, identidade da edição e política de cada campo são verificações adicionais.

## Transferência e edições manuais

A sequência permanece SP-API/anteriores → consolidação → uma chamada Lab → Consulta → `createRegistrationDraft` → formulário. O complemento termina antes da disponibilização do resultado; não há preenchimento tardio em formulário que o operador já esteja editando.

Foi encontrado outro descarte: `handleOpenRegistration` recriava o draft e restaurava somente imagens, idioma e cBenef. Agora reabrir a **mesma edição e condição**, antes de conclusão, reutiliza o draft existente, preservando todas as edições e remoções intencionais. Isso inclui sinopse e Marca digitadas manualmente, sem tratá-las como fonte Amazon.

Ao mudar NOVO ↔ USADO na mesma edição ainda não concluída, somente a ficha bibliográfica editada é transportada. Códigos, condição, categoria, preço, quantidade e fotografias particulares continuam obedecendo à criação de um novo draft/exemplar. Livro seguinte, conclusão ou nova pesquisa não recuperam o draft anterior. Não foi implementada recuperação após refresh nem persistência de rascunho.

`createRegistrationDraft` deixa Marca vazia, em vez de copiá-la da editora. Editora mantém seu campo próprio; uma Marca manual permanece ao reabrir o mesmo draft. Não se alterou o serviço Magazord.

## SP-API: dados fornecidos versus normalização

Não houve consulta adicional à SP-API nesta etapa. O JSON entregue anteriormente pelo responsável foi conservado como fixture de evidência, sem credenciais. SHA-256 do objeto JSON compacto: `cd15b6d7ea4b656d857be112e45f8d496d7facbc365a78b140f1dba86fd81764`, conferido por teste.

Esse JSON é a **resposta projetada do endpoint do Projeto ISBN**, não o envelope bruto de atributos da Amazon. Portanto, `publisher=null` ou `pageCount=null` não provam ausência no payload bruto anterior à projeção. O código atual solicita `summaries,attributes,identifiers,dimensions,images`; não foi alterado.

| Dado da resposta fornecida | Processamento existente observado | Resultado |
|---|---|---|
| Título e autores | Conservados; autor sem reordenar nome | Preservados no formulário |
| Data `2025-11-27` | `publishedDate` conservada; draft recebe ano `2025` | Data completa não é campo do draft |
| `portuguese` / `paperback` | Português / Capa comum | Idioma por extenso; formato preservado |
| Editora, edição, páginas `null` | Ausentes | Não são preenchidos com valores de referência artificiais |
| Peso só em `physical.package` | Retido como metadado de embalagem | Campo de peso do exemplar permanece vazio |
| Eixos de `physical.item` | Conversão literal de inches para cm | Altura 22,86; largura 0,84; profundidade 15,24 |
| Três variantes MAIN | Duas identidades; maior MAIN escolhida | Uma capa, nenhuma adicional por esse JSON |
| `synopsis=null`, `contentPolicy=synopsis_omitted` | Omissão intencional | Não contornada pelo Lab |

O mapeador do servidor já extrai editora, páginas e medidas de item/embalagem em canais separados quando disponíveis. Marca e outros atributos fora da projeção não são aproveitados como Marca Magazord. Para provar perda indevida de algum atributo do livro real, ainda seria necessário o payload bruto correspondente, que não foi disponibilizado. Não se executou pesquisa ASIN para obtê-lo.

## Livro O Rei de Amarelo: comparação honesta de evidências

| Campo | SP-API fornecida / Consulta antes do complemento | Página segundo verificação visual do responsável | Comportamento implementado no Cadastro |
|---|---|---|---|
| Título | O Rei de Amarelo | Igual | Mantém título válido |
| Autor | W. Chambers, Robert | Robert W. Chambers | Mantém nome já selecionado; diferença pode gerar aviso, sem reordenar automaticamente |
| Editora | Ausente | Independently published | Preenche se extraída e validada na página exata; valor real novo ainda não homologado nesta execução |
| Publicação | 27/11/2025; ano 2025 | Igual | Mantém; data completa não é inventada |
| Idioma / formato | Português / Capa comum | Iguais | Mantém valores existentes |
| Páginas | Ausentes | 143 | Preenche contagem explícita validada; 143 não foi injetado em teste de integração |
| Peso do exemplar | Ausente; embalagem 0,6 lb separada | 272 g de produto | Pode preencher pelo rótulo explícito; 272 não foi derivado da embalagem nem injetado em teste |
| Dimensões | A 22,86 / L 0,84 / P 15,24 cm | Trio 15,24 × 0,84 × 22,86 cm | Preserva eixos da SP-API. Sem evidência inequívoca de rótulos do trio, requer revisão; nenhuma troca por suposição |
| Edição / Marca | Ausentes | Sem identificação confiável fornecida | Mantém vazias |
| Sinopse | Ausente por política | Há descrição comercial | Campo editável preservado; não importa automaticamente texto protegido |
| Capa | MAIN 1000×1499 | Disponível | Preservada em `mainImageUrl` |
| Contracapa | Não consta no JSON oficial | Etapa 1 homologada pelo responsável com uma adicional | Transporte/deduplicação preservados; ensaios offline verificam `additionalImageUrls` e imagens renderizadas |

**Limitação da consulta real desta etapa:** foi feita uma única leitura pública pelo transporte existente para `/dp/B0G4CS2PMG`. A execução chegou à gravação do resumo factual, mas falhou com `ENOENT` porque `tests/fixtures` ainda não existia. O processo encerrou e o HTML em memória não foi conservado. Não houve repetição para exceder o limite autorizado. Essa execução não é usada como prova dos novos campos, da correspondência extraída ou da contracapa. O diretório foi criado posteriormente para a fixture do JSON já fornecido, sem outra chamada externa.

Assim, os valores visuais declarados pelo responsável orientam a comparação, mas não foram artificialmente acrescentados à resposta real da API nem apresentados como nova evidência de extração desta edição.

## Sinopse e condições de uso

O Lab já reconhece `bookDescription_feature_div` e rótulos descritivos, com revisão humana. Não foi identificada autorização específica/fonte adequada para reproduzir automaticamente a descrição comercial no cadastro. A implementação exclui sinopse/description da complementação automática, inclusive em fixture com texto explícito classificado válido. Preserva conteúdo manual existente e a política do endpoint oficial.

As [políticas e acordos oficiais da SP-API](https://developer-docs.amazon/sp-api/docs/policies-and-agreements) remetem aos instrumentos aplicáveis por região; sua existência não é uma licença de reprodução de qualquer página comercial. Não se faz aqui uma conclusão jurídica sobre conteúdo específico.

## Testes e verificações

| Verificação | Resultado |
|---|---|
| TypeScript (`npm run typecheck`) | Aprovado |
| Lint (`npm run lint`, TypeScript neste projeto) | Aprovado |
| Build (`npm run build`) | Aprovado; avisos existentes de bundle e importação estática/dinâmica do Supabase |
| Nove testes novos de bibliografia | 9/9 aprovados |
| Suíte final `npm test` | **718 testes: 715 aprovados e 3 falhas preexistentes** |
| React real StrictMode + Edge headless local | Quatro cenários 978/979 × NOVO/USADO aprovados |
| `git diff --check` | Aprovado |

As três falhas remanescentes estão em `tests/infrastructureUi.test.mjs:58`, perfis admin/operator/developer: o mock React não fornece `lazy`. Já existiam na base da Etapa 1 e não foram corrigidas fora do escopo. Uma primeira execução concorrente também teve timeout no teste de inicialização Vite; ele passou isoladamente (11/11) e no `npm test` final, sem mudança em seu código ou timeout.

Cobertura nova: 978 com HTML sanitizado existente; 979 com ASIN confirmado em fixture autoral; fontes parciais; editora/páginas/peso; peso genérico/embalagem/envio; eixos explícitos versus ambíguos; data/ano e edição divergentes; falta de campo; Lab 403/429/falha; sinopse/Marca indevidas; fonte imutável; capa/adicional; livro vazio; JSON real previamente fornecido; correções e remoções manuais na reabertura e troca de condição, com códigos/comercial/fotos de exemplar preservando suas regras.

Além das asserções de objetos, `amazonBibliography.test.mjs` renderiza **Card e formulário/seções reais com React DOM Server** e confere os valores dos inputs e referências `img`. O ensaio em `scripts/test-amazon-bibliography-browser.mjs` monta **App, Consulta, formulário e seções reais** com React StrictMode no Edge headless, verifica inputs do DOM e edita/reabre o cadastro. Respostas externas são substituídas por fixtures em memória; CSP, resolução de hosts e fetch controlado impedem comunicação externa do aplicativo. Usa perfil temporário vazio e sessão fictícia apenas nos mocks, sem acesso às credenciais do responsável.

Resultado do ensaio de navegador: quatro cenários, oito chamadas em memória (um catálogo e um Lab por pesquisa), quatro tentativas automáticas de auditoria **recusadas**, zero erros de página. Não se simulou sucesso de gravação no Supabase. Imagens remotas ficam bloqueadas nesse navegador; sua ligação/renderização é conferida também no HTML do formulário renderizado localmente. Não houve upload, confirmação de cadastro, estoque, produto ou consulta publicada.

Comandos reproduzíveis, a partir desta worktree:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd test
node --test tests/amazonBibliography.test.mjs tests/amazonAsin.test.mjs tests/spapiIntegrated.test.mjs tests/operations.test.mjs
node scripts/test-amazon-bibliography-browser.mjs
```

O último comando exige Edge instalado (ou executável explícito em `ISBN_TEST_BROWSER`). Ausência de navegador é impedimento, não aprovação silenciosa. Ele não utiliza o perfil pessoal do Chrome nem acessa o Preview.

Revisão React aplicada: nenhuma nova rede/efeito no componente, nenhuma dependência de hook removida, nenhum HTML injetado, avisos como texto escapado com `role=status` e chaves estáveis. Layout/CSS da PR #4 não foi incorporado.

## Alerta “Perigoso” e Preview

Inspeção segura da Vercel confirmou que o alias da Etapa 1 pertence ao projeto ISBN esperado, branch `fix/amazon-lab-asin`, commit `83209ed`, deployment `dpl_BE23NQPV433xN9rV5StcXyFaS4Qz`, READY/Preview. A revisão limitada do fonte mostrou entrada HTML com script local e login via cliente Supabase existente; a Etapa 1 não alterou login ou dependências. Isso **não é auditoria de segurança completa nem comprova falso positivo**.

O relatório público Google Safe Browsing não pôde ser lido pela ferramenta disponível; não há sessão autorizada de Search Console para obter o diagnóstico do proprietário. Não foi possível confirmar se o aviso é classificação de URL/domínio, conteúdo sinalizado ou outro contexto do navegador. READY comprova implantação, não reputação ou segurança.

Segundo a [orientação oficial do Chrome](https://support.google.com/chrome/answer/99020?hl=pt-BR), o aviso vermelho é associado a conteúdo potencialmente inseguro. O [relatório Problemas de segurança do Search Console](https://support.google.com/webmasters/answer/9044101?hl=en) é uma fonte apropriada para investigar exemplos e eventual revisão pelo proprietário. Não se solicitou revisão sem diagnóstico, alteração da Navegação segura ou bypass.

**Não ignorar o aviso nem inserir credenciais no domínio sinalizado.** Nenhuma autenticação foi feita nesse Preview. A etapa de homologação autenticada fica impedida até esclarecer o alerta; os testes locais e este relatório ficam disponíveis sem exigir login.

A integração Git existente gerou um Preview técnico da Etapa 2, inspecionado exclusivamente por metadados Vercel. URL estável da branch: https://isbn-git-feat-amazon-bibliogr-c40141-silveira8393-svgs-projects.vercel.app . A publicação inicial do código `70b5947` ficou READY em https://isbn-qy52234dp-silveira8393-svgs-projects.vercel.app . O commit de documentação gera a atualização do mesmo alias, cujo SHA/deployment final é confirmado na descrição da PR e na entrega. Essas URLs são registros técnicos, **não uma recomendação para autenticar enquanto a pendência de segurança existir**. Nenhum domínio foi trocado para contornar sinalização.

## Arquivos modificados nesta etapa

- `src/services/amazonOfficial.ts`: whitelist factual, precedência, proveniência, revisão e mesma chamada de imagens.
- `experimentos/amazon/extrator_amazon.ts`: distinção de peso explicitamente do produto.
- `src/types.ts`: avisos bibliográficos internos em memória.
- `src/utils/draft.ts`: separação entre Editora e Marca comercial.
- `src/App.tsx`: preservação do draft e das correções bibliográficas durante navegação.
- `src/components/BookDetailsCard.tsx`: fonte complementar e avisos de revisão.
- `tests/amazonBibliography.test.mjs`: extração, pipeline, JSON real e inputs reais renderizados.
- `tests/fixtures/amazon_spapi_9798276439839_resposta_fornecida.json`: evidência fornecida pelo responsável, com hash conferido.
- `tests/spapiIntegrated.test.mjs`: correções manuais, remoções e isolamento comercial/fotos entre condições.
- `tests/operations.test.mjs`: expectativa de idioma manual preservado ao trocar condição; mantém teste de normalização inicial.
- `scripts/test-amazon-bibliography-browser.mjs`: ensaio offline com React real e DOM do navegador.
- Este relatório.

## Pendências e limites de conclusão

1. Esclarecer o alerta do Chrome com diagnóstico do Google/proprietário antes de qualquer autenticação no Preview.
2. Homologar os novos campos reais de `9798276439839` quando houver ambiente seguro e autorização para eventual nova consulta. A única chamada desta etapa não forneceu evidência preservada; não declarar editora/143 páginas/272 g homologados por este agente.
3. Revisar humanamente a associação dos eixos físicos da SP-API. A implementação conserva os eixos recebidos.
4. Sinopse comercial sem autorização/fonte adequada, Marca sem identificação confiável e edição ausente permanecem manuais/vazias; não são preenchidas para aparentar maior cobertura.
5. As três falhas preexistentes de Infraestrutura permanecem fora do escopo. Não foi solicitada nem aplicada correção nelas.

Implementação e testes locais concluídos. Merge e produção dependem de autorização expressa futura; nada desta entrega altera a versão 1.0 ou o layout aprovado.
