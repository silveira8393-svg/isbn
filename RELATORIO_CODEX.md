# Relatório Codex — autenticação Supabase

Data: 01/10/2026.

## Implementação

A identidade provisória foi substituída por Supabase Auth real com e-mail e senha. O cliente existente em `src/lib/supabase.ts` foi reutilizado, sem modificar suas chaves ou configuração. Nenhuma senha, identidade fixa, secret key ou service_role foi adicionada.

A estrutura foi analisada antes das alterações: `main.tsx` já envolve `App` com `UserProvider`, as permissões estão centralizadas no contexto e o seletor mock era consumido somente por `UserSwitcher`. `SettingsView` também consumia a lista mock de usuários. Por isso, a proteção foi implementada no provider, sem modificar `App.tsx`, `main.tsx` ou os fluxos operacionais.

## Arquivos e linhas aproximadas

| Arquivo | Alteração | Linhas finais afetadas |
| --- | --- | --- |
| `src/contexts/UserContext.tsx` | Sessão, identidade real, bloqueio de acesso, erros e logout; permissões preservadas | 1–176 |
| `src/components/UserSwitcher.tsx` | Identificação da conta, nome, iniciais, role, loja, ambiente developer e Sair; sem troca de identidade | 1–61 |
| `src/components/SettingsView.tsx` | Textos atualizados para a identidade real e lista limitada à sessão atual | 45, 242–245, 286–287 |
| `src/types.ts` | Campos adicionais de identidade/loja/ambiente compatíveis com os tipos antigos | 159–163 |
| `src/components/Login.tsx` | Novo formulário de autenticação, carregamento e mensagens amigáveis | 1–53 |
| `src/vite-env.d.ts` | Novo arquivo de tipos Vite para `import.meta.env` no cliente Supabase existente | 1 |
| `RELATORIO_CODEX.md` | Novo relatório | Documento completo |

As alterações preexistentes em `package.json`, `package-lock.json`, `src/App.tsx` e o cliente `src/lib/supabase.ts` foram preservadas. `.env.local` não foi alterado nem seu conteúdo exposto.

## Fluxo

1. Na inicialização, `getSession()` recupera a sessão persistida pelo SDK. `onAuthStateChange()` acompanha login, renovação e encerramento da sessão, inclusive em outras abas.
2. Sem sessão, o provider renderiza somente Login. Enquanto a identidade inicial é validada, renderiza “Carregando Projeto ISBN...”, sem montar os componentes operacionais.
3. Login usa `signInWithPassword()`. Não existe cadastro público. Credenciais inválidas, excesso de tentativas e falhas de conexão recebem mensagens amigáveis, sem divulgar detalhes internos.
4. `profiles` é consultada por `auth.user.id`, obtendo `id`, `display_name` e `active`.
5. `store_users` é consultada por `user_id`, filtrando `active = true`, obtendo `store_id`, `role` e `active`. A consulta mantém uma lista de vínculos; nesta etapa escolhe o primeiro, ordenado por `store_id`, permitindo adicionar seleção de loja futuramente.
6. `stores` fornece `id`, `name` e `slug`. Somente roles reconhecidas são aceitas.
7. Profile ausente/inativo, vínculo ausente, role inválida, loja indisponível ou erro de consulta bloqueiam o acesso e tentam encerrar a sessão local. Erros de logout também são tratados.
8. Sair usa `signOut({ scope: 'local' })`: encerra a sessão deste navegador. A aplicação protegida é desmontada e retorna ao login. Um encerramento externo/expiração sinalizado pelo SDK mostra mensagem para entrar novamente.

As consultas são executadas em um efeito separado do callback de autenticação. Há cancelamento de efeitos e controle de geração para impedir que consultas atrasadas restaurem a identidade depois de logout/troca de sessão. Eventos repetidos com o mesmo token não reiniciam o carregamento; renovação do token da mesma conta revalida a identidade sem desmontar o fluxo operacional já autorizado.

Referência consultada: [Supabase — onAuthStateChange](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).

## UserContext e permissões

`currentUser`, `users`, helpers de permissão e `operationEnvironment` foram preservados para os consumidores existentes. `currentUser.name` permanece como alias de `displayName`; o usuário carregado inclui ID real, role, active, storeId, storeName, storeSlug e environment. `users` contém somente a identidade autenticada; não representa um diretório administrativo completo. Os setters de troca de identidade e `MOCK_USERS` foram removidos. `signOut` foi acrescentado.

