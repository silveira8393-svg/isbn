# Restauração dos modelos de conservação e Meta Description

Data: 03/11/2026. Base: `origin/main` em `85436ee1289adae4fbad329e0b8fdccf8cf2d75f`.
Branch única: `fix/condition-templates-meta-description`.

## Entregas

- Configurações → Modelos de conservação: consulta, busca por nome/texto, criação, edição, ativação, desativação e exclusão com confirmação.
- Administradores e desenvolvedores precisam de vínculo ativo com a loja. Operadores apenas consultam e aplicam modelos. A aplicação mantém autenticação, RLS e isolamento por loja existentes.
- Seletor apenas no cadastro USADO, sem aplicação automática. O texto é copiado e pode ser editado livremente; o ID escolhido e o texto acompanham o rascunho e o snapshot. Um modelo desativado/excluído não apaga o texto já escolhido.
- Sugestões rápidas preservadas. Descrição comercial continua sendo conservação + linha em branco + sinopse.
- Meta Description independente, sugerida localmente para NOVO e USADO, editável e apagável. A primeira edição manual impede atualizações automáticas posteriores. Orientação de 160 caracteres sem limite imposto ao texto manual.
- Meta Description visível na revisão e incluída no snapshot encaminhado à auditoria existente. Nenhuma integração real Magazord adicionada.

## Reaproveitamento

Inspecionados o histórico Git, a main e as worktrees existentes. Os componentes citados não constavam como arquivos versionados no histórico local disponível; estavam presentes como arquivos locais não rastreados no diretório principal. Foram copiados para a worktree isolada e adaptados, preservando integralmente os arquivos e alterações do diretório principal:

`ConditionTemplateManager`, `UsedConditionTemplatePicker`, `conditionTemplatesService`, `useConditionTemplates`, `SeoSection`, `generateMetaDescription` e seus testes anteriores.

## Importação executada e verificada

Projeto Supabase: `jcxdkrpmrfbrhzwbzhph`.
Loja: Sebo Livraria Sul, `6058abd1-96e5-465b-a1df-292e5cf76de3`.

- Antes: 1 modelo ativo. Adicionados: 16. Depois: **17 modelos ativos**.
- Comparação de todos os textos completos: **cada original aparece exatamente uma vez**.
- Modelo original `55b4401d-2085-4a1d-96ef-730d305c17bf` preservado, incluindo nome, texto e estado.
- Textos extraídos do pedido em UTF-8, sem revisão ortográfica ou reescrita. Fonte de importação: `scripts/marcos-condition-templates.json`.
- Atualização aditiva, condicionada à igualdade do JSONB anterior completo, como o controle de concorrência já disponível no serviço. Nenhum retry sem releitura, exclusão, alteração de RLS, tabela ou bucket.
- `default_location`, `updated_by`, `created_at` e configurações preexistentes preservados. O trigger existente mantém `updated_at`.
- O planejador `scripts/import-marcos-condition-templates.mjs` é idempotente: compara texto completo, mantém inclusive modelos inativos existentes e não gera UPDATE quando todos os originais já existem. Ele não executa gravações automaticamente.

## Validação

- `npm.cmd run typecheck`: aprovado.
- `npm.cmd run lint`: aprovado (o script atual executa `tsc --noEmit`).
- `npm.cmd run build`: aprovado; aviso de bundle acima de 500 kB já característico do projeto.
- Testes pertinentes de modelos, importação, SEO e operações: 67 aprovados.
- Suíte completa antes das alterações: **614/619 aprovados, 5 falhas**.
- Suíte completa após as alterações: **655/660 aprovados, as mesmas 5 falhas**.
- Sem alteração de autenticação, Amazon, Storage, integração Magazord, políticas ou esquema do banco.
- Revisão dos componentes segundo a skill React: hooks incondicionais, cancelamento de carregamentos, troca de usuário/loja, bloqueio de gravações simultâneas, labels e avisos acessíveis conferidos.

Falhas preexistentes mantidas fora do escopo:

1. `amazonOnlineStartup.test.mjs`: timeout no teste de serviços reais Vite/proxy/SIGINT neste ambiente Windows.
2. `infrastructureUi.test.mjs`: três casos (admin, operator, developer), mock React sem `lazy` utilizado pelo SettingsView já existente.
3. `magazordMode.test.mjs`: compilação interrompida por mock de componente incompatível com os imports atuais do MagazordStatusCard.

Os testes de interface executam componentes/handlers reais com dependências controladas; não equivalem a uma homologação autenticada completa no navegador. A inspeção das políticas reais confirmou leitura por membros e gravação por admin/developer da loja.

## Roteiro breve de homologação

