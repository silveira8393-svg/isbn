# ISBN — correção das pendências MFA/TOTP

16/11/2026. Branch `feature/isbn-2fa-totp`, base aprovada `95e2c7d`.
**Preparação local; NÃO é autorização de publicação nem validação de produção.**

Nesta etapa não foi executado SQL no Supabase, criado ambiente, alterado usuário/dado real,
mudada configuração de Auth, publicado serviço, feito commit, merge ou deployment.
As alterações anteriores, inclusive `RELATORIO_CODEX.md`, foram preservadas.
Não houve alteração de funcionalidades bibliográficas/comerciais ou dependências.

## Arquivos criados ou modificados nesta correção

| Arquivos | Alteração |
| --- | --- |
| `supabase/setup/mfa_required_review.sql` | Policies restritivas nas 11 tabelas e proteção do helper dos RPCs. |
| `supabase/setup/mfa_rollback_review.sql` | Reversão apenas das policies marcadas e do helper auditado. |
| `supabase/setup/mfa_rpc_baseline.json` | Definições auditadas dos quatro RPCs/helpers, referência de drift/reversão sem dados. |
| `supabase/setup/mfa_storage_baseline.json` | Metadados originais das duas policies Storage. |
| `supabase/setup/mfa_storage_read_predicate.sql`, `mfa_storage_insert_predicate.sql` | Expressões completas para editar as duas policies existentes pelo painel. |
| `supabase/functions/infrastructure-control/index.ts`, `handler.ts`, `deno.json` | Incorpora o backend auditado e exige MFA antes de RPCs/cliente administrativo. |
| `supabase/functions/_shared/infrastructure/collector.ts`, `providers.ts` | Dependências originais desse backend; lógica de coleta auditada preservada. |
| `supabase/functions/manage-store-users/index.ts`, `handler.ts` | Valida Auth por cliente público; cria cliente administrativo somente após MFA. |
| `tests/mfaSecurityGaps.test.mjs` | Cobertura offline das ações e da barreira administrativa; contratos estáticos SQL/Storage. |
| `tests/manageStoreUsers.test.mjs`, `tests/mfa.test.mjs` | Adapta a simulação ao cliente de autenticação separado, mantendo os testes. |
| `docs/MFA_STORAGE.md`, `docs/MFA_TOTP.md`, este relatório | Aplicação, limites, homologação, testes e reversão. |

O backend infrastructure-control foi incorporado do snapshot obtido na investigação anterior
de leitura, versão publicada 2. O snapshot ainda estava disponível nesta sessão; nenhuma
nova consulta SQL ou download de backend remoto ocorreu nesta etapa. O coletor e providers
foram copiados sem alterar a lógica. Somente o handler recebeu bloqueio MFA/identidade.
Utilitários e contratos já presentes no checkout não foram sobrescritos.

## Proteções preparadas

As seis tabelas adicionais são audit_logs, infra_monitor_configs, infra_metric_limits,
infra_metric_snapshots, infra_sync_runs e infra_config_audit. Com as cinco originais, são
11 policies restritivas isbn_require_mfa, TO anon,authenticated, com USING e WITH CHECK.
Nenhuma policy comercial é substituída; os grants e as restrições por perfil/usuário/loja
permanecem. Os comandos não habilitam operações antes negadas.

Os três RPCs mutadores não são reescritos: infra_initialize, infra_save_config e
infra_authorize_action já chamam infra_is_developer. Esse helper passa a exigir aal2 E as
mesmas condições originais de identidade, perfil/loja/vínculo ativos e papel developer.
Isso protege também chamadas diretas dos RPCs SECURITY DEFINER e as policies de leitura
de infraestrutura. Os RPCs exclusivos de serviço infra_claim_run/infra_finish_run permanecem
inalterados; o coletor não depende do helper modificado.

O SQL verifica fingerprints das definições auditadas dos três mutadores e aceita apenas o
corpo original ou o corpo MFA conhecido do helper, com as características auditadas de
owner/security definer/stable/search_path. Divergências interrompem a transação, em vez
de sobrescrever mudanças posteriores. Os hashes detectam drift de metadados; não são
usados em autenticação ou TOTP. CREATE OR REPLACE preserva assinatura, proprietário e ACL.