| Role | Comportamento preservado | Ambiente |
| --- | --- | --- |
| admin | Consulta, cadastro, histórico global, Produção e Configurações; sem ferramentas developer | production |
| operator | Fluxo operacional e filtros existentes do próprio histórico/produção; sem aba administrativa de Produção, Configurações ou ferramentas developer | production |
| developer | Acesso administrativo/técnico, diagnósticos e ferramentas mock | development |

Não houve mudança da matriz RBAC. RLS permanece como proteção do banco. A identidade não lê nem grava a chave mock de localStorage; a persistência interna do SDK Supabase permanece ativa.

## Validação executada

- `npm.cmd run lint`: aprovado (`tsc --noEmit`). Foi necessário adicionar os tipos Vite para o cliente Supabase já existente.
- `npm.cmd run build`: aprovado. Vite apresentou aviso de chunk acima de 500 kB; otimização do bundle ficou fora do escopo.
- `git diff --check`: aprovado.
- 14 verificações isoladas do provider real, com respostas Supabase simuladas e execução controlada dos hooks: sem sessão não há consultas nem acesso; admin/operator/developer mantêm permissões e ambiente; profile ausente/inativo, vínculo ausente, falha de consulta e role inválida bloqueiam e fazem logout; eventos repetidos não repetem consultas; renovação revalida; logout voluntário retorna ao login sem erro; encerramento externo informa expiração; resposta atrasada não reabre a aplicação. O harness temporário foi removido após execução, sem adicionar dependências de teste ao projeto.

Essas verificações não substituem testes no navegador com o banco e as contas reais. Não foram fornecidas credenciais das três contas, e não houve login real, inspeção visual ou alteração de dados no Supabase durante esta tarefa.

## Pendências de homologação

- Entrar com Proprietário, João e Desenvolvimento e confirmar nomes, loja, roles, abas e ferramentas conforme a tabela acima.
- Atualizar a página após cada login e confirmar restauração da sessão sem novo login.
- Usar Sair nas três contas e confirmar retorno ao login; conferir propagação em outra aba.
- Validar profile inativo/ausente, ausência de vínculo ativo e expiração contra RLS real em contas de teste.
- A implementação espera `store_users.user_id` como referência ao usuário autenticado; confirmar essa coluna e leitura das três tabelas pelas políticas RLS na homologação.
- Gestão de outros usuários e seleção de múltiplas lojas permanecem para etapas futuras.

## Escopo preservado

Histórico, auditoria, operações, métricas e CSV **não foram migrados**. Permanecem com os mecanismos locais existentes. Os registros antigos conservam IDs mock; não foram remapeados para UUIDs reais, então o filtro de um operador real não atribui automaticamente registros mock antigos a ele.

Novo/Usado, BrasilAPI, Distribuidora Curitiba, câmera, Cadastro Magazord e métricas não foram alterados. Não houve implementação de Amazon, API Magazord real, migrations, alteração de RLS/triggers ou redesign das telas operacionais.

## Recuperação e redefinição de senha — 01/10/2026

Implementado o fluxo real `Login → Esqueci minha senha → e-mail → PASSWORD_RECOVERY → Definir nova senha → updateUser → logout → Login`. Esta etapa alterou somente o formulário de login, a camada de autenticação, o novo formulário de senha e este relatório. As alterações anteriores do projeto foram preservadas.

### Arquivos desta etapa e linhas aproximadas finais

| Arquivo | Mudança | Linhas |
| --- | --- | --- |
| `src/components/Login.tsx` | Recuperação pelo e-mail digitado, estados de envio, validação e mensagens de confirmação/erro | 1–92 |
| `src/contexts/UserContext.tsx` | Estado explícito de autenticação, precedência da recuperação, marcador de URL e logout após redefinição | 11–46, 76–145, 151–160, 179–243 |
| `src/components/ResetPassword.tsx` | Novo formulário com confirmação, mínimo de 8 caracteres, exibir senha, updateUser e retorno ao login | 1–101 |
| `RELATORIO_CODEX.md` | Registro desta implementação e validação | Esta seção |

