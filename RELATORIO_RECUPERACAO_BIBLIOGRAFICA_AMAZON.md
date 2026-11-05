# Amazon SP-API ? recupera??o bibliogr?fica comprovada

05/11/2026. Branch `fix/amazon-bibliographic-recovery`, baseada em `76261ae0b7270812c3545bba2c18075a16b5a9d9`. Marco 1.1, produ??o, demais branches e pend?ncias locais preservados.

## Ambiente e evid?ncia

Projeto Vercel ISBN `prj_pvcmEP52OoMKQhhvb5FJRWrGZv1e`, equipe `silveira8393-svgs-projects`. Metadados confirmaram configura??es necess?rias em Preview e Production e aus?ncia em Development. Somente presen?a/escopo/tipo foram lidos; nenhum segredo foi recuperado, copiado ou modificado. Production n?o foi utilizado.

O respons?vel autenticou-se como Desenvolvimento no Preview de diagn?stico `6b64d9f`, READY/Preview, https://isbn-pw79nj55v-silveira8393-svgs-projects.vercel.app e forneceu um retorno por ISBN. S?o observa??es factuais restritas dos atributos originais e da proje??o, n?o payloads brutos completos. Primeiro anexo: SHA-256 dos bytes `d4d5bb55222a729e71f6e697db094fe7956fcd96e262e82806d076161b5eef7a`; segundo retorno recebido no chat. Ambos confirmam um item correspondente, marketplace Brasil e aus?ncia de pagina??o.

As duas respostas autorizadas foram recebidas, sem consulta adicional pelo agente. O procedimento assistido previa dois GETs sequenciais com 15 s de intervalo; os corpos fornecidos n?o cont?m hor?rios ou status HTTP, portanto esses metadados n?o foram auditados independentemente. Nenhum Buscar/handleSearch, cadastro, escrita Supabase ou acesso comercial Amazon foi executado pelo agente.

## Compara??o factual

| ISBN | Campo | SP-API original observado | Parser antes ? depois | Lab | Resultado / causa |
|---|---|---|---|---|---|
| 9798276439839 | P?ginas | pages=143; number_of_pages ausente | null ? 143 | N?o necess?rio | Atributo ignorado: corrigido |
| 9798286828647 | P?ginas | pages=193; number_of_pages ausente | null ? 193 | N?o necess?rio | Mesmo defeito confirmado, independentemente, no segundo retorno |
| 9798276439839 | Editora / edi??o | Nomes inspecionados ausentes | null ? null | 503 hist?rico antes da extra??o | N?o inventar; eventual informa??o fora da allowlist permanece desconhecida |
| 9798286828647 | Editora / edi??o | Nomes inspecionados ausentes | null ? null | N?o consultado nesta etapa | N?o h? evid?ncia para preencher |
| 9798276439839 | Peso do produto | Item sem peso; embalagem 0,6 lb | Exemplar vazio; embalagem separada | Sem consulta nova | Aus?ncia na observa??o, n?o perda na transfer?ncia |
| 9798286828647 | Peso do produto | item_weight e dimensions.item.weight=0,78 lb | Produto 353,8 g preservado | Desnecess?rio | J? corretamente aproveitado, independentemente de a embalagem ter igual peso |
| 9798276439839 | Dimens?es | Item A9 / L0,33 / P6 inches | A22,86 / L0,84 / P15,24 cm | Desnecess?rio | Eixos preservados literalmente |
| 9798286828647 | Dimens?es | Item A9 / L0,44 / P6 inches | A22,86 / L1,12 / P15,24 cm | Desnecess?rio | Eixos preservados literalmente |
| Ambos | T?tulo / autores / data / idioma / formato | Presentes | Preservados; data normalizada, ano 2025, Portugu?s, Capa comum | Desnecess?rio | Correto; sem reordenar autores nem retirar sufixos do t?tulo |
| Ambos | Subt?tulo | subtitle e book_subtitle ausentes | N?o inferido | Sem consulta nova | T?tulo completo preservado |
| Ambos | Sinopse | Conte?do n?o inspecionado por esta coleta | Omitida por pol?tica | N?o incorporada automaticamente | Sem altera??o de pol?tica ou alega??o de aus?ncia na Amazon |

Identidades confirmadas: O Rei de Amarelo ? ISBN 9798276439839 / ASIN B0G4CS2PMG / data 2025-11-27; Desperte sua For?a Interior ? ISBN 9798286828647 / ASIN B0FDX22ZWC / data 2025-06-17. A verifica??o dos campos ausentes limita-se aos nomes observados; os dados descartados pela allowlist n?o s?o tratados como integralmente conhecidos.

## Corre??o m?nima e valida??o

?nico arquivo de execu??o diferente do marco 1.1: `server/spapi/catalog.ts`, que aceita `pages` como fallback de `number_of_pages`, com a mesma prioridade, filtragem de marketplace e valida??o de inteiro positivo. Nenhuma chamada extra, retry ou lat?ncia de rede foi adicionada. N?o se usa embalagem para preencher exemplar.

Duas fixtures em `tests/fixtures/spapi-recovery-<ISBN>.json` preservam somente fatos sanitizados e proje??es anteriores. O envelope de replay e grupo de identificadores s?o reconstru?dos dos ISBNs confirmados, explicitamente documentados; n?o representam resposta bruta completa. Tr?s testes direcionados em `spapiOfficial.test.mjs` e `amazonBibliography.test.mjs` cobrem ambos os livros, prioridades/valores inv?lidos/marketplace e parser ? cliente ? proveni?ncia ? Consulta ? inputs reais NOVO/USADO. P?ginas previamente selecionadas continuam tendo prioridade.

Valida??o final: 37/37 testes focados; TypeScript, lint, build e diff --check aprovados. Su?te geral: 764 testes, 761 aprovados, tr?s falhas preexistentes do mock React.lazy em infrastructureUi.test.mjs. Os testes de bibliografia, Cadastro e Curitiba passaram. N?o se repetiu pesquisa real no Preview corrigido para homologar a mudan?a: a comprova??o usa replays controlados das duas evid?ncias reais, sem persist?ncia ou rede externa. Log local ignorado: recovery-validation.log.

## Entrega e limites

O diagn?stico tempor?rio e o script de coleta foram removidos do estado final da branch; `server/spapi/handler.ts` voltou exatamente ? base. A rota normal n?o exporta atributos brutos nem diagn?stico. Os commits anteriores de diagn?stico permanecem no hist?rico, sem reescrita. N?o reutilizar os Previews hist?ricos para repetir chamadas.

A abertura autom?tica da PR em rascunho sobre fix/curitiba-product-gallery recebeu HTTP 403 do conector GitHub (Resource not accessible by integration). Compara??o manual: https://github.com/silveira8393-svg/isbn/compare/fix/curitiba-product-gallery...fix/amazon-bibliographic-recovery?expand=1 . Commit e Preview finais s?o confirmados na entrega.

N?o foram alterados imagens, Curitiba, App/React/layout, Lab, Magazord, autentica??o/perfis, esquema, pre?os, estoque ou configura??es sens?veis. Os logs anteriores j? demonstraram 503 externo antes do parser do Lab; sua causa remota espec?fica continua n?o comprovada. Editora/edi??o permanecem lacunas da observa??o; n?o houve corre??o especulativa, merge ou publica??o em produ??o.
