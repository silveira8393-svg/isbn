# Migração Amazon experimental para TypeScript

Data local: 26/10/2026 (America/Sao_Paulo).

## Resultado

O laboratório inicia e consulta usando Node.js/TypeScript, sem procurar um
interpretador Python e sem iniciar o servidor `.py`. Os comandos npm, as portas,
o proxy local, o contrato de resposta e os componentes de galeria foram mantidos.
A substituição do inicializador ocorreu após aprovação da equivalência offline
e dos testes do novo extrator/servidor.

Foram aprovados 72/72 casos de equivalência integral com a referência Python,
54/54 testes Node direcionados, 65/65 testes Python existentes, lint, build e dois
ensaios no navegador. Não houve consultas HTTP externas à Amazon, downloads de
imagens Amazon, novas dependências, commit, push ou deploy.

Os arquivos Python, fixtures, relatórios e imagens de evidências anteriores
continuam preservados. A homologação realizada é local/offline; comportamento
com HTML novo obtido ao vivo continua pendente de uma etapa que permita rede.

## Arquivos desta migração

Vários arquivos Amazon já eram locais e não rastreados antes desta tarefa.
A lista abaixo identifica o que foi efetivamente criado ou editado nesta etapa,
independentemente da classificação exibida por `git status`.

### Criados

| Arquivo | Finalidade |
|---|---|
| `experimentos/amazon/html_local.ts` | Árvore HTML local, atributos, entidades, texto e linhas de evidências; sem execução de scripts. |
| `experimentos/amazon/extrator_amazon.ts` | Extração, validação, normalização, evidências, imagens e projeções do relatório e do contrato do laboratório. |
| `experimentos/amazon/servidor_laboratorio.ts` | Serviço HTTP local, fixtures, exclusão de concorrência e transporte HTTPS experimental. |
| `experimentos/amazon/runtime_typescript.mjs` | Compilação TypeScript em memória usando o esbuild existente. |
| `experimentos/amazon/servico_typescript.mjs` | Entrada Node do novo serviço local. |
| `experimentos/amazon/tests/casos_equivalencia.mjs` | Matriz de fixtures e variações negativas para comparação. |
| `experimentos/amazon/tests/verificar_equivalencia_typescript.mjs` | Comparador offline com a referência Python, com sockets Python bloqueados. |
| `tests/amazonTypeScript.test.mjs` | Testes do extrator, contrato, transporte simulado e API local, sem Python. |
| `experimentos/amazon/RELATORIO_MIGRACAO_TYPESCRIPT.md` | Este relatório. |

### Editados

| Arquivo | Alteração delimitada |
|---|---|
| `experimentos/amazon/iniciar_laboratorio.mjs` | Inicia Node/TypeScript; remove descoberta e inicialização automática de Python. |
| `experimentos/amazon/iniciar_online.mjs` | Supervisiona TypeScript e Vite; adapta nomes e ponto de injeção de testes para `startService`. |
| `src/components/AmazonLab.tsx` | Acrescenta a fixture de galeria de O estrangeiro à ajuda. Layout, modo inicial HTTP e interações preservados. |
| `tests/amazonOnlineStartup.test.mjs` | Migra cenários de processos para TypeScript e verifica consulta de galeria pelo proxy real. |
| `experimentos/amazon/tests/verificar_galeria_visual.mjs` | Usa o extrator TypeScript e adiciona ensaio offline `--migracao-typescript`, com saída separada. |
| `experimentos/amazon/tests/verificar_interface.mjs` | Registra o fluxo TypeScript e permite salvar as novas evidências em pasta separada. |
| `experimentos/amazon/LEIA-ME_LABORATORIO.md` | Atualiza arquitetura, fixtures, comandos e distinção entre execução normal e comparação com Python. |

`package.json` e `vite.config.ts` já tinham alterações locais e não foram editados
nesta migração. Também não foram editados os serviços BrasilAPI/Curitiba,
componentes de galeria, pesquisa operacional, Magazord, Supabase ou estoque.
As demais alterações locais encontradas foram mantidas.

