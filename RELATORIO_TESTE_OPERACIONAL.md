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

## Etapa 1 — gerenciamento de imagens (2026-11-02)

Implementação sobre `32b856c`, na branch `feat/amazon-spapi-official`, para homologação
em Preview. Amazon SP-API, Laboratório, BrasilAPI, Curitiba e regras comerciais foram
preservados. Não foram criadas rotas, módulos de aplicação, credenciais ou tabelas.

### Experiência do operador e persistência

- A galeria existente mantém a seleção automática inicial e permite trocar a capa,
  remover qualquer imagem (inclusive indisponível) e cadastrar sem imagens. A decisão
  manual de capa prevalece sobre carregamentos posteriores. Redimensionamentos Amazon
  continuam deduplicados pelo identificador do arquivo, preservando imagens distintas.
- As escolhas e a ordem sobrevivem ao retorno à pesquisa e à reabertura do cadastro do
  mesmo livro e condição. Na Etapa 2, abrir outro cadastro após concluir o anterior ou
  mudar a condição pela consulta reinicia a seleção a partir das fontes, evitando
  reaproveitar fotos de outro exemplar. O seletor de condição dentro da mesma ficha
  mantém as escolhas dessa edição em andamento. Uma nova pesquisa inicia outra ficha. A
  recuperação geral do rascunho após recarregar a página pertence à etapa seguinte.
- Fotografias locais são selecionadas em lote, verificadas e pré-visualizadas antes da
  confirmação. JPEG/PNG/WebP até 5 MiB; MIME, assinatura e decodificação precisam ser
  válidos. O hash SHA-256 evita repetição por conteúdo, independentemente do nome.
- A confirmação envia sequencialmente e preserva cada sucesso. Falhas mantêm a ficha,
  as fotos já adicionadas e a prévia que falhou; nenhuma tentativa é repetida
  automaticamente. Cadastro/navegação ficam protegidos enquanto há processamento.
- São reutilizados `RegistrationDraft`, `mainImageUrl`, `additionalImageUrls`, o
  snapshot e o cliente Supabase existentes. Somente referências persistentes entram no
  snapshot; arquivos, URLs `blob:`, URLs assinadas e tokens não são persistidos nele.
- A galeria e a ficha histórica leem fotos privadas com a sessão Supabase e exibem
  URLs de objeto temporárias em memória, liberadas ao remover/desmontar. Fotos públicas
  das fontes existentes conservam seu comportamento. Remover uma foto da ficha remove
  sua referência, sem apagar o arquivo privado que pode estar em snapshots anteriores.

### Storage: alteração autorizada e aplicada

A inspeção somente de leitura no projeto ISBN `jcxdkrpmrfbrhzwbzhph` retornou zero
buckets e zero políticas em `storage.objects`. A RLS está habilitada. As estruturas
existentes `profiles` e `store_users` fornecem usuário ativo, loja, vínculo ativo e perfil.

O arquivo [supabase/setup/registration_images.sql](supabase/setup/registration_images.sql)
contém exclusivamente:

1. Bucket privado `isbn-registration-images`, limite de 5 MiB e MIME JPEG/PNG/WebP.
2. SELECT autenticado para usuários ativos vinculados à loja do caminho, nos perfis
   `admin`, `operator` ou `developer`.
3. INSERT autenticado no caminho `<loja>/<usuário>/<sha256>.<extensão>`, limitado ao
   próprio usuário e à loja autorizada. Sem UPDATE, sobrescrita ou DELETE.

Não há alteração de tabelas de produtos, dados comerciais ou políticas preexistentes.
O SQL é transacional e falha se já existir recurso homônimo, evitando alterar uma
configuração desconhecida. Em 2026-11-02, após autorização explícita do responsável,
a inspeção confirmou novamente zero buckets/políticas. O SQL foi aplicado com sucesso
pela alteração `registration_images_private_storage`, exclusivamente no projeto ISBN.
Não reaplicar esse arquivo: o bucket e as políticas já existem.

