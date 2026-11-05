# Galeria Curitiba — recuperação dinâmica serverless

Implementação em 05/11/2026 na branch `fix/curitiba-product-gallery`, sobre `cc2d2d53fd7abcf8081bc10815f7c95316a67f85`, mantido no histórico. Não incorpora o trabalho local pendente da PR #6. O relatório anterior descreve a etapa com leitura direta no navegador; este documento registra sua substituição pela Function solicitada.

## Fluxo implementado

1. A ficha Curitiba continua sendo consultada pelo mecanismo existente. A capa direta é disponibilizada normalmente, junto de um descritor validado de produto/índice; essa etapa não aguarda imagens adicionais.
2. App inicia um único GET para `/api/curitiba/gallery?product=...&index=...`, em paralelo ao restante da pesquisa. Não refaz BrasilAPI, Curitiba ou Amazon, nem cria outra operação de pesquisa.
3. A Function valida método, origem quando presente, parâmetros, domínio HTTPS, diretório e correspondência estrutural do produto. Recebe somente produto e índice. É uma rota de leitura de referências públicas; não depende de JWT, cookies da Curitiba, banco ou serviços administrativos. Não muda as rotas/autenticação existentes.
4. A conexão HTTPS mantém validação TLS normal, verifica o DNS no momento da conexão e rejeita IPs internos/reservados. Não encaminha headers do chamador, cookies, tokens ou Referer e não segue redirecionamentos. Faz no máximo uma leitura do índice, em 4 s e até 64 KiB, extraindo até 32 referências. Não lê arquivos de imagens.
5. O extrator anterior, reaproveitado em módulo compartilhado, aceita somente links realmente presentes no HTML, dentro do mesmo host/pasta/produto. Não executa scripts nem gera nomes. CAPTCHA, bloqueios, HTTP 403/404/429/503, timeout e respostas inválidas encerram o complemento, sem retry. Há exclusão concorrente por instância, sem fila; não é um limitador global distribuído.
6. A resposta contém somente um array JSON de URLs. O cliente revalida cada URL e limita sua leitura a 16 KiB e 6,5 s. Cabeçalhos/logs fornecem somente status, contagem e duração, sem URL/HTML/identificadores de sessão.
7. A chegada das referências acrescenta imagens à Consulta e ao draft atual, preservando capa, ordem, deduplicação, outras fontes e todos os demais campos. Respostas de pesquisa anterior, outra identidade/loja/ambiente, componente desmontado ou cadastro concluído não são aplicadas. Uma escolha/remoção manual de imagens não é desfeita.
8. Revisão ou upload em andamento adiam a aplicação ao draft até o retorno à edição, com as mesmas verificações. A Consulta pode receber a galeria enquanto a revisão mantém sua seleção estável. Nenhuma tela, botão, CSS ou etapa do operador foi acrescentada.

Não há download/armazenamento de fotografias, proxy genérico, cache persistente, migração, nova variável sensível ou alteração de permissões, Supabase, Magazord, SP-API, Lab ou lógica bibliográfica das demais fontes.

## Endpoint documentado e acesso público

Buscas nos domínios oficiais não localizaram documentação pública de uma API específica da galeria. Isso não prova sua inexistência. Não foram sondados endpoints alternativos. O site da distribuidora é uma aplicação JavaScript sem documentação de API exposta na página inicial consultada.

`https://conteudo.livrariascuritiba.com.br/robots.txt` retornou 404 em uma leitura controlada. Isso não constitui licença contratual. A implementação acessa somente o índice público informado pela ficha e interrompe se houver restrição; não há autenticação, CAPTCHA, spoofing de navegador ou proteção removida. A ausência de CORS no índice afeta a leitura por JavaScript no navegador, não exige mudar a autenticação ou a proteção do Preview para a leitura específica no servidor solicitada pelo responsável.

## Arquivos

