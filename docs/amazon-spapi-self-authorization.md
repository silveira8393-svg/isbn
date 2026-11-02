# Provisionamento da autoautorização privada Silveira Lab

**Documento histórico. Não executar provisionamento para a consulta ISBN atual.** O fluxo vigente usa o refresh token protegido no servidor Vercel, sem armazenamento de autorização no Supabase. Consulte [o guia atual de consulta ISBN](amazon-spapi-env-query.md). Tabelas, dados e utilitário anterior foram preservados, mas não são dependências desse endpoint.

Complemento da PR #1, branch `feat/amazon-spapi-official`. O utilitário foi implementado e testado com dados sintéticos; o provisionamento real não foi executado. Nenhuma migração, consulta remota, autorização real, merge ou publicação foi realizada nesta etapa.

`vercel.json` desabilita deployments Git automáticos exclusivamente da branch `feat/amazon-spapi-official`, para permitir atualizar a PR sem publicar Preview. As demais branches mantêm o comportamento padrão. Homologação futura requer autorização e revisão separadas dessa configuração ou uso de uma branch própria de homologação.

## Revisão do ZIP

O ZIP `ISBN_SPAPI_autoautorizacao_finalizacao.zip` foi tratado como referência, não como código ou instruções automaticamente aprovados. A proposta usa o formato correto do armazenamento da PR: `store_id`, `selling_partner_id`, `ciphertext`, `iv`, `tag`, `key_version=1`, `updated_at`, AES-256-GCM e AAD `${store}:${seller}:v1`.

A implementação integrada reutiliza `encrypt` de `server/spapi/core.ts`, sem duplicar a criptografia do ZIP. O comando MJS compila esse módulo em memória com o esbuild já instalado no projeto; não gera arquivos com segredos. Não há nova dependência nem endpoint administrativo HTTP.

Correções sobre a proposta:

- URL Supabase exata, comparada com confirmação independente de um project ref de 20 caracteres: HTTPS, sem credenciais, domínio alternativo, porta, caminho, query, fragmento ou normalizações ambíguas.
- UUID completo da loja, confirmação `YES` da própria conta e leitura restrita de `stores.id` antes de qualquer inserção. O nome comercial do projeto não é consultado na API de gerenciamento: o operador deve confirmar que o ref pertence ao banco ISBN, e não ao `silveira-hub`.
- JWT de serviço legado precisa declarar `role=service_role` e o ref esperado. Essa leitura local não verifica a assinatura; a autenticação real continua sendo responsabilidade do Supabase. Chaves opacas `sb_secret_…` não carregam ref: são enviadas só em `apikey`, sem Bearer. O adaptador oficial de consulta também foi ajustado para esse formato; chaves legadas mantêm os cabeçalhos anteriores.
- Refresh token precisa começar com `Atzr|`, ter caracteres ASCII sem espaços/controles e no máximo 2048 caracteres. A função não confirma na Amazon que o token pertence ao vendedor informado; essa associação precisa ser conferida no momento da autoautorização.
- Lookup limitado a IDs, sem ler tokens existentes; erro de lookup bloqueia a escrita. A inserção usa POST simples com `return=minimal`, sem `on_conflict`/upsert. A chave primária composta já preparada na PR é a proteção atômica contra corrida; o SELECT prévio sozinho não bastaria. HTTP 409 impede sobrescrita e exige análise administrativa.
- Timeout total, limite de leitura, redirects proibidos, nenhum retry automático e códigos de erro fixos. O ZIP imprimia `error.message` de qualquer exceção; a CLI agora não imprime exceções brutas nem corpos HTTP.

## Execução administrativa futura

O comando é para um computador administrativo controlado e exige Node 24 e dependências do projeto instaladas (incluindo esbuild). Não executá-lo no frontend, numa rota HTTP, no build da Vercel ou automaticamente em CI. Não compartilhar chave privilegiada com usuários da aplicação.

Antes de executar, conferir o projeto ISBN e a associação entre loja, conta Silveira Lab, aplicativo LWA e vendedor. Revisar e validar em projeto de teste separado o SQL já preparado em `supabase/setup/amazon_spapi_official.sql`: schema, chave primária, RLS, permissões exclusivas de serviço e acesso PostgREST. Esta etapa não altera nem executa esse SQL.

Injetar as variáveis abaixo no processo por um gerenciador confiável de segredos. Não passar valores como argumentos, colar tokens no terminal/chat, usar capturas com segredos ou versionar arquivos contendo os valores. A CLI não carrega `.env.local` automaticamente.

| Variável | Valor esperado |
| --- | --- |
| `ISBN_EXPECTED_SUPABASE_PROJECT_REF` | Ref do projeto ISBN conferido independentemente no Dashboard; não copiar cegamente da URL de destino |
| `SUPABASE_URL` | `https://<ref>.supabase.co`, aceitando apenas uma barra final opcional |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta administrativa do projeto, `sb_secret_…` ou JWT service_role legado |
| `ISBN_CONFIRM_PRIVATE_OWN_ACCOUNT` | `YES`, somente para a própria conta Silveira Lab |
| `AMAZON_SPAPI_STORE_ID` | UUID da loja associada à própria conta, existente no projeto confirmado |
| `AMAZON_SPAPI_SELLER_ID` | ID da própria conta vendedora autoautorizada |
| `AMAZON_SPAPI_TOKEN_KEY` | A mesma chave AES de 64 caracteres hexadecimais que será usada nas Functions |
| `AMAZON_SPAPI_REFRESH_TOKEN` | Refresh token privado fornecido pela Amazon, somente neste processo administrativo |

