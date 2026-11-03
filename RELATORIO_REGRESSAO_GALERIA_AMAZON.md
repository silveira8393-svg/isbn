# Correção de regressão — galeria complementar Amazon

Base: Fase 1 homologada, main 33b0da7b838a6f06f9eb88e4f61678cb294e4605.
Branch: fix/amazon-gallery-complement. Publicação somente em Preview, sem merge ou alteração de produção.

## Causa raiz

O guard canUseAmazonOfficial exigia que a loja operacional fosse o UUID do contexto técnico de credenciais Amazon. O mesmo guard era reutilizado pela complementação de imagens. Ao selecionar Sebo Livraria Sul, ambas as consultas eram ignoradas antes da requisição. Além disso, App limitava a complementação ao ambiente Desenvolvimento. A seleção de loja apresentava o contexto técnico como segunda loja operacional.

## Correção pontual

- A consulta oficial permanece com as permissões de Desenvolvimento e a autorização privada SP-API existentes, mas deixa de depender da loja operacional técnica no cliente. Credenciais e autorização oficial não foram alteradas.
- A complementação de imagens usa a loja operacional selecionada e envia X-ISBN-Store-Id junto da sessão. Desenvolvimento, Proprietário (admin) e Operador podem consultá-la, conforme orientação expressa do proprietário nesta tarefa.
- A Function reutiliza as leituras existentes: valida token no Auth, perfil ativo, vínculo ativo com a loja exata e loja ativa, usando o token do solicitante e RLS. Nenhuma permissão é concedida por headers de perfil ou metadados do usuário. Saúde/diagnóstico e painel do laboratório continuam exclusivos de Desenvolvimento.
- O contexto técnico de credenciais não é oferecido como loja operacional. Os vínculos e dados existentes são preservados. Duas lojas comerciais reais continuam exigindo seleção explícita; uma única loja comercial entra diretamente.
- Extração, identificação por ISBN, deduplicação, prioridade da capa, limites HTTP, tratamento de CAPTCHA e descarte de resultados após troca de identidade permanecem.
- Nenhuma mudança em banco, migrations, Storage, credenciais, autenticação Supabase, RLS, dados comerciais, integração Magazord ou atributos do cadastro.

## Validação

- TypeScript: npm.cmd run typecheck — passou.
- Lint do projeto: npm.cmd run lint (tsc --noEmit) — passou.
- Build: npm.cmd run build — passou; avisos de bundle/tipos de importação já existentes.
- Suíte completa: 697 testes, 694 passaram, 3 falhas preexistentes em infrastructureUi.test.mjs (mock React sem lazy). As mesmas 3 falhas foram reproduzidas na árvore da Fase 1 anterior à correção. Nenhuma falha nova restante.
- Regressões permanentes exercitam Sebo Livraria Sul nos três perfis: resultado de ISBN com 1 capa + 5 imagens adicionais, galeria com 6 imagens, revisão e retorno sem perda nem novas consultas. Também cobrem isolamento, revogação, lojas inativas, sessão divergente e restrição dos diagnósticos.
- O harness de histórico foi atualizado para controlar explicitamente as consultas Amazon agora habilitadas na loja operacional, sem depender do antigo bloqueio por UUID.
- Consulta HTTP real, somente leitura, pelo transporte/extrator existente: ISBN 9781419762109, HTTP 200, correspondência confirmada, 1 imagem principal e 5 adicionais, aproximadamente 2,5 segundos. Sem cookies, repetição, contorno de restrições ou persistência de HTML.

A consulta HTTP real confirma a disponibilidade das imagens na fonte. O fluxo de interface foi validado por integração automatizada com respostas controladas; a homologação visual autenticada no Preview fica para a sessão do usuário. Nenhum produto ou operação comercial real foi gravado nos testes.

## Arquivos

Implementação: src/App.tsx, src/contexts/UserContext.tsx, src/services/amazonOfficial.ts, src/services/amazonLabClient.ts, server/amazonAuthorization.ts, server/amazonFunction.ts.
Testes: tests/spapiIntegrated.test.mjs, tests/amazonVercel.test.mjs, tests/storeSelection.test.mjs, tests/history.test.mjs.
