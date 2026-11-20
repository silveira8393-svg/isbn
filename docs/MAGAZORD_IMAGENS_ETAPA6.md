# ISBN → Magazord — Etapa 6: imagens (projeto seguro, sem escrita habilitada)

Estado: contrato de upload e de associação confirmado em 2026-11-20; helpers puros e fixtures incluídos. **Sem endpoint de escrita, sem upload real, sem mudança em produção**.

## Premissas homologadas
- A confirmação de Pai e Filho já consta no journal `magazord_registration_jobs`: usar o `registrationId` e os códigos confirmados, sem novo GET de existência.
- Destino exclusivo: Magazord homologação da Silveira Lab, branch `feature/magazord-homologacao-etapa3`. Nunca reapontar a conexão de produção da Livraria Sul.
- Usuário com sessão, MFA, loja vinculada; somente produtos criados pela operação registrada, jamais SKU arbitrário.
- Capa principal primeiro, demais imagens na ordem de seleção; seleção definitiva congelada na operação. Fotos privadas somente sob controle de acesso existente.
- Não reenviar POST/PUT se o resultado da requisição for desconhecido. Persistir estágio *started* antes de qualquer operação remota; reconciliação manual segura se ocorrer falha após envio.
- Não substituir mídias associadas preexistentes. Preferir POST de relação (adicionar) ao PUT (alterar relações), sujeito à verificação de semântica; não supor idempotência.
- Não fazer chamadas de verificação restritivas para Pai/Filho; respostas positivas de escritas podem servir de confirmação do próprio envio.

## Código existente confirmado
- `src/types.ts`: `mainImageUrl`, `additionalImageUrls`.
- `src/components/magazord/ImagesSection.tsx`: seleção de capa, adicionais, URLs e fotografias locais.
- `src/utils/imageUrls.ts`: validação, SHA-256, deduplicação; bucket privado `isbn-registration-images` no Supabase Storage.
- Bucket confirmado no projeto ISBN: privado; 5 MiB; JPEG, PNG, WebP; policies de leitura e inserção presentes.
- Em `shared/magazordRegistration.ts`, as imagens ainda NÃO são incluídas na operação congelada do cadastro real. Incluir snapshot de referências/ordem antes do início da etapa 6; preservar compatibilidade com registros anteriores.

## API oficial, sem inferir corpo não documentado
- `POST /v2/site/midia/upload`: cadastrar mídia; o OpenAPI v1 detalha JSON com `tipo:6` (derivação), `plataforma:1` (todas), `tipoMidia:1` (imagem), `midiaFile` (Base64), `nomeArquivo` (com extensão). Resposta 201: `status: success`, `data.id` (texto numérico). Contrato puro em `shared/magazordMedia.ts`, teste em `tests/magazordMedia.test.mjs`.
- `POST /v2/site/produto/{pai}/derivacao/{filho}/midia`: adicionar relação ao Filho com `{midiaId:[105,106]}`; documentação v1 confirma que POST preserva relações não informadas.
- `PUT /v2/site/produto/{pai}/derivacao/{filho}/midia`: alterar relações; risco de substituição, NÃO usar como primeira opção.
- `GET /v2/site/produto/{pai}/derivacao/{filho}/midia`: consulta disponível, mas NÃO deve ser exigida no fluxo normal.
- Referências oficiais: https://docs-v2.api.magazord.com.br/api/post-midia/ , https://docs-v2.api.magazord.com.br/api/post-midia-relaciona-produto-yaml/ , https://docs-v2.api.magazord.com.br/api/put-midia-relaciona-produto-yaml/ .

## Operação segura planejada
1. Após `registration_verified`, congelar fotos, códigos e usuário/loja em uma operação com journal único por `registrationId`.
2. Preparar/validar cada imagem: URLs externas precisam de defesa contra SSRF e limites de bytes/tempo; fotos privadas devem ser lidas pelo servidor com autorização; não registrar bytes/secrets nos logs.
3. Reservar escrita do upload *antes* da chamada externa. Em sucesso HTTP inequívoco, armazenar `midiaId` retornado; em resultado incerto, bloquear repetição e exigir reconciliação.
4. Relacionar as mídias **somente** depois de todos os IDs conhecidos; reservar a operação de relação antes da chamada, sem reenviar em timeout.
5. Registrar `media_verified` somente quando Magazord confirmar a operação; exibir situação em UI.
6. Não incorporar nova função Vercel (limite Hobby 12 functions): reutilizar rota autenticada existente mediante despacho explícito e seguro.

