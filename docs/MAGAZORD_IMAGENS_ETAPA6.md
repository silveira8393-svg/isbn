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
