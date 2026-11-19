# Simplificação do preço Magazord — 19/11/2026

## Resultado local

Após a confirmação Pai/Filho, o componente processa automaticamente o preço informado pelo operador. Foram removidos os passos manuais de revisar e enviar preço. Permanece uma ação de consulta de estado, sem reenvio, para tratar falhas.

A preparação automática usa `action: prepare`: autentica o operador, verifica a configuração da tabela ID 1 e o cadastro `verified` no Supabase, e testa a disponibilidade do diário quando há operação liberada. Não faz nenhuma chamada à Magazord. Em seguida, `send` reserva a operação, registra `price_started` por CAS e executa o único POST. **Zero GETs à Magazord antes do primeiro POST de preço.** As consultas ao Supabase e à autenticação permanecem.

O antigo `action: preview`, com seus cinco GETs, permanece disponível apenas como diagnóstico opcional para preservar o trabalho anterior e seus testes. Não é usado pelo componente nem exigido pelo envio.

O preço é validado antes do cadastro e congelado na confirmação da criação, junto da operação local. Ao restaurar o cadastro após recarregar, o formulário atual não substitui esse valor. Operações antigas sem preço preservado não recebem um novo valor automaticamente.

Antes de solicitar o envio, a aba preserva a identidade e o UUID autorizado da operação de preço. Uma tentativa preservada só pode consultar/reconciliar, inclusive após recarregar. Indisponibilidade do armazenamento bloqueia o envio. O Supabase continua sendo a autoridade para reserva, fingerprint, intenção persistente, exclusão concorrente e confirmação. Nenhuma tabela ou migration foi alterada.

O backend continua exigindo o UUID liberado em `MAGAZORD_HOMOLOGATION_PRICE_OPERATION_ID`, cadastro verificado do mesmo operador/loja, autenticação/MFA e configuração de canal/tabela. Não repete a consulta de vínculo Pai/Filho ou de tabela ativa na Magazord. A gravação é restrita à tabela ID 1 também no servidor.

O fluxo é exclusivamente de cadastro novo. A máquina de cadastro existente rejeita códigos já presentes enquanto a operação está em `prepared` e só alcança `verified` pelas etapas de criação/confirmação. Um produto preexistente antes dessa operação não recebe preço nem alterações de cadastro. Um produto criado pela própria operação, inclusive recuperado após perda de resposta, pode continuar normalmente para o primeiro envio de preço. Não foi implementada uma operação de atualização de preços.

Após HTTP 200 e `sucesso: true`, permanecem dois GETs de preço (ativos/inativos) para confirmar o valor exato, inclusive em produtos cadastrados inativos. Só então o diário avança a `price_verified`. Resultado incerto, timeout, rejeição ou falha de confirmação preserva `price_started`: nenhum novo POST é permitido; somente a reconciliação pode confirmar o resultado. `price_read_unavailable` ainda pode ocorrer nessa confirmação/reconciliação e mantém o envio bloqueado, mas não é mais pré-requisito de leitura do primeiro POST.

## Contrato oficial