## Bloqueadores antes de habilitar API
1. **Concluído para JSON**: contrato de upload/ID documentado na referência oficial v1; validar com fixtures antes da primeira escrita real.
2. **Parcial**: POST é aditivo sem remover as mídias anteriores; ainda falta validar ordem/capa principal no painel para múltiplas imagens.
3. Definir estratégia segura de imagens externas (origens autorizadas, proxy binário, não redirecionar para hosts privados, limites por arquivo).
4. Journal persistente e testes de falha após chamada para garantir que cada escrita seja no máximo uma tentativa por etapa. Sem consulta redundante de Pai/Filho.
5. Testes locais completos; só depois habilitar uma única operação real na homologação.

Nenhuma etapa deste documento executa upload, associação, ativação ou qualquer ação em produção.

## Evidência adicional
- Fonte OpenAPI v1 pesquisável: https://docs-v1.api.magazord.com.br/ (Adicionar Mídia; Relacionar Mídias com Produto Derivação).
- `shared/magazordMedia.ts` apenas constrói/valida payloads, não envia requests; `tests/magazordMedia.test.mjs` cobre contrato e campos inválidos.
- Ainda não há journal de mídia, backend de envio nem acionamento pela UI. Não concluir que o fluxo está homologado.

## Implementação — 20/11/2026 (continuação)
- Journal `public.magazord_media_jobs` aplicado no projeto Supabase ISBN, RLS habilitada, nenhuma operação registrada até a conferência de 20/11.
- `server/magazordMedia.ts`: `lookup`, `prepare`, `upload`, `link`, `status`. Produção bloqueada pela URL exata de homologação. MFA e vínculo de loja ativos.
- `lookup` consulta apenas `magazord_registration_jobs`, filtrando usuário, loja, Pai e Filho; o LVP013 consta como `verified`.
- `api/magazord/price.ts` despacha `?media=1` à implementação dedicada sem aumentar o número de functions Hobby.
- `src/services/magazordMedia.ts` e `src/components/magazord/MagazordMedia.tsx`: sessão autenticada e ações separadas com confirmação manual. `MagazordExistingMedia.tsx` retoma cadastro já registrado entre diferentes URLs de Preview sem recriar produto.
- As imagens selecionadas são congeladas em `sessionStorage` na preparação. O servidor valida o fingerprint/posição contra o journal e recusa trocar referência de mídia após reserva.
- Cada mídia só avança `prepared → upload_started → uploaded → link_started → linked` por CAS persistente; ações interrompidas em `*_started` não são reenviadas. A imagem fonte é obtida antes do marco irreversível de envio externo.
- `GET` de produto Pai/Filho na Magazord **não ocorre nesta etapa**. Associação `POST`, sem `PUT` destrutivo; retorna confirmação apenas com HTTP 201 e envelope `status:success`.
- Fontes aceitas pelo backend: fotos privadas do bucket e hosts conhecidos da Amazon / Google Books HTTPS; capas HTTP do Google Books são normalizadas para HTTPS. URLs externas genéricas não são prometidas como suportadas e exigem fluxo local autorizado. JPEG/PNG/WebP até 5 MiB.
- `tests/magazordMedia.test.mjs` e `tests/magazordMediaFlow.test.mjs` incluem fixtures de payload, upload, associação, perda de respostas, bloqueio de produção e recuperação por journal. **Testes adicionados, ainda não executados com Node**.
- O build da Vercel em Preview não comprova a execução da suíte Node; executar antes do teste real:
  `npm run typecheck`
  `node --test tests/magazordMedia.test.mjs tests/magazordMediaFlow.test.mjs`
  `node --test tests/magazordStock.test.mjs tests/magazordPrice.test.mjs`

## Homologação manual pendente (LVP013)
1. Abrir o último Preview da branch, autenticar com a conta que criou LVP013 e confirmar MFA.
2. Se não houver sessão do cadastro antigo, usar **Retomar imagens de livro já homologado**, Pai `LVP013`, Filho `9788532530837`.
3. Selecionar somente **uma capa** válida da Amazon/Google Books ou uma foto local já armazenada pelo ISBN. Verificar visualmente antes.
4. Acionar **Preparar imagem (sem envio)** e conferir o estado.
5. Após testes automatizados, acionar **Confirmar upload desta imagem** e **Associar imagem ao Filho** individualmente.
6. Conferir a imagem na aba **4 — Mídias** do LVP013 na Magazord de homologação; confirmar a posição da capa principal e eventual imagem auxiliar. Não ativar produto nem fazer qualquer gravação em produção.
7. Se um estado for incerto, parar: reconciliar manualmente; nunca repetir POST.

**Não homologado ainda:** retorno real com imagem, comportamento da capa principal e ordenação de várias imagens no painel, formatos externos fora da lista segura.
