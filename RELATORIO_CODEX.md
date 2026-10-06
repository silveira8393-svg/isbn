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

## Mapa preciso de alterações — Correção de registrationMode e padrão do relatório

Padrão para esta tarefa e para as próximas: documentar cada ponto alterado em uma entrada separada, com arquivo, função/método/callback/componente (ou seção nomeada em documentação), linha inicial e final exatas no código final, resumo objetivo da implementação e nome exato do teste que o cobre, quando existir. Ler os arquivos finais após a implementação e conferir todas as alterações pelo diff, executando também `git diff --check`. Preservar o histórico e acrescentar uma seção `Mapa preciso de alterações — [nome da tarefa]` contendo somente as mudanças da tarefa correspondente.

| Alteração | Arquivo | Função / símbolo | Linhas finais | Implementação |
| --- | --- | --- | --- | --- |
| Correção do metadata de cadastro Novo e Usado | src/App.tsx | handleSuccessRegistration | 445–445 | Define registrationMode pela condição: usado → used_copy; novo → new_product. Cobertura: teste "New and used registration record only final completion, using the correct condition/type/registrationMode", em tests/operations.test.mjs, linhas 154–165. |
| Identificação e casos explícitos do teste de cadastro | tests/operations.test.mjs | teste "New and used registration record only final completion, using the correct condition/type/registrationMode" | 154–155 | Atualiza o nome do teste e inclui os valores esperados new_product e used_copy junto dos tipos e condições de cada caso. |
| Asserção específica de metadata.registrationMode | tests/operations.test.mjs | teste "New and used registration record only final completion, using the correct condition/type/registrationMode" | 163–163 | Compara metadata.registrationMode com o valor esperado em ambos os casos; as asserções de operationType e condition permanecem na linha 161. |
| Novo padrão e mapa de documentação | RELATORIO_CODEX.md | seção "Mapa preciso de alterações — Correção de registrationMode e padrão do relatório" | 195–208 | Institui localização final exata e cobertura por alteração, registra os pontos desta tarefa e os resultados de validação, preservando integralmente as etapas anteriores. Não há teste automatizado específico para documentação; conferência por leitura final e git diff. |

Resultado validado pelo teste acima: Novo → operation_type = new_product_created, condition = new, metadata.registrationMode = new_product; Usado → operation_type = used_copy_created, condition = used, metadata.registrationMode = used_copy. O serviço já converte operationType para operation_type; não foi necessário alterá-lo.

Validação desta tarefa: `node --test tests/operations.test.mjs` — 13 testes aprovados; `npm.cmd run lint` — aprovado. `git diff --check` — aprovado. Diff conferido: a definição de metadata, os dois pontos do teste e esta seção estão integralmente contemplados na tabela. Nenhuma outra alteração funcional foi realizada.

## Mapa preciso de alterações — ProductionView e métricas Supabase

Análise anterior à implementação: ProductionView recebia history de App e usava calculateMetrics/classifyOperationForMetrics sobre SearchHistoryItem. Exibia Produtos Processados (soma de cadastros/entradas), Novos Criados, Reaproveitados, Usados Criados, Pesquisas, produção individual por usuário e auditoria de desenvolvimento. Os filtros eram Hoje (meia-noite local do navegador), 7 dias, 30 dias, Todos e operador. Não havia botão de atualização nem indicador visual de erros/unidades; erros eram calculados internamente. O seletor e os nomes usavam identidades mock. UserContext já fornece storeId, UUID real e operationEnvironment; somente admin/developer têm acesso à aba. Essa matriz permanece intacta.

Fonte única desta tela: public.operations, usando o cliente Supabase existente com Publishable Key e RLS vigente. Cada página filtra store_id e environment explicitamente. Admin lê production; Developer lê development, inclusive nos cartões principais e agrupamento. App mantém histórico/localStorage/CSV nas demais telas, sem importar registros antigos para o banco.

Data operacional: completed_at quando não nulo; created_at somente quando completed_at é nulo. O período é aplicado no SELECT antes da paginação. Hoje conserva o fuso do navegador; 7/30 dias são janelas móveis. Um limite superior capturado no início da leitura exclui operações futuras e é reutilizado nas páginas. A ordenação created_at/id estabiliza a paginação. São solicitadas páginas de 500, usando count exact e avanço pelo número efetivamente recebido, inclusive se o servidor limitar a resposta abaixo de 500. Falha em qualquer página descarta o resultado parcial. Não há snapshot transacional entre páginas; alterações concorrentes em registros existentes exigem nova abertura da tela para conferência.

Semântica: cartões comerciais e produção individual contam operações bem-sucedidas, uma por cadastro/entrada; Produtos Processados = Novos Criados + Reaproveitados + Usados Criados. A classificação exige operation_type e condition coerentes, com status success. Erros são status error ou operation_type operation_error; pending não gera produção. metadata.registrationMode não participa da classificação, preservando o Usado antigo com valor incorreto. Pesquisas conta somente isbn_search com status success, inclusive consulta normal sem livro. operation_error com metadata.flow isbn_search conta como erro, sem entrar em Pesquisas, preservando a separação visual anterior. Erros continuam calculados internamente, sem inventar cartão novo.

Unidades movimentadas aparecem como informação complementar no cartão existente. Somente operações comerciais bem-sucedidas somam metadata.quantity: inteiro numérico positivo seguro. Quantidade ausente, texto, zero, negativa, fracionária ou inválida usa 1, coerente com uma entrada/exemplar comercial. Pesquisas e erros somam zero unidades, independentemente da quantidade no metadata.

Usuários são agrupados e filtrados exclusivamente por user_id real. profiles/display_name é consultado em lotes de até 100 IDs sob o RLS atual; nomes indisponíveis usam o UUID integral. Sem user_id, a operação continua no consolidado, sem atribuição individual. Como operations não fornece papel e esta tarefa não muda gestão de usuários, a etiqueta individual agora diz Usuário, sem inferir admin/operator. A possibilidade de leitura dos nomes dos demais usuários no banco real não foi homologada; se o RLS negar ou omitir perfis, o UUID permanece visível e as métricas continuam válidas.

Estados: loading e erro ocultam números anteriores; sucesso sem dados informa ausência no período/operador. Falha exibe texto fixo amigável, sem mensagem bruta nem fallback local. Entrada na aba e alteração de período/conta/loja/ambiente carregam os dados; filtro de usuário é local ao resultado já lido. Cleanup cancela a requisição e ignora respostas atrasadas. Rerenders comuns não recarregam. Sem Realtime. Layout, cartões e controles existentes foram preservados, com ajustes de texto necessários à fonte real e ao ambiente.

Validações: `node --test tests/production.test.mjs tests/operations.test.mjs` — 28 testes aprovados (15 novos e 13 anteriores); comando isolado dos novos testes: `node --test tests/production.test.mjs`. `npm.cmd run lint` — aprovado. `npm.cmd run build` — aprovado, com o aviso de chunk JavaScript acima de 500 kB após minificação. `git diff --check` — aprovado. Os testes executam serviço, métricas e componente reais com SDK/hooks simulados; não acessam banco real nem substituem homologação visual.

Homologação após deploy: abrir Produção como Admin e conferir os registros reais da loja em production, inclusive o Usado antigo; abrir como Developer e conferir somente development; validar filtros de período/usuário, nomes permitidos pelo RLS e unidades. Não foi realizado deploy nesta tarefa. Autenticação, recuperação de senha, RBAC, banco/schema/RLS/triggers/migrations, gravação de operações, Novo/Usado, APIs comerciais/bibliográficas, Amazon, câmera, CSV e histórico local não foram alterados. audit_logs não foi implementado.