Cada policy nova recebe o comentário isbn-mfa-totp:v1. Reexecuções reconhecem só essas
policies, conferem RESTRICTIVE/FOR ALL e atualizam somente suas expressões/papéis.
Colisões desconhecidas, tabelas ausentes ou RLS desabilitado abortam a transação inteira.
Não há DROP de policies comerciais, GRANT/REVOKE, FORCE RLS ou troca de proprietário.

Ambas as Edge Functions usam hasAal2ForUser somente DEPOIS de o Supabase Auth validar o
Bearer exato, conferindo também o sub do token. Flags do cliente e user_metadata não
concedem MFA. Em manage-store-users, getAuthClient usa a chave pública padrão do runtime;
getAdminClient só é chamado depois da validação. Em infraestrutura, userClient não usa
service role; o adminClient só é usado após MFA e as autorizações de loja/ação existentes.

## Storage

O SQL principal altera somente objetos públicos. Não tenta DDL em storage.objects,
cujo proprietário é gerenciado pelo Supabase. O caminho preparado é editar pelo painel
oficial as policies isbn_registration_images_read e isbn_registration_images_insert,
acrescentando AND aal2 ao predicado INTEIRO de cada uma. Mantém nome, comando, papel,
modo permissivo e todas as condições de bucket/usuário/loja/arquivo.

Não criar policy permissiva MFA-only, pois o OR com outras permissões ampliaria o acesso.
Não depender de suporte a RESTRICTIVE no editor. Não tentar ALTER OWNER, SET ROLE ou
concessões indevidas. Passos, expressões exatas, reexecução, limites e reversão estão em
[MFA_STORAGE.md](MFA_STORAGE.md). A capacidade efetiva de salvar com a conta do operador
permanece pendente; se o painel recusar, parar e recorrer ao suporte oficial.

## Aplicação coordenada — somente após nova autorização

1. Aprovar a janela de manutenção e os testes controlados no projeto ISBN existente.
   Não criar projetos/bancos/ambientes adicionais. Exportar snapshots atuais das policies,
   grants, helper/RPCs, duas Edge Functions e aplicação. Reconfirmar o projeto correto,
   TOTP no Auth, schemas expostos e ausência de drift desde a auditoria.
2. Fechar o acesso externo à aplicação E às APIs durante a transição, por controle que
   impeça chamadas diretas. Uma tela de aviso não basta. Se não houver esse mecanismo,
   preparar/aprovar a janela antes de ativar MFA; não prosseguir com ativação parcial.
3. Publicar as duas Edge Functions revisadas, mantendo o acesso externo fechado.
   manage-store-users utiliza SUPABASE_ANON_KEY padrão do runtime para validar Auth;
   service role continua apenas no cliente administrativo criado após MFA. Conferir a
   configuração existente sem expor chaves e sem reduzir a validação de autenticação.
4. Publicar frontend/APIs preparados, ainda em manutenção. Não reabrir uma mistura de
   frontend antigo, APIs sem MFA e banco parcialmente protegido.
5. Aplicar mfa_required_review.sql em transação, com timeouts de lock/execução declarados.
   O script não contém DDL Storage. Inspecionar sucesso/erro; não prosseguir parcialmente.
6. Editar as duas policies de Storage pelo painel conforme MFA_STORAGE.md. Comparar o
   snapshot antes de salvar e confirmar depois. Se não for possível, manter manutenção.
7. Com acesso de teste controlado, executar a matriz real aal1/aal2 para os três perfis,
   lojas e fluxos. Testar diretamente os três RPCs, as duas Edge Functions e Storage,
   inclusive sem UI, com usuário inativo e vínculo de outra loja. Conferir ausência de
   efeitos nos casos negados e funcionamento de operações/métricas/imagens permitidas.
8. Reabrir apenas depois da cobertura integral e de registrar evidências. Comunicar que
   sessões antigas precisarão configurar/validar MFA. Preservar dados e trabalho pendente.

## Reversão e falhas parciais — autorização específica

