# ISBN — implementação para homologação do teste operacional

Status: três fases implementadas localmente. TypeScript, build e 414 testes aprovados.
Sem commit, push ou deploy. A versão em isbn.silveiralab.com.br permanece a publicada anteriormente.
Trabalho anterior no workspace preservado. Nenhuma operação foi executada contra o banco nesta implementação.

## Dashboard

O aplicativo reutiliza o OwnerDashboard existente, agora com cinco abas: Visão Geral,
Eficiência da Automação, Registros, Operadores e Consulta de Cadastros.
O administrador continua entrando no Dashboard; operadores continuam no fluxo de consulta.

Para admin, a leitura exige store_id da loja atual e aceita production OU development com
demo=true, mock=true e demo_batch_id=isbn-demo-20261014-realapp-01. Há filtros no SELECT
e conferência defensiva dos resultados. Outros eventos técnicos de development ficam fora.
Developer conserva sua leitura exclusiva de development. O SDK continua usando a sessão
normal e a RLS instalada; não há credencial privilegiada no frontend.

Atualizar executa nova leitura, aborta a anterior e só informa horário após sucesso.
Falhas/troca de contexto ocultam dados anteriores. Período, operador, simulação e natureza
da atividade filtram o conjunto; trocar de aba não faz nova consulta.

Naturezas independentes da simulação da integração:
- Histórico demonstrativo: marcação explícita demo/demo_batch_id.
- Teste operacional realizado por usuário: purpose=operational_test e identificador de rodada.
- Registro sem classificação suficiente: legado sem evidência adequada.

O ambiente técnico production não é apresentado como comprovação de operação comercial real.
Os totais gerais e por operador podem incluir demonstração quando o filtro inclui todas as
atividades; contagens e filtro de natureza tornam essa composição explícita.

## Auditoria

Próximos eventos recebem operational_test_run_id=isbn-operational-20261014-01, centralizado
em src/utils/operationalTest.ts. A marcação é desta rodada, independentemente do ambiente
derivado pelo banco. Nenhum evento anterior é reclassificado. Encerrar ou iniciar outra
rodada exige revisar esse identificador no código antes de uma publicação posterior.

Cada evento nasce com UUID estável e payload congelado. Falhas mantêm uma fila de auditoria
com aviso visível, IDs de evidência e botão de reenvio. Reenviar não repete busca, cadastro
ou movimentação. A fila usa sessionStorage por usuário/loja e pode ser recuperada após
recarregar a mesma aba, com reenvio manual. Não contém tokens ou credenciais.
Se o armazenamento estiver indisponível, a falha também aparece em tela.
Existe aviso de saída enquanto há eventos sem confirmação.

Uma resposta perdida pode esconder um INSERT já confirmado. No reenvio, conflito de UUID
só é considerado sucesso após SELECT sob a RLS e comparação do evento inteiro com o payload
original, incluindo autor. Não há UPSERT, UPDATE ou alteração de registros existentes.
Conflito não verificável continua pendente. Uma sessão de outro usuário não reenvia a fila.

Registros passa a apresentar mensagem de erro e painel de evidência: ID, operador e UUID,
horário, ISBN/título, ambiente, natureza, códigos, fluxo, rodada e diagnósticos por fonte.
Falhas da consulta ao catálogo simulado e da reconsulta pós-cadastro geram eventos próprios,
sem desfazer o cadastro concluído. Indisponibilidade parcial da Curitiba fica no diagnóstico
da pesquisa bem-sucedida, sem inflar o número de pesquisas. Exceções brutas desses fluxos
não são copiadas para o evento de erro.

A confirmação de cadastro informa explicitamente que a integração é simulada. Resultado
negativo do serviço não abre a confirmação de sucesso. O serviço Magazord não foi modificado.
audit_logs permanece fora do escopo: esta implementação registra evidências em operations.

## Consulta de Cadastros e snapshot

