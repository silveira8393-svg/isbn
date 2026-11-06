# Magazord — categorias reais, somente leitura

Base: tag `isbn-cadastro-manual-homologado-v1.4.1`, commit
`41307cab20408ec72e40f03377ed906c98caaa63`.
Branch: `feature/magazord-categorias-reais`.

## Contrato e segurança

`GET /api/magazord/categories`, com sessão ISBN Bearer e `x-isbn-store-id`.
Reutiliza a validação existente de Auth, perfil ativo, vínculo ativo com função
developer/admin/operator e loja ativa, sob o token/RLS do próprio usuário.
A loja solicitada deve corresponder a `MAGAZORD_STORE_ID` no servidor.
Nenhuma chave administrativa é necessária para esta rota.

Somente `GET /v2/site/categoria` é utilizado na Magazord. Paginação de 100,
ordenada por ID, com limite defensivo de 100 páginas, resposta limitada e prazo
total de 20 segundos. Falhas não revelam respostas ou credenciais da API.
Cache de cinco minutos no processo servidor e no cliente; chamadas concorrentes
compartilham a mesma consulta. A atualização explícita tem intervalo mínimo de
30 segundos no servidor. Instâncias frias podem precisar reconstruir o cache;
não há cache público/CDN nem persistência de credenciais no navegador.

IDs, nomes e pais são preservados. Caminhos completos distinguem nomes repetidos.
Ramos órfãos/circulares são excluídos da seleção, sem reparentear registros.
Falha na atualização mantém catálogo anterior, seleção e campos editados.
Apenas a revisão/conclusão exige seleção real da loja corrente; abrir e editar
o formulário continua possível sem conexão. Seleções simuladas antigas são
identificadas como anteriores e exigem nova seleção, sem conversão silenciosa.
Produtos e estoque continuam no simulador existente.

## Configuração do Preview pelo responsável

No projeto `isbn` da Vercel, Settings → Environment Variables, selecionar somente
**Preview**, restrito à branch `feature/magazord-categorias-reais`:

- `MAGAZORD_BASE_URL`: `https://livrariasul.painel.magazord.com.br/api`
- `MAGAZORD_API_USER`: inserir diretamente o usuário/token oficial como Secret.
- `MAGAZORD_API_PASSWORD`: inserir diretamente a senha oficial como Secret.
- `MAGAZORD_STORE_ID`: UUID da loja operacional Sebo Livraria Sul no ISBN.

Não selecionar Production. Não usar prefixo `VITE_` nos segredos Magazord.
As variáveis Supabase já existentes de Preview são reutilizadas.
Não copiar arquivos de credenciais para o novo worktree, Git ou artefatos.
Variáveis adicionadas após a publicação exigem um novo Preview autorizado.

## Verificação

`node --test tests/magazordCategories.test.mjs` e testes direcionados anteriores.
`node tests/magazordCategories.browser.mjs` usa apenas fixtures e servidor local,
exercitando formulário → sessão → API → árvore, falha/repetição e seleção por ID.
`npm run typecheck` e `npm run build`.

Consulta real local: cinco GETs, 428 categorias, quatro raízes, profundidade
máxima quatro (cinco níveis), zero referências inválidas, IDs únicos.
Isso não comprova acesso real pelo Preview enquanto suas variáveis estiverem
ausentes; autenticação ISBN do Preview deve ser homologada com sessão válida.