- Erro antes do COMMIT do SQL público: manter manutenção e encerrar a transação com
  ROLLBACK. O script não confirma mudanças públicas parcialmente.
- Edições de Storage e publicação de serviços não são atômicas com essa transação.
  Conferir cada etapa e manter manutenção se alguma falhar, mesmo que outra já terminou.
- Preferir correção para frente, mantendo MFA. Reverter apenas por decisão autorizada.
- Para reversão integral, manter aplicação/APIs fechadas, restaurar os predicados Storage
  pelo snapshot da janela no painel e executar mfa_rollback_review.sql para remover apenas
  as policies marcadas e restaurar o helper original. O rollback recusa helper/policies
  desconhecidos, não desabilita RLS e não toca nos três corpos dos RPCs mutadores.
- Restaurar versões anteriores das funções/aplicação somente se expressamente autorizado.
  Não reverter serviços silenciosamente nem reabrir o sistema só com senha.
- A reversão não apaga usuários, fatores TOTP, arquivos, vínculos ou dados. Policies antigas,
  grants e assinaturas permanecem. Restaurar o helper antigo/remover restrictions retira
  parte da garantia MFA; manter manutenção até nova decisão explícita de reabertura.

## Testes e pendências

Os testes de handlers usam Auth/DB simulados e providers em modo demo, sem tráfego externo.
As verificações SQL são contratos ESTÁTICOS de cobertura/preservação/drift, não execução
em Postgres. Não comprovam sintaxe/planejamento/efeitos reais de RLS, nem a interface de
gestão de Storage. Não houve SQL no Supabase, teste em conta real ou validação em produção.

Permanecem pendentes de autorização/homologação: execução/reexecução/reversão reais do SQL,
grants e isolamento efetivo, edição pelo Dashboard, leitura/escrita de Storage com tokens
reais, publicação das duas funções e APIs, TOTP/recuperação de senha com os aplicativos
reais e coordenação da janela. Nenhuma dessas pendências é dispensada pelos testes locais.

Resultados locais desta correção:

| Verificação | Resultado |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit` | Aprovado, sem erros. |
| Build Vite em `.mfa-security-build` | Concluído; avisos de tamanho/importação dinâmica, sem erro de build. |
| Suíte direcionada abaixo | 310 testes aprovados, nenhuma falha. |
| `node --test tests/*.test.mjs` | 1.071 testes: 1.014 aprovados, 57 falhas preexistentes. |
| Comparação com o log da base aprovada 95e2c7d | Mesmo conjunto nominal das 57 falhas; nenhuma falha nova. |
| Contratos SQL/Storage | Cobertura, preservação, fingerprints e reversão verificados estaticamente; não executados no banco. |

```powershell
node --test tests/mfaSecurityGaps.test.mjs tests/mfa.test.mjs tests/storeSelection.test.mjs tests/amazonVercel.test.mjs tests/spapiOfficial.test.mjs tests/manageStoreUsers.test.mjs tests/magazordCategories.test.mjs tests/googleBooks.test.mjs tests/titleSearch.test.mjs tests/curitibaProductLink.test.mjs
```

São 35 casos novos: as cinco ações de infraestrutura bloqueadas para aal1 em todos os papéis;
fluxos existentes liberados para developer aal2; negação de operator/admin sem privilégio,
perfil inativo e outra loja; Auth inválido/indisponível; nenhuma criação do cliente
administrativo sem MFA; comparação dos predicados Storage e detecção estática de drift SQL.

O log anterior da base 95e2c7d já estava disponível localmente e foi reutilizado para a
comparação; não foi criado novo checkout, projeto ou ambiente. A primeira etapa MFA teve
56 falhas em uma execução, porque o teste de inicialização Vite/proxy passou naquela ocasião.
Ele voltou a falhar nesta execução, como na base original; não foi alterado ou relaxado.

Logs ignorados pelo Git: `.mfa-security-targeted.log`, `.mfa-security-full.log`,
`.mfa-security-build.log`; referência anterior: `.mfa-baseline-tests.log`.
O build usou diretório separado e preservou o `dist` existente. Node disponível: v26.13.0;
o projeto declara Node 24.x, ainda necessário na homologação do runtime de destino.
