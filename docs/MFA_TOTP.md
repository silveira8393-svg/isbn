# ISBN — MFA/TOTP básico — desenvolvimento

Solicitação: Marcos, 16/11/2026. Branch: `feature/isbn-2fa-totp`, criada no commit
`95e2c7d` da branch `release/isbn-v1.5.0-production`. Sem commit, merge, push ou deployment.
`RELATORIO_CODEX.md` tinha alterações locais anteriores e não foi editado nesta entrega.

## Estado da entrega

Fluxo básico implementado no código de desenvolvimento. **NÃO ESTÁ PRONTO PARA PRODUÇÃO.**
O banco remoto não foi alterado. A investigação posterior consultou somente metadados
e código publicado; esta etapa de correção NÃO executou SQL no Supabase. As proteções
permanecem locais até uma aplicação/publicação autorizada e homologada.

**Atualização de segurança:** aplicação, reversão, arquivos e resultados da correção em
[MFA_SECURITY_CORRECTIONS.md](MFA_SECURITY_CORRECTIONS.md). O roteiro de Storage está em
[MFA_STORAGE.md](MFA_STORAGE.md). Não criar projetos ou ambientes adicionais.

Não foram alteradas variáveis de ambiente, configurações ou contas reais. Não há dependências
novas nem implementação própria de geração/validação TOTP. O Silveira Hub não participa.

## Comportamento

- Mantém o login existente de e-mail/senha com Supabase Auth.
- Antes de consultar perfil, vínculos e lojas, verifica MFA nativo com o token da sessão.
- Sessão `aal1` não monta a aplicação protegida, para operator, admin e developer.
- Sem TOTP confirmado: QR Code, chave manual e confirmação de seis dígitos obrigatória.
- Com TOTP confirmado: desafio e validação nativos. Seleciona fator se já existir mais de um.
- Código incorreto, falha de rede ou indisponibilidade não liberam acesso.
- Configuração interrompida: remove apenas fatores TOTP não confirmados e reinicia o cadastro;
  o segredo de uma inscrição anterior não pode ser recuperado para reapresentar seu QR Code.
- Replay de efeitos no React StrictMode compartilha uma única preparação em andamento.
- Cadastro só continua enquanto a tela está montada e a identidade continua sendo a mesma.
- Segredos e códigos ficam apenas na memória da tela; sem logs ou persistência próprios.
- Logout local e recuperação de senha existentes continuam disponíveis. Recuperar a senha
  não elimina o requisito MFA para voltar às funcionalidades.
- Renovação válida `aal2` da mesma identidade preserva a montagem da aplicação; downgrade
  para `aal1` fecha o acesso imediatamente. Respostas atrasadas não reabrem após logout.
- Não há botão para ignorar, desativar ou remover um autenticador confirmado. Perda do
  aparelho exige futuro procedimento administrativo seguro, sem exceção de acesso.

## Arquivos criados

| Arquivo | Finalidade |
| --- | --- |
| `src/components/MfaChallenge.tsx` | Cadastro e desafio TOTP na identidade visual atual. |
| `src/services/mfaHeaders.ts` | Encaminhamento da sessão às consultas Google Books/Curitiba. |
| `supabase/functions/_shared/mfa.ts` | Leitura de `aal` e associação ao usuário após validação do token. |
| `server/mfaAuthorization.ts` | Barreira HTTP de MFA para handlers de fontes já existentes. |
| `supabase/setup/mfa_required_review.sql` | SQL somente para revisão; nunca executado. |
| `tests/mfa.test.mjs` | Testes isolados do fluxo, barreiras HTTP e função administrativa. |
| `tests/helpers/mfa.mjs` | JWTs sintéticos e simulação de cabeçalhos em testes. |
| `docs/MFA_TOTP.md` | Entrega, limitações e homologação. |

## Arquivos modificados

- `src/contexts/UserContext.tsx`: acrescenta os estados MFA e bloqueia consultas/montagem.
- `server/amazonAuthorization.ts`: exige MFA após validação do token atual no Auth;
  mantém perfis, vínculos e lojas, incluindo a autorização compartilhada com Magazord.
