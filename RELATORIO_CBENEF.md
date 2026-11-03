# Benefício Fiscal (cBenef) — PR #2

Implementação pontual em `fix/condition-templates-meta-description`, a partir de `9691b44`.

## Comportamento

- Novo campo opcional `fiscalBenefitCode` no rascunho. Cadastros NOVO e USADO começam com `SC800001`.
- Campo de texto editável em Configurações Fiscais & Avançadas, próximo de NCM e Origem Fiscal; pode ser limpo.
- Orientação exibida: “Padrão sugerido: SC800001. Altere quando necessário, conforme orientação fiscal da loja.” Trata-se de padrão operacional provisório da livraria, sujeito à confirmação do proprietário/contador para cada operação, sem regra fiscal universal no código.
- Edição e limpeza preservadas na revisão/retorno e na reabertura do mesmo rascunho. Um novo produto recebe novamente a sugestão.
- Revisão, payload do cadastro simulado, catálogo simulado local e snapshot de auditoria preservam exatamente o texto informado, inclusive vazio. Registros antigos continuam sem o atributo, sem preenchimento retroativo.
- NCM, origem fiscal e unidade não são modificados pelo cBenef; nenhum valor de cBenef bloqueia o cadastro. Sem validação fiscal nova, API real ou nome de parâmetro Magazord presumido.

## Arquivos modificados

- `src/types.ts`: campo opcional no `RegistrationDraft`.
- `src/utils/draft.ts`: sugestão inicial.
- `src/components/magazord/AdvancedFiscalSection.tsx`: campo e orientação.
- `src/App.tsx`: preservação ao reabrir o mesmo rascunho.
- `src/components/magazord/ProductRegistrationForm.tsx`: apresentação na revisão; a estrutura existente encaminha o campo na confirmação.
- `src/utils/registrationSnapshot.ts`: inclusão na lista de campos do snapshot/auditoria existente.
- `src/services/magazordMockService.ts`: somente a propriedade opcional no registro local e sua cópia exata do rascunho; regras e comportamento do simulador mantidos.
- Testes em `postHomologation.test.mjs`, `operations.test.mjs` e `magazordIsolation.test.mjs`.

## Validação

- **126 testes relacionados aprovados**, com componentes/handlers reais e dependências controladas: `postHomologation`, `operations`, `magazordIsolation`, `metaDescription`, `conditionTemplates`, `conditionTemplateImport`.
- Cobertura de padrão NOVO/USADO, edição, limpeza, reabertura, revisão/retorno, submissão, snapshot/auditoria, persistência/releitura do simulador, registros antigos e preservação dos demais atributos fiscais.
- TypeScript, lint e build aprovados. Apenas o aviso já conhecido de tamanho do bundle.
- As cinco falhas preexistentes documentadas no relatório anterior não foram corrigidas. A suíte completa não foi repetida nesta etapa.
- Nenhuma alteração de Supabase, loja, modelos, fontes bibliográficas, preço, idioma, imagens, permissões ou configuração Amazon. Nenhuma dependência, tabela, migração, API ou serviço novo.

## Homologação

Abrir um NOVO e um USADO; expandir Configurações Fiscais & Avançadas. Conferir `SC800001`, substituir e depois limpar. Abrir a revisão e retornar; confirmar que o conteúdo permanece. Confirmar um cadastro simulado e conferir o snapshot. Iniciar outro produto e verificar a nova sugestão `SC800001`.

Merge na main e publicação em produção não foram executados.