Referências técnicas: [Supabase — paginação por range](https://supabase.com/docs/reference/javascript/range) e [Supabase — filtros or](https://supabase.com/docs/reference/javascript/or).

Cada teste citado abaixo está em tests/production.test.mjs. As entradas dos testes registram seu nome completo e intervalo final. Imports necessários estão incluídos nas entradas de integração/tipos/harness correspondentes.

| Alteração | Arquivo | Função / símbolo | Linhas finais | Implementação |
| --- | --- | --- | --- | --- |
| Modelo de leitura e períodos | src/services/productionService.ts | ProductionPeriod / ProductionOperation / ProductionData | 1–27 | Tipos dos campos estruturados e resultado com nomes opcionais. Cobertura: SELECT isolates store and admin/production or developer/development. |
| Limites do período | src/services/productionService.ts | productionPeriodBounds | 29–37 | Calcula início e fim únicos, preservando períodos existentes. Cobertura: Period SELECT uses completed_at first and created_at only when completion is null. |
| Validação de contexto e mensagem segura | src/services/productionService.ts | loadProduction / failure | 39–47 | Rejeita loja inválida e ambiente desconhecido antes do SELECT. Cobertura: Read errors discard partial pages and invalid contexts never query. |
| SELECT isolado e filtro operacional de data | src/services/productionService.ts | loadProduction | 48–55 | Seleciona operations por loja/ambiente e período com precedência de completed_at. Cobertura: SELECT isolates store and admin/production or developer/development; Period SELECT uses completed_at first and created_at only when completion is null. |
| Paginação completa e isolamento defensivo | src/services/productionService.ts | loadProduction | 56–66 | Ordena, pagina com count exact, avança pelo tamanho real e rejeita páginas incompletas com erro. Cobertura: Pagination retains more than 1000 operations even with a smaller server cap; Defensive isolation excludes unexpected rows from another store/environment; Read errors discard partial pages and invalid contexts never query. |
| Nomes sob RLS existente | src/services/productionService.ts | loadProduction / callback de flatMap | 67–80 | Resolve profiles por UUID em lotes; falha opcional preserva UUID. Cobertura: Profiles resolve real UUIDs and unavailable names remain unresolved safely. |
| Conclusão e descarte de falha/cancelamento | src/services/productionService.ts | loadProduction | 81–84 | Entrega resultado completo ou erro fixo sem payload bruto. Cobertura: Read errors discard partial pages and invalid contexts never query; Late requests cannot replace a newer period or reveal previous-account data. |
| Classificação estruturada | src/utils/metrics.ts | classifyProductionOperation | 7–19 | Novo, entrada Novo, Usado, pesquisa e erro por tipo/condição/status; não usa registrationMode. Cobertura: Structured fields classify Novo, reused Novo and old Usado despite incorrect registrationMode; Invalid commercial quantities default to one; errors, pending and inconsistent fields do not inflate production. |
| Quantidade comercial | src/utils/metrics.ts | productionUnits | 21–26 | Soma quantidade válida, fallback 1 comercial e zero para consulta/erro. Cobertura: Invalid commercial quantities default to one; errors, pending and inconsistent fields do not inflate production. |
| Totais Supabase | src/utils/metrics.ts | calculateProductionMetrics | 28–40 | Conta operações e unidades separadamente, preservando as funções legadas/CSV. Cobertura: Structured fields classify Novo, reused Novo and old Usado despite incorrect registrationMode; Legacy CSV metrics stay unchanged. |
| Desacoplamento do histórico local | src/App.tsx | App / renderização da aba producao | 762–762 | Monta ProductionView sem history, mantendo o guard canViewProduction. Cobertura do componente sem history: ProductionView loads Supabase without localStorage and rerenders/user filters do not refetch; guard conferido pelo diff e TypeScript. |
| Imports de integração | src/components/ProductionView.tsx | ProductionView / imports | 6–11 | Importa serviço e métricas Supabase. Cobertura: ProductionView loads Supabase without localStorage and rerenders/user filters do not refetch. |
| Estado de leitura | src/components/ProductionView.tsx | ProductionView | 29–36 | Associa estado à conta/loja/ambiente/período. Cobertura: ProductionView loads Supabase without localStorage and rerenders/user filters do not refetch. |
| Carregamento e cancelamento | src/components/ProductionView.tsx | ProductionView / callback de useEffect / then / catch / cleanup | 38–46 | Carrega na montagem e mudanças de contexto, cancela e ignora conclusões atrasadas. Cobertura: Late requests cannot replace a newer period or reveal previous-account data; ProductionView empty period and period changes issue one new read. |
| Dados e filtro por UUID | src/components/ProductionView.tsx | ProductionView / callbacks de useMemo e filter | 48–55 | Usa somente dados de sucesso do contexto ativo e calcula métricas do usuário escolhido. Cobertura: Real UUID grouping and user filter keep equal display names separate; ProductionView developer only displays development and UUID fallback. |
| Agrupamento real por usuário | src/components/ProductionView.tsx | ProductionView / callback userBreakdown de useMemo e map | 57–68 | Agrupa UUIDs sem nomes mock e reaproveita métricas estruturadas. Cobertura: Real UUID grouping and user filter keep equal display names separate. |
| Texto do ambiente ativo | src/components/ProductionView.tsx | ProductionView | 90–91 | Identifica métricas development no cabeçalho. Cobertura: ProductionView developer only displays development and UUID fallback. |
| Opções reais do filtro | src/components/ProductionView.tsx | ProductionView / callback userBreakdown.map | 113–113 | Substitui duas identidades mock por usuários reais com atividade. Cobertura: Real UUID grouping and user filter keep equal display names separate. |
| Loading, erro, vazio e abertura do bloco de sucesso | src/components/ProductionView.tsx | ProductionView | 168–171 | Renderiza os estados e mostra métricas apenas em sucesso. Cobertura: ProductionView read failure shows safe error without local metrics or partial success; ProductionView empty period and period changes issue one new read. |
| Fechamento do bloco de sucesso | src/components/ProductionView.tsx | ProductionView | 378–378 | Encerra a renderização condicional dos cartões e agrupamento. Cobertura: ProductionView read failure shows safe error without local metrics or partial success. |
| Unidades no cartão existente | src/components/ProductionView.tsx | ProductionView | 189–189 | Exibe soma das unidades sem mudar contagem de operações. Cobertura: ProductionView loads Supabase without localStorage and rerenders/user filters do not refetch. |
| Etiqueta individual sem papel inventado | src/components/ProductionView.tsx | ProductionView / callback userBreakdown.map | 295–295 | Usa Usuário em vez de inferir papel por identidade mock. Cobertura: ProductionView developer only displays development and UUID fallback. |
| Título de auditoria development | src/components/ProductionView.tsx | ProductionView | 344–344 | Remove referência exclusiva a mocks no título. Cobertura: ProductionView developer only displays development and UUID fallback. |
| Origem da auditoria development | src/components/ProductionView.tsx | ProductionView | 373–373 | Identifica o registro no Supabase. Cobertura: ProductionView developer only displays development and UUID fallback. |
| Harness de compilacao e dependencias isoladas | tests/production.test.mjs | compile | 1–27 | Compila codigo real via esbuild e substitui apenas SDK, hooks e icones; exercitado pelos testes deste arquivo. |
| Factories e dados de teste | tests/production.test.mjs | service / metrics / component / row | 29–40 | Instancia modulos reais e fabrica operations com UUIDs e campos estruturados; exercitado pelos testes deste arquivo. |
| SDK simulado paginado | tests/production.test.mjs | sdk / from / query / then / respond | 42–74 | Simula filtros, ordenacao, contagem, limites, perfis, erros e respostas atrasadas; exercitado pelos testes de SELECT e paginacao. |
| Flush de tarefas assincronas | tests/production.test.mjs | flush | 154–154 | Aguarda conclusoes e rerenders no harness; exercitado pelos testes ProductionView. |
| Harness do componente real | tests/production.test.mjs | mount / hooks / render / nodes / text / unmount | 156–178 | Executa componente com cleanup, deps e localStorage proibido; exercitado pelos testes ProductionView. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "SELECT isolates store and admin/production or developer/development" | 76–86 | Cobre especificamente: SELECT isolates store and admin/production or developer/development. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "Defensive isolation excludes unexpected rows from another store/environment" | 88–91 | Cobre especificamente: Defensive isolation excludes unexpected rows from another store/environment. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "Pagination retains more than 1000 operations even with a smaller server cap" | 93–100 | Cobre especificamente: Pagination retains more than 1000 operations even with a smaller server cap. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "Period SELECT uses completed_at first and created_at only when completion is null" | 102–113 | Cobre especificamente: Period SELECT uses completed_at first and created_at only when completion is null. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "Structured fields classify Novo, reused Novo and old Usado despite incorrect registrationMode" | 115–124 | Cobre especificamente: Structured fields classify Novo, reused Novo and old Usado despite incorrect registrationMode. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "Invalid commercial quantities default to one; errors, pending and inconsistent fields do not inflate production" | 126–135 | Cobre especificamente: Invalid commercial quantities default to one; errors, pending and inconsistent fields do not inflate production. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "Profiles resolve real UUIDs and unavailable names remain unresolved safely" | 137–144 | Cobre especificamente: Profiles resolve real UUIDs and unavailable names remain unresolved safely. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "Read errors discard partial pages and invalid contexts never query" | 146–152 | Cobre especificamente: Read errors discard partial pages and invalid contexts never query. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "ProductionView loads Supabase without localStorage and rerenders/user filters do not refetch" | 180–194 | Cobre especificamente: ProductionView loads Supabase without localStorage and rerenders/user filters do not refetch. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "ProductionView developer only displays development and UUID fallback" | 196–203 | Cobre especificamente: ProductionView developer only displays development and UUID fallback. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "ProductionView read failure shows safe error without local metrics or partial success" | 205–212 | Cobre especificamente: ProductionView read failure shows safe error without local metrics or partial success. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "ProductionView empty period and period changes issue one new read" | 214–221 | Cobre especificamente: ProductionView empty period and period changes issue one new read. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "Late requests cannot replace a newer period or reveal previous-account data" | 223–237 | Cobre especificamente: Late requests cannot replace a newer period or reveal previous-account data. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "Legacy CSV metrics stay unchanged" | 239–241 | Cobre especificamente: Legacy CSV metrics stay unchanged. |
| Teste automatizado da migracao | tests/production.test.mjs | teste "Real UUID grouping and user filter keep equal display names separate" | 243–259 | Cobre especificamente: Real UUID grouping and user filter keep equal display names separate. |
| Documentacao da migracao | RELATORIO_CODEX.md | secao "Mapa preciso de alterações — ProductionView e métricas Supabase" | 210–280 | Registra analise, regras, limites, validacoes e mapa exato da tarefa; conferencia por leitura final e diff, sem teste automatizado especifico de documentacao. |

## Mapa preciso de alterações — ProductionView e métricas Supabase

Reconferência solicitada em 02/10/2026, no workspace C:\Desenvolv\isbn: a implementação está em disco como diff pendente, incluindo productionService.ts e production.test.mjs ainda não rastreados pelo Git. A frase da linha 193 descreve a etapa histórica de gravação de operações; não representa o código atual. O mapa completo nas linhas 210–280 documenta cada ponto funcional e teste do diff de migração e foi preservado integralmente. Nesta reconferência não foi necessária nova alteração funcional.

Diagnóstico atual: App monta ProductionView sem history; o componente carrega operations via loadProduction, com loja e ambiente de UserContext, e calcula métricas estruturadas via calculateProductionMetrics. A função calculateMetrics legada continua atendendo histórico/CSV e não é a função usada por Produção. UserContext e suas permissões permanecem sem diff.

Validações reexecutadas: `node --test tests/production.test.mjs tests/operations.test.mjs` — 28 aprovados; `npm.cmd run lint` — aprovado; `npm.cmd run build` — aprovado, warning de bundle JavaScript de 1.134,00 kB acima de 500 kB; `git diff --check` — aprovado. Também conferidos os novos arquivos com `git diff --no-index --check -- NUL src/services/productionService.ts` e `git diff --no-index --check -- NUL tests/production.test.mjs`. Nenhum banco real foi acessado; nomes não autorizados pelo RLS continuam como UUID. Deploy/homologação real não foram realizados.

| Alteração | Arquivo | Função / símbolo | Linhas finais | Implementação |
| --- | --- | --- | --- | --- |
| Registro desta reconferência | RELATORIO_CODEX.md | seção "Mapa preciso de alterações — ProductionView e métricas Supabase" (reconferência) | 282–292 | Documenta diagnóstico em disco, diff pendente e validações reexecutadas. Sem teste automatizado específico para documentação; conferência por leitura final e diff. |

## Mapa preciso de alterações — Proteção do Modo Teste

Correção pontual em 04/10/2026, partindo de main em 3aa0939d7146d89069e6b4f1b8c118d77eed83f7, com working tree inicialmente limpa. Causa: controles de simulação e handleModeChange não verificavam isDeveloper; o efeito de restauração sozinho não impedia mudanças manuais posteriores.

| Alteração | Arquivo | Função / símbolo | Linhas finais | Implementação |
| --- | --- | --- | --- | --- |
| Guard da alteração manual | src/components/magazord/MagazordStatusCard.tsx | MagazordStatusCard / handleModeChange | 87–91 | Não-developer restaura auto no serviço (memória/localStorage) e estado do componente, retornando antes da mudança solicitada e onRetryCheck. Cobertura: testes admin/operator de chamada direta. |
| Restrição do botão Modo Teste | src/components/magazord/MagazordStatusCard.tsx | MagazordStatusCard / botão de alternância | 198–210 | Renderiza somente quando isDeveloper. Cobertura: testes das três roles. |
| Restrição do alerta com retorno manual | src/components/magazord/MagazordStatusCard.tsx | MagazordStatusCard / alerta de modo forçado | 214–214 | Alerta e botão de retorno manual disponíveis somente para developer. Cobertura: ausência de botões de mudança para admin/operator. |
| Restrição do painel de opções | src/components/magazord/MagazordStatusCard.tsx | MagazordStatusCard / painel de simulação | 234–234 | Exige isDeveloper mesmo com showConfig previamente aberto. Cobertura: testes admin/operator com estado de painel aberto. |
| Harness sem dependências novas | tests/magazordMode.test.mjs | output / nodes / setup | 1–71 | Compila componente real em memória com esbuild, captura handler privado apenas no bundle de teste e usa serviço mock real com localStorage controlado; não altera código de produção para expor handler. |
| Preservação do developer | tests/magazordMode.test.mjs | teste Developer keeps manual controls, simulation options and local persistence | 73–94 | Verifica controle, opções existentes, persistência, estado e nova checagem após mudanças. |
| Bloqueio de admin/operator | tests/magazordMode.test.mjs | testes parametrizados hidden controls, persisted forced mode reset and direct handler blocked | 96–123 | Verifica controles ocultos, restauração de persistência/estado para auto, handler direto sem retry e transição de developer para não-developer. |
| Registro da correção | RELATORIO_CODEX.md | seção Mapa preciso de alterações — Proteção do Modo Teste | 294–311 | Acrescenta causa, mapa exato, validações e limites, preservando o histórico. Conferência por leitura e diff. |

Validações: `node --test tests/magazordMode.test.mjs tests/operations.test.mjs tests/production.test.mjs` — 31 aprovados; `npm.cmd run lint` — aprovado; `npm.cmd run build` — aprovado, com aviso existente de bundle acima de 500 kB (1.134,06 kB); `git diff --check` e verificação do novo teste com `git diff --no-index --check -- NUL tests/magazordMode.test.mjs` — sem erros de whitespace. `npm run lint/build` inicialmente bloqueados pelo PowerShell (npm.ps1); executados via npm.cmd sem alterar política do sistema. Conferidos git status, git diff --stat e git diff.

Persistência e opções do serviço permanecem inalteradas; o efeito existente continua restaurando auto ao carregar como admin/operator. Nenhuma alteração em UserContext, Auth, banco/RLS, operations, ProductionView/métricas, histórico/CSV, consultas ISBN ou regras Novo/Usado/reaproveitamento. audit_logs não implementado. Sem commit/push. Testes isolados não substituem homologação visual: conferir Modo Teste como developer e ausência dos controles/retorno a auto como admin/operator após modo forçado persistido.

## Mapa preciso de alterações — Aplicação confirmada do Modo Teste

Em 04/10/2026, partindo do diff pendente das etapas anteriores: Configurações e Consultar aplicavam imediatamente cada opção. Agora escolher uma opção altera somente selectedMode, um estado React local; Aplicar confirma a alteração. Modo ativo mostra currentMode, lido do serviço, e Aplicar fica desabilitado quando não existe diferença efetiva entre os dois modos. Nenhum botão Salvar foi acrescentado.

A regra de seleção/aplicação foi concentrada em useMagazordTestMode, utilizado pelos dois controles, preservando os estilos e ações operacionais do card. O atalho de Auto em Consultar passou a selecionar Auto e abrir o painel para confirmação. Somente uma aplicação efetiva dispara a nova consulta e limpa a mensagem de vinculação de estoque, como ocorria anteriormente na mudança imediata. A configuração efetiva continua no mesmo magazordMockService e na chave sebo_magazord_sim_config_v2; seleções pendentes não são persistidas e são descartadas ao desmontar. Aliases legados permanecem equivalentes sem regravação automática.

Developer vê os controles e pode selecionar/aplicar. Admin/operator continuam sem botão/painel; o efeito por perfil e os guards de seleção/aplicação restauram auto, inclusive nas chamadas diretas aos handlers e na troca de perfil com painel aberto. A proteção foi centralizada, não removida. App/activeTab e SettingsView/activeSubTab não foram alterados: F5 continua iniciando em Consultar. Auth, UserContext, banco/RLS, serviço de simulação, operations, ProductionView/métricas, histórico/CSV e regras ISBN/Novo/Usado permanecem sem alteração nesta etapa; audit_logs não implementado. Sem commit/push.

Validações: `node --test tests/magazordMode.test.mjs tests/operations.test.mjs tests/production.test.mjs` — 40 aprovados (12 magazordMode, 13 operations, 15 production); `npm.cmd run lint` — aprovado; `npm.cmd run build` — aprovado, com aviso de bundle acima de 500 kB (1.136,46 kB); `git diff --check` — sem erros de whitespace. Os arquivos novos também foram conferidos por `git diff --no-index --check -- NUL <arquivo>`, incluindo o hook compartilhado.

Os testes usam os componentes e o serviço reais, hooks/JSX controlados e localStorage em memória, contando cada chamada efetiva e gravação; a captura dos handlers ocorre somente no bundle de teste. A recarga é simulada por nova instância do módulo/serviço com a mesma persistência. Não foi realizada homologação visual no navegador nem acesso ao banco real nesta etapa.

| Alteração | Arquivo | Função / símbolo | Linhas finais | Implementação |
| --- | --- | --- | --- | --- |
| Opções, rótulos e compatibilidade | src/components/magazord/useMagazordTestMode.ts | magazordModeOptions / normalizeMode / getMagazordModeLabel | 5–22 | Mantém os seis modos visíveis e reconhece os aliases legados sem persistência adicional. |
| Estados de modo e seleção pendente | src/components/magazord/useMagazordTestMode.ts | useMagazordTestMode | 24–29 | Inicializa currentMode pelo serviço, selectedMode local e comparação que habilita Aplicar. |
| Restauração e proteção por perfil | src/components/magazord/useMagazordTestMode.ts | resetRestrictedMode / efeito por isDeveloper | 31–46 | Restaura auto no serviço e nos estados, fecha o painel e relê o serviço para developer. |
| Sincronização do resultado do catálogo | src/components/magazord/useMagazordTestMode.ts | efeito por syncKey | 48–54 | Relê o modo efetivo quando o resultado muda, preservando uma escolha pendente. |
| Seleção local protegida | src/components/magazord/useMagazordTestMode.ts | selectMode | 56–62 | Verifica developer e altera apenas selectedMode; não aplica nem persiste a escolha. |
| Aplicação confirmada protegida | src/components/magazord/useMagazordTestMode.ts | applyMode | 64–77 | Verifica developer, ignora reaplicação do mesmo modo, grava pelo serviço, relê currentMode e executa callback após mudança efetiva. |
| Controle em Configurações | src/components/magazord/MagazordTestMode.tsx | MagazordTestMode | 1–40 | Usa o hook compartilhado, exibe Modo ativo, destaca selectedMode e oferece somente Aplicar, condicionado à diferença pendente. |
| Integração do card de Consultar | src/components/magazord/MagazordStatusCard.tsx | imports / useMagazordTestMode / callback onApplied | 6; 13–14; 64–68 | Substitui a lógica duplicada pelo hook e mantém nova consulta/limpeza de mensagem somente após Aplicar. |
| Atalho de Auto com confirmação | src/components/magazord/MagazordStatusCard.tsx | botão Selecionar Padrão (Auto) | 174–180 | Seleciona Auto e abre o painel; não altera o modo efetivo antes de Aplicar. |
| Painel de Consultar | src/components/magazord/MagazordStatusCard.tsx | painel protegido / opções / botão Aplicar | 185–281 | Mantém guard developer, exibe Modo ativo, destaca apenas selectedMode e adiciona Aplicar desabilitado sem pendência. |
| Harness unificado das duas telas | tests/magazordMode.test.mjs | output / setupView / assertSelection | 1–166 | Compila componentes e hook reais com um único serviço; controla hooks, perfis, persistência e contadores de chamadas/gravações. |
| Fluxo developer e Auto | tests/magazordMode.test.mjs | testes parametrizados developer selects locally | 168–214 | Confere seleção sem escrita/chamada/retry, aplicação efetiva, indicação textual, destaque único, botão desabilitado e Auto pelo mesmo fluxo nas duas telas. |
| Leitura inicial e aliases | tests/magazordMode.test.mjs | testes parametrizados initial mode | 216–236 | Confere todos os modos iniciais, aliases e padrão sem configuração salva, sem gravação na montagem ou reaplicação direta. |
| Persistência e descarte de pendência | tests/magazordMode.test.mjs | testes parametrizados only applied selection survives | 238–267 | Confere navegação entre os controles, remontagem e nova instância do serviço; só o modo aplicado sobrevive. |
| Bloqueio admin/operator | tests/magazordMode.test.mjs | testes parametrizados has no controls | 269–312 | Confere controles ausentes, auto efetivo/persistido, chamadas diretas de seleção/aplicação bloqueadas e troca de perfil com escolha pendente. |
| Atalho e atualização do catálogo | tests/magazordMode.test.mjs | testes consultar Auto alert shortcut / catalog refresh | 314–332; 334–352 | Confere confirmação de Auto no atalho e preservação da seleção pendente durante atualização do resultado. |
| Documentação final desta etapa | RELATORIO_CODEX.md | seção Aplicação confirmada do Modo Teste | 313–343 | Acrescenta comportamento, escopo, validações, limites e mapa exato, preservando todo o histórico anterior. |

## Mapa preciso de alterações — Exclusão das simulações do Histórico

Em 04/10/2026, com working tree inicialmente limpa, foi aplicada a regra somente para novas ações. Nenhum registro antigo foi apagado. Sem commit/push.

Fonte do Histórico: estado history de App e localStorage na chave sebo_isbn_history_v1, compartilhados pelo Histórico Recente, aba Histórico e exportação CSV. Encontrados quatro pontos de criação: consulta encontrada, consulta sem resultado/erro bibliográfico, reaproveitamento de Novo e cadastro Novo/Usado; também foi protegida a atualização do resultado Magazord. A carga inicial/dataset canônico e a limpeza manual existentes foram preservadas.

Fonte de verdade: magazordMockService.getSimulationConfig().mode, sem alteração no serviço e sem nova persistência. updateOperationalHistory permite a gravação somente se o modo aplicado na origem da ação e o modo atual forem auto. Os handlers assíncronos capturam o modo antes do await; ProductRegistrationForm encaminha o modo do início do envio ao callback de sucesso, impedindo que uma conclusão tardia em Auto registre uma ação iniciada em modo forçado. Nenhuma decisão depende de isDeveloper.

Auto continua registrando consultas, erros bibliográficos, cadastros e reaproveitamento, com deduplicação imediata e limite de 50 itens mantidos. Modos forçados não criam entradas nem alteram resultados anteriores no Histórico, inclusive retries sobre ISBNs já presentes. Os fluxos de resultado, estoque e cadastro continuam funcionando. saveOperation permanece independente da supressão; operationsService e a atribuição de development pelo banco não foram alterados. Auth, UserContext, roles, banco/RLS/schema, ProductionView, métricas, regras Novo/Usado, navegação/F5 e CSV permanecem sem alteração. audit_logs não implementado.

Validações: node --test tests/magazordMode.test.mjs tests/operations.test.mjs tests/production.test.mjs tests/history.test.mjs — 70 aprovados (12 magazordMode, 13 operations, 15 production, 30 history). Inclui controles/aplicação pendente, bloqueio admin/operator, todos os modos visíveis, aliases e force_used_not_found, erros, cadastro real pelo formulário, reaproveitamento, retorno a Auto, conclusões assíncronas e independência de operations. npm.cmd run lint — aprovado; npm.cmd run build — aprovado, com aviso existente de bundle acima de 500 kB (1.136,77 kB). git diff --check — aprovado; arquivo novo conferido também com git diff --no-index --check -- NUL tests/history.test.mjs, sem erro de whitespace. Conferidos git status, git diff --stat e git diff, incluindo o arquivo novo por diff --no-index.

Regressão existente do histórico/CSV: runCanonicalMetricsRegressionTests de src/utils/metrics.test.ts — quatro cenários aprovados (global, João, proprietário e cenário limpo), compilados em memória com esbuild já instalado. A execução inicial via node --import tsx falhou no ambiente ao chamar uv_os_get_passwd (ENOMEM); a execução via esbuild não exigiu mudança de dependências nem de permissões.

Limites de validação: componentes, formulário, mock Magazord e operationsService reais executados com hooks/JSX, requisições bibliográficas, timers e respostas Supabase controlados. Não foi acessado banco real nem feita homologação visual. Os testes confirmam que os INSERTs seguem acontecendo sem override de environment/user_id; o isolamento development/production permanece coberto pela suíte existente. Git status final: modificados RELATORIO_CODEX.md, src/App.tsx, src/components/magazord/ProductRegistrationForm.tsx e tests/operations.test.mjs; novo tests/history.test.mjs.

| Alteração | Arquivo | Função / símbolo | Linhas finais | Implementação |
| --- | --- | --- | --- | --- |
| Supressão central na fonte | src/App.tsx | updateOperationalHistory / MagazordSimulationMode | 37; 61–68 | Usa o getter existente e bloqueia o setter antes de criar/atualizar registros quando a origem ou o modo atual forem forçados. |
| Proteção do resultado Magazord | src/App.tsx | runMagazordCheck | 108–112; 121–142 | Captura/recebe o modo aplicado e protege o enriquecimento de registros anteriores; o resultado em tela continua sendo atualizado. |
| Consulta encontrada | src/App.tsx | handleSearch | 161; 203–220; 231 | Captura o modo antes da consulta bibliográfica, protege a inserção e repassa a origem à checagem; operations segue fora do guard. |
| Consulta sem resultado/erro | src/App.tsx | handleSearch | 257–265 | Protege a entrada erro_consulta; mantém mensagem e gravação independente de operations. |
| Reaproveitamento comercial Novo | src/App.tsx | handleLinkStock | 335; 392–400 | Captura o modo antes da vinculação e suprime somente a gravação de histórico, mantendo saldo/resultado/operations. |
| Cadastro Novo/Usado concluído | src/App.tsx | handleSuccessRegistration | 414–418; 444–452 | Recebe o modo de origem do formulário, com getter como padrão, e protege a entrada de cadastro sem interromper o fluxo ou operations. |
| Origem do envio assíncrono | src/components/magazord/ProductRegistrationForm.tsx | ProductRegistrationFormProps / handleSubmit | 12; 38; 117; 129 | Acrescenta argumento opcional de modo ao callback, lendo o serviço no início do envio e encaminhando o valor após o await. |
| Compatibilidade da suíte existente | tests/operations.test.mjs | dependencies / magazord | 125 | Mock existente passa a oferecer getSimulationConfig em Auto; assertions e comportamento de operations foram preservados. |
| Harness de integração sem framework novo | tests/history.test.mjs | output / setup / forcedModes | 1–166 | Compila os módulos reais em memória; controla localStorage, respostas Supabase, hooks e timers, e verifica fonte persistida e fonte exibida. |
| Developer em Auto | tests/history.test.mjs | teste Developer + Auto | 168–180 | Confere registro normal, resultado Magazord e compartilhamento entre as duas telas de Histórico. |
| Todos os modos forçados | tests/history.test.mjs | testes parametrizados Developer + mode | 182–199 | Oito modos, incluindo aliases: zero gravações, registros antigos intocados, resultado/erro correto e INSERT independente de operations. |
| Consulta sem resultado/erro bibliográfico | tests/history.test.mjs | teste Auto keeps no-result | 201–215 | Compara Auto e modos forçados com 404, 500 e FALHA_CONEXAO, preservando os tipos de operations. |
| Cadastro completo Novo/Usado | tests/history.test.mjs | testes parametrizados registration | 217–235 | Envia pelo formulário real, verifica confirmação e banco simulado, histórico conforme modo e operations corretas. |
| Reaproveitamento Novo | tests/history.test.mjs | testes parametrizados Existing Novo stock reuse | 237–250 | Confere saldo, persistência no catálogo e operations em Auto/Novo Encontrado/Múltiplos Resultados. |
| Erro forçado de cadastro | tests/history.test.mjs | teste Forced registration failure | 252–261 | Erro real do mock em force_error não cria histórico; callback mantém operation_error. |
| Retorno a Auto e fonte aplicada | tests/history.test.mjs | teste Applied Auto resumes history | 263–274 | Nova consulta volta a registrar após resetModeToAuto; valor externo ao serviço não governa o guard. |
| Retry forçado sobre histórico anterior | tests/history.test.mjs | teste A forced catalog retry cannot alter | 276–286 | Verifica que a tela muda, mas a entrada Auto anterior e a contagem de operações permanecem preservadas. |
| Trocas de modo durante ações assíncronas | tests/history.test.mjs | testes lookup/retry/stock/registration finishing | 288–336 | Verifica consulta forçada concluída em Auto, Auto concluída em modo forçado, retry tardio e conclusões de estoque/cadastro após Auto. |
| Inicialização e regras legadas de Auto | tests/history.test.mjs | testes History initialization / Auto retains | 338–357 | Preserva dataset inicial em modo forçado, deduplicação imediata e limite de 50 em Auto sem suprimir operations. |
| Erros fatais e independência de operations | tests/history.test.mjs | teste Fatal bibliographic and stock errors | 359–370 | Falhas bibliográfica e de vinculação mantêm operation_error sem gravação de histórico em modo forçado. |
| Documentação desta etapa | RELATORIO_CODEX.md | seção Exclusão das simulações do Histórico | 345–383 | Acrescenta diagnóstico, decisões, cobertura, validações, limites e mapa com linhas finais, preservando integralmente o conteúdo anterior. |

## Mapa preciso de alterações — Histórico de Testes do Developer

Em 04/10/2026, partindo do diff local da etapa anterior, a regra definitiva substitui a supressão completa descrita nas linhas 345–383: simulações agora são registradas no mesmo histórico, classificadas e visíveis somente para developer. Todo o relatório anterior foi preservado, sem commit/push.

Campo escolhido: SearchHistoryItem.historyKind?: 'operational' | 'test'. Nas quatro criações atuais (consulta encontrada, consulta sem resultado/erro bibliográfico, reaproveitamento Novo e cadastro Novo/Usado), o valor é definido pelo actionMode capturado na origem: auto gera operational; qualquer modo forçado, incluindo aliases, gera test. O setter não suprime mais entradas. A captura antes do await e o repasse do modo pelo formulário da etapa anterior foram mantidos, sem consultar o modo final para reclassificar a conclusão.

Compatibilidade: entradas sem historyKind continuam operacionais/legadas, inclusive se contiverem userRole developer ou operationEnvironment development. Não há inferência retroativa, migração nem limpeza automática. A checagem Magazord atualiza somente consultas do ISBN com classificação compatível com a origem da checagem, preservando o campo original; retries de teste não alteram consultas operacionais, e retries Auto não alteram consultas test. No Simular Erro, a consulta fica registrada como test e a falha continua sendo exibida no card. Os callbacks de erro de cadastro/estoque e suas operations seguem o comportamento existente.

Visibilidade: visibleHistory em App entrega todo o histórico ao developer e remove entradas test para admin/operator antes da renderização. O mesmo dataset alimenta Histórico Recente, aba Histórico, historyCount do Header e exportação CSV. O badge âmbar discreto TESTE fica junto ao título de entradas test no componente compartilhado SearchHistoryGroup, independente da presença de status Magazord. CSV mantém as 13 colunas, ordem, formatos e nome de arquivo existentes; apenas o dataset exportado passa de history bruto para visibleHistory.

Deduplicação: preserva ISBN, pesquisa_isbn e janela de três segundos, acrescentando a equivalência da classificação (legado equivale a operational) para não descartar uma consulta operacional imediatamente posterior ao teste do mesmo ISBN. O limite continua em 50 entradas no histórico bruto compartilhado. A chave sebo_isbn_history_v1, carga inicial/dataset canônico, limpeza manual de todo o histórico, F5, navegação e persistência Magazord foram preservados. Nenhum segundo histórico, aba ou filtro novo foi criado.

Operations: todas as chamadas saveOperation e operationsService permanecem independentes de historyKind/visibleHistory; environment continua sendo atribuído pela infraestrutura existente (developer/development, produção/production), sem override no INSERT. Nenhuma alteração nesta etapa em Auth, UserContext, roles, banco/RLS/schema, ProductionView, métricas, regras Novo/Usado, Modo Teste/Aplicar ou mock Magazord. audit_logs não implementado.

Validações: node --test tests/magazordMode.test.mjs tests/operations.test.mjs tests/production.test.mjs tests/history.test.mjs — 80 aprovados (12 magazordMode, 13 operations, 15 production, 40 history). runCanonicalMetricsRegressionTests de src/utils/metrics.test.ts executado via esbuild em memória, já instalado — quatro cenários de histórico/CSV aprovados. npm.cmd run lint — aprovado; npm.cmd run build — aprovado, aviso existente de bundle acima de 500 kB (1.137,21 kB). git diff --check e verificação do arquivo novo com git diff --no-index --check -- NUL tests/history.test.mjs — sem erros de whitespace. Conferidos git status, git diff --stat e git diff, incluindo o novo teste.

Limites e estado final: módulos reais de App, SearchHistoryGroup, formulário, mock Magazord e operationsService testados com hooks/JSX, timers, requisições bibliográficas, DOM de download e respostas Supabase controlados; não houve homologação visual nem acesso ao banco real. Git status: modificados RELATORIO_CODEX.md, src/App.tsx, src/components/SearchHistoryGroup.tsx, src/components/magazord/ProductRegistrationForm.tsx, src/types.ts e tests/operations.test.mjs; novo tests/history.test.mjs. Os diffs do formulário e do mock de operations são herdados da etapa anterior e foram mantidos.

| Alteração | Arquivo | Função / símbolo | Linhas finais | Implementação |
| --- | --- | --- | --- | --- |
| Classificação opcional compatível | src/types.ts | SearchHistoryItem.historyKind | 181–182 | Adiciona operational/test; ausência do campo significa legado operacional, sem alteração dos dados persistidos antigos. |
| Fonte filtrada por perfil | src/App.tsx | visibleHistory | 61–63 | Developer recebe history completo; admin/operator recebem somente entradas que não são test. Substitui o helper anterior de supressão. |
| Classificação da consulta encontrada | src/App.tsx | handleSearch / newItem | 157; 186; 229 | Mantém captura do modo na origem, classifica a nova consulta e repassa a origem à checagem assíncrona. |
| Classificação da consulta sem resultado/erro | src/App.tsx | handleSearch / newItem | 245 | Persistência retomada em modo forçado com historyKind test; tipo erro_consulta e operations existentes preservados. |
| Atualização sem cruzar classificações | src/App.tsx | runMagazordCheck | 103–106; 120 | Getter/captura herdados; atualização exige classe compatível e preserva o campo original da consulta, inclusive sua ausência nos legados. |
| Deduplicação dentro da classificação | src/App.tsx | handleSearch / updater setHistory | 206 | Acrescenta comparação de classe à regra existente, tratando legado como operational e mantendo limite de 50 e persistência. |
| Reaproveitamento Novo classificado | src/App.tsx | handleLinkStock / auditItem | 334; 375 | Usa o modo capturado antes do await para gravar operational/test, mantendo estoque/resultado/operations. |
| Cadastro Novo/Usado classificado | src/App.tsx | handleSuccessRegistration / auditItem | 414–417; 428 | Retoma todas as gravações com a classe do início do envio; nenhuma reclassificação pelo modo na conclusão. |
| Preservação da origem do cadastro | src/components/magazord/ProductRegistrationForm.tsx | ProductRegistrationFormProps / handleSubmit | 38; 117; 129 | Alteração da etapa anterior mantida: lê o modo antes de criar o produto e encaminha ao callback de sucesso após o await. |
| CSV autorizado por perfil | src/App.tsx | handleExportHistoryCsv | 495; 513 | Verifica/exporta visibleHistory; não acrescenta colunas nem altera formatos existentes. |
| Contador e ambas as listagens | src/App.tsx | Header / SearchHistoryGroup | 598; 707; 766 | Todos recebem o mesmo dataset filtrado; registros test não entram no contador/lista de admin/operator. |
| Badge discreto de teste | src/components/SearchHistoryGroup.tsx | título do item / badge TESTE | 115–119 | Mostra TESTE junto ao título somente quando historyKind é test, inclusive em consultas sem status Magazord. |
| Compatibilidade da suíte de operations | tests/operations.test.mjs | dependencies / magazord | 125 | Getter Auto acrescentado na etapa anterior permanece; nenhum comportamento/assertion de operations alterado nesta etapa. |
| Harness integrado e download CSV | tests/history.test.mjs | output / setup | 1–181 | Acrescenta componente real de Histórico, captura do Blob CSV, troca de perfil e leitura de badges; mantém módulos/serviços reais em memória. |
| Auto e todos os modos forçados | tests/history.test.mjs | testes Developer + Auto / modos | 183–216 | Confere operational em Auto, test nos oito modos/aliases, legado não reclassificado e operations independentes. |
| Consultas sem resultado/erro | tests/history.test.mjs | teste No-result and bibliographic errors | 218–233 | Compara classificações em Auto e modos forçados com 404/500/FALHA_CONEXAO, mantendo operações correspondentes. |
| Cadastros Novo/Usado e reaproveitamento | tests/history.test.mjs | testes registration / Existing Novo stock reuse | 235–268 | Confere classes, confirmação pelo formulário real, persistência no catálogo, saldo e operations em Auto e modos forçados. |
| Erro simulado de cadastro | tests/history.test.mjs | teste Forced registration failure | 270–279 | Confere a consulta test preservada, falha mostrada pelo formulário e operation_error independente. |
| Retorno a Auto e retries isolados | tests/history.test.mjs | testes Applied Auto / Catalog retries | 281–311 | Confere classes distintas no mesmo ISBN, getter como fonte, atualização somente da classe correspondente e ausência de migração do legado. |
| Classificação durante mudanças assíncronas | tests/history.test.mjs | testes Lookup / retry / stock / registration | 313–364 | Origem test concluída em Auto e origem operational concluída em modo forçado permanecem na classe original; retry e operations preservados. |
| Inicialização, deduplicação e limite | tests/history.test.mjs | testes Canonical / Both classifications / immediate legacy | 366–397 | Preserva dataset legado, deduplicação em ambas as classes, equivalência do legado em Auto e limite compartilhado de 50 entradas. |
| Falhas fatais e operations | tests/history.test.mjs | teste Fatal bibliographic and stock errors | 399–411 | Mantém callbacks/operation_error e a consulta test sem alterar o fluxo existente das falhas. |
| Visibilidade, badge e CSV nas duas telas | tests/history.test.mjs | mixedHistory / countBadges / testes por role | 413–448 | Confere os três perfis, legado developer/development operacional, badge real, contador e CSV de 13 colunas somente com entradas autorizadas. |
| Troca de perfil e conjunto somente test | tests/history.test.mjs | testes Profile changes / admin/operator dataset | 450–476 | Filtra imediatamente sem excluir os dados; fonte vazia e exportação sem download quando todas as entradas são test. |
| Conclusão tardia após troca de perfil | tests/history.test.mjs | teste A test lookup completed after switching to admin | 478–494 | Persiste test pela origem e nunca entrega essa entrada ao histórico/contador de admin. |
| Limpeza manual preservada | tests/history.test.mjs | teste Manual clearing | 496–507 | Continua limpando o único histórico bruto, inclusive testes ocultos; nenhum registro de operations é criado por limpeza. |
| Documentação da regra definitiva | RELATORIO_CODEX.md | seção Histórico de Testes do Developer | 385–431 | Acrescenta regra vigente, diagnóstico, validações, limites e mapa de linhas finais, preservando integralmente todas as etapas anteriores. |

## Mapa preciso de alterações — Isolamento do Sandbox Magazord

Em 04/10/2026, sobre o diff local ainda pendente do Histórico de Testes do Developer, foi isolado o catálogo mock usado por simulações. Todas as seções anteriores do relatório foram preservadas integralmente. Sem commit/push.

Diagnóstico integral: antes desta correção havia um único catálogo Record<string, SimulatedRecord[]> por ISBN/EAN, lido pela chave sebo_magazord_simulated_db_v3 com fallback/migração em memória de sebo_magazord_simulated_db_v2. saveSimulatedDb escrevia ambos os nomes em toda mutação. O único estado duradouro em memória do serviço era config; os registros de catálogo eram desserializados por chamada, alterados localmente e persistidos. SimulatedRecord contém id, ean, Pai, Filho, condição, título, preço, estoque, descrição e registeredAt; SKU era derivado nas consultas.

Causa exata: Novo Encontrado devolvia uma resposta artificial com estoque fixo 3, sem registro próprio. addStockToExistingProduct lia o catálogo compartilhado e, ao não achar o produto, criava um fallback Novo com saldo 3 + quantidade, persistindo nas mesmas chaves consultadas por Auto. createProduct também inseria/atualizava Novo ou anexava Usado nesse catálogo único, independentemente do modo. checkProductByEan e createProduct verificavam this.config.mode somente após o await; addStock nem selecionava contexto. complementExistingProduct lia a mesma fonte, embora não persistisse alterações. Assim, dados exclusivos do teste passavam a aparecer em Auto.

Arquitetura: Auto preserva integralmente a fonte operacional sebo_magazord_simulated_db_v3 e a compatibilidade com sebo_magazord_simulated_db_v2, inclusive leitura de V2 em formato único e escrita simultânea dos dois nomes em mutações operacionais. Sandbox usa a nova chave sebo_magazord_sandbox_db_v1, com estrutura { modoCanônico: { isbn: SimulatedRecord[] } }. Cada cenário mantém seu próprio catálogo. force_existing compartilha force_new_found; force_not_found compartilha force_new_not_found. sebo_magazord_sim_config_v2 continua sendo apenas configuração. Não há cópia inicial do operacional, merge, promoção, migração destrutiva ou limpeza automática.

Fixtures: Novo Encontrado materializa somente no cenário sandbox um Novo com estoque 3; Usado/Edição Conhecida materializa um Usado de referência; Múltiplos materializa Novo com estoque 4 e dois Usados com estoque 1. Reconsultas reutilizam registros e seus saldos persistidos, sem sobrescrever alterações. O SKU opcional das fixtures é persistido junto com Pai/Filho/id no sandbox; registros operacionais anteriores continuam com a geração de SKU original. Múltiplos conserva status e composição Novo/Usado e agora incrementa seu saldo inicial 4 corretamente para 6 ao adicionar 2, em vez do antigo fallback 3 -> 5. Cenários Não Encontrado continuam forçando NOT_FOUND; cadastros realizados neles permanecem em seu namespace sandbox. Simular Erro mantém as falhas de consulta/cadastro sem mutação operacional.

Contexto assíncrono: getRecordsForEan, checkProductByEan, addStockToExistingProduct, createProduct e complementExistingProduct recebem actionMode opcional, cujo padrão captura o modo no início da chamada, antes do primeiro await. Todas as leituras/escritas dependentes recebem esse mesmo valor. App repassa o modo capturado antes da consulta bibliográfica, da vinculação e da conclusão do cadastro; o formulário usa a mesma captura para chamar createProduct e classificar o Histórico. Uma ação iniciada em teste continua no mesmo cenário sandbox após voltar a Auto; uma ação Auto continua operacional após ativar teste.

Perfis e exibição: captureActionMode em App consulta o modo para developer (incluindo Auto) e garante Auto a admin/operator; um efeito restaura a configuração persistida para Auto nesses perfis. UserContext/roles/Auth não foram alterados. As refs de perfil/contexto impedem resultados tardios de substituírem uma consulta atual de outro contexto e ocultam dados/error de sandbox ao trocar de perfil. O card também etiqueta a confirmação de estoque com a origem e só a mostra ao perfil/contexto autorizado; o fallback sem callback repassa o modo explicitamente. Isso evita tanto o vazamento de catálogo quanto uma confirmação visual antiga de estoque test.

Novo/Usado/estoque: incremento de Novo, criação/atualização de Novo e criação de cada exemplar Usado selecionam o dataset exclusivamente pelo contexto capturado. Pai/Filho/SKU, saldo, preço e descrição de sandbox não entram no operacional. Regras comerciais de incremento e independência dos exemplares Usados foram mantidas. complementExistingProduct segue sem mutação e agora lê somente o namespace correto. Reset/configuração alternam apenas modo; não copiam nem apagam catálogos. F5 recria o serviço e relê a mesma configuração e os dois estados persistidos separados. A nova chave facilita uma futura limpeza explícita, mas nenhum botão ou ação Limpar Sandbox foi implementado.

Preservações: SearchHistoryItem.historyKind, operational/test, legado operacional, badge TESTE, filtragem por perfil, contador, Histórico Recente/aba Histórico e CSV autorizado continuam funcionando; classificação de origem e datasets não foram substituídos. saveOperation/operationsService/INSERTs continuam independentes, sem user_id/environment manualmente adicionados; o ambiente permanece da infraestrutura existente. Sem alteração em banco/schema/RLS, ProductionView, métricas, API bibliográfica, navegação/F5, Amazon, audit_logs ou gestão de usuários.

Validações: node --test tests/magazordMode.test.mjs tests/operations.test.mjs tests/production.test.mjs tests/history.test.mjs tests/magazordIsolation.test.mjs — 108 aprovados (12 magazordMode, 13 operations, 15 production, 46 history, 22 magazordIsolation). A suíte nova reproduz o ISBN 9788528617931, testa leitura/escrita em ambos os sentidos de troca assíncrona, persistência/F5, V2 legado, aliases, estoque e identificadores, e instrumenta chaves lidas/escritas para confirmar isolamento. Integração cobre operador/developer no mesmo ISBN, cadastro admin/operator, resultado tardio e o card real com confirmação antiga/tardia. runCanonicalMetricsRegressionTests via esbuild em memória já instalado — quatro cenários de métricas/CSV aprovados. npm.cmd run lint e npm.cmd run build — aprovados; build com aviso existente de bundle acima de 500 kB (1.139,48 kB). git diff --check e verificações de whitespace dos dois arquivos novos via git diff --no-index --check -- NUL — sem erros. Conferidos git status, git diff --stat e git diff.

Limites e compatibilidade: validações isoladas usam o serviço e componentes reais, com hooks/JSX/timers/Supabase/DOM controlados; não houve nova homologação visual nem acesso a banco real. A correção impede novas contaminações. Registros que já estavam nas chaves operacionais, inclusive eventuais resíduos de testes anteriores sem origem identificável, foram preservados conforme solicitado e não são inferidos/removidos. Git status: modificados RELATORIO_CODEX.md, src/App.tsx, src/components/SearchHistoryGroup.tsx, src/components/magazord/MagazordStatusCard.tsx, src/components/magazord/ProductRegistrationForm.tsx, src/services/magazordMockService.ts, src/types.ts e tests/operations.test.mjs; novos tests/history.test.mjs e tests/magazordIsolation.test.mjs. Parte do diff é herdada das etapas anteriores.

| Alteração | Arquivo | Função / símbolo | Linhas finais | Implementação |
| --- | --- | --- | --- | --- |
| Chaves e estrutura dos datasets | src/services/magazordMockService.ts | constantes de storage / SimulatedRecord.sku / SimulatedCatalog / SandboxCatalogs | 36–39; 51; 55–56 | Mantém V3/V2/config existentes e acrescenta uma chave sandbox com namespaces por cenário e SKU opcional de fixture. |
| Aliases canônicos | src/services/magazordMockService.ts | normalizeMode | 89–93 | Aliases legados compartilham exatamente o dataset do cenário equivalente. |
| Leitura da raiz sandbox | src/services/magazordMockService.ts | getSandboxCatalogs | 95–103 | Lê somente a chave sandbox, validando objeto e retornando vazio em ausência/falha. |
| Seleção de fonte de catálogo | src/services/magazordMockService.ts | getSimulatedDb | 109–151 | Modos forçados leem somente o namespace sandbox; Auto conserva leitura/migração V3/V2 operacional. |
| Gravação com isolamento | src/services/magazordMockService.ts | saveSimulatedDb | 153–166 | Sandbox grava somente a nova chave e retorna; Auto grava V3/V2 sem consultar/copiar sandbox. |
| Fixtures persistentes do cenário | src/services/magazordMockService.ts | ensureSandboxFixtures | 169–196 | Materializa e reutiliza referências Novo/Usado/Múltiplos apenas no sandbox; preserva saldo e não copia o operacional. |
| Consulta direta/por Filho | src/services/magazordMockService.ts | getRecordsForEan | 201–203 | Usa o modo da origem em ambas as buscas, sem fallback entre datasets. |
| Checagem assíncrona e estoque reencontrado | src/services/magazordMockService.ts | checkProductByEan | 226–236; 244; 273; 303; 330 | Captura o modo antes do await; cenários encontrados usam fixtures persistidas, Auto usa somente o catálogo operacional e erro respeita a origem. |
| Incremento/reaproveitamento isolado | src/services/magazordMockService.ts | addStockToExistingProduct | 465–475; 509; 523 | Snapshot antes do await, fixture quando pertinente e leitura/escrita no mesmo contexto para atualização e fallback Novo. |
| Criação/atualização Novo e exemplares Usados | src/services/magazordMockService.ts | createProduct | 539; 543; 552; 588 | Erro, leitura, inserção/atualização e gravação usam a origem; regras comerciais existentes mantidas. |
| Complementação sem leitura cruzada | src/services/magazordMockService.ts | complementExistingProduct | 605–613 | Captura contexto no parâmetro e repassa à leitura após await; continua sem persistência. |
| Captura e autorização da origem na UI | src/App.tsx | currentUserRef / checkActionMode / captureActionMode / canShowActionResult | 60–68 | Preserva modo para developer e Auto para perfis restritos; checa perfil/modo atuais antes de exibir conclusão tardia. |
| Proteção da troca de perfil/F5 | src/App.tsx | canViewCheck / visibleMagazordCheck / efeito por role | 95–102 | Oculta resultado de sandbox para admin/operator e restaura configuração Auto sem apagar/copiar catálogos. |
| Consulta composta e estado tardio | src/App.tsx | runMagazordCheck / handleSearch | 123; 129–133; 161–164; 180 | Repassa origem bibliográfica à consulta mock; controla exibição sem interferir na classificação de histórico. |
| Vinculação sem contaminar saldo atual | src/App.tsx | handleLinkStock | 354; 357; 361; 376; 407–408 | Usa somente resultado autorizado, repassa contexto à mutação e impede atualização visual tardia sobre outro contexto. |
| Rechecagem pós-cadastro | src/App.tsx | handleSuccessRegistration | 440; 489–496 | Reconsulta no mesmo namespace da criação, controla resultado tardio e trata falha de atualização sem novo INSERT. |
| Props de resultado e contexto de cadastro | src/App.tsx | MagazordStatusCard / ProductRegistrationForm | 697; 699; 750 | Entrega somente resultado autorizado e a função de captura ao formulário. |
| Origem única de envio e histórico | src/components/magazord/ProductRegistrationForm.tsx | ProductRegistrationFormProps / handleSubmit | 36; 47; 119; 128; 131 | Captura na submissão e repassa o mesmo modo ao serviço e callback de sucesso. |
| Confirmação de estoque por contexto | src/components/magazord/MagazordStatusCard.tsx | stockLinkResult / stockLinkSuccess / handleLinkStockSubmit | 13; 58–62; 70–88 | Etiqueta origem na confirmação, oculta resultados de outro perfil/cenário e encaminha contexto no fallback direto. |
| Expectativas de leitura/estoque corrigidas | tests/history.test.mjs | harness / reaproveitamento / retry / troca para admin | 12; 178; 264–266; 343; 493 | Inclui card real; Múltiplos usa saldo inicial 4, retry retém a origem e admin não recebe resultado tardio de sandbox. |
| Integração do cenário obrigatório | tests/history.test.mjs | teste Developer sandbox stock remains separate | 513–535 | Mesmo ISBN entre operador/developer: Auto ausente, sandbox 3 -> 5, volta Auto ausente; Histórico e operations continuam classificados. |
| Proteção admin/operator em consultas e cadastros | tests/history.test.mjs | testes parametrizados queries only Auto | 537–554 | Configuração forçada anterior não provoca leitura/escrita sandbox nesses perfis; cadastro operacional não altera sandbox. |
| Saldo tardio na tela do operador | tests/history.test.mjs | teste A late sandbox stock completion | 556–571 | Sandbox concluído tardiamente não altera saldo operacional 7 nem substitui a consulta exibida; histórico test/operations mantidos. |
| Confirmação antiga/tardia no card real | tests/history.test.mjs | testes parametrizados The real card hides | 573–592 | Confirmação de sandbox já concluída ou pendente deixa de aparecer após trocar para operador, mantendo a ação operacional disponível. |
| Harness do serviço real sem dependências novas | tests/magazordIsolation.test.mjs | output / setup / seedOperational | 1–47 | Compila em memória e controla timers/storage, recarga de instância e instrumentação de chaves. |
| Reprodução e operacional já existente | tests/magazordIsolation.test.mjs | testes Required reproduction / Sandbox reuse | 49–87 | Reproduz ISBN obrigatório e mantém saldo operacional 7 intocado durante reaproveitamento, Novo e Usado de teste. |
| Não Encontrado e identificadores | tests/magazordIsolation.test.mjs | testes parametrizados created novo/usado | 89–111 | Três modos/aliases, seis casos: produtos, Pai/Filho, quantidade e descrição existem somente no namespace correspondente. |
| Usados e múltiplos cenários | tests/magazordIsolation.test.mjs | testes Used edition / Multiple matches | 113–155 | Usados independentes, SKU/fixtures, preservação dos saldos e isolamento entre cenários/alias canônico. |
| Trocas assíncronas de fonte/destino | tests/magazordIsolation.test.mjs | testes Async query / stock / create | 157–194 | Consulta, criação e estoque preservam contexto em test -> Auto e Auto -> test. |
| Snapshot explícito e complementação | tests/magazordIsolation.test.mjs | testes Explicit caller / Complement reads | 196–223 | Todas as APIs respeitam origem explícita; complementação lê o contexto original e permanece sem mutação. |
| Erro pela origem | tests/magazordIsolation.test.mjs | teste Forced errors | 225–240 | Cadastro iniciado em erro continua falhando após Auto; cadastro Auto continua operacional quando erro é ativado durante o await. |
| F5 e preservação de legado operacional | tests/magazordIsolation.test.mjs | testes F5 reloads / Existing V2 | 242–279 | Recria instância e mantém ambos os datasets, sem promoção/merge; V2 único conserva dados e compatibilidade de escrita Auto. |
| Instrumentação de isolamento de leitura | tests/magazordIsolation.test.mjs | teste Operational reads never access sandbox | 281–296 | Verifica chaves consultadas por cada API e ausência de escrita operacional durante ações forçadas. |
| Documentação do diagnóstico e isolamento | RELATORIO_CODEX.md | seção Isolamento do Sandbox Magazord | 433–492 | Acrescenta diagnóstico completo, arquitetura, preservações, cobertura, validações, limites e mapa exato, sem alterar o histórico anterior. |

## Gestão de Usuários Etapa 1 — 05/10/2026

Implementada a listagem somente leitura em Configurações → Usuários, substituindo a identidade
única da sessão por usuários vinculados à loja atual. Esta revisão termina na Etapa 1.

### Estado inicial e arquivos preservados

Branch main; git status inicial continha somente os cinco arquivos B1 não rastreados em supabase/.
Não houve limpeza, stash ou reversão. CHECKPOINT_B1.md, migration, rollback, preflight e plano B1
permaneceram intactos, comparados por SHA-256 antes/depois. Nenhum SQL B1 foi executado.

Criados: src/services/usersService.ts, src/components/users/UserManagement.tsx e tests/users.test.mjs.
Modificados: src/components/SettingsView.tsx, tests/magazordMode.test.mjs e RELATORIO_CODEX.md.
UserContext, App, Header, tipos globais, cliente Supabase, dependências e demais telas não mudaram.

### Origem, permissões e comportamento

usersService usa o cliente frontend existente, com a sessão autenticada e RLS atuais. Recebe
currentUser.storeId do UserContext e lê apenas store_users com filtro store_id, sem filtro active.
A leitura é paginada por user_id, usando count exato e tamanho efetivamente recebido para evitar
truncamento no limite do servidor. Perfis correspondentes são lidos em profiles por lotes de até
100 IDs, apenas id/display_name/active. Nenhum acesso a auth.users, e-mail ou service_role.

Nome vem de display_name, sem espaços externos; nome vazio recebe o rótulo neutro “Sem nome”.
Roles internas permanecem admin/operator/developer, exibidas como Proprietário/Operador/Desenvolvedor.
Status Ativo exige vínculo e profile ativos; qualquer false resulta em Inativo. Vínculos inativos
e developer permanecem na lista. O contador usa o número de usuários retornados, não UserContext.users.
Profile ausente/inacessível ou erro em qualquer consulta gera erro tratado, sem diretório parcial
ou status inventado. Leituras só exibem o que as RLS atuais autorizam; não se contorna restrição.

Admin e developer mantêm Configurações via canViewSettings existente. Operator segue sem acesso
no App; o componente também usa essa mesma permissão e não consulta quando ela é falsa.
Não há seleção multiloja, edição, Novo Usuário, convite, criação Auth, mudança de role/status,
Edge Function, audit_logs, migration, RLS nova ou implementação da Etapa 2.

UserManagement carrega somente ao abrir a aba, mostra carregamento, vazio, erro com nova tentativa
e tabela Nome/Perfil/Status. O contador aparece após sucesso, inclusive zero para lista vazia.
O visual mantém os padrões slate/blue e bordas da tela. Não existem controles administrativos.
AbortController e a chave conta/loja/role/permissão cancelam leituras e ocultam resultados antigos
ao mudar contexto; desmontar a aba cancela o carregamento. UserContext não virou diretório global.

### Validação executada

- 131 testes aprovados: 108 existentes nas cinco suítes e 23 novos em tests/users.test.mjs.
- Novos cenários: três rótulos, quatro combinações de status, isolamento por loja, inativos/developer,
  paginação acima de 1000, vazio, erros/transportes, profiles indisponíveis, abort, interface, retry,
  acesso admin/developer, negação operator, troca de loja/conta e resposta tardia.
- O harness Magazord isola UserManagement como componente de outra funcionalidade, sem carregar
  o cliente Supabase real; os testes de usuários exercitam o service e o componente reais em memória.
- Comando: node --test --test-reporter=dot tests/users.test.mjs tests/operations.test.mjs
  tests/production.test.mjs tests/history.test.mjs tests/magazordMode.test.mjs tests/magazordIsolation.test.mjs.
- npm.cmd run lint e npm.cmd exec tsc -- --noEmit aprovados.
- npm.cmd run build aprovado; Vite avisou de chunk acima de 500 kB. Sem mudança de bundling.
- git diff --check aprovado; whitespace dos arquivos novos também conferido, pois são não rastreados.

Não houve conexão real ao Supabase nesta implementação nem login/inspeção visual com contas reais.
Os testes usam dados sintéticos e SDK simulado; a homologação visual/RLS real permanece para o usuário.

### Homologação visual

1. Executar npm.cmd run dev e abrir a URL mostrada no terminal (porta padrão 3000).
2. Entrar como developer e abrir Configurações → Usuários. Conferir loja atual, nomes reais,
   contador, rótulos Proprietário/Operador/Desenvolvedor e ausência de botões administrativos/e-mail.
3. Sair, entrar como admin e repetir a conferência da mesma aba.
4. Sair e entrar como operator: Configurações deve continuar ausente/inacessível.
5. Conferir Inativo somente se já houver vínculo/profile inativo nessa loja; não criar/inativar dados.
6. Para observar carregamento, usar throttling no DevTools e reabrir a aba; para erro, ativar Offline,
   reabrir a aba, restaurar a rede e usar Tentar novamente. Lista vazia depende dos registros autorizados.
7. Nas requisições de rede, conferir SELECTs de store_users filtrados pela loja e profiles pelos IDs
   correspondentes, sem writes. Não compartilhar tokens ou respostas com dados pessoais.

## Mapa preciso de alterações — Gestão de Usuários Etapa 1

| Alteração | Arquivo | Função / símbolo | Linhas finais | Implementação |
|---|---|---|---|---|
| Modelo de usuário da loja | src/services/usersService.ts | StoreUser / StoreMembership / StoreProfile | 4–22 | Tipos locais derivados somente das colunas existentes. |
| Rótulos e erro tratado | src/services/usersService.ts | USERS_LOAD_ERROR / storeUserRoleLabel / storeUserStatusLabel | 24–31 | Mantém códigos internos; rótulos em português e mensagem sem detalhes internos. |
| Leitura restrita e paginada | src/services/usersService.ts | loadStoreUsers | 34–53 | SELECT de vínculos por store_id, ordenação, count, paginação e cancelamento. |
| Perfis e status efetivo | src/services/usersService.ts | loadStoreUsers | 55–79 | Perfis pelos IDs, validação sem resultado parcial, status por ambas as flags e ordem por nome. |
| Carregamento próprio e contexto | src/components/users/UserManagement.tsx | UserManagement / useEffect / contextKey | 7–28 | Loja/conta/permissão atuais, cancelamento, retry e proteção contra resultado antigo. |
| Estados e contador | src/components/users/UserManagement.tsx | UserManagement | 30–62 | Título, contador real, carregamento, erro tratado e vazio. |
| Tabela somente leitura | src/components/users/UserManagement.tsx | UserManagement | 63–93 | Nome/Perfil/Status; sem e-mail, UUID visível ou controles administrativos. |
| Substituição da aba | src/components/SettingsView.tsx | SettingsView / UserManagement | 9, 25, 121, 239–242 | Remove lista da sessão, contador falso e conteúdo antigo; integra componente próprio. |
| Isolamento do harness Magazord | tests/magazordMode.test.mjs | mocks | 18 | Isola o novo componente, preservando a suíte Magazord sem Supabase real. |
| Testes do service | tests/users.test.mjs | compile / sdk / testes de leitura | 1–146 | Usa service real com SDK simulado; cobre rótulos, flags, loja, limites e erros. |
| Testes do componente e acesso | tests/users.test.mjs | mount / testes da interface | 148–242 | Hooks controlados, helper real de permissão, estados, retry e respostas tardias. |
| Relatório desta etapa | RELATORIO_CODEX.md | Gestão de Usuários Etapa 1 / mapa | 494–580 | Escopo, origem, preservação B1, validação e passos de homologação; histórico anterior preservado. |

## Gestão de Usuários — Etapa 2: backend local para convites

Status: implementação local concluída para revisão, sem implantação. A Etapa 1 permanece
homologada visualmente; a Etapa 3 não foi iniciada. Nenhum acesso ao Supabase real foi feito
nesta etapa, nem SQL, alteração de secrets, mudança no MCP, criação de conta ou envio de convite.
Não houve commit/push. Branch main preservada.

### Arquivos e separação das etapas

Etapa 2: criados supabase/functions/manage-store-users/index.ts, handler.ts, deno.json
e tests/manageStoreUsers.test.mjs; este relatório recebeu somente a seção adicional.
Etapa 1: SettingsView.tsx, UserManagement.tsx, usersService.ts, tests/users.test.mjs e
tests/magazordMode.test.mjs permanecem byte a byte como estavam ao iniciar esta etapa.
Os cinco arquivos B1 (checkpoint, migration, rollback, preflight e plano de autorização)
também mantêm seus SHA-256 anteriores. Nada foi executado ou alterado nesses arquivos.
Não foi preparada a função opcional inviteStoreUser no frontend: a listagem aprovada permanece integral.

### Fluxo e autorização no servidor

A única ação é POST com JSON { action: 'invite_user', displayName, email, role }.
Nome obrigatório, trim, até 120 caracteres; e-mail obrigatório, trim, lowercase, até 254
caracteres e formato básico. Caracteres de controle e qualquer campo adicional são rejeitados,
inclusive actor_id, store_id, password, active e redirectTo. Não há senha temporária.

Authorization: Bearer é validado com auth.getUser(token), sem confiar na decodificação
local do JWT ou em roles da metadata. Profile, vínculo e loja precisam estar ativos.
A loja vem do primeiro vínculo ativo do caller, ordenado por store_id, exatamente como
loadIdentity no UserContext. Se esse primeiro vínculo for operator, outro vínculo admin
não permite selecionar uma segunda loja. Não existe escolha de loja no payload.
Somente caller admin/developer pode convidar; operator ou caller sem profile/vínculo ativo
recebe 403. Destino somente admin (Proprietário) ou operator (Operador); developer,
perfil desconhecido ou campo extra recebe 400. A autorização é revalidada antes do convite
e antes do INSERT do vínculo. Essas leituras não oferecem bloqueio transacional entre serviços.
Referência de validação do JWT: [auth.getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

O cliente administrativo existe somente no runtime da Edge Function. Lê SUPABASE_URL e
SUPABASE_SERVICE_ROLE_KEY do ambiente do servidor; não usa VITE_, persistência de sessão
ou JWT do caller nos headers padrão. Não há logs nem retorno de chave, JWT ou objeto Auth.
A dependência Deno é fixada em @supabase/supabase-js@2.117.2, mesma versão local validada.
Referência: [secrets das Edge Functions](https://supabase.com/docs/guides/functions/secrets).

CORS usa ISBN_ALLOWED_ORIGINS, lista de origens exatas separadas por vírgula, sem wildcard.
OPTIONS retorna 204 sem executar Auth; POST exige JWT mesmo em chamada direta sem Origin.
Respostas JSON usam Cache-Control: no-store e mensagens sem erros internos do SDK.
ISBN_INVITE_REDIRECT_URL é definida no servidor, deve pertencer às origens permitidas e conter
auth=recovery. Esse marcador reaproveita a tela de definição de senha já existente no app;
a aceitação completa do convite ainda depende de homologação futura, sem mudança na UI.

### Auth, profile e vínculo

Antes de convidar, listUsers verifica e-mail existente com paginação administrativa,
apenas no servidor. Conta existente retorna 409: "Já existe uma conta com este e-mail.",
sem informar loja, vínculo, senha ou perfil dessa conta. Não há upsert ou alteração de role.

inviteUserByEmail envia display_name e um identificador aleatório desta solicitação na
metadata, com redirectTo configurado no servidor. O trigger public.handle_new_auth_user()
é responsável por criar profiles: a função apenas verifica o profile ativo após o Auth,
sem inserir profile manualmente. Depois insere exclusivamente store_users com store_id
derivada, user_id retornado pelo Auth, role validada e active=true. Sucesso 201 retorna
somente success, message e user { id, displayName, role }.
Referência: [convite oficial](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail).

O Auth pode reutilizar uma conta não confirmada criada entre a consulta e o convite.
A metadata retornada deve conter o identificador aleatório desta solicitação; caso contrário,
a função retorna 409 e não cria/altera vínculos dessa conta. A API pode já ter enviado outro
e-mail nesse caso de concorrência. Esta proteção depende do comportamento atual do Auth e
deve ser homologada com a versão do projeto antes da publicação.
Referência do comportamento: [implementação oficial de invite](https://github.com/supabase/auth/blob/master/internal/api/invite.go).
A consulta paginada percorre o diretório Auth até uma página vazia e tem custo proporcional
ao número de contas; não retorna nem registra dados pessoais desse diretório.

### Falhas e limitação de atomicidade

Falha conhecida do convite retorna 502, conflito 409; falha de configuração, consulta ou
transporte inesperado retorna 503, sempre success=false. Sem JWT válido, 401; método diverso, 405.
Depois de sucesso do Auth, profile ausente/inativo, permissão revogada ou falha no INSERT
retorna 502 com code=membership_creation_failed e partial=true. A mensagem informa que
o convite foi enviado e o vínculo não foi concluído, solicitando verificação administrativa.

Auth e PostgREST não formam uma transação única. Podem restar conta/profile sem vínculo,
ou estado incerto em timeout do Auth/INSERT. Não há retry automático, exclusão do usuário,
revogação de convite ou rollback distribuído. Uma nova tentativa com conta já existente
é bloqueada; a conciliação precisa de análise administrativa em etapa autorizada separada.
Os códigos e mensagens ajudam o diagnóstico sem expor detalhes internos ao consumidor.

### Validação local concluída

- 188 testes aprovados: 131 preservados + 57 novos, usando mocks, sem rede ou convite real.
- Casos novos: todas as combinações admin/developer → admin/operator; operator, developer
  de destino, campos extras, nome/e-mail inválidos, JWT, profile/vínculo/loja inativos, loja
  externa, CORS, paginação, duplicidade, conta não confirmada concorrente, Auth e erro parcial.
- TypeScript geral e lint aprovados; o script lint deste repositório é tsc --noEmit.
- TypeScript strict isolado do backend aprovado com moduleResolution=bundler e libs ES2022,DOM.
- Build aprovado; aviso já existente de bundle acima de 500 kB.
- git diff --check aprovado; conferência adicional de whitespace nos arquivos novos.
- Deno CLI não está instalado neste ambiente. O runtime Deno e a resolução npm pelo deno.json
  ainda devem ser validados antes de deploy; os testes atuais executam o handler real via esbuild/Node.
- SHA-256 dos cinco arquivos B1 e dos cinco arquivos de código/testes da Etapa 1 preservados;
  conteúdo anterior deste relatório preservado.

### Passos para futura implantação (não executados)

1. Revisar esta implementação local e autorizar a implantação da função separadamente.
2. Validar com Deno check usando o deno.json local e ensaiar a função em ambiente isolado,
   com Auth/PostgREST simulados ou contas de teste expressamente autorizadas.
3. Confirmar SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY somente no backend. Configurar,
   em etapa autorizada, ISBN_ALLOWED_ORIGINS e ISBN_INVITE_REDIRECT_URL; incluir o redirect
   com auth=recovery na allowlist do Auth. Não publicar nenhuma dessas chaves no frontend.
4. Conferir gateway/JWT da Edge Function compatível com o projeto, preservando a validação
   getUser no handler; verificar SMTP/template de convite, entrega e tela existente de senha.
5. Após autorização de deploy, homologar com convites de teste permitidos: recebimento,
   definição da própria senha, primeiro login, profile, vínculo e isolamento entre lojas.
   Confirmar também conflito/concorrência e procedimento manual para falhas parciais.
6. Manter B1 e a Etapa 3 fora dessa implantação; nenhuma migration é necessária para este backend.

## Mapa preciso de alterações — Gestão de Usuários Etapa 2

| Alteração | Arquivo | Função / símbolo | Linhas finais | Implementação |
|---|---|---|---|---|
| Inicialização e segredo de servidor | supabase/functions/manage-store-users/index.ts | runtime / getAdminClient | 1–22 | Deno.serve, configuração de origem/redirect e cliente administrativo sem sessão persistida. |
| Dependência Deno | supabase/functions/manage-store-users/deno.json | imports / compilerOptions | 1–8 | SDK fixado em 2.117.2 e strict habilitado. |
| Contratos e erros tratados | supabase/functions/manage-store-users/handler.ts | InvitePayload / HandlerOptions / RequestError | 1–22 | Ação e perfis limitados, opções injetáveis, erros públicos sem detalhes internos. |
| Validação de entrada | supabase/functions/manage-store-users/handler.ts | validateInvitePayload | 24–47 | Trim, limites, e-mail lowercase, controles e whitelist de campos; rejeita developer. |
| Autorização e derivação da loja | supabase/functions/manage-store-users/handler.ts | authorizedStore | 49–68 | Profile ativo, primeiro vínculo ativo por store_id, admin/developer e loja ativa. |
| Duplicidade prévia | supabase/functions/manage-store-users/handler.ts | rejectExistingAccount | 70–80 | Diretório Auth paginado só no backend; conflito genérico sem alteração de conta. |
| CORS, método e autenticação | supabase/functions/manage-store-users/handler.ts | createManageStoreUsersHandler | 82–119 | Origem exata, OPTIONS, POST, Bearer validado pelo Auth, JSON e redirect controlado. |
| Convite e proteção de concorrência | supabase/functions/manage-store-users/handler.ts | invitationRequestId / inviteUserByEmail | 121–137 | Revalida caller, metadata display_name, nonce e rejeição de conta reutilizada. |
| Profile automático e novo vínculo | supabase/functions/manage-store-users/handler.ts | newProfile / insert / resposta 201 | 139–149 | Confere resultado do trigger e insere somente store_users com loja derivada e role validada. |
| Erro parcial e sanitização | supabase/functions/manage-store-users/handler.ts | catch / invited | 150–158 | 502 partial após Auth; falhas gerais sem detalhes sensíveis e sem rollback automático. |
| Harness local | tests/manageStoreUsers.test.mjs | setup / esbuild | 1–96 | Handler real compilado em memória, Auth e tabelas simulados, nenhuma rede. |
| Autorizações e validações | tests/manageStoreUsers.test.mjs | testes parametrizados / validateInvitePayload | 98–170 | Combinações de perfis, primeira loja, payload externo, validações e JWT. |
| CORS, conflitos e falhas | tests/manageStoreUsers.test.mjs | testes parametrizados | 172–247 | Métodos, paginação, nonce concorrente, Auth, profile, revogação e vínculo parcial. |
| Segredos e preservação do frontend | tests/manageStoreUsers.test.mjs | teste do entry point | 249–259 | Configuração sem VITE/logs/updates, SDK fixado e service da Etapa 1 sem integração administrativa. |
| Relatório da Etapa 2 | RELATORIO_CODEX.md | Gestão de Usuários Etapa 2 / mapa | 581–715 | Fluxo, segurança, testes, limitações, preservação e requisitos futuros de deploy. |

## Gestão de Usuários — Etapa 2B: implantação e homologação do backend

Em 05/10/2026, manage-store-users foi implantada exclusivamente no projeto ISBN já
identificado pelo frontend e MCP. Management API confirmou status ACTIVE, versão 1,
com verify_jwt=true. Nenhuma outra função existia ou foi publicada. Branch main mantida;
sem migration, B1, alteração de schema, commit ou push. A única criação de dados foi
o convite real autorizado, detalhado abaixo. Etapa 3 não iniciada.

### Runtime e preservação local

Deno 2.9.6 e Supabase CLI 2.119.0 obtidos temporariamente via pacotes oficiais npm,
em cache fora do repositório; sem Docker, instalação global ou mudança de dependências.
deno check --no-lock --config supabase/functions/manage-store-users/deno.json passou
para index.ts e handler.ts. A inicialização real do index.ts com Deno.serve, SDK real
e Auth/PostgREST locais simulados passou: sem JWT 401, destino developer 400, JSON
malformado 400; origem local permitida, externa rejeitada; zero convites/gravações.
Nenhuma correção funcional da Edge Function foi necessária.

Os 188 testes existentes, TypeScript, lint e build passaram na primeira parte desta
Etapa 2B. Build mantém aviso conhecido de bundle acima de 500 kB. git diff --check
passou. SHA-256 dos cinco arquivos B1, dos cinco arquivos de código/testes da Etapa 1
e dos quatro arquivos de código/testes da Etapa 2 permanecem iguais ao início da etapa.
Somente este relatório recebeu alterações locais nesta execução.

### Implantação e configuração conferida

Deploy oficial executado com functions deploy manage-store-users, projeto explicitamente
informado, --use-api e --import-map supabase/functions/manage-store-users/deno.json.
Somente index.ts, handler.ts e deno.json foram enviados; nenhuma migration executada.

Antes da configuração, a lista de secrets customizados estava vazia. Criados somente
ISBN_ALLOWED_ORIGINS=http://localhost:3000 e
ISBN_INVITE_REDIRECT_URL=http://localhost:3000/?auth=recovery.
Após deploy, os nomes SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY foram confirmados
entre as variáveis fornecidas pelo runtime; não foram criados, copiados para o frontend
ou impressos. Tokens/chaves/senhas permanecem fora deste relatório e do Git.

Auth já tinha site_url=http://localhost:3000, e-mail habilitado e SMTP configurado;
não havia URL de produção na configuração consultada nem redirects adicionais.
Foi acrescentado somente http://localhost:3000/?auth=recovery à uri_allow_list,
preservando site_url e as demais configurações. CORS continua configurável por lista
de origens exatas no servidor, permitindo acrescentar uma origem de produção quando
ela for definida, sem wildcard. JWT público do projeto usa ES256; não houve mudança
de chave ou algoritmo. A função mantém sua validação auth.getUser e autorização própria.

### Testes na função publicada

- POST sem JWT: 401, code=unauthenticated, sem criar usuário.
- OPTIONS da origem http://localhost:3000: 204 com origem exata e headers esperados.
- OPTIONS de origem externa: 403.
- Payload role=developer com sessão autorizada do aplicativo: 400, code=invalid_payload.
- JSON malformado com a mesma sessão autorizada: 400, code=invalid_payload.

Os três negativos foram confirmados na função publicada após o usuário fornecer sua
sessão existente pela passagem local. Todos passaram; nenhuma tentativa de convite
foi executada durante os negativos. A autenticação do CLI administra o projeto; o JWT usado nestes testes
foi validado pelo Auth do aplicativo e pela autorização própria da função.

Uma passagem temporária vinculada somente a 127.0.0.1 e à origem local permitida foi
preparada fora do repositório. O usuário forneceu sua sessão já existente pelo navegador;
JWT permaneceu somente na memória do processo, sem logs ou arquivo. Os dois payloads
negativos não contêm um convite válido. Nenhum usuário, senha, link de acesso ou sessão
de outra conta foi criado para executar os testes.

### Aceite e teste real

O código existente reconhece ?auth=recovery antes de carregar a identidade e apresenta
ResetPassword, que chama auth.updateUser({ password }), encerra a sessão após sucesso
e volta ao login. Isso foi conferido no código; entrega do e-mail, abertura do link,
definição de senha e primeiro login ainda não foram observados com um convite real.
Nenhuma interface específica de convite foi criada.

Leitura do banco confirmou o trigger de criação de profiles via metadata display_name,
default active=true e três profiles/três vínculos existentes antes do convite. Nenhum
dado foi alterado nos testes negativos. Depois deles, foi informado que o backend estava
pronto e solicitados somente nome, e-mail e perfil para autorizar o convite único.

### Resultado do único convite real autorizado

O usuário confirmou Adalberto, o e-mail Gmail informado na conversa e Proprietário.
Foi executada uma única chamada invite_user com role=admin pela função publicada,
usando a sessão existente validada nos negativos. HTTP 201, success=true, sem erro parcial.
Nenhum retry ou segundo convite foi executado. Não houve criação manual de profile,
inserção SQL administrativa ou alteração de conta/vínculo preexistente.

Verificação posterior por SELECT, sem retornar UUIDs, chaves, tokens ou metadata completa:

- Auth: exatamente uma conta com o e-mail autorizado; invited_at e confirmation_sent_at
  preenchidos, display_name na metadata igual a Adalberto. E-mail ainda não confirmado
  no momento da leitura; entrega na caixa postal e aceite aguardam o usuário.
- profiles: criado pelo trigger existente, display_name=Adalberto e active=true.
- store_users: exatamente um vínculo para a nova conta, na única loja existente do projeto,
  role=admin (Proprietário), active=true; loja também ativa.

A passagem temporária foi encerrada após a verificação e o JWT descartado da memória.
O e-mail completo foi omitido deste relatório; nenhum UUID completo foi registrado.

Homologação do convidado: manter o ISBN em http://localhost:3000 em execução, abrir o
e-mail e seguir o link preferencialmente em janela anônima; definir e confirmar senha
de pelo menos oito caracteres na tela existente Definir nova senha. Após salvar e voltar
ao login, entrar com o e-mail convidado e a nova senha. Como Proprietário, conferir acesso
a Configurações → Usuários e Adalberto ativo na lista. Link inválido/expirado ou ausência
do e-mail exigem diagnóstico; não executar novo convite automaticamente.

Recebimento, abertura do link, definição de senha, primeiro login e acesso visual pelo
convidado ainda dependem dessa homologação. Nenhuma tela nova foi criada.

Referências: [deploy via CLI](https://supabase.com/docs/reference/cli/supabase-functions-deploy),
[secrets do runtime](https://supabase.com/docs/guides/functions/secrets),
[Auth e headers da função](https://supabase.com/docs/guides/functions/auth-headers),
[redirects](https://supabase.com/docs/guides/auth/redirect-urls).

## Mapa preciso de alterações — Gestão de Usuários Etapa 2B

| Alteração local | Arquivo | Implementação |
|---|---|---|
| Registro da implantação e homologação | RELATORIO_CODEX.md | Runtime Deno, deploy exclusivo, configuração remota, preservação, negativos executados e pendências antes do convite autorizado. |

Mudanças remotas desta etapa: publicação de manage-store-users, criação dos dois secrets
ISBN_ e inclusão do redirect local exato no Auth. Nenhum arquivo funcional foi alterado.

## Gestão de Usuários — Etapa 3: formulário Novo Usuário

Etapa 3 concluída localmente em 05/10/2026. A solicitação desta etapa confirmou a
homologação real da Etapa 2B: e-mail recebido, link aceito, senha definida, login feito
e perfil Proprietário funcionando. Esse aceite foi informado pelo usuário; nenhum
novo convite real ou acesso ao projeto Supabase foi executado nesta implementação.
Etapa 4 não iniciada. Branch main preservada, sem commit ou push.

### Arquivos e separação das etapas

- Etapa 1: listagem, contador, paginação, RLS, estados vazio/carregamento/erro/retry e
  status preservados. UserManagement.tsx recebeu a coordenação do painel e refresh;
  usersService.ts recebeu funções de convite após o código de leitura existente.
  tests/users.test.mjs adaptou o harness e as expectativas para o botão agora permitido.
  SettingsView.tsx e tests/magazordMode.test.mjs não mudaram nesta etapa.
- Etapa 2: index.ts, handler.ts e deno.json mantêm seus SHA-256 anteriores; nenhuma
  lógica funcional do backend foi alterada. Os 57 testes continuam presentes;
  apenas a asserção de separação frontend/backend em tests/manageStoreUsers.test.mjs
  foi ajustada para permitir functions.invoke e continuar proibindo segredos/admin/writes.
- Etapa 2B: deploy, secrets, CORS, redirect e Auth remoto preservados; nenhum redeploy.
- Etapa 3: criados src/components/users/NewUserForm.tsx e tests/userInvites.test.mjs;
  modificados UserManagement.tsx, usersService.ts, tests/users.test.mjs,
  tests/manageStoreUsers.test.mjs e este relatório. Dependências e configurações não mudaram.
- B1: checkpoint, migration, rollback, preflight e plano de testes mantêm os cinco
  SHA-256 do início da etapa; nenhum arquivo B1 foi executado ou alterado.

### Comportamento do formulário

Configurações → Usuários oferece + Novo Usuário para developer/admin, usando a
permissão existente canViewSettings. Operator continua sem Configurações no App;
UserManagement e NewUserForm também recusam renderização sem essa permissão.
O painel acompanha o padrão slate/blue, com labels Nome, E-mail e Perfil, Cancelar
e Enviar convite. Perfil começa sem seleção e oferece apenas Proprietário (admin)
e Operador (operator); Desenvolvedor continua na listagem se houver esse vínculo,
mas nunca aparece entre os perfis disponíveis para um novo convite.

Nome obrigatório, trim, até 120 caracteres; e-mail obrigatório, trim/lowercase,
formato básico e até 254 caracteres; caracteres de controle rejeitados em ambos.
Perfil obrigatório e limitado a admin/operator mesmo em chamadas diretas ao service.
O foco vai para Nome ao abrir e para o campo inválido na validação; ao fechar volta
ao botão de abertura. Enter envia o form nativo, sem necessidade de clicar no botão.
O painel usa aria-labelledby, aria-expanded/controls, aria-invalid/describedby,
aria-busy e feedback por role=status/alert; não é modal e não captura o foco em um ciclo.

NewUserForm usa uma trava síncrona em ref para bloquear submits concorrentes e uma
trava de conclusão para não reenviar após sucesso. Durante envio, campos e botões
ficam desabilitados, com Enviando... e feedback de carregamento. Cancelar fecha e
descarta os campos; reabrir começa limpo. Mudanças de conta/loja/role/permissão fecham
o painel e ocultam feedback anterior. Desmontagem e troca de contexto impedem efeitos
de respostas tardias; uma requisição já enviada não é abortada nem tratada como desfeita.

### Chamada ao backend e respostas

inviteStoreUser usa o cliente frontend já existente. Obtém a sessão via getSession,
confere a conta atual e a validade do contexto antes do envio, e chama
supabase.functions.invoke('manage-store-users') com POST e o JWT dessa sessão.
O body contém exatamente action='invite_user', displayName, email e role.
action é o discriminador obrigatório do contrato existente; actor_id, store_id,
password, redirect, flags e quaisquer dados extras não são transmitidos.
Nenhuma chave administrativa ou Auth Admin foi acrescentada ao frontend. O backend
continua validando o JWT e as permissões e derivando a loja como barreira real.
Referência: [invoke oficial](https://supabase.com/docs/reference/javascript/functions-invoke).

HTTP 201/success=true fecha e limpa o painel, mostra Convite enviado com sucesso
para o e-mail normalizado e recarrega a lista/contador pela leitura existente.
Falha na atualização da lista mantém a confirmação do envio e o erro/retry de leitura;
Tentar novamente nesse caso repete somente SELECTs e nunca outro convite.

FunctionsHttpError mantém o JSON de erro em Response, mesmo quando data é null;
o service lê uma cópia desse body. 409 recebe Já existe uma conta com este e-mail,
sem dados de outras lojas; 401/sessão ausente ou alterada pede novo login; 403 informa
falta de permissão; 400 pede conferência dos campos; 429 orienta aguardar. Falhas
conhecidas antes do convite (configuração/autorização/consulta de duplicidade)
informam indisponibilidade. Mensagens do SDK/backend, stacks, UUIDs e JWT não são exibidos.

partial=true tem prioridade inclusive sobre uma resposta success=true: informa que
o convite foi criado, o vínculo falhou e é necessária revisão antes de tentar novamente.
Falha de rede, resposta inesperada ou resultado incerto também pedem revisão, pois
um convite pode ter sido enviado antes da falha. Nessas situações Enviar convite fica
bloqueado no painel atual; Cancelar continua disponível após o fim da requisição.
Reabrir o painel é uma decisão manual, depois da revisão; não existe retry, reparo,
rollback, alteração de conta ou correção automática.

### Validação executada

- 229 testes aprovados: os 188 anteriores preservados, com expectativas de interface
  ajustadas, e 41 novos em tests/userInvites.test.mjs.
- Novos testes exercitam os componentes/service reais compilados em memória e o
  FunctionsClient real, com Auth, SELECTs e transporte HTTP simulados, sem rede real.
- Cobertura: developer/admin/operator, abertura/cancelamento/campos limpos/foco/labels,
  roles/opções, campos obrigatórios/limites/normalização, payload exato/JWT atual,
  sucesso e refresh/contador, 409, partial, sessão/permissão/payload/indisponibilidade,
  rede/incerteza, duplo clique, erro de refresh, troca de contexto e resposta tardia.
- Comando: node --test --test-reporter=spec tests/*.test.mjs.
- npm.cmd exec tsc -- --noEmit e npm.cmd run lint aprovados; lint continua sendo tsc.
- npm.cmd run build aprovado; aviso preexistente de bundle acima de 500 kB mantido.
- git diff --check aprovado; whitespace dos novos arquivos também conferido.
- SHA-256 confirmou backend, B1, SettingsView e harness Magazord sem alterações.

Nenhum convite real foi enviado nesta etapa. A homologação visual no navegador e o
envio manual pela nova interface ficam a critério do usuário; mocks não confirmam
entrega de e-mail nem substituem o teste visual.

### Passos exatos para homologação visual/manual

1. Executar npm.cmd run dev, se o servidor ainda não estiver ativo, e abrir
   http://localhost:3000. Entrar como Developer; abrir Configurações → Usuários.
   Conferir lista real, contador, rótulos e status e o botão + Novo Usuário.
2. Abrir o painel; conferir foco em Nome, labels, opções Proprietário/Operador e
   ausência de Desenvolvedor no select. Tentar enviar campos vazios/e-mail inválido;
   conferir mensagem/foco e ausência de requisição de convite. Preencher, Cancelar
   e reabrir: campos devem voltar vazios e o foco deve retornar corretamente.
3. Sair e entrar como Proprietário; repetir a abertura/validação. Sair e entrar
   como Operador: Configurações continua ausente/inacessível.
4. Ao decidir testar um convite real, entrar como Developer ou Proprietário,
   abrir Novo Usuário e informar nome, e-mail sob seu controle e perfil. Enviar uma
   vez (ou Enter): conferir Enviando..., campos/botões desabilitados, fechamento,
   mensagem com e-mail e atualização automática da lista e do contador.
5. Abrir o e-mail recebido, aceitar o link e definir a senha no fluxo já homologado.
   Entrar com a nova conta: Operador sem Configurações; Proprietário com
   Configurações → Usuários. Para testar 409 sem criar conta, usar e-mail já existente
   sob seu controle: deve aparecer Já existe uma conta com este e-mail.
6. Em falha parcial ou resultado incerto, conferir o aviso de revisão e não repetir
   o convite antes da revisão. Esses estados já estão cobertos por mocks; não provocar
   falhas de banco ou alterar permissões/dados para simulá-los nesta homologação.

## Mapa preciso de alterações — Gestão de Usuários Etapa 3

| Alteração | Arquivo | Função / símbolo | Linhas finais | Implementação |
|---|---|---|---|---|
| Coordenação e foco do painel | src/components/users/UserManagement.tsx | UserManagement / formKey / notice / previousFormKey | 6–24 | Estado local, fechamento por contexto e foco de retorno após o fechamento. |
| Botão e sucesso com refresh | src/components/users/UserManagement.tsx | botão / NewUserForm / onSuccess | 48–75 | Novo Usuário, painel com contexto, confirmação por e-mail e atualização pela leitura existente. |
| Estado e prevenção de envio duplicado/tardio | src/components/users/NewUserForm.tsx | NewUserForm / handleSubmit | 7–58 | Campos, refs, validação, trava síncrona, sessão/contexto e callbacks protegidos. |
| Campos, perfis e acessibilidade | src/components/users/NewUserForm.tsx | form / inputs / select | 60–91 | Painel nativo com labels/foco/ARIA; somente admin e operator como perfis de destino. |
| Feedback e controles de envio | src/components/users/NewUserForm.tsx | alert / status / buttons | 92–106 | Erro seguro, carregamento, Cancelar e Enviar com bloqueios durante envio/revisão. |
| Contrato e validação de convite | src/services/usersService.ts | InviteStoreUserInput / InviteStoreUserError / validateInviteStoreUserInput | 81–111 | Nome/e-mail normalizados, limites e perfis restritos; erro associado ao campo. |
| Sessão e invocação | src/services/usersService.ts | uncertainInvite / inviteStoreUser | 113–131 | Sessão da conta atual, guarda de contexto, POST com exatamente os quatro campos do contrato. |
| Parsing e erros seguros | src/services/usersService.ts | httpResponse / result / catch | 132–168 | Body do FunctionsHttpError, 409, partial prioritário, sessão/permissão e resultado incerto sem vazamentos. |
| Harness anterior adaptado | tests/users.test.mjs | mount / testes da listagem / retry | 155, 175–188, 214 | Suporte a refs, botão agora permitido e seleção explícita do retry; regressões mantidas. |
| Separação servidor/frontend preservada | tests/manageStoreUsers.test.mjs | teste Entry point | 249–260 | Permite a invocação frontend, mantém bloqueio de credenciais administrativas e writes diretos. |
| Harness integrado sem rede | tests/userInvites.test.mjs | compiled / sdk / mount | 1–135 | Componentes/service e FunctionsClient reais, Auth/HTTP/SELECTs simulados e foco controlado. |
| Contrato, sessão e respostas | tests/userInvites.test.mjs | testes do service | 137–186 | Normalização, payload, validações, sessão, HTTP real do SDK, partial e rede. |
| Interface, refresh e concorrência | tests/userInvites.test.mjs | testes de UserManagement / NewUserForm | 188–281 | Permissões, opções/foco, estados, sucesso, contador, erros, duplo envio e respostas tardias. |
| Relatório desta etapa | RELATORIO_CODEX.md | Gestão de Usuários Etapa 3 / mapa | 838–981 | Escopo, separação das etapas, comportamento, testes e roteiro de homologação manual. |

## Gestão de Usuários — Ajuste da Etapa 3: status de convite

Ajuste implementado em 05/10/2026. A lista distingue habilitação interna de confirmação
do convite por e-mail no Supabase Auth. Formulário, envio de convite, perfis comerciais,
lista/contador, permissões e etapas anteriores preservados. Sem commit ou push.

### Regra e fonte do status

- Inativo: profiles.active=false OU store_users.active=false, independentemente do convite.
- Convite pendente: ambos ativos, invited_at presente e email_confirmed_at ausente.
- Ativo: ambos ativos e convite confirmado; contas não originadas de convite continuam
  com a classificação de habilitação anterior.
- Badge pendente âmbar, ativo verde e inativo cinza, todos com rótulo textual.
- O campo active do service continua representando habilitação interna; status é o
  estado apresentado na coluna. Nenhum status modifica a permissão de login ou a role.

email_confirmed_at foi escolhido porque o modelo oficial Auth usa esse campo em
IsConfirmed; confirmed_at é de compatibilidade e também pode representar confirmação
de telefone. invited_at identifica a origem por convite. last_sign_in_at não é usado.
Referência: [modelo oficial do Supabase Auth](https://github.com/supabase/auth/blob/master/internal/models/user.go).

Limite semântico: o Auth confirma o e-mail ao verificar o link e pode gerar uma senha
temporária aleatória nessa operação, antes da escolha de senha no aplicativo.
Portanto, esta regra representa confirmação do convite, não uma prova independente
de que o usuário escolheu a senha. O fluxo manual continua exigindo definir a senha.
Nenhum marcador de onboarding, metadata de controle ou migration foi introduzido.
Referência: [verificação oficial do convite](https://github.com/supabase/auth/blob/master/internal/api/verify.go).

### Contrato administrativo e segurança

manage-store-users recebeu POST action=get_invitation_status com somente userIds,
entre 1 e 100 UUIDs distintos por requisição. A loja e o solicitante são derivados
do JWT validado e das permissões existentes, nunca do payload. Admin/developer precisam
ter profile, vínculo e loja ativos; operator continua recebendo 403.

Antes de consultar Auth, todos os IDs precisam pertencer à loja derivada. ID ausente
ou de outra loja rejeita a requisição inteira, sem consulta Auth desses alvos ou
divulgação de quais existem. A função usa getUserById para os alvos autorizados,
com no máximo dez consultas simultâneas, sem listUsers na ação de status.
A autorização do solicitante e os vínculos dos alvos são verificados novamente
antes de responder. Não existe transação conjunta entre Auth e PostgREST.

Resposta HTTP 200: success=true e users=[{id,invitePending:boolean}]. Não são devolvidos
e-mail, timestamps, JWT, metadata ou objeto Auth completo. Cache-Control permanece
no-store. Falha de dependência retorna erro seguro, sem sucesso parcial ou status inventado.
Referência: [getUserById oficial](https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid).

O frontend mantém as leituras públicas com RLS e paginação e pede o estado Auth apenas
dos usuários internamente ativos, em lotes de até 100. Usa functions.invoke com a sessão
do cliente existente; não acessa auth.users ou Auth Admin. Valida cobertura dos IDs,
duplicidades e booleanos; erro, resposta incompleta ou cancelamento impedem exibir
uma lista com usuários falsamente Ativos. Inativos não precisam da consulta Auth.

O refresh automático depois de HTTP 201 inclui essa leitura de status. Reabrir a
aba Usuários ou atualizar a página consulta Auth novamente, sem reenviar convites.
O botão existente Tentar novamente também repete apenas as leituras.

### Validação e implantação

- 273 testes aprovados: os 229 anteriores mantidos e 44 casos acrescentados.
- Casos novos: permissões, isolamento de loja, payload/limites, resposta mínima,
  confirmação nativa, independência de login/confirmed_at legado, falhas fechadas,
  revogação/vínculo removido, prioridade de Inativo, paginação, badges, cancelamento,
  refresh imediato após convite e reabertura após confirmação sem novo envio.
- node --test --test-reporter=spec tests/*.test.mjs aprovado.
- npx.cmd tsc --noEmit e npm.cmd run lint aprovados; lint continua sendo TypeScript.
- npm.cmd run build aprovado; aviso preexistente de bundle maior que 500 kB mantido.
- Deno check de index.ts com deno.json e --no-lock aprovado.
- git diff --check e conferência de whitespace dos arquivos novos aprovados.
- Publicada somente manage-store-users no projeto jcxdkrpmrfbrhzwbzhph pelo CLI
  existente com --use-api. Função ACTIVE, versão 2, verify_jwt=true.
- Checagens HTTP reais de leitura: sem JWT=401, JWT inválido=401,
  preflight local permitido=204, preflight de origem externa=403.
- Consulta HTTP positiva com sessão de admin/developer fica no roteiro manual abaixo;
  a execução automatizada positiva usou o handler/SDK reais com transporte simulado.
- Nenhum convite real, reenvio ou criação de conta neste ajuste. Nenhuma alteração
  em Auth/configuração, secrets, dados comerciais, schema, RLS ou migrations.
- SHA-256 confirmou NewUserForm.tsx, SettingsView.tsx, index.ts e deno.json intactos.
  Os cinco arquivos B1 também conservam os hashes anteriores e não foram executados.
  Dependências, configuração e arquivos Magazord não foram editados neste ajuste.

### Leitura real dos convites existentes

A consulta administrativa somente de leitura encontrou os dois usuários convidados,
Adalberto e Silveira, com profiles.active=true, store_users.active=true e
email_confirmed_at presente. A busca por convidados vinculados sem confirmação
retornou zero registros. A confirmação ocorreu depois do convite em ambos; a
configuração mailer_autoconfirm está false. Pela regra implementada, ambos são Ativos.

O caso real ANTES do aceite não pôde ser observado: não existe, na leitura atual,
um convidado vinculado com e-mail ainda não confirmado. Não se criou conta, não se
reenviou convite nem se alteraram campos para fabricar essa condição. A identificação
do usuário esperado foi solicitada; a transição pendente→confirmado passou nos mocks.
Não se afirma que a confirmação comprova escolha de senha ou aceite manual por pessoa.

### Passos exatos para homologar com o usuário já existente

1. Se necessário, iniciar npm.cmd run dev em C:\Desenvolv\isbn. Abrir
   http://localhost:3000 e atualizar a página para carregar o frontend ajustado.
2. Entrar como Desenvolvedor ou Proprietário. Abrir Configurações → Usuários.
   Localizar o usuário já convidado; não usar Novo Usuário nem reenviar o convite.
3. Se o convite desse usuário ainda não estiver confirmado no Auth, conferir
   Convite pendente com badge âmbar. Adalberto e Silveira já estão confirmados na
   leitura atual e devem aparecer Ativo; não é possível desfazer isso nesta homologação.
4. Para um convite existente efetivamente pendente, usar somente o e-mail já recebido,
   aceitar o link e definir a senha manualmente. Fazer esse fluxo em janela separada
   mantém a sessão administrativa disponível para conferir a lista.
5. Voltar à sessão administrativa; clicar em outra aba de Configurações e depois em
   Usuários, ou pressionar F5 e reabrir Configurações → Usuários. Conferir Ativo verde,
   mesmo usuário, mesmo perfil e mesmo contador, sem novo convite.
6. Opcionalmente, na aba Rede do navegador, conferir get_invitation_status com HTTP 200
   e resposta contendo somente success e users com id/invitePending. Não copiar tokens.
   Operator continua sem Configurações; não alterar contas/permissões para testar Inativo.

## Mapa preciso de alterações — Gestão de Usuários Etapa 3 — Status de Convite

As linhas abaixo correspondem aos arquivos finais deste ajuste; os mapas anteriores
descrevem suas respectivas etapas.

| Alteração | Arquivo | Função / símbolo | Linhas finais | Implementação |
|---|---|---|---|---|
| Validação e isolamento dos alvos | supabase/functions/manage-store-users/handler.ts | validateStatusPayload / assertStoreUsers | 24–41 | Payload mínimo, até 100 UUIDs distintos e pertencimento integral à loja antes de ler Auth. |
| Consulta administrativa de convite | supabase/functions/manage-store-users/handler.ts | readingStatus / get_invitation_status | 120–154 | Autorização existente, getUserById em grupos de dez, confirmação de e-mail e retorno mínimo após revalidação. |
| Falha segura de leitura | supabase/functions/manage-store-users/handler.ts | catch / status_unavailable | 197 | Erro sanitizado para exceção inesperada da nova ação; envio de convite preservado. |
| Modelo e rótulos | src/services/usersService.ts | StoreUserStatus / StoreUser / statusLabels | 4–12, 34–37 | Status separado da habilitação interna e três rótulos da interface. |
| Composição e consulta de status | src/services/usersService.ts | loadStoreUsers / enabledIds / pending | 74–108 | Inativo prioritário, invocação segura por lote, validação completa e cancelamento antes de publicar a lista. |
| Badges | src/components/users/UserManagement.tsx | user.status / storeUserStatusLabel | 112–118 | Âmbar pendente, verde ativo, cinza inativo, com texto. |
| Harness Auth e vínculos | tests/manageStoreUsers.test.mjs | setup / getUserById / query.then | 20–119 | Simulação separada de leitura Auth e alvos, sem interferir nos testes de convite. |
| Segurança e semântica do backend | tests/manageStoreUsers.test.mjs | statusPayload / testes de status | 286–363 | Escopo, roles, confirmação, payload, falhas, revogação e lote máximo. |
| Harness e compatibilidade da listagem | tests/users.test.mjs | sdk / statusCalls / statusLabel | 39–50, 97 | Mock independente de leitura de status e uso do novo rótulo. |
| Status, prioridade e refresh | tests/users.test.mjs | testes de status e badges | 253–321 | Pendência/inatividade, lotes, respostas inválidas, cores, reabertura e abort. |
| Harness integrado e refresh imediato | tests/userInvites.test.mjs | sdk / statusCalls / teste HTTP 201 | 38–84, 234 | Leitura de status sem contabilizar convite e asserção de pendência após criar em mock. |
| Aceite sem novo envio | tests/userInvites.test.mjs | teste de reabertura após aceite | 291–299 | Mock confirma o convite e a reabertura mostra Ativo sem segunda chamada de envio. |
| Registro do ajuste | RELATORIO_CODEX.md | Ajuste da Etapa 3 / mapa | 983–1116 | Regra, fonte oficial, limite semântico, segurança, testes, deploy, evidência real e roteiro manual. |

## Gestão de Usuários — Etapa 4: editar perfil e vínculo

Etapa 4 concluída em 05/10/2026, com implementação local validada e nova versão da
Edge Function publicada. Nenhuma alteração real de usuário, convite ou vínculo foi
executada durante a implementação. Homologação positiva real fica exclusivamente
manual, com usuários existentes. Etapa 5 não iniciada. Sem commit ou push.

### Arquivos e preservação

Criado src/components/users/EditUserForm.tsx. Alterados UserManagement.tsx,
usersService.ts, supabase/functions/manage-store-users/handler.ts, os testes
manageStoreUsers.test.mjs, userInvites.test.mjs, users.test.mjs e este relatório.
Os arquivos que já estavam modificados antes da Etapa 4 foram preservados.

Os SHA-256 do início/fim confirmaram NewUserForm.tsx, SettingsView.tsx, index.ts,
deno.json, tests/magazordMode.test.mjs e os cinco arquivos B1 intactos. Nenhum
checkpoint, migration, rollback, preflight ou plano B1 foi executado.
Dependências, UserContext, configurações, secrets, CORS e redirects não foram alterados.
Não há exclusão, edição de developer, edição de nome/e-mail/senha, banimento Auth,
multiloja, nova auditoria ou alteração de profiles.active nesta etapa.

### Ação backend, autorização e contrato

Nova ação POST update_user em manage-store-users. Body estrito: action, targetUserId
e pelo menos um dos campos role/active. targetUserId deve ser UUID; role só admite
admin/operator; active deve ser boolean. store_id, actor_id, e-mail, senha, dados
Auth e demais campos são rejeitados. O backend não usa dados de metadata para autorizar.

O JWT passa por auth.getUser; authorizedStore mantém caller autenticado, profile
ativo, primeiro vínculo ativo ordenado pela loja, role admin/developer e loja ativa.
A loja continua derivada do caller, sem parâmetro de escolha e sem multiloja.
Operator recebe 403. As permissões são verificadas outra vez antes do UPDATE.

O alvo precisa pertencer à mesma loja. Ausência e outra loja recebem o mesmo 404
target_not_found, sem divulgar dados da conta ou de outra loja. Developer alvo,
inclusive o próprio developer solicitante, recebe 403 developer_not_editable.
Role developer enviada recebe 400 invalid_role, mesmo que o alvo seja comercial.

Somente store_users.role e/ou store_users.active são atualizados. Cada UPDATE
filtra store_id, user_id, role anterior e active anterior. Se o alvo mudou desde a
leitura, não há sobrescrita: 409 target_changed. Isso também impede editar um alvo
promovido tecnicamente para developer entre a leitura e a escrita.
Resposta HTTP 200: success=true e user={id,role,active}, sem perfil/Auth completo,
JWT, e-mail ou metadata. Falhas de dependência recebem mensagem sanitizada.
Referência de UPDATE filtrado/retorno: [Supabase SDK](https://supabase.com/docs/reference/javascript/update).

### Último Proprietário e próprio acesso

Antes de retirar a habilitação de um admin com vínculo ativo, por rebaixamento a
operator ou active=false, o backend conta outros admins ativos na mesma loja.
A contagem é exata, sem depender do limite de linhas retornadas, exclui o alvo e
exige profiles.active=true e store_users.active=true nos outros Proprietários.
Convite pendente não introduz um critério adicional na contagem de habilitação.

Se não existir outro Proprietário ativo, retorna 409 last_active_admin:
“Não é possível alterar este usuário porque a loja precisa manter pelo menos um Proprietário ativo.”
Falha ou ausência de contagem bloqueia a alteração. Developer solicitante respeita
a mesma proteção; ele não substitui um Proprietário comercial na contagem.

Admin pode alterar/desativar a própria conta quando existir outro Proprietário ativo.
Depois desse sucesso, a página é recarregada para o UserContext existente reler o
vínculo e aplicar as novas permissões. Rebaixado perde Configurações; desativado
encontra o bloqueio existente de vínculo inativo. Nenhuma senha/token Auth é alterado.

Limite solicitado para esta etapa: a consulta de contagem e o UPDATE não formam
uma transação serializada. A comparação protege o estado de um mesmo alvo, mas
duas alterações simultâneas em Proprietários diferentes podem passar na contagem
antes das escritas. Não foram adicionados locks, SERIALIZABLE, RPC, triggers ou B1.
A homologação deste fluxo simples deve ser sequencial.

### Interface, refresh e erros

A tabela recebeu Ações. Somente admin/operator têm Editar; developer fica sem ação.
O painel segue o padrão de Novo Usuário, com Nome somente leitura, Perfil
Proprietário/Operador e Status Ativo/Inativo, Cancelar e Salvar. O foco inicial vai
para Perfil; o botão de origem recupera foco ao fechar. Há labels e estados ARIA.

membershipActive foi acrescentado ao modelo da lista para representar exclusivamente
store_users.active. O editor usa esse campo, não o status combinado da listagem.
Assim, editar alguém com profiles.active=false não reativa globalmente seu perfil.
O badge continua seguindo a regra anterior: Inativo prioritário, Convite pendente
quando habilitado e ainda não confirmado, e Ativo após confirmação do convite.
Editar perfil ou vínculo de um convidado não cancela nem reenvia convite Auth.

O service valida o input, lê a sessão da conta esperada, verifica contexto atual
antes do envio e chama a Edge Function com o JWT existente. Transmite somente os
campos alterados. Não há UPDATE direto pelo frontend. Salvar sem mudança fecha o
painel sem invocação de escrita. Novo Usuário e Editar ficam mutuamente exclusivos.

Uma trava síncrona bloqueia duplo submit. Durante salvamento, campos e Cancelar/Salvar
ficam desabilitados. Sucesso fecha o painel, mostra Usuário atualizado/desativado
com sucesso e refaz a leitura completa da lista/perfil/status, mantendo o contador.
Editar o perfil de alguém já inativo informa atualização, não nova desativação.
Falha do refresh preserva a mensagem de sucesso e oferece retry somente de leitura.

Mensagens amigáveis tratam último Proprietário, sessão/permissão, developer protegido,
alvo ausente/outra loja, role inválida, backend indisponível e falha de rede, sem stacks.
Resultado incerto, indisponibilidade da escrita ou alteração concorrente bloqueia
nova tentativa no painel: Cancelar fecha e atualiza a lista antes de editar novamente.
Não existe repetição automática de UPDATE. Mudança de conta/loja/role/permissão fecha
o painel; desmontagem e contexto alterado suprimem respostas tardias e refresh.

### Validação e deploy

- 359 testes aprovados: os 273 anteriores preservados, com expectativas da coluna
  Ações ajustadas, e 86 novos casos de backend/service/componentes.
- Cobertura mínima solicitada completa: admin/operator nos dois sentidos, developer
  caller, operator bloqueado, developer alvo/role bloqueados, ativar/desativar,
  outro Proprietário presente, último Proprietário, próprio acesso, outra loja,
  refresh, mensagens e duplo envio. Casos adicionais cobrem payload estrito, falhas
  de contagem/escrita, comparação do estado, pendência, profile inativo, sessão,
  cancelamento, respostas inválidas e retorno tardio. Todos os dados estão em mocks.
- node --test --test-reporter=spec tests/*.test.mjs aprovado.
- npx.cmd tsc --noEmit e npm.cmd run lint aprovados; lint continua sendo TypeScript.
- npm.cmd run build aprovado; aviso preexistente de bundle maior que 500 kB mantido.
- Deno check --no-lock de index.ts com deno.json aprovado.
- git diff --check aprovado, inclusive conferência --no-index --check dos novos arquivos.
- Deploy exclusivo de manage-store-users pelo CLI existente, --use-api, sem migrations.
  Projeto jcxdkrpmrfbrhzwbzhph; metadata após deploy: ACTIVE, versão 3, verify_jwt=true.
- Após deploy houve somente leitura de metadata para confirmar publicação. Não houve
  chamada real de update_user, edição real, banimento, convite ou reenvio.
- Leitura de catálogo confirmou o FK existente store_users.user_id → profiles.id,
  utilizado na contagem; nenhum DDL ou arquivo B1 foi executado.

### Passos exatos para homologação manual com usuários existentes

1. Se necessário, executar npm.cmd run dev em C:\Desenvolv\isbn. Abrir
   http://localhost:3000, atualizar com F5 e entrar como Desenvolvedor.
   Abrir Configurações → Usuários e anotar perfis/status originais dos alvos.
2. Conferir Ações: admin/operator possuem Editar; developer não possui ação.
   Abrir um comercial: Nome somente leitura, opções comerciais e Ativo/Inativo.
   Alterar campos e Cancelar: dados originais devem permanecer na lista.
3. Escolher um Operador existente. Alterar somente Perfil para Proprietário e Salvar.
   Conferir fechamento, sucesso, perfil atualizado e mesmo contador. Editar novamente
   e voltar a Operador; confirmar os mesmos comportamentos.
4. No mesmo Operador, salvar Status Inativo. Conferir badge e contador; em janela
   separada, o login dessa conta deve encontrar o bloqueio de vínculo inativo.
   Reativar pelo Desenvolvedor; confirmar o acesso novamente, sem mudar senha.
5. Havendo outro Proprietário ativo, desativar temporariamente um Proprietário
   comercial existente; conferir sucesso e reativá-lo. Também conferir seu
   rebaixamento/restauração de perfil mantendo outro Proprietário ativo.
6. Para testar a proteção, permanecer como Desenvolvedor e deixar, manualmente,
   exatamente um Proprietário comercial ativo. Anotar e restaurar depois cada perfil/
   status temporariamente alterado. No último Proprietário, tentar salvar Operador:
   deve aparecer a mensagem de manter pelo menos um Proprietário ativo, sem mudança.
   Cancelar/reabrir e tentar Inativo: deve ser bloqueado da mesma forma. Developer
   permanece intacto e não conta como Proprietário. Restaurar os demais vínculos.
7. Entrar como Proprietário e repetir uma edição de Operador existente, confirmando
   sua autorização. Para próprio acesso, somente havendo outro Proprietário ativo:
   rebaixar/desativar a própria conta em janela separada deve recarregar a página e
   aplicar a perda de Configurações/acesso; restaurar pelo Desenvolvedor.
8. Entrar como Operador: Configurações deve continuar ausente. Se existir convite
   ainda pendente, pode editar seu vínculo: Inativo ao desativar, Convite pendente
   ao reativar antes da confirmação, sem receber outro e-mail de convite.
9. Ao terminar, restaurar todos os perfis/vínculos anotados. Não criar usuários,
   reenviar convites, editar developer, alterar Auth ou executar migrations.

## Mapa preciso de alterações — Gestão de Usuários Etapa 4

Linhas finais desta etapa; mapas anteriores registram suas respectivas versões.

| Alteração | Arquivo | Função / símbolo | Linhas finais | Implementação |
|---|---|---|---|---|
| Contrato mínimo de edição | supabase/functions/manage-store-users/handler.ts | UpdatePayload / validateUpdatePayload | 24–41 | UUID, role comercial/active boolean e rejeição de campos extras. |
| Autorização do alvo | supabase/functions/manage-store-users/handler.ts | updateCommercialUser | 43–56 | Loja do caller, alvo comercial, developer bloqueado e revalidação do solicitante. |
| Último Proprietário | supabase/functions/manage-store-users/handler.ts | count / last_active_admin | 57–65 | Contagem exata dos outros Proprietários habilitados, com profile ativo, e erro amigável. |
| Escrita restrita e comparação | supabase/functions/manage-store-users/handler.ts | changes / updated / target_changed | 66–75 | Somente role/active do vínculo, filtros de loja/alvo/estado anterior e retorno mínimo. |
| Ação e falhas seguras | supabase/functions/manage-store-users/handler.ts | updating / update_user / catch | 174, 187–193, 258 | Dispatch administrativo com HTTP 200 e erro seguro para exceções de edição. |
| Flag exclusiva do vínculo | src/services/usersService.ts | StoreUser.membershipActive / loadStoreUsers | 12, 83 | Editor distingue habilitação do vínculo de profile/status Auth. |
| Contrato e validação frontend | src/services/usersService.ts | UpdateStoreUserInput / UpdateStoreUserError / validateUpdateStoreUserInput | 203–225 | Perfis comerciais, patch mínimo e erro com indicação de revisão. |
| Sessão, invocação e mensagens | src/services/usersService.ts | uncertainUpdate / updateStoreUser | 227–271 | JWT da conta atual, HTTP via Edge, parsing real do SDK e falhas sanitizadas sem retry automático. |
| Estado e envio do editor | src/components/users/EditUserForm.tsx | EditUserForm / handleSubmit | 5–38 | Snapshot do vínculo, payload só alterado, contexto, duplo submit e bloqueio de developer. |
| Campos e feedback | src/components/users/EditUserForm.tsx | form / inputs / selects / buttons | 40–77 | Nome readonly, opções comerciais, status do vínculo, foco, mensagens e controles. |
| Coordenação e foco | src/components/users/UserManagement.tsx | editing / editButton / previousEditKey | 13–28, 63 | Editor por contexto e exclusão simultânea com formulário de convite. |
| Sucesso e refresh | src/components/users/UserManagement.tsx | EditUserForm / onCancel / onSuccess | 84–98 | Fecha, informa resultado, recarrega leitura; próprio acesso força releitura da identidade pela página. |
| Ações comerciais | src/components/users/UserManagement.tsx | coluna Ações / Editar | 127, 144–155 | Botão somente para admin/operator; developer sem ação. |
| Harness backend | tests/manageStoreUsers.test.mjs | setup / updates / count / target | 20–136 | Leituras/UPDATE/contagem simuladas sem usuários reais. |
| Casos backend de edição | tests/manageStoreUsers.test.mjs | editPayload / testes update_user | 380–486 | Roles, vínculo, autorização, último Proprietário, próprio alvo, payload, falhas e comparação de estado. |
| Regressão da tabela | tests/users.test.mjs | testes da listagem para admin/developer | 182–202 | Coluna Ações e botões comerciais, preservando demais casos anteriores. |
| Harness integrado | tests/userInvites.test.mjs | compiled / load / sdk / mount | 6–157 | EditUserForm real, FunctionsClient real, escrita/refresh e reload em memória. |
| Casos service/interface de edição | tests/userInvites.test.mjs | editId / openEdit / changeEdit / testes | 316–495 | Patch/JWT, erros reais do SDK, painel, readonly/roles, vínculo, refresh, próprio acesso e concorrência. |
| Registro da etapa | RELATORIO_CODEX.md | Gestão de Usuários Etapa 4 / mapa | 1118–1299 | Implementação, limites, segurança, preservação, validação, deploy e roteiro manual. |

## Gestão de Usuários — Homologação Final

Homologação técnica da Etapa 5 concluída em 05/10/2026.
GESTÃO DE USUÁRIOS APROVADA PARA COMMIT.

Nenhum bloqueador real foi encontrado na revisão ou nos testes do escopo entregue.
A aprovação é técnica: não converte testes com dados simulados em homologação visual
ou login real. Os registros de homologação real estão discriminados abaixo.
Nesta etapa somente RELATORIO_CODEX.md foi alterado no repositório; não houve nova
funcionalidade, correção de código, mudança em outros módulos ou novo deploy.
Por isso não foi acrescentado Mapa preciso de alterações da Etapa 5.

### Funcionalidades entregues e permissões

| Perfil autenticado e habilitado | Listar usuários | Convidar Proprietário/Operador | Editar perfil/vínculo comercial | Administrar developer |
|---|---|---|---|---|
| Developer | Sim | Sim | Sim | Não |
| Proprietário (admin) | Sim | Sim | Sim | Não |
| Operador (operator) | Não acessa Configurações | Não | Não | Não |

A listagem traz nome, perfil, contador, status e Ações. Novo Usuário contém Nome,
E-mail e Perfil com somente Proprietário/Operador. invite_user usa Auth Admin no
backend, aproveita o profile automático e cria o vínculo da loja autorizada.
HTTP 201 fecha/limpa o formulário e atualiza lista e contador. Erros e resultado
incerto recebem mensagens seguras; não há reenvio automático ou criação de developer.

get_invitation_status devolve somente ID/pendência aos alvos da loja autorizada.
Inativo tem prioridade quando profile ou vínculo está desabilitado. Com ambos
habilitados, invited_at presente sem email_confirmed_at significa Convite pendente;
convite confirmado aparece Ativo. O frontend não acessa auth.users nem Auth Admin.

Editar oferece Nome readonly, Perfil comercial e Status do vínculo, Cancelar/Salvar.
update_user aceita somente targetUserId e campos role/active quando alterados.
A escrita atinge store_users; não modifica profiles.active, e-mail, senha ou Auth.
Alvo ausente/outra loja, role developer e alvo developer são rejeitados no backend.
Caller precisa de JWT válido, profile/vínculo/loja ativos e role admin/developer.

Retirar a habilitação de um Proprietário ativo exige outro Proprietário ativo, com
contagem exata no backend e mensagem amigável. Developer não substitui Proprietário
na contagem. A comparação do estado do alvo impede sobrescrever alteração concorrente
do mesmo vínculo. Duplo submit é bloqueado no frontend; não há retry automático.

Salvar fecha o painel e relê lista/perfil/status sem alterar o contador. A alteração
do próprio acesso recarrega a página para reler a identidade. Header/App usam as
permissões atuais; operador perde Configurações/Produção, e o vínculo inativo é
bloqueado pelo carregamento de identidade existente.

### Revisão e testes finais executados

- Suíte existente completa: 359 testes aprovados, zero falhas, cancelados ou ignorados.
  Comando: node --test --test-reporter=spec tests/*.test.mjs.
- A suíte cobre lista/RLS/paginação/contador, convite/contrato/trigger esperado, status,
  edição nos dois sentidos, ativação/reativação, caller operator, developer alvo/role,
  outra loja, último Proprietário, próprio acesso, refresh, erros e duplo envio.
- Nove verificações adicionais isoladas compilaram Login/UserProvider reais em memória:
  identidade/permissões de developer/admin/operator; vínculo inativo bloqueado;
  reativação voltando a permitir acesso; profile inativo bloqueado; mudança de role
  após releitura removendo Configurações; perda de vínculo após releitura; envio
  normalizado do login ao SDK. Todas passaram, com Auth/tabelas simulados e sem rede.
  Script temporário fora do repositório; os nove checks não aumentam a contagem
  de 359 testes da suíte e não fazem parte do commit.
- TypeScript: npx.cmd tsc --noEmit aprovado.
- Lint: npm.cmd run lint aprovado; o script existente é tsc --noEmit.
- Build: npm.cmd run build aprovado. Aviso conhecido de chunk maior que 500 kB
  mantido e não bloqueante, conforme solicitação.
- Deno: check --no-lock de index.ts com deno.json aprovado, utilizando runtime/cache
  temporários já existentes. Nenhuma função foi executada contra usuário real.
- git diff --check aprovado. Arquivos novos da entrega também conferidos com
  git diff --no-index --check.
- Servidor local existente: GET http://localhost:3000 retornou HTTP 200/text/html.
  Essa checagem não equivale a inspeção visual de navegador autenticado.
- SHA-256 dos arquivos existentes antes/depois comprova preservação de código,
  configurações, testes, módulos vizinhos e dos cinco arquivos B1.

### Regressão rápida dos demais módulos

| Área | Evidência na suíte existente |
|---|---|
| Consultar ISBN | history.test.mjs e magazordIsolation.test.mjs: consulta Auto/Modo Teste, resultados, falhas e troca de contexto. |
| Cadastro Novo/Usado | history.test.mjs e magazordIsolation.test.mjs: cadastro, estoque, reaproveitamento, condições e classificação. |
| Histórico e CSV | history.test.mjs: visibilidade por role, contador, colunas CSV e separação operacional/teste. |
| ProductionView | production.test.mjs: filtros, métricas, carregamento, vazio/erro e regressão CSV. |
| operations | operations.test.mjs: contrato, actor/loja, validações e persistência simulada por role. |
| Modo Teste | magazordMode.test.mjs: perfis, controles e configuração; mock de UserManagement já existente preservado. |
| Sandbox Magazord | magazordIsolation.test.mjs e history.test.mjs: separação dos catálogos, estoque, F5 e respostas tardias. |

Os testes exercitam código real com dependências externas simuladas. Nenhuma operação
real ISBN/Magazord/estoque foi criada nesta etapa. Nenhum arquivo desses módulos
precisou de correção.

### Homologações reais já registradas e leituras atuais

- Etapa 2B: função implantada; negativos reais sem JWT/origem externa e, pela sessão
  autorizada do usuário, role developer de destino/payload arbitrário rejeitados.
- Etapa 2B: único convite autorizado para Adalberto com perfil Proprietário,
  HTTP 201, profile automático e exatamente um vínculo na loja correta.
  Nenhum retry; JWT temporário descartado após a verificação.
- Etapa 3: o usuário informou recebimento do e-mail, aceite do link, definição da
  senha, login e funcionamento do perfil Proprietário. Esse relato foi registrado.
- Ajuste de status: leitura real confirmou os convites existentes no Auth e os
  estados internos habilitados; não havia convidado pendente naquele momento.
- Etapa 4: deploy da versão 3 confirmado. Não houve UPDATE real automatizado;
  edição/desativação/reativação/último Proprietário ficaram no roteiro manual.
- Etapa 5: leitura administrativa atual encontrou cinco vínculos habilitados:
  dois admins, dois operators e um developer, todos com profiles ativos.
  Há um convidado confirmado com vínculo admin e outro com vínculo operator;
  nenhum convite vinculado ainda pendente. Essa fotografia não prova quais
  ações manuais de edição foram realizadas.
- Etapa 5: catálogo confirmou handle_new_auth_user habilitado em auth.users.
  Metadata remota confirmou manage-store-users ACTIVE, versão 3, verify_jwt=true.

Não há confirmação explícita registrada de todos os casos visuais da Etapa 4.
Essa informação foi solicitada ao usuário para completar o registro; os casos
técnicos passaram na suíte e nas verificações isoladas. Não se presume login real
de todas as contas nem se cria um teste pendente artificial para homologação.

### Limitações conhecidas e acompanhamento não bloqueante

- Convite: email_confirmed_at confirma a verificação do link; não prova isoladamente
  a escolha da senha. Não existe novo marcador de conclusão de onboarding.
- Último Proprietário: contagem e UPDATE não são serializados entre alvos diferentes.
  Duas retiradas simultâneas podem passar na contagem; a proteção simples permanece
  exatamente no escopo aprovado, sem redesenho, locks ou B1.
- Permissões de outra sessão já aberta: o menu acompanha a releitura da identidade
  em login/F5/refresh de sessão; a própria alteração força reload. Não há push de
  invalidação de outras sessões nesta entrega. A função administrativa verifica
  habilitação e role a cada chamada.
- Falha parcial de convite/resultado incerto exige revisão; não há reparo automático.
- Prosseguir com o registro da homologação visual de edição/login com as contas
  existentes, conforme roteiro da Etapa 4, se ainda não confirmado pelo usuário.
- Otimização do bundle maior que 500 kB pode ser avaliada futuramente.
- B1, governança multiloja, serialização avançada e auditoria avançada continuam
  fora desta entrega. Não se estabelece autorização para executá-los futuramente.

### Git status e conjunto exato para o futuro commit

Antes de qualquer commit, o status apresenta três arquivos rastreados modificados:
RELATORIO_CODEX.md, src/components/SettingsView.tsx e tests/magazordMode.test.mjs.
Os componentes/service, testes de usuários, função, B1 e cache CLI estão como arquivos
não rastreados. Nenhum arquivo está no index; não houve git add, commit ou push.

Incluir exclusivamente estes 13 arquivos da Gestão Simples de Usuários:

- src/components/SettingsView.tsx
- src/components/users/EditUserForm.tsx
- src/components/users/NewUserForm.tsx
- src/components/users/UserManagement.tsx
- src/services/usersService.ts
- supabase/functions/manage-store-users/deno.json
- supabase/functions/manage-store-users/handler.ts
- supabase/functions/manage-store-users/index.ts
- tests/manageStoreUsers.test.mjs
- tests/magazordMode.test.mjs
- tests/userInvites.test.mjs
- tests/users.test.mjs
- RELATORIO_CODEX.md

tests/magazordMode.test.mjs entra porque sua única alteração integra o mock do novo
UserManagement ao harness antigo de Configurações; não modifica o comportamento Magazord.

Manter fora os cinco arquivos experimentais B1, não executados nesta entrega:

- supabase/CHECKPOINT_B1.md
- supabase/migrations/20261005000100_b1_authorization_hardening.sql
- supabase/preflight/b1_read_only.sql
- supabase/rollback/20261005000100_b1_authorization_hardening.sql
- supabase/tests/b1_authorization_plan.md

Também manter fora os artefatos locais do CLI:

- supabase/.temp/cli-latest
- supabase/.temp/linked-project.json

O conjunto específico evita incluir B1 ou cache por adição genérica do diretório
supabase. Nenhuma autorização de commit ou execução B1 foi inferida da aprovação
técnica. Encerramento da Etapa 5 neste ponto, aguardando a decisão do usuário.