Depois da revisão e preparação separadas, executar manualmente:

```text
npm.cmd run spapi:provision-self
```

Equivalente: `node scripts/provision-self-authorization.mjs`. Nenhum argumento é aceito. Exit code 0 significa que o Supabase confirmou a inserção com HTTP 201; exit code 1 significa abortado. A mensagem de sucesso não inclui IDs, tokens, chaves ou ciphertext. Remover o refresh token do ambiente/gerenciador de sessão administrativa após o uso; não configurá-lo na Vercel.

Execuções repetidas não atualizam autorizações existentes, mesmo com token/chave diferentes. O utilitário não oferece opção `force`. Para rotação, aplicar o procedimento administrativo separado da documentação principal. Se a conexão cair depois do envio, a escrita pode ter ocorrido: não há retry automático; verificar a situação antes de repetir. A prevenção concorrente depende da chave primária do SQL existente, que ainda precisa ser validada no banco real.

## Configuração restante para consultar ISBN oficialmente

1. Validar/preparar o banco ISBN em ambiente separado e provisionar o token privado conforme acima, usando exclusivamente a própria conta Silveira Lab. Confirmar que o app tem acesso ao catálogo e ao marketplace Brasil. Não foi usada credencial real para comprovar isso aqui.
2. No ambiente de homologação autorizado, configurar exclusivamente no servidor `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AMAZON_SPAPI_STORE_ID`, `AMAZON_SPAPI_SELLER_ID`, `AMAZON_SPAPI_TOKEN_KEY`, `AMAZON_SPAPI_APP_ID`, `AMAZON_SPAPI_CLIENT_ID`, `AMAZON_SPAPI_CLIENT_SECRET` e `AMAZON_SPAPI_ORIGIN`. A chave AES e a associação loja/vendedor devem ser exatamente as usadas no provisionamento. A configuração atual do handler ainda exige APP_ID e publishable key mesmo na consulta privada.
3. Habilitar `AMAZON_SPAPI_ENABLED=true` somente nesse ambiente revisado. **Manter `AMAZON_SPAPI_EXTERNAL_AUTH_APPROVED=false`**: a consulta usa a autorização já armazenada e não inicia OAuth externo. As URLs OAuth não precisam ser usadas para essa autoautorização; continuam documentadas para eventual fluxo público aprovado.
4. Ter usuário Supabase autenticado, perfil ativo e vínculo `developer` ativo na loja configurada. Enviar Bearer de sessão válida para `GET /api/amazon/spapi/catalog?isbn=9788535914849` na origem HTTPS exata. A resposta continua somente bibliográfica, para revisão humana; não escreve cadastros.
5. Em futura homologação autorizada, validar PostgREST, descriptografia, troca LWA e resposta Catalog Items ponta a ponta. Esta tarefa não executou publicação ou consulta real.

Autoautorização privada permite o acesso à própria organização; não libera atendimento externo a livrarias de terceiros. O ZIP relata exposição anterior de Client Secret/refresh token em capturas; isso não foi verificado nesta etapa. Se os valores a provisionar forem os expostos, revogar a autorização comprometida e rotacionar o segredo antes de utilizá-los. Gerar outro refresh token não invalida automaticamente o anterior, conforme a documentação Amazon.

## Testes e limites da evidência

`npm.cmd run test:spapi` executa OAuth/catálogo e o novo `tests/spapiProvision.test.mjs`. Os testes injetam ambiente sintético e transporte simulado, cobrem projeto incorreto, loja inexistente, chaves inválidas, AAD/IV/tag, decifragem pelo runtime existente, duplicação sequencial/concorrente, erros sem vazamento, subprocesso real da CLI sem credenciais e exclusão do provisionamento dos bundles HTTP/frontend. Há teste de fluxo completo simulado de provisionamento → armazenamento → refresh LWA → consulta ISBN, com autorização externa bloqueada.

Esses testes não substituem execução real do schema/RLS/PostgREST e não verificam credenciais ou autorização Amazon reais. Nenhuma tabela existente, Amazon experimental, Magazord ou cadastro foi modificado.

Validação local desta etapa (Node 24.19.0): TypeScript, lint (`tsc --noEmit`) e build aprovados; **35/35 testes SP-API**, incluindo 14 novos testes de provisionamento, aprovados. Suíte geral: **550 testes, 546 aprovados e as mesmas quatro falhas preexistentes** documentadas na etapa anterior (três mocks de `React.lazy` em infraestrutura e o marcador de fonte no teste Magazord). Permanecem os avisos conhecidos de bundle grande e import Supabase estático/dinâmico. O diff de `src/`, `experimentos/`, Amazon experimental e `supabase/` nesta etapa é vazio.

Arquivos desta etapa: `scripts/provision-self-authorization.mjs`, `server/spapi/provision.ts`, `server/spapi/supabaseHeaders.ts`, ajuste em `server/spapi/store.ts`, `tests/spapiProvision.test.mjs`, `.env.example`, `package.json`, `vercel.json`, esta documentação e o link na documentação principal.

Fontes oficiais: [Amazon: Authorize Private Applications](https://developer-docs.amazon/sp-api/docs/self-authorization), [Supabase: API keys](https://supabase.com/docs/guides/getting-started/api-keys), [PostgREST: Tables and Views](https://docs.postgrest.org/en/stable/references/api/tables_views.html), [Vercel: Git configuration](https://vercel.com/docs/project-configuration/git-configuration).
