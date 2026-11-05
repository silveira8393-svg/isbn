# Laboratório Amazon por ASIN — implementação isolada

## Base e escopo

- Branch: `fix/amazon-lab-asin`, criada diretamente de `93ff20473ca68b50d42d075276e07c624772c9e0`.
- Implementação funcional independente da PR #4 e do layout azul.
- Sem alterações em banco, RLS, autenticação, permissões, Edge Functions, variáveis, dependências ou configurações de implantação.
- Sem cadastro, operação de pesquisa no Supabase, merge ou publicação em produção.
- O documento solicitado termina literalmente em “O resultado esperado é:”. Foram aplicados os requisitos completos anteriores a esse trecho.

## Alteração implementada

O resultado oficial conserva uma referência interna com ASIN, ISBN canônico e marketplace. Ela só é criada quando há um identificador retornado correspondente ao ISBN pesquisado e um ASIN com formato válido; a consolidação só a transporta para a mesma edição no marketplace brasileiro.

A complementação existente envia o ASIN ao mesmo Laboratório, sem outra consulta ao catálogo ou ação do operador. O transporte continua fixo em `https://www.amazon.com.br/dp/`, aceita apenas ASIN de dez caracteres alfanuméricos maiúsculos e mantém seus limites, ausência de redirecionamento, cookies e tentativas adicionais.

O extrator exige simultaneamente o ISBN solicitado e a identidade primária do ASIN da página (input ASIN e/ou canonical do domínio autorizado). Divergência, sinais conflitantes ou identificação insuficiente impedem a incorporação. ASIN de recomendações não autoriza a página. Scripts de galeria da edição podem usar o ASIN alfanumérico; scripts que declarem outro ASIN são rejeitados. A normalização e deduplicação de imagens existentes foram reutilizadas.

ISBN 978 sem referência confiável mantém o caminho por ISBN-10. ISBN 979 sem referência confiável encerra a complementação preservando o livro. Falhas ou bloqueios também preservam capa, galeria e bibliografia já disponíveis. O ASIN não substitui o ISBN e não integra o draft comercial.

As permissões existentes permanecem: a obtenção automática pela SP-API continua restrita ao Desenvolvimento; o enriquecimento de imagens mantém os perfis já autorizados. A correção não amplia a disponibilidade do catálogo para outros perfis.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/types.ts` | Referência interna de edição |
| `src/services/amazonOfficial.ts` | Criação, consolidação e uso da referência, mantendo prioridades |
| `src/services/amazonLabClient.ts` | ASIN opcional no contrato existente |
| `experimentos/amazon/consulta_amazon.ts` | Validação e caminho HTTPS fixo |
| `server/amazonFunction.ts` | Passagem do ASIN no endpoint existente |
| `experimentos/amazon/servidor_laboratorio.ts` | Mesmo contrato no servidor local |
| `experimentos/amazon/extrator_amazon.ts` | Identidade ASIN + ISBN e galeria existente |
| `tests/amazonAsin.test.mjs` | Sete cenários automatizados offline |
| `tests/spapiIntegrated.test.mjs` | Adaptação de expectativas ao contrato adicional |

## Validação

- TypeScript, lint e build: aprovados. Build conserva os avisos existentes de tamanho de bundle e importação estática/dinâmica do Supabase.
- Cinco arquivos focados: 95/95 aprovados antes da inclusão dos dois últimos cenários; arquivo ASIN final: 7/7 aprovados.
- Suíte completa final: **708 testes, 705 aprovados, 3 falhas preexistentes** em `tests/infrastructureUi.test.mjs:58`. O mock de React desse teste não fornece `lazy`, nos três perfis. A execução da base anterior à implementação apresentou as mesmas três falhas (701 testes, 698 aprovados). Não foram corrigidas por estarem fora do escopo.
- `git diff --check`: aprovado.
- Fluxo offline com cliente, handler, transporte, extrator e criação de drafts reais: ISBN 979 → ASIN → capa/adicional → NOVO/USADO; somente uma chamada de catálogo por fluxo, sem consulta adicional para obter ASIN. Fixtures de HTML e imagens são autorais, sem comunicação externa ou persistência.
- Cobertura de 978 com/sem ASIN, 979 sem referência, edição divergente, identidade ausente/conflitante, URL arbitrária, scripts de outra edição, deduplicação, usuários inativos, preservação bibliográfica e parada em 302/403/429/CAPTCHA/erro de rede, sem retry.

## Verificação real limitada

Foi realizado **um único GET** pelo transporte implementado para `https://www.amazon.com.br/dp/B0G4CS2PMG`, solicitando a edição ISBN `9798276439839`. Resultado: HTTP **200**, 1.043.945 bytes, ASIN **corresponde**, ISBN **corresponde**, **duas referências de imagem** identificadas. Sem redirecionamento, nova chamada à SP-API, navegador autenticado, operação no Supabase ou download das imagens. HTML descartado ao término do processo, sem arquivo de resposta.

A coleta resumida desse GET não registrou os papéis de imagem corretamente; portanto, não sustenta uma contagem de capa versus adicionais. A identificação de duas referências não comprova visualmente qual delas é a contracapa. A classificação e o transporte de capa/adicionais foram comprovados com fixtures offline; a conferência visual da contracapa real fica para homologação autenticada do Preview. Não foi repetido o GET apenas para ampliar a coleta.

## Riscos e homologação

- Mudanças no HTML ou ausência dos sinais seguros de identidade podem impedir o complemento; a resposta é conservadora e preserva o catálogo oficial.
- CAPTCHA, bloqueio, limite ou indisponibilidade continuam impedindo o HTML; nenhuma proteção foi contornada.
- Os testes offline não substituem a homologação autenticada no Preview. Não foi acionado Buscar em ambiente publicado, pois esse fluxo registra automaticamente uma operação.
- Preview funcional pode apresentar o layout da base homologada. Não incorpora nem modifica o layout aprovado da PR #4.

Publicação autorizada: commit e push apenas desta branch, PR em rascunho contra `main` e Preview pela integração Git existente. O resultado, SHA e URL serão informados na entrega. Aguardar homologação antes de merge, produção ou alterações adicionais.
