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
