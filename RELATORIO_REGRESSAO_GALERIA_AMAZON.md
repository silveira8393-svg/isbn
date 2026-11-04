# PR #3 — galeria Amazon parcial: investigação e correção

Branch: fix/amazon-gallery-complement. PR #3 permanece em rascunho. Sem merge ou publicação em produção.
Base de produção preservada: 33b0da7b838a6f06f9eb88e4f61678cb294e4605.
Correção anterior da PR: 84c48db23bb3a28d6e6d8a7e769de2256a6a78f0.

## ISBNs e evidências reais

O proprietário confirmou que a homologação visual com apenas duas imagens usou **9786555982688**. O teste técnico anterior usou **9781419762109**. Não eram o mesmo livro.

Em 03/11/2026, uma nova consulta de leitura por ISBN, usando o transporte e extrator existentes, retornou:

| ISBN | HTTP | Correspondência | Capa | Adicionais distintas | Total |
| --- | --- | --- | --- | --- | --- |
| 9786555982688 | 200 | corresponde | 1 | 5 | 6 |
| 9781419762109 | 200 | corresponde | 1 | 5 | 6 |

Tempos aproximados: 2,6 s e 2,1 s. HTML mantido somente em memória; sem cookies, repetição ou contorno de bloqueios. Isso comprova disponibilidade na origem a partir deste ambiente, não uma resposta idêntica da Amazon para a Vercel.

## Causa comprovada no código

Em src/services/amazonOfficial.ts, complementAmazonImages calculava hasGallery como a existência de qualquer imagem adicional distinta da capa. Se outra fonte já fornecesse capa + uma foto, a função retornava antes de consultar o Laboratório. Uma galeria parcial era tratada como completa.

A reprodução automatizada antes da correção falhou para os três perfis: o resultado manteve apenas a primeira foto adicional e perdeu as quatro fotos esperadas, pois a consulta complementar não era executada. Não era um limite de duas imagens no formulário nem uma substituição posterior da resposta do Laboratório pela SP-API. App consolida BrasilAPI/Curitiba, complementa com SP-API e somente então consulta o Laboratório.

Há também uma condição externa comprovada no Preview anterior dpl_EWKAtmfQc7kCLmmKKMwuXq5HiZwo: em 03/11/2026 às 19:13:09 UTC (16:13:09 de Brasília), POST /api/amazon registrou status_http 200, codigo amazon_captcha e motivo blocked. Essa execução não entregou uma galeria de seis imagens. Os logs não incluem ISBN ou identidade; portanto, não é possível atribuir esse evento ao ISBN visual com certeza. Não há evidência de seis imagens saindo da Function naquela sessão autenticada.

## Alteração mínima

Removida somente a condição hasGallery e ajustado seu comentário. Cada pesquisa elegível faz uma única consulta complementar, mesmo se outra fonte já tiver fotos. A mesclagem e deduplicação existentes preservam capa prioritária e fotos válidas, adicionando somente referências distintas.

Não foram alterados autenticação, permissões, banco, Storage, RLS, credenciais, seleção de loja, campos do cadastro, fontes bibliográficas ou integração Magazord. O bloqueio por CAPTCHA permanece: sem repetição ou contorno, preservando as imagens já disponíveis.

## Rastreio permanente de integração

O teste usa ambos os ISBNs e os três perfis na loja Sebo Livraria Sul. Parte de uma galeria parcial com capa + uma foto. Um documento sanitizado e controlado contém seis imagens distintas e uma duplicação redimensionada. São reais o parser, o handler da Function, a serialização JSON, o cliente autenticado, a consolidação do App, o estado do rascunho, ImagesSection e a revisão. Somente autorização e transporte externo são controlados no teste; não é uma sessão real de usuário.

| Etapa no teste de integração | Capa | Adicionais distintas | Total |
| --- | --- | --- | --- |
| Galeria parcial das fontes anteriores | 1 | 1 | 2 |
| Extração/normalização do Laboratório | 1 | 5 | 6 |
| Resposta JSON do handler da Function | 1 | 5 | 6 |
| Resultado normalizado do App, pelo cliente real | 1 | 5 | 6 |
| Mesclagem, filtragem e deduplicação | 1 | 5 | 6 |
| Estado do formulário | 1 | 5 | 6 |
| Renderização de ImagesSection | 1 | 5 | 6 |
| Revisão e retorno ao formulário | 1 | 5 | 6 |

As asserções comparam todas as referências e contagens. Falham se uma foto válida desaparecer ou se a duplicação redimensionada permanecer. A resposta da SP-API inclui MAIN + PT01 para reproduzir o bloqueio anterior; as fotos complementares não substituem título ou capa existentes. Um teste separado confirma que CAPTCHA não produz imagens fictícias e preserva a galeria parcial de duas fotos com uma única tentativa.

## Verificação técnica

- npm.cmd run typecheck: passou.
- npm.cmd run lint: passou (o lint configurado é tsc --noEmit).
- npm.cmd run build: passou, com os avisos de bundle já existentes.
- Suíte completa executada: 700 testes, 697 aprovados, somente as 3 falhas preexistentes de infrastructureUi.test.mjs (mock React sem lazy).
- Testes pertinentes finais, incluindo o cenário adicional de CAPTCHA com galeria parcial: 74/74 aprovados (spapiIntegrated, amazonVercel e amazonGallery).

Arquivos desta revisão: src/services/amazonOfficial.ts, tests/spapiIntegrated.test.mjs e este relatório.

## Homologação

A correção do bloqueio prematuro está comprovada pelos testes. A homologação visual autenticada do novo Preview permanece aberta até observar as imagens disponíveis na sessão real. CAPTCHA no ambiente Vercel pode impedir a complementação mesmo com o código corrigido; não deve ser anunciado como seis imagens recuperadas quando isso não ocorreu.
