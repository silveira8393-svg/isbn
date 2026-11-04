# PR #4 — layout azul aprovado

## Registro anterior à implementação

- Worktree isolado: `.worktrees/isbn-visual-livraria-sul`, limpo no início.
- Branch e PR existentes: `feat/isbn-visual-livraria-sul`, PR #4 em Draft, sem merge.
- HEAD inicial confirmado localmente e no GitHub: `8c96e2c00ebdb360142b80b49038512b42979d1c`.
- Referência funcional imutável: `93ff20473ca68b50d42d075276e07c624772c9e0` e tag `isbn-amazon-galeria-homologada-2026-11-04`.
- Main e produção não serão alteradas. Outros worktrees não participarão da entrega.

## Inventário e plano curto

1. Shell: adaptar a variante desktop existente do Header para sidebar fixa de 230 px e barra superior de 68 px. Reutilizar os mesmos botões, condições e eventos. A variante mobile existente receberá uma disclosure nativa, sem novo hook/evento de aplicação. Somente uma variante estará visível por viewport, como já acontece na base.
2. Consulta: manter pesquisa, câmera, informações completas, resultados, dados técnicos, capa, adicionais e cartão Magazord. Usar largura útil ao lado da sidebar e tipografia compacta legível.
3. Cadastro: manter a página única e a ordem DOM de todas as seções/campos. Aplicar grade sequencial de cartões no desktop, sem wizard, novas abas ou resumo inventado. Manter apenas a barra de revisão verdadeira existente.
4. Configurações: envolver navegação e conteúdo existentes em um grid de menu secundário + painel. Condições de perfil e callbacks permanecem intactos.
5. Histórico/dashboard/áreas técnicas: compartilhar a paleta azul, campos, tabelas, densidade e superfícies, sem novos indicadores, filtros ou telemetria.
6. Login: conservar a composição existente, harmonizando a paleta; remover grafismos grandes, serifas e resíduos roxos dos estilos.

As três imagens aprovadas foram lidas integralmente e estão preservadas em `docs/visual-v1.5/layout-azul/referencias/`. Elas definem proporções e acabamento, nunca dados ou permissões.

## Elementos reais versus ilustrativos

Reais: Consulta, Cadastro e Histórico nos perfis autorizados; Dashboard/Configurações conforme regras existentes; menu de conta; seções reais de configuração; pesquisa, scanner, livro completo, galerias, formulários, modelos, revisão, indicadores, tabelas e filtros existentes.

Ilustrativos e não implementados: sino/notificações, resumos e métricas hardcoded, toggles de fontes, backup, nova pesquisa/filtro de histórico, salvar rascunho, limpar/publicar por botões sem fluxo vigente. Laboratório Amazon e infraestrutura continuam exclusivamente onde o código atual permite. Não há nova loja operacional.

## Evidências e publicação

### Equivalência funcional e movimentos de JSX

- Header: o logotipo e o nav desktop existentes foram envolvidos por `aside.isbn-sidebar`. O título/contexto foi colocado na barra superior, ao lado do mesmo menu de conta. Botões, condições, indicadores e callbacks são os mesmos. As duas variantes responsivas preexistentes continuam tendo somente uma variante visível por viewport; nenhuma navegação adicional foi criada.
- Mobile: `details/summary` nativo permite recolher e reabrir a navegação com mouse, Enter ou Espaço, sem novo hook, callback, rota ou estado de aplicação. Inicia aberto para não exigir um clique adicional para acessar as opções já visíveis na versão anterior.
- Configurações: um wrapper de layout envolve o menu existente e o conteúdo existente, sem trocar a ordem dos botões ou painéis condicionais. Apenas o grid os coloca lado a lado no desktop.
- Cadastro: o wrapper que já possui `hidden={reviewing}` recebeu classe de grid. O CSS só aplica `display:grid` em `:not([hidden])`, preservando o ocultamento do formulário durante a revisão. Campos e seções continuam na mesma sequência DOM. A grade segue essa sequência em linhas; comercial, bibliografia e fiscal ocupam toda a largura para manter legibilidade.
- Histórico: classes de apresentação organizam os mesmos botões de consulta e metadados em linhas de grid no desktop. Sem novos filtros, abas, campos ou paginação.
- Loja operacional: o texto real de contexto continua no DOM, na mesma posição lógica, e é disposto visualmente abaixo da barra superior pelo flex do shell. Não contém controles cujo fluxo de tabulação possa ser alterado por essa disposição.