- `api/curitiba/gallery.ts`: entrada Web Standard da Vercel/Node, duração máxima de 10 s.
- `server/curitibaGalleryFunction.ts`: contrato GET, validações, resposta JSON, status/logs restritos e exclusão por instância.
- `server/curitibaGalleryReader.ts`: leitura limitada, resposta parcial/HTML/bloqueios e extração sem imagens.
- `server/curitibaGalleryTransport.ts`: HTTPS e DNS público fixado na conexão, sem credenciais ou redirecionamentos.
- `src/utils/curitibaGallery.ts`: validação/extrator anterior reaproveitados.
- `src/services/distribuidoraCuritiba.ts`: ficha imediata e descritor do índice, mantendo o merge já aprovado.
- `src/services/curitibaGallery.ts`: chamada same-origin, revalidação e adição preservando draft.
- `src/App.tsx`: complemento secundário, cancelamento e proteção de estado/edições.
- `src/components/magazord/ProductRegistrationForm.tsx`: callback interno opcional de abertura/fechamento da revisão; sem alteração visual.
- `tests/curitibaGallery.test.mjs` e `scripts/test-curitiba-gallery-browser.mjs`: cobertura de Function/cliente e App real.

## Validação controlada

- 42/42 testes específicos aprovados: índice real preservado, ficha parcial, duplicatas, galeria preexistente, limites, timeout, HTTP 403/404/429/503, resposta inválida, CAPTCHA, URLs/produtos/hosts internos inválidos, DNS, ausência de credenciais, requisição única e rejeição concorrente sem fila.
- App real + React StrictMode + Edge isolado: nove cenários aprovados, dez pesquisas somente em memória, 60 chamadas controladas, dez tentativas de auditoria recusadas, nenhuma rede externa do aplicativo e nenhum erro de página.
- Capa + quatro adicionais chegam por NOVO/menu/USADO, inclusive quando o formulário abre antes da resposta. Edições de título/código/preço sobrevivem. Remoção manual não é revertida. Revisão aberta mantém as imagens estáveis e recebe o complemento ao retornar à edição. Resposta antiga não invade outra pesquisa. Falha de uma imagem mostra o tratamento existente sem apagar sua referência selecionada ou repetir a pesquisa.
- As imagens do ensaio offline receberam um pixel local via CDP, conservando `src`. Isso não comprova conteúdo ou disponibilidade real do CDN. Fixtures/simulações não são homologação externa.
- Tarô: o ensaio anterior com a ficha real e adicional sintética continua sendo apenas prova de preservação. Nenhuma segunda URL histórica é inventada.

TypeScript, lint, build e `git diff --check` aprovados. Suíte geral: 761 testes, 758 aprovados e as três falhas preexistentes do mock React.lazy em `infrastructureUi.test.mjs`, fora do escopo. Uma execução concorrente ao build também teve timeout no teste de inicialização Vite/Lab; ele passou isoladamente (11/11) e na suíte completa com `--test-concurrency=2`, sem alteração de seu código/timeout. Commit, Preview e resultado externo são registrados na entrega.

## Desempenho

A galeria deixou de acrescentar até 4 s à espera da ficha. Há uma chamada secundária por pesquisa elegível, sem polling ou retries. O tempo real da Function ainda precisa ser medido no Preview. Nenhum teste representa uma garantia de latência da fonte.

## Homologação externa

Pendente da publicação do novo Preview e de uma leitura controlada de cada índice pela rota publicada: Gravity Falls e Tarô. O teste real deve distinguir recuperação de URLs na Vercel, carregamento dos arquivos pelo navegador e fluxo autenticado da aplicação. A pesquisa publicada registra operação automaticamente; não será acionada silenciosamente para transformar um teste de leitura em gravação no Supabase.

Não se declara homologação completa antes de observar os limites reais. A PR continua ausente no início desta etapa; a criação anterior foi negada pelo conector GitHub (403). Caso a permissão continue indisponível, a entrega inclui comparação manual sobre a PR #6. Nenhum merge ou publicação em produção é autorizado.