1. Entrar como administrador da loja e abrir Configurações → Modelos de conservação. Localizar os 17 textos por nome ou trecho.
2. Criar um modelo de teste, editar, desativar, reativar e conferir a confirmação de exclusão. Não excluir os originais.
3. Como operador, abrir cadastro USADO: escolher um modelo, ajustar o texto e usar uma sugestão rápida. Conferir conservação + linha em branco + sinopse.
4. Editar Meta Description; revisar e retornar ao formulário. Confirmar preservação da seleção, do texto e do SEO. Alterar título/sinopse e conferir que o SEO manual permanece.
5. Repetir com cadastro NOVO: SEO presente e seletor de conservação ausente. Apagar SEO e verificar que continua vazio após alterações bibliográficas.
6. Concluir um cadastro simulado e conferir na auditoria o snapshot final, incluindo Meta Description e conservação do USADO.

Merge e publicação em produção dependem de homologação e não foram executados.

## Correções da homologação da PR #2 — 03/11/2026

### Causas verificadas

1. Idioma: `createRegistrationDraft` copiava `book.language.trim()` diretamente. A normalização existente só era aplicada posteriormente na revisão/confirmação. A criação do rascunho agora usa `normalizeLanguage`, sem modificar a fonte nem sua proveniência. Códigos conhecidos aparecem por extenso, valores desconhecidos permanecem e a edição manual continua livre. A indicação de Português presumido pela BrasilAPI segue sem confirmação explícita.
2. Modelos: o Preview usa corretamente `https://jcxdkrpmrfbrhzwbzhph.supabase.co`. A conta técnica tem vínculos ativos com duas lojas. `UserContext` escolhe `memberships[0]` após ordenar `store_id`, selecionando `492af2ad-905c-42f8-90f4-aa6c1dc142f3` (Silveira Lab - Homologacao Amazon), sem configuração de modelos. Os 17 modelos pertencem a `6058abd1-96e5-465b-a1df-292e5cf76de3` (Sebo Livraria Sul). Não havia erro no JSONB nem necessidade de alterar RLS.

### Correção restrita à origem dos modelos

Apenas nesta branch de Preview foi configurada `VITE_CONDITION_TEMPLATES_STORE_ID=6058abd1-96e5-465b-a1df-292e5cf76de3`. O serviço lê e grava os modelos nessa origem explícita, validando sessão e vínculo ativo com a mesma role; a interface mostra o nome real da loja consultada. A opção está documentada em `.env.example`. Sem a variável, permanece o comportamento de consultar a loja operacional do usuário.

Não se altera o contexto de autenticação, a loja operacional da conta técnica, auditoria operacional ou configuração Amazon. Não existe busca automática em outras lojas, fallback local ou cópia dos textos para a loja técnica. Configuração inválida ou sem autorização é recusada, sem fallback. Leitura sem linha de configuração, lista vazia confirmada, divergência de identidade da loja e erro de leitura têm apresentações distintas.

Arquivos corrigidos: `src/utils/draft.ts`, `src/services/conditionTemplatesService.ts`, `src/hooks/useConditionTemplates.ts`, `src/components/ConditionTemplateManager.tsx`, `src/components/magazord/UsedConditionTemplatePicker.tsx`, `.env.example` e os testes `conditionTemplates.test.mjs` e `postHomologation.test.mjs`.

### Validação desta correção

- **98 testes relacionados aprovados**: `conditionTemplates`, `conditionTemplateImport`, `postHomologation`, `metaDescription` e `operations`.
- TypeScript, lint e build aprovados; permanece o aviso de tamanho do bundle.
- Fonte Supabase: 17 modelos, todos ativos; nenhuma gravação de modelos foi realizada nesta correção.
- Leitura real sob RLS verificada em transação com `SET LOCAL ROLE authenticated` e claims da conta técnica: loja Sebo Livraria Sul, vínculo developer ativo e 17 modelos ativos retornados. Transação encerrada com rollback. Esse teste não substitui um login real do navegador.
- Teste de componente com os 17 textos: 18 opções (placeholder + 17), seletor habilitado, seleção de cada texto e ID corretos, identidade operacional preservada e gravações restritas à origem autorizada.
- Meta Description e cadastros NOVO/USADO preservados pelos testes existentes. As cinco falhas preexistentes não foram objeto de correção; a suíte completa não foi repetida nesta etapa.

Homologação: na PR #2, abrir USADO com a conta técnica e conferir “Loja de origem dos modelos: Sebo Livraria Sul” e “17 modelos ativos disponíveis”. Selecionar um modelo, editar as observações, revisar e retornar. Conferir também idioma por extenso em NOVO/USADO e manutenção do aviso de origem não confirmada quando aplicável.