As linhas acima substituem as referências anteriores dos arquivos modificados nesta etapa.

### Envio e reconhecimento da recuperação

“Esqueci minha senha” usa o e-mail já digitado; exige um endereço válido antes de chamar `supabase.auth.resetPasswordForEmail()`. O envio usa `redirectTo: window.location.origin + '/?auth=recovery'`, sem domínio ou porta fixos. A confirmação informa que, se o e-mail estiver cadastrado, receberá o link. O envio não exige preencher a senha do login.

Foi adaptado o listener `onAuthStateChange()` existente, sem adicionar outro. `PASSWORD_RECOVERY` ativa o modo de recuperação antes de aplicar a sessão e invalida consultas de identidade em andamento. Nesse modo, `SIGNED_IN`, `TOKEN_REFRESHED` e `USER_UPDATED` mantêm exclusivamente a tela de redefinição; não carregam profile/store_users nem montam a aplicação principal. A sessão Supabase é preservada para `updateUser()`.

Há estados explícitos `initializing`, `unauthenticated`, `authenticated` e `recovery`. Um marcador não sensível `auth=recovery` na URL preserva o fluxo após F5, mesmo quando o SDK já consumiu o fragmento do link. Links anteriores com `type=recovery` no fragmento também são reconhecidos. Erros de link na URL bloqueiam o formulário, mesmo se existir uma sessão anterior no navegador. Nenhuma senha ou token é copiado para armazenamento próprio da aplicação.

### Nova senha e conclusão

O formulário “Definir nova senha” exige os dois campos, igualdade e pelo menos 8 caracteres. A opção Exibir senhas não usa dependência nova. Ao salvar, chama `supabase.auth.updateUser({ password })`.

Após sucesso, limpa os campos de senha e executa `signOut({ scope: 'local' })`. Somente após logout bem-sucedido remove o marcador de recuperação e volta ao Login com “Senha alterada com sucesso. Entre novamente.” Se o logout falhar, permanece na recuperação e oferece repetir a saída, sem reenviar a alteração de senha. “Voltar ao login” também encerra a sessão temporária antes de abandonar o fluxo.

### Erros tratados

- E-mail vazio ou inválido: orientação para informar um endereço válido e foco no campo.
- Rate limit de envio: “Não foi possível enviar outro e-mail agora. Aguarde alguns minutos e tente novamente.”
- Falha de envio/conexão: mensagem amigável para tentar novamente.
- Link inválido/expirado ou sessão ausente: bloqueia alteração e orienta pedir outro link pelo login.
- Senha curta, campos vazios ou senhas diferentes: validação anterior à chamada Supabase.
- Sessão rejeitada por updateUser, senha igual à anterior, senha recusada pelo servidor e falha de atualização: mensagens amigáveis, sem detalhes internos.
- Falha no logout após atualização: mantém a aplicação bloqueada e permite tentar encerrar a sessão novamente.

Senhas ficam somente nos campos/estado transitório do formulário e são enviadas ao SDK. Não são registradas em console, banco, histórico, auditoria ou localStorage. O cliente com Publishable Key existente foi reutilizado; nenhuma Admin API ou chave privilegiada foi acrescentada.

### Testes desta etapa

- `npm.cmd run lint`: aprovado (`tsc --noEmit`).
- `npm.cmd run build`: aprovado; permanece o aviso de bundle maior que 500 kB.
- `git diff --check`: aprovado.
- 21 verificações isoladas dos componentes reais com hooks controlados e respostas Supabase simuladas: login persistido e logout normais; precedência de PASSWORD_RECOVERY sobre sessão existente; bloqueio durante SIGNED_IN/TOKEN_REFRESHED/USER_UPDATED; F5 na recuperação; link anterior com fragmento; link expirado com sessão prévia; sessão ausente; cancelamento de consulta atrasada; confirmação após logout; manutenção do bloqueio se logout falhar; e-mail vazio/inválido; envio pelo endereço digitado com origem dinâmica; rate limit; campos vazios; senha curta; senhas diferentes; updateUser bem-sucedido; repetição de logout sem repetir updateUser; sessão inválida; erro de atualização sem logout. Harness temporário removido após execução, sem novas dependências.