A auditoria compara declarações funcionais, imports não decorativos, assinaturas, instruções anteriores aos retornos, expressões JSX, propriedades e ordem dos controles. Movimentos de wrappers e classes são permitidos; as expressões são comparadas sem estilos. **10 arquivos TSX preservam lógica, expressões e controles ordenados.** Serviços, hooks, contextos, utilitários, tipos, APIs, backend, Supabase, dependências, configurações e testes funcionais são idênticos à base `93ff204...`.

### Arquivos de aplicação alterados nesta etapa

- `src/index.css`: substituição do tema anterior pelo shell azul compartilhado, tipografia, grids, superfícies e responsividade.
- `src/components/Header.tsx`: sidebar/topbar e disclosure mobile nativa.
- `src/components/SettingsView.tsx`: wrapper do menu secundário/painel.
- `src/App.tsx` e `src/components/SearchHistoryGroup.tsx`: identificação visual e grade do histórico.
- `src/components/magazord/ProductRegistrationForm.tsx`: classe do grid, mantendo `hidden` e eventos.
- Seções `AdvancedFiscalSection`, `BibliographicSection`, `CommercialSection`, `ImagesSection` e `PhysicalAttributesSection`: somente marcadores de estilo.
- `public/brand/livraria-sul.svg`: somente o retângulo roxo de fundo foi tornado transparente; paths, lettering, cores e formas restantes são idênticos ao SVG oficial já incorporado. Não houve alteração de imagens de produtos. O roteiro de auditoria verifica essa transformação exata.

Documentação e ensaios estão em `docs/visual-v1.5/layout-azul/`, fora do código de aplicação. Não houve instalação ou atualização de dependências.

### Resultados técnicos

- Typecheck: aprovado (`npm.cmd run typecheck`).
- Lint: aprovado (`npm.cmd run lint`, que na stack existente executa `tsc --noEmit`).
- Build: aprovado (`npm.cmd run build`). Permanecem os avisos de chunk grande e importação estática/dinâmica da base; não foram feitas refatorações fora do escopo.
- Suíte completa final: **701 testes, 698 aprovados e 3 falhas conhecidas**, em `infrastructureUi.test.mjs:58`, para admin/operator/developer, por mock de React sem `lazy`. Nenhuma nova falha; nenhum teste funcional foi alterado. [Registro](docs/visual-v1.5/layout-azul/regressao.json).
- [Auditoria de escopo](docs/visual-v1.5/layout-azul/auditoria-escopo.json): lógica e propriedades/ordem dos controles preservadas nos 10 TSX; caminhos funcionais e testes idênticos à v1.0.

### Inspeção visual e de interação

Ensaio com **componentes reais** compilados em isolamento: App, Header, pesquisa, ficha bibliográfica, formulários, galerias, revisão, histórico, dashboard e configurações. Apenas identidades, livros e respostas de dados são fixtures locais; tráfego externo do navegador é bloqueado. As capas exibidas identificam explicitamente o livro sintético. Os números dessas capturas não são dados de produção.