Validado antes da implementação em [Atualizar Preço — Magazord](https://docs.api.magazord.com.br/api/post-preco/): `POST /v1/preco`, JSON em array, `produto` como código, `tabelaPreco` como ID e `precoVenda` como número. Sem `anuncio`, a operação se refere ao registro sem anúncio. A resposta de sucesso documentada é HTTP 200, com `sucesso: true`. O contrato de transporte existente foi mantido: HTTPS, Basic Auth e uma tentativa; a leitura posterior precisa confirmar o valor exato.

Não há exigência documentada de GETs prévios nem impedimento documentado para enviar o primeiro preço depois da criação. O endpoint também altera preços: não oferece no contrato consultado uma condição de “somente criar preço”. Por isso, a autorização de uso neste projeto vem da proveniência do cadastro `verified` e da reserva permanente da operação, não de um suposto POST exclusivo de criação. Alterações por outros sistemas fora desse fluxo não são uma funcionalidade deste projeto.

Payload do caso solicitado, validado apenas em teste local:

```json
[{"produto":"9788535931938","tabelaPreco":1,"precoVenda":12}]
```

Nenhum preço antigo, anúncio, quantidade, estoque ou imagem é acrescentado a esse payload. A quantidade permanece no fluxo existente, sem nova integração de estoque.

## Verificação inicial do caso

Na etapa anterior, consultas somente SELECT no Supabase conectado `ISBN Livraria Sul`, projeto `jcxdkrpmrfbrhzwbzhph`, registraram:

- Pai `LVP007`, Filho `9788535931938`: cadastro `07fe6a56-2b7d-4406-a3ad-bdfb21c6e700`, estágio `verified`, criado em 19/11/2026 às 14:14:41, horário de Brasília.
- `magazord_price_jobs`: nenhum registro para esses códigos no momento da consulta.

Isso registra o estado do diário naquela consulta, não o estado atual do produto/preço remoto. Não se conclui que o preço esteja ausente. Nesta revisão não houve chamadas remotas autenticadas ao Supabase ou à Magazord. Nenhum produto foi recadastrado, nenhum preço foi enviado ou reconciliado no ambiente real. O caso LVP007 foi validado apenas com respostas simuladas, usando o mesmo ID de cadastro para recuperar a operação própria, sem tratá-la como cadastro de produto preexistente.

## Verificação local

Comando: `node --no-experimental-webstorage --test tests/magazordPrice*.test.mjs tests/magazordRegistration*.test.mjs tests/magazordValidationDiagnostics.test.mjs`.

- 111 testes: **110 aprovados, 0 falhas, 1 ignorado**.
- Ignorado: teste PostgreSQL opcional, sem `ISBN_PRICE_PGLITE_MODULE`.
- Cobertura: zero GETs antes do POST; preparação sem chamadas Magazord; integração cadastro→preço de R$ 12,00 ao Filho 9788535931938/Pai LVP007; recuperação de cadastro interrompido; bloqueio de produto preexistente e de tentativas de atualização; envio automático sem revisão manual; valor original; tabela ID 1; autorização; perda de resposta; concorrência; CAS; ausência de reenvio; recarga com preço preservado; troca de sessão; falha no armazenamento; diagnósticos e regressão do cadastro Pai/Filho. Os testes de diagnóstico opcionais de preços existentes e respostas ambíguas foram mantidos. Dois testes do envio foram adaptados à remoção intencional da leitura prévia.
- `node node_modules/typescript/bin/tsc --noEmit`: aprovado.
- `git diff --check`: aprovado.
- Revisão React: preservados bloqueio de concorrência, isolamento de usuário/loja, descarte de respostas após mudança de identidade/desmontagem e mensagens de estado acessíveis.

Os testes usam respostas simuladas e não comprovam a disponibilidade das rotas neste tenant. O aceite em homologação ainda exige verificar o diário atual, autorizar uma única gravação se necessária, confirmar o valor de R$ 12,00 e verificar que a consulta/reabertura da mesma operação não produz segundo POST. Se já houver tentativa incerta, somente reconciliar. A liberação por UUID de operação continua exigida no backend; não foi habilitada nesta tarefa. Nenhuma consulta remota de vínculo/tabela/preço é um passo manual obrigatório do fluxo normal.

## Escopo preservado

As alterações locais preexistentes em `RELATORIO_CODEX.md`, `docs/MAGAZORD_PRICE_READ_DIAGNOSTICO.md` e `backups/` foram preservadas. Os metadados seguros de diagnóstico e seus testes continuam ativos. O cadastro Pai/Filho no servidor, o transporte e o diário de preços mantêm suas proteções.

Até a conclusão da implementação, não foram feitos commit, push, deployment, alteração de variáveis, escrita remota no Supabase/Magazord ou alteração em produção. Estoque, imagens e outras integrações não foram alterados.

## Publicação autorizada em Preview

Em 19/11/2026, o usuário autorizou um único novo Preview da branch `feature/magazord-homologacao-etapa3`, com commit em português e sem mudanças de produção, credenciais ou configurações. O commit desta publicação reúne apenas este relatório, cinco arquivos de implementação e quatro arquivos de testes da simplificação. `RELATORIO_CODEX.md`, `docs/MAGAZORD_PRICE_READ_DIAGNOSTICO.md`, `backups/` e as migrations ficam fora do commit.

Revisão antes da publicação: `package.json` usa `vite build`, sem hooks de projeto para instalação/build, migrações ou gravações remotas. As funções de cadastro/preço são inicializadas sem chamadas de rede; a lógica de escrita só ocorre no atendimento de uma requisição autenticada e autorizada. Os testes de inicialização e a regressão direcionada passaram. O build local também passou com `fetch` bloqueado. Os scripts de instalação das dependências identificados são os instaladores de binários do esbuild; não há rotina de integração Magazord nessa instalação. O pipeline Git existente do projeto usa instalação de dependências e `npm run build`.

Não abrir a aplicação para recuperar operações, não consultar ou recuperar LVP007 e não chamar endpoints de cadastro/preço nesta publicação. A homologação funcional será feita depois, com um único cadastro novo pela interface e preço escolhido pelo operador, mediante autorização específica para gravações. O resultado READY, SHA e URL serão conferidos na Vercel e comunicados após a publicação, sem um segundo deployment documental.