### Novas evidências

- [Comparação integral por caso](relatorios/migracao_typescript_equivalencia.json).
- [Ensaio da interface](relatorios/migracao_typescript/verificacao_interface.json).
- [Captura da interface](relatorios/migracao_typescript/laboratorio_fixture.png).
- [Ensaio da galeria](relatorios/migracao_typescript/verificacao_galeria_visual.json).
- [Captura da galeria](relatorios/migracao_typescript/galeria_autoral_visual.png).

Os ensaios desta etapa usaram a saída separada; não sobrescreveram as evidências
históricas em `relatorios/`.

## Arquitetura resultante

```text
npm run dev:amazon:online
  ├─ serviço Node → esbuild em memória → servidor_laboratorio.ts (127.0.0.1:8765)
  └─ React/Vite (127.0.0.1:3000)

SettingsView, com guard de desenvolvimento existente
  → AmazonLab → amazonLabClient → /__amazon_lab/* → proxy Vite
  → Laboratory.search → fixture local ou GET HTTPS explícito
  → html_local → extractAmazon → validateAmazon → toLabResult
  → BookInfo + campos/complementares/imagens/origens
  → AmazonLabImageGallery → BookImageGallery
```

O extrator reutiliza `canonicalBookIsbn`, `cleanIsbn`, `normalizeEdition`,
`normalizeLanguage`, `normalizeCoverFormat`, `COVER_FORMATS`, `isImageReference`,
`BookInfo` e os tipos/campos do cliente do laboratório. As regras específicas
Amazon mantêm as mensagens, decisões de qualidade e evidências da referência.
Sinopses editoriais continuam candidatas a revisão; não foram convertidas
automaticamente em sinopses válidas. Dimensões sem eixos explícitos permanecem
brutas e inconsistentes, sem atribuição arbitrária de largura/altura/profundidade.

A extração preserva `landingImage`, alternativas de capa, `altImages`, slots
`media-block-image-tag` em DIV com `data-mb-pv-slot-index`, `data-old-hires` e
`data-a-dynamic-image`. Seleciona a maior resolução declarada, sem fabricar URLs.
Arrays JSON literais de galeria são aceitos com vínculo ao produto/capa; não há
`eval`, carregamento de scripts externos ou execução de JavaScript da página.
Deduplicação considera resoluções/hosts Amazon e mantém a origem do candidato
escolhido. Vídeos, ícones, publicidade, elementos ocultos e produtos não vinculados
continuam excluídos.

O serviço conserva Host/origem/cabeçalho local, JSON até 1 KiB, uma consulta por
vez, ausência de fila/persistência, GET único por `/dp/{isbn10}`, limite de 8 MiB
e prazo de 25 segundos. Não segue redirects, não repete requisições e não usa
cookies, proxy de saída ou credenciais. CAPTCHA e respostas inadequadas interrompem
a coleta. O supervisor continua encerrando ambos os serviços em falha ou Ctrl+C,
sem encerrar processos preexistentes em portas ocupadas.

O transporte HTTP foi implementado e testado com respostas simuladas, sem acesso
à Amazon nesta etapa. A interface mantém o modo HTTP inicial já existente;
para trabalhar offline é necessário escolher **HTML sanitizado local**.

## Equivalência Python/TypeScript

O comparador executou os dois extratores sobre os mesmos HTMLs em memória.
Comparou integralmente os relatórios por igualdade estrutural: campos, valores,
estados, motivos, evidências, tipos/origens, linhas, ISBNs, correspondência,
métricas, complementares, datas, medidas, BookInfo, proveniência, referências,
miniaturas, ordem das imagens e metadados históricos da referência.

Foram 8 fixtures-base e 64 variações locais, totalizando **72/72 aprovadas**.
Nos **69 casos com ISBN pesquisado válido**, também houve igualdade integral
com a resposta do servidor Python, descontando somente `duracao_ms`, variável
por execução. Os outros três casos verificam ISBN pesquisado inválido no extrator;
as rejeições da API são verificadas nos testes do servidor TypeScript.