Pesquisa única por ISBN normalizado ou trecho do título, sem diferenciar maiúsculas e
acentos. Grid paginado de 20 linhas com título, ISBN, condição, códigos Pai/Filho, operador,
data, natureza e Visualizar ficha. São incluídos somente eventos de cadastro concluído
com condição coerente; pesquisas, erros, pendências e entradas vinculadas ficam fora.
Cada evento de cadastro ocupa sua linha, sem deduplicação por ISBN que una exemplares
usados distintos. Repetições deliberadas do cadastro são eventos distintos; o reenvio
da auditoria do mesmo evento não cria outra linha.

Nos próximos cadastros concluídos, o mesmo INSERT grava metadata.registrationSnapshot:
version=1, capturedAt e fields. O conteúdo vem do formulário final enviado ao simulador,
incluindo dados bibliográficos, comerciais, físicos, fiscais, descrição e observações de
usados. Arrays são copiados antes da operação assíncrona. Somente campos de produto
explicitamente permitidos são serializados. Não são persistidos binários, URLs data/blob,
URLs com credenciais, query string ou fragmento, nem propriedades extras como tokens/e-mails.

O leitor valida a versão e mostra os campos armazenados como texto escapado pelo React.
URLs são texto; a ficha não carrega imagens, não contém formulário de edição e não chama
BrasilAPI, Curitiba, Amazon ou Magazord. Sem snapshot válido, exibe resumo e mensagem de
ficha completa não armazenada/versão não suportada. Não há preenchimento retroativo.

A apresentação visual reaproveita o padrão do Dashboard. Histórico não foi reutilizado
como mecanismo de abertura porque ele refaz pesquisas; o formulário ativo de Cadastro
também não foi montado na ficha, para não carregar ações de escrita. O componente de leitura
é pequeno e usa apenas os dados já autorizados e carregados pelo Dashboard.

Além da proteção do Dashboard, a ficha recusa montagem para operador/inativo, confere loja
e escopo de ambiente/lote e invalida a seleção quando muda identidade, loja, perfil ou
conjunto de dados. Não há endpoint novo nem bypass da RLS. A autorização no servidor
continua sendo a original de operations, inclusive a leitura das próprias operações.

## Arquivos desta implementação

| Arquivo | Alteração |
|---|---|
| src/components/OwnerDashboard.tsx | Leitura conjunta limitada, atualização, natureza, evidências e quinta aba |
| src/services/productionService.ts | Escopo opcional do lote e leitura de error_message |
| src/utils/operationalTest.ts | Lote, rodada, classificação e conferência do lote autorizado |
| src/hooks/useOperationAudit.ts | Fila, confirmação, isolamento de identidade e reenvio |
| src/services/operationsService.ts | UUID estável e confirmação de conflito sem UPDATE |
| src/App.tsx | Conexão da auditoria, novos erros e snapshot de cadastro concluído |
| src/components/magazord/ProductRegistrationForm.tsx | Cópia final, resultado negativo e mensagens explícitas de simulação |
| src/utils/registrationSnapshot.ts | Contrato versionado e lista de campos/URLs permitidos |
| src/components/dashboard/RegistrationLookup.tsx | Grid, pesquisa e ficha exclusivamente de leitura |
| tests/production.test.mjs | Escopo, lote, cinco UUIDs, filtros, atualização, evidências e cinco abas |
| tests/operations.test.mjs | Reenvio, conflito, armazenamento, isolamento, erros e snapshots |
| tests/history.test.mjs | Novas evidências de falha e regressão com formulário/simulador reais |
| tests/registrationLookup.test.mjs | Pesquisa, exemplares, leitura, autorização e versões de snapshot |
| RELATORIO_TESTE_OPERACIONAL.md | Esta entrega e roteiro de homologação |

Header.tsx, ProductionView.tsx, DashboardCharts.tsx, utils/dashboard.ts e os testes de
navegação já continham a recuperação do Dashboard no início desta tarefa. Foram preservados
e fazem parte do conjunto necessário para uma futura publicação. Há outros arquivos locais
anteriores não versionados; não selecionar todo o workspace indiscriminadamente para commit.

## Validações executadas

