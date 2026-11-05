# Recupera??o bibliogr?fica Amazon ? resultado parcial comprovado

05/11/2026. Branch isolada `fix/amazon-bibliographic-recovery`, criada de `76261ae0b7270812c3545bba2c18075a16b5a9d9`. Tag 1.1, produ??o, outras branches e arquivos pendentes preservados.

## Ambiente e consultas

Metadados oficiais Vercel confirmaram os nomes necess?rios em Preview e Production e sua aus?ncia em Development. Foram lidos somente presen?a, escopo e tipo; nenhum segredo foi recuperado, copiado ou modificado. Usado o Preview do projeto ISBN `prj_pvcmEP52OoMKQhhvb5FJRWrGZv1e`, equipe `silveira8393-svgs-projects`.

Preview inicial de diagn?stico: https://isbn-pw79nj55v-silveira8393-svgs-projects.vercel.app ? READY/Preview, `dpl_GRyCHapkpeuCp5pbbW73bKFLnbwa`, commit `6b64d9f1b9ce902fcdf737115840aeb8efa84727`. O respons?vel confirmou autentica??o Desenvolvimento sem pesquisa operacional e forneceu a resposta diagn?stica do primeiro ISBN. O anexo n?o cont?m status HTTP, hor?rio ou o envelope da coleta dupla. N?o se afirma que a segunda consulta ocorreu. Nenhuma consulta adicional foi executada pelo agente.

Limite permanece um GET por ISBN e intervalo m?nimo de 15 s. Foi solicitado apenas o resultado j? existente de `window.__isbnSpapiRecovery` ou do segundo ISBN; n?o repetir a coleta. A ferramenta de abas continua indispon?vel. N?o houve `handleSearch`, cadastro, escrita Supabase ou GET ao site comercial nesta etapa.

## Evid?ncia e causa

Anexo fornecido pelo respons?vel: SHA-256 dos bytes `d4d5bb55222a729e71f6e697db094fe7956fcd96e262e82806d076161b5eef7a`. ? uma observa??o factual restrita da resposta original e da proje??o, n?o um payload bruto completo da Amazon.

| ISBN | Campo | Original observado | Parser anterior ? corrigido | Lab | Causa |
|---|---|---|---|---|---|
| 9798276439839 | P?ginas | `attributes.pages[0].value=143`, marketplace Brasil; `number_of_pages` ausente | null ? 143 | Desnecess?rio para este campo | Parser ignorava o atributo pages: falha comprovada |
| 9798276439839 | Editora / edi??o | Ausentes nos nomes observados | null ? null | Obten??o factual real n?o confirmada | N?o preencher por infer?ncia; outros nomes n?o observados permanecem desconhecidos |
| 9798276439839 | Peso do produto | item_weight e dimensions.item.weight ausentes; embalagem 0,6 lb | Exemplar vazio, embalagem separada | 503 anterior antes da extra??o | Peso de embalagem n?o ? peso do exemplar |
| 9798276439839 | Dimens?es | Item A9 / L0,33 / P6 inches | Mesmos eixos; Cadastro A22,86 / L0,84 / P15,24 cm | Sem consulta nova | Aproveitamento correto; sem trocar eixos por suposi??o |
| 9798276439839 | T?tulo / autor / data / idioma / formato | O Rei de Amarelo / W. Chambers, Robert / 2025-11-27T00:00:01Z / portuguese / paperback | Preservados; data normalizada; ano 2025 no Cadastro | Sem consulta nova | Correto |
| 9798276439839 | Subt?tulo | subtitle e book_subtitle ausentes | N?o inventado | Sem consulta nova | Sem evid?ncia de recupera??o poss?vel |
| 9798286828647 | Campos bibliogr?ficos factuais | Resposta diagn?stica ainda n?o fornecida | N?o verificado nesta coleta | Sem consulta nova | Disponibilidade desconhecida; aguardar resultado existente |

Identidade do primeiro retorno: ASIN B0G4CS2PMG / ISBN 9798276439839 / marketplace A2Q3Y263D00KWC; um item correspondente, sem pagina??o. Sinopse continua omitida pela pol?tica existente. Os registros anteriores j? demonstram 503 remoto antes do parser do Lab, sem prova de causa remota espec?fica; essa auditoria n?o foi repetida.

## Corre??o e testes

?nica mudan?a de recupera??o: `server/spapi/catalog.ts` passa a aceitar `pages` como fallback de `number_of_pages`, com a mesma filtragem de marketplace e valida??o de inteiro positivo. Campo anterior v?lido mant?m prioridade. N?o se acrescenta chamada externa, lat?ncia de rede ou infer?ncia. Nenhum c?digo de Consulta, Cadastro, proveni?ncia, imagens, Curitiba, Lab, layout, autentica??o ou persist?ncia foi alterado.

Fixture `tests/fixtures/spapi-recovery-9798276439839.json`: somente fatos decodificados da allowlist do diagn?stico e proje??o anterior; n?o cont?m credenciais nem resposta bruta completa. O grupo de identificadores do replay ? reconstru?do do ISBN confirmado, explicitamente documentado. Tr?s testes novos cobrem a resposta observada, preced?ncia/valores inv?lidos/marketplace e parser ? cliente ? proveni?ncia ? Consulta ? inputs reais NOVO/USADO. As demais proje??es factuais permanecem iguais.

Valida??o final: 42/42 testes focados; TypeScript, lint e build aprovados; su?te geral 769 testes, 766 aprovados e tr?s falhas preexistentes do mock React.lazy em infrastructureUi.test.mjs. Casos existentes de bibliografia, Cadastro e Curitiba aprovados. Testes inteiramente controlados, sem rede externa ou persist?ncia. Log local ignorado: recovery-validation.log.

## Observabilidade tempor?ria e pend?ncia

O diagn?stico permanece restrito ao GET existente, runtime Preview, dois ISBNs e mesma autoriza??o real Desenvolvimento/loja. A resposta comum n?o inclui observabilidade. N?o exp?e payload bruto completo ou logs, limita tipos/valores/amostras e tamanho, exclui sinopse, ofertas, estoque e dados privados. Mantido temporariamente porque falta a segunda evid?ncia autorizada; remover ap?s completar a coleta, antes de considerar entrega definitiva, salvo justificativa expressa.

`scripts/collect-spapi-bibliography-console.js` ? o procedimento assistido, n?o um fluxo operacional ou recurso de interface. Usa a sess?o apenas dentro da p?gina, impede repeti??o nessa p?gina, separa GETs por 15 s e interrompe em erro, sem retry. O respons?vel n?o deve execut?-lo novamente se a coleta j? foi iniciada.

A CLI criou um v?nculo local ao verificar uma URL; os dois arquivos gerados foram removidos e o .gitignore restaurado ao hash anterior. A verifica??o retornou origin_denied e n?o chegou ? Amazon; n?o ? usada como prova de funcionamento autenticado. Nenhuma configura??o remota foi alterada.

Publicar apenas Preview da corre??o comprovada. N?o h? autoriza??o para merge ou produ??o. O diagn?stico de Desperte sua For?a Interior permanece pendente do resultado j? existente, sem nova consulta.