- `server/spapi/store.ts`: exige MFA antes das consultas/autorização privilegiadas.
- `server/spapi/handler.ts`: usa um prefixo versionado nos hashes de estado OAuth e vínculo
  ao navegador, impedindo continuação de estados anteriores à obrigatoriedade de MFA.
  O início exige `aal2`; callbacks continuam vinculados ao início aprovado, sem mudar
  o protocolo da Amazon nem adicionar colunas. Consentimentos pendentes antigos precisam reiniciar.
- `supabase/functions/manage-store-users/handler.ts`: exige MFA antes de operações
  administrativas que usam service role e contornam RLS.
- `api/google-books.ts`, `api/curitiba/gallery.ts`, `api/curitiba/product-link.ts`:
  envolvem os handlers existentes na barreira de MFA.
- `src/services/googleBooks.ts`, `src/services/curitibaGallery.ts`,
  `src/services/curitibaProductLink.ts`: acrescentam somente o cabeçalho da sessão.
  Transformações bibliográficas, regras de seleção, imagens e contratos não mudam.
- `vite.config.ts`: aplica a mesma proteção aos handlers locais e encaminha Authorization.
- Testes adaptados para sessões sintéticas MFA: `amazonVercel`, `spapiOfficial`,
  `spapiIntegrated`, `magazordCategories`, `magazordProducts`, `manageStoreUsers`,
  `storeSelection`, `googleBooks`, `titleSearch`, `curitibaProductLink`.

Não foram modificados App, histórico, regras bibliográficas, formulários de cadastro,
categorias, transportes Magazord, package.json ou lockfile.

## Garantias e limites das verificações de token

No backend, a leitura de `aal` só acontece DEPOIS de o Supabase Auth validar o mesmo Bearer
usado na requisição. O `sub` também deve corresponder ao ID retornado por Auth.
O helper compartilhado não verifica assinatura e não pode substituir essa validação.
Flags do cliente, `user_metadata`, papel administrativo ou fator cadastrado não concedem MFA.

O frontend usa a leitura local apenas para fechar imediatamente uma sessão rebaixada;
a liberação inicial também exige a verificação nativa com o token, seguida da autorização
existente por perfil/loja. Banco e APIs são as fronteiras reais de segurança.

## Pendências obrigatórias antes de produção

1. Autorizar a janela de manutenção e os testes controlados no projeto ISBN existente;
   não criar projetos, bancos ou ambientes adicionais.
2. Reconfirmar inventário e drift antes da ativação. A revisão anterior examinou as
   18 policies e os backends publicados, mas não confirmou todos os schemas expostos
   pela Data API nem a configuração efetiva de enrollment/verification TOTP.
3. Aplicar o SQL público e editar Storage pelo painel, somente após autorização e conforme
   MFA_SECURITY_CORRECTIONS.md / MFA_STORAGE.md. Nenhuma alteração remota foi aplicada.
4. Publicar ambos os backends corrigidos e frontend/APIs somente após autorização.
   As versões remotas auditadas (infrastructure-control v2 e manage-store-users v10)
   não incluem as proteções locais. Service role não é limitado por policies RLS.
5. Homologar acessos reais aal1/aal2, papéis/lojas, RPCs, Storage e integrações.
   Os testes simulados e contratos estáticos SQL não comprovam proteção em produção.
6. Homologar os dois autenticadores e a recuperação de senha com contas de teste e
   procedimento autorizado; não modificar usuários reais nesta preparação.

Não foi implementada recuperação alternativa, SMS, códigos de backup, sincronização de
segredos ou gerenciamento complexo de dispositivos. O cadastro de um novo fator pode
encerrar outras sessões pelo comportamento nativo do Supabase; planejar a ativação fora
de operações em andamento e avisar sobre nova autenticação. Não apagar históricos/dados.
Tokens já emitidos e revogação imediata precisam de avaliação no futuro procedimento de perda.

## Homologação, após autorização

1. Usar o projeto ISBN existente somente nas ações de validação autorizadas para a janela.
   Não criar projetos ou ambientes adicionais; nunca expor chave administrativa no navegador.
2. Seguir MFA_SECURITY_CORRECTIONS.md para publicar ambas as funções e frontend/APIs,
   aplicar o SQL público e editar Storage pelo painel, somente após autorização expressa.