- npm.cmd run lint: aprovado, tsc --noEmit.
- npm.cmd run build: aprovado. JS index-Dgh8lQ1R.js, cerca de 1.194 kB / 313 kB gzip.
- Todos os tests/*.test.mjs: 414 testes, 414 aprovados, zero falhas/ignorados.
  Saída local em operational-test-validation.log, ignorada pelo Git.
- git diff --check: sem erros de whitespace; avisos locais de conversão LF/CRLF do Git.
- Os testes incluem permissões, cinco abas e teclado, pesquisa e fontes parciais, novo,
  usado, reaproveitamento, erro forçado, persistência simulada, resposta perdida, conflito
  não verificável, fila após reload, troca de identidade, falha de armazenamento, ficha
  legada, snapshot, múltiplos usados e revogação de leitura.
- Verificação adicional somente em memória com o backup exato de
  C:/Desenvolv/isbn-backups/20261014-commercial-real-app: 1089 registros de entrada;
  proprietário recebe 1067 = 1045 demonstrativos + 22 production originais; developer
  recebe 1067 development; cinco UUIDs autorizados no lote, 140 usados individuais e
  340 fichas demonstrativas resumidas (200 novos + 140 usados).
- Os 44 originais não sofreram mutação na validação. Hashes de operations.json,
  manifest.json, inserted-receipt.json, cleanup.sql e post-insertion-verification.json
  permaneceram iguais antes/depois; hash de cleanup.sql confere com o manifesto.
  Essa validação não fez chamadas ao banco ou a serviços externos.

Não foram alterados Auth, perfis, RLS, tabelas, migrations, integração Magazord, fontes
bibliográficas ou scripts de limpeza. A migration B1 não foi aplicada. Nenhum dos 1089
registros foi atualizado. Banco real não foi usado para ensaios de INSERT/DELETE.

## Riscos residuais e homologação manual

1. Catálogo/estoque Magazord simulado continuam locais ao navegador, sem sincronização
   entre funcionários. O simulador existente pode retornar sucesso mesmo se seu
   localStorage falhar; esse comportamento não foi alterado. Eventos centralizados não
   comprovam estoque compartilhado, publicação ou venda real.
2. A fila recuperável é da sessão da aba. Fechar a aba, limpar dados do navegador ou
   ignorar avisos pode perder eventos que ainda não chegaram ao servidor. Se o armazenamento
   falhar, conservar a página e copiar os IDs apresentados. A fila não é um serviço durável.
3. Dados antigos não têm ficha completa; métricas de preenchimento automático, duração
   completa, tentativas inválidas e abandono continuam sem instrumentação integral.
4. A leitura conjunta depende da RLS atualmente instalada. Aplicar B1 no futuro exige
   reavaliar esse comportamento; não aplicar automaticamente junto desta publicação.
5. O build informa chunk maior que 500 kB. O Dashboard carrega metadados das operações;
   crescimento prolongado dos snapshots poderá exigir otimização de leitura/paginação.
6. Os testes de autorização usam SDK/respostas isolados e componentes reais; não substituem
   a homologação no navegador com as cinco contas reais. A validação do backup não é uma
   nova inspeção do estado atual do servidor. Os testes não criaram dados reais.

Para homologar localmente, executar npm.cmd run dev e abrir o endereço informado pelo Vite:
primeiro conferir somente leituras como Proprietário, as cinco abas e os filtros; o lote
deve aparecer apenas quando incluído, e as fichas antigas devem ser resumidas. Depois,
em rodada manual expressamente combinada, operar como funcionários e conferir Atualizar,
autoria/rodada, um novo, dois usados do mesmo ISBN, reaproveitamento e a ficha final.
Para exercitar erro forçado, usar somente as ferramentas já permitidas ao developer;
os eventos técnicos dele continuam fora da leitura do proprietário.
Simular perda de conexão na gravação de auditoria, restaurá-la e reenviar; deve haver
um único UUID persistido e nenhuma repetição do cadastro/estoque. Não desligar permissões
ou reclassificar environment para viabilizar o ensaio.

O app local usa o Supabase configurado: ações manuais de pesquisa/cadastro podem criar
NOVOS eventos. Esses ensaios não foram executados pelo agente nesta etapa.
Após homologação, commit/push/deploy permanecem dependentes de autorização específica.
Nenhuma limpeza deve ocorrer antes de sua autorização própria; os novos eventos não usam
demo_batch_id e ficam fora do recibo de IDs do lote demonstrativo.
