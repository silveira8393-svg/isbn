# ISBN — aplicar MFA nas políticas de Storage

**Preparação local; nada aplicado.** Projeto existente: `jcxdkrpmrfbrhzwbzhph`.
Executar qualquer etapa no painel somente após autorização expressa, na janela coordenada
descrita em [MFA_TOTP.md](MFA_TOTP.md). Não criar projetos ou ambientes adicionais.

## Caminho suportado

Utilizar o **Supabase Dashboard → Storage → Policies**, autenticado com uma conta que possa
administrar as políticas do projeto. A documentação oficial oferece esse editor para gerenciar
as regras de acesso a arquivos:

- https://supabase.com/docs/guides/storage/quickstart#add-security-rules
- https://supabase.com/docs/guides/storage/security/access-control

A investigação anterior encontrou `storage.objects` pertencente a `supabase_storage_admin`;
a conexão SQL disponível (`postgres`) não possui a propriedade nem pode assumir esse papel.
Por isso o SQL principal de MFA NÃO tenta criar/alterar políticas em `storage.objects`.

Não usar `ALTER OWNER`, concessões de papéis, funções SECURITY DEFINER para executar DDL,
segredos internos da plataforma, ou service role como substituto de propriedade SQL.
Não pressupor um endpoint HTTP de gestão de policies que não esteja documentado oficialmente.

## Alteração mínima, preservando as regras atuais

Editar exatamente as duas políticas existentes, sem criar uma nova política permissiva:

| Política existente | Comando/papel preservados | Campo a editar | Expressão preparada |
| --- | --- | --- | --- |
| `isbn_registration_images_read` | SELECT / authenticated / PERMISSIVE | USING | `supabase/setup/mfa_storage_read_predicate.sql` |
| `isbn_registration_images_insert` | INSERT / authenticated / PERMISSIVE | WITH CHECK | `supabase/setup/mfa_storage_insert_predicate.sql` |

As expressões preservam INTEGRALMENTE os predicados auditados e acrescentam:

```sql
(predicado_original_inteiro)
AND ((select auth.jwt()->>'aal') = 'aal2')
```

Assim permanecem as condições de bucket, perfil ativo, vínculo/loja, papel, diretório de
usuário e nome/formato de arquivo. Não acrescentar UPDATE/DELETE ou tornar o bucket público.
Não criar uma policy permissiva cujo único critério seja MFA: ela seria combinada por OR
com as existentes e poderia ampliar acesso. Não é necessário que o editor suporte RESTRICTIVE:
neste caminho a exigência de MFA fica dentro de cada permissão já existente.

O snapshot de referência está em `supabase/setup/mfa_storage_baseline.json` e contém somente
metadados, sem imagens, tokens ou dados de usuários. Os arquivos de predicado são fragmentos
para o editor, NÃO comandos SQL autônomos; não os executar com execute_sql ou no SQL Editor.

## Aplicação controlada, somente após autorização

1. Confirmar o ref do projeto e exportar novamente as políticas imediatamente antes da mudança.
   Conferir modo, comandos, papéis, USING e WITH CHECK contra o snapshot. Se houver diferenças,
   interromper e revisar; não sobrescrever mudanças posteriores com o snapshot antigo.
2. Inventariar TODAS as políticas de `storage.objects`. Na auditoria existiam somente essas duas.
   Se houver outras policies aplicáveis ao bucket por OR, elas também precisam ser analisadas:
   acrescentar MFA só nestas duas não garante cobertura de uma nova permissão ampla.
3. Confirmar que `isbn-registration-images` continua privado.
4. No editor de Storage, editar cada policy preservando seu nome/comando/papel/modo.
   Inserir o predicado completo preparado no campo correto e conferir a prévia antes de salvar.
5. Ler novamente `pg_policies` por um acesso de leitura autorizado ou pelo painel. Confirmar
   os predicados completos, com AND externo envolvendo toda a condição antiga.
6. Testar por API Storage com tokens reais: aal1 e anon não podem listar/baixar/enviar;
   aal2 deve permitir só as operações previamente autorizadas do usuário/loja.
   Incluir downloads de caminhos conhecidos, não apenas listagens e telas.
7. Testar perfil/vínculo inativo, outra loja e outro diretório de usuário; todos continuam negados
   onde já eram negados. Confirmar que UPDATE/DELETE não foram liberados.

Não foi aberto o painel nem foi feito um salvamento nesta entrega. A capacidade efetiva de
edição com a conta do operador e os testes de Storage permanecem pendentes de homologação.
Se o editor também recusar a alteração por propriedade/permissão, PARAR e abrir atendimento
oficial do Supabase para o projeto. Não contornar a restrição e não aprovar a publicação.

## Reexecução e reversão

- Reexecução: se o predicado já for o original AND aal2, não acrescentar a condição outra vez;
  apenas conferir as duas policies e todos os outros caminhos aplicáveis ao bucket.
- Não há automatismo local que salve essas mudanças no painel.
- Falha durante a ativação: manter o acesso externo fechado até completar/corrigir as duas
  edições. Não reabrir a aplicação com apenas parte da cobertura verificada.
- Reversão emergencial exige autorização específica: com aplicação/APIs fechadas, restaurar
  os predicados exportados IMEDIATAMENTE antes da alteração, nos mesmos campos e atributos.
  O JSON auditado é referência; ele não substitui o snapshot da janela real se houver drift.
- Não excluir políticas, bucket, arquivos ou usuários; não restaurar concessões amplas.
- Restaurar o predicado antigo remove a exigência explícita MFA e precisa permanecer sob
  manutenção até uma nova decisão autorizada. Reverter o frontend sozinho não é seguro.