| Fixture-base | Preenchidos | Válidos locais | Imagens | Resultado |
|---|---:|---:|---|---|
| 1984 sanitizada | 9/9 | 8/9 | Ausentes no HTML fornecido | Equivalente |
| O Alquimista sanitizada | 9/9 | 8/9 | Ausentes no HTML fornecido | Equivalente |
| O estrangeiro, galeria sanitizada | 0/9 | 0/9 | 1 capa + miniatura + 3 adicionais | Equivalente |
| 1984 sintética | 9/9 | 8/9 | Ausentes | Equivalente |
| O Alquimista sintética | 9/9 | 8/9 | Ausentes | Equivalente |
| Complementares sintéticos | 9/9 | 9/9 | 1 capa + 1 adicional | Equivalente |
| Galeria DOM sintética | 1/9 | 1/9 | 1 capa + miniatura + 2 adicionais | Equivalente |
| Galeria script sintética | 1/9 | 1/9 | 1 capa + miniatura + 2 adicionais | Equivalente |

A fixture de O estrangeiro foi sanitizada especificamente para galeria e ISBN;
o resultado 0/9 bibliográfico é esperado. Ela preservou exatamente:

| Papel | Referência final | Origem |
|---|---|---|
| Capa | `91Sb5HdDL3L._SL1500_.jpg` | `#landingImage` |
| Miniatura | `61cFRircgZL._SY445_SX342_ML2_.jpg` | `#landingImage` |
| Adicional | `91pv+3HSGRL._SL1500_.jpg` | `#imageBlock / data-mb-pv-slot-index=1 (linha 6)` |
| Adicional | `81YiEHsaX1L._SL1500_.jpg` | `#imageBlock / data-mb-pv-slot-index=2 (linha 7)` |
| Adicional | `31Epa894dmL.jpg` | `#imageBlock / data-mb-pv-slot-index=3 (linha 8)` |

As variações cobriram ISBN inválido/divergente/conflitante, datas impossíveis,
unidades e eixos ambíguos, dimensões conflitantes, idiomas/edições/páginas
desconhecidos, dados técnicos em campos bibliográficos, conteúdo oculto,
entidades, JSON inválido, scripts sem âncora e exclusões/deduplicação da galeria.

## Testes aprovados e ocorrências

| Verificação | Resultado |
|---|---|
| Comparador Python/TypeScript | 72 casos aprovados; zero divergências; 69 contratos de laboratório equivalentes. |
| Testes Node direcionados | 54 aprovados; zero falhas, cancelados ou ignorados. |
| Suíte Python de referência existente | 65 aprovados; zero falhas. |
| `npm.cmd run lint` | Aprovado (`tsc --noEmit`). |
| `npm.cmd run build` | Aprovado; aviso de bundle acima de 500 kB, sem erro. |
| Navegador: galeria com slots DIV extraídos em TypeScript | Aprovado: capa, três adicionais, seleção e retorno à capa, pesquisas sucessivas, diagnóstico recolhido. Cinco recursos servidos localmente; zero conexões externas. |
| Navegador: interface com API/proxy reais | Aprovado: dois ISBNs, nove campos, oito válidos, revisão humana e bloqueio para perfis admin/operator. Zero erros JavaScript. |
| Exclusão do laboratório de produção | Teste aprovado; busca no JS de `dist/assets` não encontrou rota/marcadores do laboratório. |
| Encerramento | Testes verificaram liberação das portas 3000/8765; nenhum serviço desta validação ficou ativo. |

Comando da suíte Node executada:

```powershell
node --test tests/amazonTypeScript.test.mjs tests/amazonOnlineStartup.test.mjs tests/amazonLab.test.mjs tests/amazonGallery.test.mjs tests/bibliographicNormalization.test.mjs tests/bibliographicContract.test.mjs
```