A verificação posterior confirmou `public: false`, `file_size_limit: 5242880`, os três
MIME previstos, RLS habilitada e exatamente duas políticas (`SELECT`/`INSERT`, ambas
para `authenticated`), com os predicados de loja, usuário e vínculos ativos revisados.
O bucket permaneceu com zero objetos; não foram enviados arquivos nem modificados dados
comerciais, credenciais, configurações Vercel ou permissões preexistentes. O aplicativo
no Preview já pode utilizar o Storage, sem novo build ou novas variáveis.

O aplicativo usa o cliente já configurado e recusa upload/download privado fora do
projeto ISBN. Não há novas variáveis nem leitura de credenciais protegidas. O upload
usa `upsert: false`; respostas de duplicidade 400/409 são confirmadas pela leitura e
comparação do hash do arquivo existente. O limite de espera é 30 segundos. Se a
transferência concluir depois do limite, o arquivo permanece privado; nova confirmação
manual reutiliza o mesmo caminho/hash sem sobrescrever.

Referências oficiais: [uploads e duplicidade](https://supabase.com/docs/guides/storage/uploads/standard-uploads),
[controle de acesso](https://supabase.com/docs/guides/storage/security/access-control).

### Limite da preparação Magazord

O fluxo existente recebe uma única `mainImageUrl` e uma lista `additionalImageUrls`
ordenada, sem duplicidades. Referências autenticadas são deliberadamente privadas;
não são links públicos para a Magazord baixar. O futuro conector deverá obter o arquivo
autorizado, enviar/converter o formato se exigido pelo contrato real e associar os IDs
de mídia ao produto, com `principal` e `ordem`. Nenhuma publicação ou envio real à
Magazord foi implementado ou executado; o simulador foi mantido.

Referência oficial: [associação de mídia ao produto](https://docs-v2.api.magazord.com.br/api/put-midia-relaciona-produto-yaml/).

### Validação desta etapa

- `npm.cmd run typecheck`: aprovado.
- `npm.cmd run lint`: aprovado (`tsc --noEmit`, conforme configuração existente).
- `npm.cmd run build`: aprovado; permanece o aviso de bundle maior que 500 kB e de
  importações estáticas/dinâmicas do mesmo cliente Supabase.
- `npm.cmd run test:spapi`: 75/75 aprovados.
- Galeria, upload, snapshot, navegação e Laboratório controlados:
  `node --test tests/amazonLab.test.mjs tests/postHomologation.test.mjs tests/registrationLookup.test.mjs tests/spapiIntegrated.test.mjs`:
  84/84 aprovados. Incluem remoção de imagens quebradas, precedência manual,
  deduplicação, prévia sem envio, tipos/tamanhos/conteúdo inválidos, projeto/sessão,
  envio parcial, troca manual durante envio, referências privadas, retry explícito,
  liberação de blobs e payload compatível com o simulador.
- Bateria completa: 602 testes, 598 aprovados, quatro falhas anteriores à etapa:
  três em `infrastructureUi.test.mjs` (mock React sem `lazy`) e uma inicialização em
  `magazordMode.test.mjs` (marcador textual sensível ao CRLF). Esses arquivos e seus
  componentes de infraestrutura/modo não foram modificados. Não representam falhas
  dos novos cenários de imagens, mas a bateria geral ainda não está totalmente verde.
- Os testes usam arquivos e respostas sintéticos em memória, sem uploads reais,
  consultas Amazon adicionais, publicação Magazord ou gravações no banco.
- A criação autorizada do Storage foi validada separadamente por SELECT de configuração
  e políticas. O verificador de segurança não apontou itens nos novos recursos; retornou
  avisos sobre recursos anteriores, mantidos fora desta alteração: funções SECURITY
  DEFINER executáveis por [anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
  e [authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
  [tabelas com RLS sem políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  e [proteção de senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
  Nenhuma dessas configurações foi alterada.

Para concluir a homologação no Preview autenticado: confirmar uma foto local, escolher
como capa, voltar/reabrir a ficha e conferir a referência no resultado simulado. O
Storage já foi aplicado e conferido; o envio de um arquivo real pelo navegador e a
aplicação da RLS durante esse envio ainda dependem desse ensaio autenticado.

## Etapa 2 — validação automática e revisão obrigatória (2026-11-02)

Implementada na mesma branch/PR, sobre `4734ebf`. Não há nova página, rota, módulo,
biblioteca, tabela, bucket, migration ou conector. Não foram alterados autenticação,
Storage, políticas, fontes operacionais, preços/estoque existentes ou produção.

### Comportamento entregue

1. A ficha valida automaticamente os dados carregados e as alterações. Campos com
   observações ou erros ficam vermelhos, com texto que distingue `Observação` de
   `Erro obrigatório`. A borda verde discreta indica consistência do campo, não
   comprovação da informação pela fonte. Durante a digitação, o aviso daquele campo
   fica suspenso até sair dele; não há confirmação individual ou pop-ups sucessivos.
2. Erros bloqueantes: condição inválida, códigos obrigatórios vazios, título ausente
   ou composto por mensagem de ausência, categoria vazia, preço inválido/não positivo,
   quantidade não inteira/menor que um, identificadores fornecidos inválidos ou
   divergentes e referências de imagens inseguras/inválidas. Ao revisar, o primeiro
   campo com erro recebe foco e rolagem. Campos opcionais ausentes não bloqueiam.
3. ISBN-10/13 reutilizam o verificador já existente, extraído sem mudança de algoritmo
   para `utils/isbn.ts`, mantendo sua exportação anterior. ISBN-10 é comparado ao ISBN-13
   equivalente apenas para conferir correspondência; não é inventado um identificador
   para preencher a ficha. ISBN/EAN ausentes continuam ausentes. Código Filho manual de
   USADO e as regras de condição/modo permanecem; coincidência com ISBN gera observação.
4. Preços `50`, `50,00` e `1.234,56` são aceitos sem parse parcial. Revisão e conclusão
   apresentam `R$ 50,00` / `R$ 1.234,56`. O envio ao simulador usa decimal com duas casas
   (`1234,56`); o rascunho digitado não é modificado ao revisar ou retornar.
5. Autor, editora, ano, edição, idioma, formato, páginas e medidas suspeitos geram
   observações informativas. Idioma/formato ausentes não recebem mais os padrões
   presumidos Português/Brochura. Português sugerido pelo importador BrasilAPI, sem
   proveniência explícita, é sinalizado para conferência sem modificar a pesquisa.
6. Peso de 10 g (caso `9781419762109`) permanece visível, com a observação vermelha
   `ATENÇÃO — PESO POSSIVELMENTE INCORRETO`, sem bloquear ou inventar outro peso. A
   conversão declarada kg → g é sempre multiplicação por mil, sem reinterpretar kg
   como gramas pela magnitude. Dimensões permanecem em cm; unidade não confirmada pela
   fonte é sinalizada. Limiares de suspeita: peso <30 g/>30 kg e dimensões <=0/>100 cm,
   além de valores não finitos; são alertas de conferência, nunca estimativas.
7. `Revisar cadastro` abre a etapa integrada de leitura: identificação, bibliografia,
   condição/conservação, códigos, preço, quantidade, localização, categoria/marca,
   medidas, dados fiscais, sinopse/descrição final e imagens selecionadas. Observações
   continuam vermelhas. `Retornar ao cadastro` preserva integralmente os campos,
   seleção/remoções de imagens e estado dos controles, sem gravar a operação.
8. `Confirmar cadastro` revalida os dados atuais e executa somente o simulador existente
   e o fluxo de registro já implementado. Cliques repetidos são protegidos por refs
   antes da chamada assíncrona; erros essenciais surgidos após abrir a revisão retornam
   ao campo, sem gravação. A conclusão mostra os dados efetivamente enviados.
9. Prévias locais não enviadas impedem o avanço silencioso: há aviso vermelho e acesso
   ao botão existente de confirmação do upload. É possível enviar as fotos ou remover
   as prévias antes de revisar. Falhas parciais continuam preservando a ficha. A revisão
   reaproveita `RegistrationImage` para imagens públicas e privadas; não faz sondagens de
   disponibilidade nem novas consultas bibliográficas. A ausência temporária de imagem
   externa não bloqueia. Cadastrar sem imagens continua permitido.
10. Dados personalizados ficam no rascunho de cada cadastro. A pesquisa mantém apenas
    os dados/imagens das fontes. Novo cadastro após conclusão, outra condição aberta
    pela consulta e nova pesquisa não herdam fotografias do exemplar anterior. Não foi
    introduzida recuperação de rascunho entre consultas ou após reload.

### Arquivos principais

- `ProductRegistrationForm.tsx`: validação, foco, revisão, retorno, confirmação única,
  apresentação monetária e dados efetivamente submetidos.
- `utils/draft.ts`, `utils/isbn.ts`, `utils/bibliographicEvaluation.ts`: validação pura,
  valores monetários, conversão confiável de peso e reutilização do checksum ISBN.
- Seções existentes `ProductIdentitySection`, `CategoryAndBrandSection`,
  `CommercialSection`, `BibliographicSection`, `PhysicalAttributesSection` e
  `ImagesSection`: mensagens e identificação dos campos; comunicação das fotos pendentes.
- `App.tsx`: separação entre edição em andamento e próximo cadastro de exemplar.
- Testes existentes `postHomologation`, `operations`, `history` e `spapiIntegrated`:
  novos cenários e adaptação dos testes de envio à confirmação obrigatória.

### Testes e limites da evidência

- TypeScript e lint (`tsc --noEmit`): aprovados.
- Build: aprovado; permanecem os avisos conhecidos de chunk >500 kB e importações
  estáticas/dinâmicas do mesmo cliente Supabase.
- `npm.cmd run test:spapi`: 76/76 aprovados.
- `node --test tests/postHomologation.test.mjs tests/operations.test.mjs tests/history.test.mjs tests/spapiIntegrated.test.mjs tests/bibliographicContract.test.mjs tests/registrationLookup.test.mjs`:
  175/175 aprovados. Cobrem checksum/correspondência, preços, 10 g não bloqueante,
  foco, digitação sem avisos prematuros, ida/volta sem gravação/perda, imagens,
  upload pendente, revalidação final, cliques repetidos, NOVO/USADO, simulador,
  snapshot e isolamento das fotos em novas consultas/exemplares.
- Bateria completa: 611 testes, 607 aprovados, mesmas quatro falhas anteriores:
  três em `infrastructureUi.test.mjs` (mock React sem `lazy`) e a inicialização de
  `magazordMode.test.mjs` (marcador textual sensível a CRLF). Fora desta etapa;
  não foram corrigidas nem ocultadas.
- Testes isolados, arquivos e respostas sintéticos. Não foram usadas credenciais
  reais, executadas consultas Amazon reais nem gravados produtos/estoque/auditoria no
  servidor. O controle de abas do navegador informou `browser access host is unavailable`;
  a conferência visual autenticada fica para a homologação do proprietário no Preview.

### Roteiro mínimo de homologação no Preview / Desenvolvimento

1. **NOVO:** pesquisar um ISBN, abrir a ficha, deixar Código Pai vazio e clicar em
   `Revisar cadastro`: conferir mensagem vermelha e foco no campo, sem operação criada.
   Preencher código e preço `50,00`; escolher a capa/remover uma foto. Revisar, conferir
   dados/imagens e `R$ 50,00`; retornar, verificar a preservação e revisar novamente.
   Somente então confirmar uma vez e conferir conclusão/registro no simulador.
2. **USADO:** abrir outra ficha, informar os códigos manuais e conservação; usar preço
   `1.234,56` e peso `10 g`. Selecionar uma foto local e solicitar revisão antes de
   enviá-la: conferir o aviso e confirmar o upload na galeria (ou remover a prévia).
   Escolher a capa, revisar e verificar o aviso de peso sem bloqueio, conservação e
   `R$ 1.234,56`. Retornar e confirmar que todos os campos/imagens foram mantidos.
   Após a conferência, revisar e confirmar; a operação deve aparecer uma única vez.
3. Iniciar outro exemplar USADO ou nova pesquisa do mesmo ISBN: conferir que fotografias
   personalizadas anteriores não aparecem como dados bibliográficos nem como seleção
   automática do novo exemplar. O primeiro upload real do Storage deve ser validado
   nessa rodada autenticada; sua estrutura/permissões já foram aplicadas na Etapa 1.

Não houve merge nem deploy de produção. O Preview é destinado à homologação; a
integração comercial permanece simulada e a liberação em produção depende de autorização.

## Correções pontuais após a homologação da Etapa 2 — 02/11/2026

Base analisada: `f00f725b6faa37cd0c931ac921ff832aecc2f4b4`, branch
`feat/amazon-spapi-official`, PR #1. A revisão visual já aprovada foi preservada.

### Causas, correções e limites

| Ponto | Evidência e resultado |
| --- | --- |
| Código Pai vermelho ao abrir | `createRegistrationDraft` inicia o Código Pai vazio e manual; `Ex: LV26579-P` em `ProductIdentitySection` é um placeholder, não geração automática. Um valor realmente preenchido passa na validação tanto para NOVO quanto para USADO. O erro obrigatório estava sendo apresentado antes da interação. Agora códigos manuais vazios mostram o erro após sair do campo ou solicitar revisão; continuam impedindo o avanço enquanto ausentes. Código Filho NOVO segue ISBN/EAN; USADO continua manual. Não foram enfraquecidas as regras. |
| Preço durante a edição | O campo mantinha o texto livre sem formatar ao sair. Continua preservando a digitação e o cursor; somente ao perder o foco um valor completo e válido recebe duas casas decimais em pt-BR. Aceita `50`, `50,00`, `1.234,56`; valores incompletos ou inválidos permanecem disponíveis para correção e não passam pela validação. Revisão e conclusão continuam em reais. |
| Casas decimais nas medidas | A conversão de unidades da Amazon mantinha 12 algarismos significativos, retendo ruído como `24.2999999752`. Medidas operacionais em g/cm agora usam até duas casas decimais, inclusive na inicialização e na revisão. Valores positivos muito pequenos não são zerados. Os valores e unidades originais de `amazonPhysical` continuam preservados e nenhuma fonte foi consultada novamente. |
| Altura e espessura | O mapeamento existente é `width → largura`, `height → altura`, `length → profundidade/espessura`, usando dimensões de `item`, não `package`. Não houve inversão introduzida na Etapa 2. A Amazon não define esses eixos como orientação bibliográfica; não é seguro trocar por tamanho. Mantivemos os eixos originais, com aviso não bloqueante quando a profundidade importada excede a altura. No caso relatado, a apresentação é `3,18 cm` e `30,5 cm`; a orientação requer conferência física pelo operador. O alerta vermelho de aproximadamente `10 g` continua sem bloquear. |
| Galeria do Batman | Não foi encontrada regressão entre o complemento SP-API/Laboratório, resultado, rascunho, seleção e revisão. A Etapa 2 não alterou esse mapeamento. Teste integrado com ISBN `9781419762109`, capa MAIN, cinco fotografias distintas e um redimensionamento duplicado preserva uma capa e cinco adicionais em todo o fluxo, sem nova consulta nem persistência personalizada. Quando o Laboratório não fornece galeria válida, a capa oficial continua sendo o resultado válido. |

Referência dos eixos: [modelo oficial Catalog Items v2022-04-01](https://raw.githubusercontent.com/amzn/selling-partner-api-models/main/models/catalog-items-api-model/catalogItems_2022-04-01.json),
definições `Dimensions`/`ItemDimensions`. A conferência do código não substitui uma
medição física do exemplar e não confirma que a fixture de teste reproduz o corpo
original da consulta real.

Foi feita somente leitura dos logs recentes do Preview anterior
`dpl_9RQKztoNJd6vdddxDDo9rTDw94xa`. Há um evento `amazon_lab` em
`2026-11-02T22:18:56.034Z`, duração `482,11 ms`, Function/HTTP `200` e código
`amazon_unexpected`. O código atual interrompe esse caso quando não recebe HTML
utilizável; HTTP 200 não garante uma galeria. O log não contém ISBN nem corpo da
resposta, portanto não permite atribuir esse evento com certeza ao teste do Batman
ou determinar o motivo exato da ausência de HTML. Não foi alterado o timeout,
o limite de consultas, o tratamento de bloqueio ou a política de ausência de retries.
Não foi feita nova consulta real à Amazon nem tentativa de contornar restrições.

### Verificação desta correção

- TypeScript (`npm.cmd run typecheck`) e lint (`npm.cmd run lint`): aprovados.
- Build (`npm.cmd run build`): aprovado; mesmos avisos conhecidos de chunk >500 kB
  e importação estática/dinâmica do cliente Supabase.
- SP-API (`npm.cmd run test:spapi`): **78/78 aprovados**.
- Fluxo relacionado (`postHomologation`, `operations`, `history`, `spapiIntegrated`,
  `bibliographicContract`, `registrationLookup`): **180/180 aprovados**.
- Bateria completa: **616 testes, 612 aprovados, quatro falhas anteriores**:
  três mocks React sem `lazy` em `infrastructureUi.test.mjs` e o marcador textual
  sensível a CRLF em `magazordMode.test.mjs`. Nenhuma nova falha identificada.
- Novas regressões cobrem códigos NOVO/USADO sem aviso prematuro, preenchimento
  real e bloqueio obrigatório, preço sem reformatação durante a digitação,
  conversão sem ruído, preservação dos eixos originais e das fontes prioritárias,
  revisão com alertas não bloqueantes, cinco fotos disponíveis até a revisão/retorno
  e Laboratório interrompido com HTTP 200 preservando a capa.

Banco, Storage, políticas, credenciais e integração real Magazord não foram alterados.
Não houve merge ou deploy de produção. O novo Preview serve para conferir códigos,
preço e medidas; a existência de fotos adicionais em uma resposta futura continua
dependendo do conteúdo disponibilizado pelo Laboratório, sem garantia artificial.

## Ajustes finais da Etapa 2 — 02/11/2026

Base: `3599034c117389b7bf164b49b10c02862957378d`, PR #1.

### Laboratório: evidência real e ponto de interrupção

- A pesquisa normal de `App.tsx` chama `complementAmazonImages` após consolidar
  BrasilAPI, Curitiba e SP-API, exclusivamente no ambiente Desenvolvimento e para
  o mesmo usuário ativo. O complemento exige Desenvolvimento/Silveira Lab; imagens
  somente MAIN não são consideradas galeria adicional.
- Limites conferidos e preservados: complemento automático 10 s, cliente do
  Laboratório 40 s, transporte Amazon 25 s, Function 45 s, corpo até 8 MiB.
  Uma única requisição, sem redirect, retry, cookies Amazon ou contorno de bloqueios.
- Leitura do log do Preview `dpl_6pgVJV8aNgKt1mREhAcRsdXWFgzz`: evento em
  `2026-11-02T22:45:29.194Z`, id `3f4c87a9-84f1-4fa1-b021-93e7767af5df`,
  duração `409 ms`, Function/HTTP `200`, código `amazon_unexpected`.
  Confirma execução real do Laboratório nesse Preview, não timeout nessa chamada.
  Como não há ISBN no log, o evento isolado não comprova que foi a pesquisa do Batman.
- Nesse código, `amazon_unexpected` com HTTP 200 ocorre antes do extrator:
  formato ausente/inválido/não HTML, corpo vazio ou limite de leitura. Portanto,
  nessa execução não foi produzida uma galeria que o formulário pudesse descartar.
  Os logs anteriores não registram qual dessas condições ocorreu; não é possível
  afirmar mudança externa da Amazon nem recuperação das cinco fotografias.
- A Function existente agora registra o motivo controlado (`content_type_missing`,
  `content_type_invalid`, `content_type_not_html`, `body_empty`, `body_limit`,
  `http_status` ou `blocked`). Quando a extração termina, registra somente contagens
  de imagens principais/adicionais. Sem ISBN, URLs, HTML, cabeçalhos, credenciais ou
  mensagens externas nos logs; nenhum endpoint, extrator ou autenticação novo.
- A tentativa de acessar a sessão autenticada pelo controle do Chrome foi
  interrompida pelo próprio controle: não conseguiu determinar a URL com segurança.
  Não houve consulta Amazon disparada pelo agente nem acesso a cookies/tokens.
  A verificação real do ISBN e das cinco fotos permanece pendente de uma única
  pesquisa pelo proprietário no novo Preview; os logs bastam para ler o motivo e
  as contagens, sem precisar copiar o corpo da resposta.

### Medidas e preço

- Removidos os dois avisos vermelhos de orientação de altura/profundidade.
  Preservados o arredondamento, os valores/eixos originais, a edição manual e o
  alerta não bloqueante de 10 g. Sem confirmação adicional para dimensões comuns.
  Rótulos mantêm largura, altura e espessura/profundidade, sem prometer orientação
  bibliográfica que a fonte não confirma; nenhuma inversão por magnitude.
- A versão anterior formatava o preço somente ao persistir o evento de blur no
  rascunho. A apresentação passa a distinguir foco/edição: sem foco, deriva duas
  casas decimais do rascunho atual, inclusive em montagem, retorno e atualização
  adiada do componente pai; com foco, preserva o texto digitado. O prefixo `R$`,
  os três formatos aceitos e a moeda na revisão/conclusão foram preservados.
  Não foi possível reproduzir visualmente o blur no navegador nesta execução.

### Verificação

- TypeScript, lint e build: aprovados; mesmos avisos conhecidos do build.
- SP-API: 78/78 aprovados.
- Testes relacionados de Laboratório, transporte, imagens, SP-API e cadastro:
  141/141 aprovados. Fixtures locais não comprovam a disponibilidade real das fotos.
- Bateria completa: 618 testes, 614 aprovados e as mesmas quatro falhas anteriores
  de mocks `lazy`/marcador CRLF, fora do escopo desta correção.
- Sem mudanças em Supabase, Storage, autenticação, Magazord real, NOVO/USADO ou
  produção. Revisão/retorno, deduplicação e isolamento das imagens preservados.

### Complemento: motivo real identificado no Preview

Consulta dos logs de `dpl_4NSNk1LLeK1DJunmHAvefyFQm4Fo` (commit `1fccd1b`):
em **02/11/2026 às 20:00:20 BRT**, a Function registrou:

```json
{"evento":"amazon_lab","id":"d3aad6a6-49fe-4783-a0c6-e8fec4efa091","duracao_ms":451.98,"status_function":200,"status_http":200,"codigo":"amazon_unexpected","motivo":"content_type_missing"}
```

Isso comprova uma chamada real do Laboratório nesse Preview e identifica a
interrupção: a resposta recebida pelo transporte não continha `Content-Type`.
Nosso código descartava essa resposta antes de ler o corpo. Não foi timeout,
deduplicação ou perda de galeria no formulário nessa execução. O log não registra
ISBN; a correlação exclusiva com `9781419762109` depende da pesquisa informada
pelo operador. Não é possível concluir que o HTML ou as cinco fotos estavam no
corpo, pois essa versão nem o examinou, nem que a fonte mudou em relação ao teste
antigo (não há cabeçalhos/corpo históricos para comparar).

**Correção mínima:** o mesmo transporte agora lê o corpo limitado quando falta o
cabeçalho e só o entrega ao extrator existente se reconhecer um documento HTML
iniciado por `<html>` ou `<!doctype html> ... <html>`. Cabeçalho declarado inválido
ou não HTML continua interrompendo antes da leitura; corpo vazio, JSON/texto,
CAPTCHA/restrição e respostas acima do limite continuam recusados. Não se deduz
HTML de HTTP 200. Não houve nova tentativa, troca de agente/IP, proxy, cookie,
redirect, mudança de timeout ou novo extrator.

A [RFC 9110, seção 8.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.3)
permite determinar o tipo pelos dados quando o campo está ausente. Aqui a
aceitação é restrita a documento HTML em memória para o extrator existente;
nenhum HTML é executado, exposto ou persistido no navegador.

Verificação após o ajuste: TypeScript/lint/build aprovados; **78/78 SP-API** e
**142/142 testes relacionados** aprovados. A bateria completa teve **619 testes,
615 aprovados e as mesmas quatro falhas preexistentes**. A regressão inclui HTML
sem MIME aceito pelo transporte/Function e casos negativos de corpo vazio,
JSON/texto, CAPTCHA e limite de 8 MiB, sempre com uma requisição.

**Resultado real ainda não homologado após a correção:** as cinco imagens não
foram comprovadamente recuperadas. Uma pesquisa única no Preview corrigido
permitirá verificar os novos motivos/contagens pelos logs existentes, sem copiar
credenciais, HTML ou URLs. Caso o corpo esteja vazio, não HTML ou bloqueado, a
capa SP-API continua válida e não haverá contorno ou retry.