3. Executar `npm run typecheck`, `npm run build` e os testes abaixo. Depois iniciar `npm run dev`.
4. Para cada papel, confirmar senha inválida, senha válida, QR Code/chave manual, código
   incorreto e correto, F5 antes/depois do cadastro, sair, novo login e múltiplas abas.
5. Antes do código, chamar APIs diretamente com o JWT `aal1`: esperar 403 (mfa_required
   nas rotas que expõem esse código; Magazord preserva seu contrato de erro de acesso)
   sem tráfego às integrações ou mutações; sem token, esperar 401.
6. Com JWT `aal1`, testar Data API e Storage diretamente: nenhuma linha, escrita ou download
   protegido pode ser autorizado. SELECT pode retornar lista vazia em vez de 403 por RLS.
   Testar também anon, views e RPCs; ausência de dados na UI não é prova dessa proteção.
7. Com `aal2`, repetir operações autorizadas, negar acesso entre lojas e confirmar que
   bloqueios por perfil inativo/vínculo revogado continuam funcionando.
8. Validar cadastro, histórico, produção, usuários, imagens, Amazon e consultas Magazord.
   Só considerar candidato a produção quando todas as pendências estiverem resolvidas.

Documentação oficial consultada:
- https://supabase.com/docs/guides/auth/auth-mfa/totp
- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/reference/javascript/auth-mfa-enroll

## Testes locais

Todos os testes de MFA usam Auth simulado, códigos e JWTs sintéticos. Não comprovam
configuração do serviço remoto, leitura real de QR Code ou aplicação das policies.
O ambiente disponível usa Node v26.13.0; o projeto declara Node 24.x, que também precisa
ser usado na homologação final. Nenhuma dependência foi atualizada para os testes.

Resultados da etapa inicial em 16/11/2026 (a correção posterior está em MFA_SECURITY_CORRECTIONS.md):

| Verificação | Resultado |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit` | Aprovado, sem erros. |
| `node node_modules/vite/bin/vite.js build --outDir .mfa-build` | Build concluído; avisos de tamanho de bundle/importação dinâmica, sem atualização de dependências. |
| Suíte direcionada abaixo | 275 testes aprovados, nenhuma falha. |
| `node --test tests/*.test.mjs` | 1.036 testes: 980 aprovados, 56 falhas. |
| Mesma suíte na cópia temporária do commit `95e2c7d`, sem alterações | 1.013 testes: 956 aprovados, 57 falhas. |
| Comparação nominal das falhas | Nenhuma falha nova; as 56 finais também falham na base. |
| `git diff --check` | Sem erros de whitespace. |

Comando da suíte direcionada:

```powershell
node --test tests/mfa.test.mjs tests/storeSelection.test.mjs tests/amazonVercel.test.mjs tests/spapiOfficial.test.mjs tests/manageStoreUsers.test.mjs tests/magazordCategories.test.mjs tests/googleBooks.test.mjs tests/titleSearch.test.mjs tests/curitibaProductLink.test.mjs
```

Cobertura nova: login existente, QR/chave manual, seis dígitos com zero inicial,
código incorreto, reentrada, sessão restaurada em aal1, três papéis, downgrade,
logout durante resposta pendente, falha/repetição de preparação, replay de efeitos,
cadastro interrompido e troca de identidade, Auth indisponível/token rejeitado,
requisições diretas aal1 às rotas Google/Curitiba, Magazord, autorizadores Amazon/SP-API
e função administrativa, além de rejeição de estados OAuth anteriores ao MFA.

As falhas preexistentes incluem expectativas antigas de bibliografia/apresentação,
harnesses de telas e testes que comparam arquivos com commits históricos de funcionalidades.
O teste de inicialização local Vite/proxy falhou na base e passou na execução final;
essa variação explica a diferença de uma falha. Não foram alteradas regras de negócio
nem relaxados esses testes para deixar a suíte geral verde.

Logs locais, ignorados pelo Git: `.mfa-targeted.log`, `.mfa-final-tests.log`,
`.mfa-baseline-tests.log` e `.mfa-build.log`. A cópia temporária da base foi removida;
o build foi feito em diretório separado para preservar o `dist` existente.