Ocorrências intermediárias corrigidas:

- A primeira versão do teste de Host falso recebeu 200 porque o `fetch` do Node
  não enviou o Host sobrescrito como esperado. O teste passou a usar
  `node:http.request`; confirmou rejeição 403, sem relaxar a validação do servidor.
- Um comando auxiliar PowerShell de ensaio aguardou uma mensagem com acento
  alterado pela codificação do pipe. O auxiliar foi corrigido e o ensaio completo
  passou. O serviço de teste foi encerrado antes da repetição.
- Uma tentativa de carregar TypeScript via `tsx` encontrou erro ambiental
  `uv_os_get_passwd/ENOMEM`. A execução final usa esbuild, já instalado e
  aprovado nos testes; não houve instalação de dependências.

**Testes reprovados na execução final: nenhum.** A suíte completa fora dos
testes direcionados não foi executada. Nenhum aviso de tamanho de bundle foi
tratado com refatorações fora do escopo.

## Pendências e limitações

- Homologação de rede real pendente: não foi feita requisição externa à Amazon
  ou à CDN. Status HTTP, redirects, CAPTCHA, MIME, limite de tamanho e falhas de
  transporte foram simulados; a disponibilidade ao vivo não foi comprovada.
- O leitor HTML cobre os seletores e estruturas das evidências disponíveis;
  não implementa toda a recuperação de HTML malformado e todo o catálogo de
  entidades nomeadas do padrão HTML. Novos layouts devem ser homologados com
  novas fixtures sanitizadas. Entidades comuns e numéricas decimal/hexadecimal
  estão cobertas.
- Sinopses comerciais, formatos/idiomas ambíguos e medidas sem eixos continuam
  exigindo revisão. A migração não aumenta artificialmente os campos válidos.
- As imagens do ensaio visual são SVGs autorais locais servidos nas referências
  extraídas. O ensaio comprova seleção/layout/contrato e preservação de URLs,
  mas não disponibilidade, resolução ou conteúdo dos arquivos remotos reais.
- A comparação com Python e o teste histórico `bibliographicContract` ainda
  exigem Python por serem ensaios explícitos da referência. O novo extrator,
  seus testes próprios e os comandos de inicialização não dependem dele.
- A Amazon continua exclusivamente experimental. Nenhuma integração operacional
  foi feita, e esta homologação não autoriza atribuição automática ao cadastro.

## Iniciar o laboratório

Na raiz `C:\Desenvolv\isbn`, com as dependências existentes instaladas:

```powershell
npm.cmd run dev:amazon:online
```

Abra **http://127.0.0.1:3000**, entre com o perfil de Desenvolvimento e acesse
**Configurações → Laboratório Amazon**. Para validar sem rede, escolha
**HTML sanitizado local** e use um dos ISBNs:

- `9788535914849` ou `8535914846`: 1984.
- `9788584390670` ou `8584390677`: O Alquimista.
- `9788501014863` ou `8501014869`: O estrangeiro, galeria.

Ctrl+C encerra Vite e o serviço TypeScript. As portas 3000 e 8765 devem estar
livres. Alternativamente, use dois terminais:

```powershell
npm.cmd run lab:amazon
```

```powershell
npm.cmd run dev:amazon
```

Para repetir os ensaios visuais sem sobrescrever as evidências históricas:

```powershell
# Requer o build e os runtimes Playwright/Chrome já disponíveis nesta máquina.
node experimentos/amazon/tests/verificar_galeria_visual.mjs --migracao-typescript
# Requer os dois serviços locais ativos.
node experimentos/amazon/tests/verificar_interface.mjs --migracao-typescript
```

Comparação explícita com a referência Python, sem rede:

```powershell
node experimentos/amazon/tests/verificar_equivalencia_typescript.mjs
```

O comparador detecta o runtime Python de referência disponível ou aceita
`ISBN_TEST_PYTHON`. Nenhum arquivo `.py` precisa ser removido para usar o novo fluxo.