Referências consultadas: [Supabase — recuperação de senha](https://supabase.com/docs/guides/auth/passwords) e [Supabase — updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser).

### Pendências de homologação desta etapa

- Confirmar em Supabase Auth → URL Configuration que as URLs de redirecionamento da aplicação local e publicada permitem `/?auth=recovery`. A configuração externa não foi alterada nesta tarefa.
- Solicitar um e-mail real, abrir o link, confirmar que não abre o sistema, atualizar a página durante a recuperação, salvar a nova senha e entrar com ela no login normal.
- Conferir link expirado/inválido e rate limit reais. Os testes locais simulam essas respostas; nenhum e-mail real foi enviado nem senha de conta real foi alterada.

Permissões, métricas, histórico, auditoria, operations, integrações, câmera, banco, RLS e migrations não foram alterados nesta etapa.

## Gravação de operações no Supabase — 02/10/2026

Implementada somente a escrita das novas operações em `public.operations`, em paralelo ao comportamento local existente. A autenticação e a recuperação de senha já homologadas não foram alteradas. Nenhuma tabela, migration, política RLS, trigger ou configuração externa foi modificada.

### Arquivos desta etapa

| Arquivo | Situação e alteração | Linhas aproximadas finais |
| --- | --- | --- |
| `src/services/operationsService.ts` | Criado: tipos, validação de contexto, conversão para campos da tabela e INSERT centralizado | 1–54 |
| `src/App.tsx` | Alterado: integração nos eventos finais de pesquisa, vinculação e cadastro; erros operacionais; aviso de gravação | 33–34, 57–65, 139–148, 209–218, 252–276, 320–336, 387–397, 439–451, 587–590, 711–719 |
| `src/components/magazord/ProductRegistrationForm.tsx` | Alterado: callback opcional para falha fatal e proteção síncrona contra envio duplicado | 6, 39, 49, 56–57, 104, 116, 126, 134–136 |
| `tests/operations.test.mjs` | Criado: 13 testes isolados do serviço e eventos reais dos componentes | 1–225 |
| `RELATORIO_CODEX.md` | Alterado: esta seção | Final do documento |

### Serviço, campos e identidade

`recordOperation(input, expectedActorId)` faz uma única tentativa de INSERT e retorna um booleano; não lança falhas de rede/banco ao fluxo operacional. O `storeId` vem do `currentUser` autenticado. Ausência de loja, UUID inválido, sessão ausente ou conta diferente daquela que iniciou o evento impedem o INSERT e resultam em aviso. A comparação de `expectedActorId` serve somente para evitar atribuir uma conclusão atrasada a outra conta; esse ID não é enviado ao banco.

Campos enviados: `store_id`, `isbn`, `title`, `condition`, `operation_type`, `status`, `parent_code`, `child_code`, `error_message`, `metadata` e `completed_at`. Campos opcionais ausentes são enviados como null; metadata ausente usa objeto vazio. Todas as operações desta etapa já estão concluídas: status success/error e completed_at capturado no evento final. Não há ciclo pending/update.

Campos deliberadamente **não enviados**: `user_id`, `environment`, `id`, `created_at` e `legacy_operator_name`. Identidade e ambiente continuam determinados por `operations_set_actor_defaults`, `auth.uid()`, vínculos da loja e RLS. O frontend não força production/development, mesmo para developer.

### Pontos de conclusão analisados e utilizados

| Tipo no banco | Evento exato |
| --- | --- |
| `isbn_search` / success | `handleSearch`: fim do fluxo bibliográfico, depois do enriquecimento e da preparação local; uma linha por consulta válida em formato ISBN-10/13. HTTP 404 ou resposta normal sem livro também é success, com resultFound=false. |
| `new_product_created` / success | `handleSuccessRegistration`: callback já existente após retorno bem-sucedido de `createProduct`, somente para condição novo. |
| `new_product_reused` / success | `handleLinkStock`: confirmação efetiva após retorno bem-sucedido de `addStockToExistingProduct`. Encontrar cadastro existente não grava esse evento. |
| `used_copy_created` / success | Mesmo callback final de cadastro, para condição usado, inclusive quando a bibliografia vem de uma edição conhecida. |
| `operation_error` / error | Pesquisa sem resultado causada por falha do serviço (não por 404), exceção fatal da pesquisa, falha de vinculação ou callback de falha fatal do cadastro. Validações de formulário, clique concorrente rejeitado e falha isolada do enriquecimento de uma consulta encontrada não geram esse tipo. |

Metadata é compacta: resultFound, status/resultados das fontes realmente consultadas, flow, mock, quantidade, modo de cadastro e origem bibliográfica, conforme o evento. Não são enviados objetos completos, tokens, chaves, sessões ou stack traces. Error_message usa descrições fixas e seguras, sem copiar erros externos.

O fluxo bibliográfico existente foi preservado: a Distribuidora Curitiba só é chamada quando a BrasilAPI retorna um livro; não foi acrescentado fallback nesta tarefa. Uma consulta encontrada continua success se o enriquecimento falhar. Uma busca normal sem resultado é registrada como success no banco, embora o histórico local preserve a classificação anterior de erro_consulta. A checagem Magazord posterior não cria outra operação de pesquisa.

### Duplicidades e falhas de gravação

Os INSERTs ficam nos handlers/callbacks de negócio, fora de efeitos, renderização e funções atualizadoras de estado. Guards com refs bloqueiam pesquisas, vinculações e cadastros concorrentes; o cadastro também bloqueia repetição do callback após conclusão. Não há replay do histórico antigo no carregamento, no rerender ou no F5. Consultas novas intencionais do mesmo ISBN podem gerar novas linhas: não há deduplicação permanente por ISBN.

A escrita não bloqueia a conclusão local. Em caso de falha, o serviço registra somente uma categoria fixa de erro no console em build de desenvolvimento; não registra payload, mensagem bruta do servidor ou dados sensíveis. A interface mostra um aviso dispensável: “Uma operação não pôde ser registrada no Supabase. O resultado e o histórico local foram preservados.” Falha do INSERT não provoca outro operation_error, retry automático ou loop.

Não há garantia de entrega offline nem transação entre localStorage e Supabase. Fechar/recarregar a página antes de concluir o INSERT pode perder essa gravação; ela não é reenviada automaticamente. A homologação deve aguardar o recebimento no banco antes de encerrar a página.

### Testes executados

- `npm.cmd run lint`: aprovado (`tsc --noEmit`).
- `npm.cmd run build`: aprovado; aviso de bundle maior que 500 kB permanece fora do escopo.
- `git diff --check`: aprovado.
- `node --test tests/operations.test.mjs`: **13 testes aprovados**, usando node:test e esbuild já disponíveis, sem novas bibliotecas.

Os testes executam o serviço e handlers reais com SDK/fontes simulados e hooks controlados: payload sem identidade/ambiente; UUID/sessão inválidos; falha de INSERT sem recursão; várias fontes em uma pesquisa; resultado ausente versus falha fatal; cliques concorrentes; novos/usados; reaproveitamento confirmado; permissões admin/operator/developer sem overrides de ambiente; erros operacionais seguros; aviso não destrutivo; ausência de replay em rerender/remontagem e proteção do formulário. Os atualizadores de estado são repetidos no harness para verificar que não contêm INSERTs. Não substituem teste visual em navegador.

Referência consultada: [Supabase — tratamento de erros no SDK](https://supabase.com/docs/guides/api/handling-errors-in-supabase-js).

### Homologação e escopo preservado

Não foram usadas credenciais nem realizadas gravações no Supabase real. Próximo passo manual: executar consulta, cadastro novo, reaproveitamento e cadastro usado com conta real; conferir uma linha por ação em public.operations, store_id, tipos/condição/status/completed_at e user_id/environment definidos pelo banco. Confirmar developer em development e admin/operator em production, conforme as triggers/RLS já existentes.

**metrics ainda NÃO lê Supabase. ProductionView ainda NÃO foi migrada. localStorage, histórico antigo e CSV foram preservados. audit_logs ainda NÃO foi implementado.** BrasilAPI, Distribuidora Curitiba, regras Novo/Usado, serviço/fluxo comercial Magazord, Amazon, câmera, autenticação, recuperação de senha, SMTP e Resend permanecem como antes. No formulário Magazord, houve somente instrumentação de erro e proteção contra duplicidade, sem mudar validações ou regras do cadastro.
