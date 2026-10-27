# Laboratório Amazon — desenvolvimento local e Vercel

Atualizado em 26/10/2026. A consulta HTTP e a galeria funcionam diretamente,
sem confirmações por consulta ou flags de autorização de imagens. O laboratório
permanece experimental e isolado da pesquisa operacional e do cadastro.
O fluxo padrão usa TypeScript, sem servidor Python. Veja o
[relatório de migração](RELATORIO_MIGRACAO_TYPESCRIPT.md).

Atualização de 27/10/2026: a adaptação para Vercel está preparada, sem publicação.
No build publicado, o painel usa a Function autenticada `/api/amazon`, exclusiva
ao perfil Desenvolvimento ativo. Em desenvolvimento, mantém o serviço local
em `127.0.0.1:8765`. Consulte o [relatório de homologação Vercel](RELATORIO_VERCEL_HOMOLOGACAO.md)
para as variáveis de ambiente, o checkout isolado e os testes antes do deploy.

## Iniciar

Na raiz `C:\Desenvolv\isbn`:

```powershell
npm.cmd run dev:amazon:online
```

O comando inicia o serviço TypeScript e React/Vite e exibe **http://127.0.0.1:3000**.
Utiliza Node.js e o esbuild já instalado no projeto para compilar o serviço em
memória. Não requer Python nem novas dependências.
Os serviços escutam somente em `127.0.0.1`, nas portas 8765 e 3000.
Ctrl+C encerra ambos. Portas ocupadas e falhas de serviço são informadas no
terminal; o comando não encerra processos preexistentes nessas portas.
Não instala dependências, abre navegador ou pesquisa livros automaticamente.

Os comandos individuais permanecem disponíveis em dois terminais:

```powershell
npm.cmd run lab:amazon
```

```powershell
npm.cmd run dev:amazon
```

Não é mais necessário passar `--permitir-http`. Ao atualizar uma instância
anterior do serviço Python, encerre-a com Ctrl+C e execute o comando novamente.

## Consultar e visualizar

Acesse **Configurações → Laboratório Amazon**, com o usuário de Desenvolvimento
do aplicativo. O modo inicial é **HTTP real — somente local**: informe o ISBN e
clique em **Pesquisar**. Não há checkbox nem confirmação a cada tentativa.
O serviço usa o extrator TypeScript e mantém o HTML somente em memória.

Para testes offline, selecione **HTML sanitizado local**. Estão disponíveis
`9788584390670` (O Alquimista), `9788535914849` (1984) e `9788501014863`
(O estrangeiro, evidência de galeria), inclusive seus ISBNs-10. A fixture de
O estrangeiro contém ISBNs e imagens, sem campos bibliográficos.

As referências identificadas são exibidas na galeria compartilhada com a consulta:
capa em destaque e adicionais em miniaturas selecionáveis. URLs e origens ficam
em **Diagnóstico das imagens**, recolhido por padrão. O laboratório não depende
de `autorizacao_uso`, autorização de miniatura ou `carregamento_remoto_permitido`.

O serviço entrega `coverUrl`, `thumbnailUrl` e `additionalImages` no modelo
BookInfo existente. O navegador carrega as imagens HTTPS diretamente, com
`referrerPolicy="no-referrer"`. Não foi criado proxy ou armazenamento de imagens.
Falhas reais de carregamento usam as alternativas existentes e são sinalizadas.

## Validações técnicas e isolamento

- ISBN validado e correspondência com o produto avaliada pelo extrator.
- Uma consulta por vez; cada tentativa HTTP faz no máximo um GET à página
  `/dp/{isbn10}`. Sem redirects, retries, lote, cookies ou sessão Amazon.
- ISBN-13 com prefixo 978 é convertido ao ISBN-10; 979 não possui essa conversão.
  CAPTCHA, resposta não 200, conteúdo não HTML, timeout e limite de leitura
  continuam sendo tratados como falhas técnicas, sem tentativas de contorno.
- URLs de imagens HTTPS válidas, sem credenciais, parâmetros ou fragmentos.
  Deduplicação e tratamento de falhas permanecem ativos.
- API e proxy restritos ao desenvolvimento local, com validação de Host/origem
  e cabeçalho próprio. A checagem de saúde informa conexão, sem liberar consultas.
- O painel segue a identidade de Desenvolvimento existente no aplicativo.
  Em builds publicados, a Function também valida token, perfil e vínculo ativo
  no servidor; ocultar a aba não é a barreira de autorização.
- Nenhuma persistência de consultas, HTML bruto, histórico ou auditoria.
  O serviço não lê `.env`, credenciais ou banco. Não houve alteração de Supabase,
  Magazord, estoque, cadastro, BrasilAPI ou Curitiba.

## Testes direcionados

Sem consultas externas:

```powershell
node --test tests/amazonTypeScript.test.mjs tests/amazonGallery.test.mjs tests/amazonLab.test.mjs tests/bibliographicNormalization.test.mjs
node --test tests/amazonOnlineStartup.test.mjs
npm.cmd run lint
npm.cmd run build
node experimentos/amazon/tests/verificar_galeria_visual.mjs --migracao-typescript
```

O teste de inicialização requer portas 3000 e 8765 livres. O ensaio de galeria
usa React real e SVGs autorais locais interceptados, sem conexões externas.
Playwright, Chrome e os runtimes usados já estavam disponíveis nesta máquina.

Com os serviços ativos, o ensaio do fluxo completo com fixtures é:

```powershell
node experimentos/amazon/tests/verificar_interface.mjs --migracao-typescript
```

Os comandos com `--migracao-typescript` gravam evidências em
`relatorios/migracao_typescript/`, preservando as evidências anteriores. O ensaio
visual usa URLs e origens da extração TypeScript dos slots DIV sanitizados,
com SVGs autorais servidos por interceptação local: nenhuma conexão à Amazon.

Para repetir a comparação integral com a referência Python (somente homologação):

```powershell
node experimentos/amazon/tests/verificar_equivalencia_typescript.mjs
node --test tests/bibliographicContract.test.mjs
& "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" -B -m unittest discover -s experimentos/amazon/tests -p 'test_*.py'
```

Esses ensaios de referência exigem Python 3.10+, mas não participam da inicialização
ou das consultas normais do laboratório. O comparador aceita `ISBN_TEST_PYTHON`.
Os arquivos `.py` continuam preservados e podem ser iniciados manualmente para
comparação, usando outra porta ou encerrando o serviço TypeScript antes.

Para conferir **imagens reais** das referências já identificadas de O Estrangeiro
em uma etapa futura que permita acesso externo:

```powershell
node experimentos/amazon/tests/verificar_galeria_visual.mjs --referencias-estrangeiro
```

Esse último ensaio acessa somente URLs de imagens da evidência sanitizada, sem
nova consulta à página do livro. Não salva arquivos de imagem, HTML bruto ou
captura das imagens reais. Registra URLs públicas, status HTTP e dimensões
renderizadas em `relatorios/verificacao_galeria_real.json`.

Relatórios anteriores são registros históricos; os bloqueios de autorização
descritos neles foram substituídos nesta etapa. Sem novas dependências, commit
ou deploy.