- **120 combinações antes e 120 depois**: 3 perfis, larguras 390/768/1024/1440 e telas existentes acessíveis a cada perfil. Antes reconstruído diretamente de `8c96e2c`, sem trocar o checkout; mesmos dados e relógio.
- **4.088 registros de controles por etapa**, comparados por SHA-256 dos atributos/valores em ordem. Sem alteração nos controles existentes e sem rolagem horizontal da página. A tabela extensa mantém rolagem interna.
- Capturas: 22 antes e 29 depois. Os pares principais cobrem desktop/celular; há seis capturas adicionais de tablet e uma de erro de cadastro.
- **56 verificações adicionais**: tabulação do ISBN para Limpar → Câmera → Buscar; abertura/Escape do menu de conta; disclosure mobile por teclado; quantidade inicial 1, edição para 2 e retorno a 1; máscara 15000 → 150,00 e 123456 → 1.234,56; formulário oculto durante a revisão; Laboratório Amazon e Infraestrutura ausentes no Administrador e presentes apenas no Desenvolvimento.
- Galeria: seleção real de miniatura exercitada; revisão aberta pelo botão vigente, sem confirmar cadastro ou alterar estoque.
- Contraste dos controles primários e do texto de entrada aferido nos estilos computados, com razão mínima de **4,5:1** nas amostras. Isso não constitui certificação integral WCAG de todo o produto.
- Fontes remotas bloqueadas no ensaio; cadeia de fontes de sistema prevista na aplicação. Sem novas fontes/dependências.

[Comparativo: aprovado × implementado e antes × depois](docs/visual-v1.5/layout-azul/comparativo.html) · [Comparação de controles/layout](docs/visual-v1.5/layout-azul/comparacao.json) · [Verificações adicionais](docs/visual-v1.5/layout-azul/depois/verificacoes-adicionais.json).

### Fidelidade às referências e diferenças justificadas

| Referência | Implementado | Diferença necessária |
| --- | --- | --- |
| 01 — Cadastro | Sidebar 230 px no desktop amplo, barra de 68 px, azul #1565D8, conteúdo claro, cartões em grade, campos alinhados e revisão existente | Ordem/campos reais preservados: códigos e condição vêm antes da bibliografia. Não foram criados resumo lateral, salvar rascunho, limpar ou publicar. Fiscal, SEO, conservação, descrição completa e fotos permanecem disponíveis. |
| 02 — Configurações | Menu secundário de 210 px e painel branco para as seções reais, mesma família visual | Não foram copiados os toggles, Online, backup ou salvamento ilustrativos. Loja/Filial mostra somente seus controles reais. Laboratório e infraestrutura respeitam seus guards atuais. |
| 03 — Consulta/dashboard/histórico/perfis | Mesmo shell, ações azuis, capa e metadados completos, indicadores/tabelas reais e menu conforme perfil | Consulta continua exibindo as informações completas e o cartão Magazord, sem seletor fictício de fontes. Histórico mantém suas ações reais; nenhum gráfico ou KPI ilustrativo foi introduzido. |

Em tablet, a sidebar usa 208 px, os painéis de resultado/histórico empilham sem perda de acesso e os metadados rápidos usam duas colunas para evitar aperto. Em celular, as opções existentes ficam em disclosure recolhível. O desenho oficial do logotipo foi mantido, em vez do logotipo estilizado presente nos mockups.

### Limite da homologação

Essas evidências verificam apresentação, controles e preservação do código/fluxos existentes. **Não foi realizada nova homologação autenticada de integrações reais, câmera física, upload remoto ou persistência.** As capturas isoladas não comprovam dados reais, autenticação ou gravação no Supabase. Essa homologação permanece sob responsabilidade do proprietário no Preview, sem necessidade de publicar em produção.

### Reprodução

```text
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
node --test --test-concurrency=1 tests/*.test.mjs
node docs/visual-v1.5/layout-azul/verificar.cjs --antes
node docs/visual-v1.5/layout-azul/verificar.cjs
node docs/visual-v1.5/layout-azul/comparar.cjs
node docs/visual-v1.5/layout-azul/auditar-escopo.cjs
```

### Publicação controlada

Commit/push somente na branch da PR #4 existente, mantendo Draft. A integração Git/Vercel cria o Preview dessa branch; SHA e READY serão confirmados na entrega e na descrição da PR. Sem merge, promoção, mudança de domínio, main, tag ou produção. Aguardar homologação expressa após a entrega.
