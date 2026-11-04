# PR #4 — repaginação visual completa

## Controle anterior à implementação

- Continuação exclusiva de `feat/isbn-visual-livraria-sul` e da PR #4 em rascunho.
- Ponto de partida visual: `48f25bcbcfac7e5491e508fe36e14e6fc15b5fc0`.
- Referência funcional intocável: `93ff20473ca68b50d42d075276e07c624772c9e0` e tag `isbn-amazon-galeria-homologada-2026-11-04`.
- Infraestrutura existente reutilizada: Tailwind, Inter, Lucide e SVG oficial local. Nenhuma nova dependência ou imagem de produto.

## Inventário e escopo definido

O primeiro trabalho centralizou a paleta e o cabeçalho. A nova composição usa classes de apresentação compartilhadas em `src/index.css`, adicionadas às raízes e superfícies já existentes de App, consulta, resultado bibliográfico, histórico, cadastro, dashboard e configurações.

Login receberá um painel institucional estático com o logotipo existente. O formulário e seus descendentes funcionais permanecem intactos. O cabeçalho destacará o logotipo sem trocar menus. Seções de cadastro conservarão campos, ordem e callbacks. Capas e galerias conservarão URLs, seleção, tratamento de erro e upload.

Imagens anexadas orientam hierarquia de formulários, organização de superfícies administrativas e contraste institucional; não autorizam reprodução de módulos, campos ou funções comerciais. A marca adotada permanece Sebo Livraria Sul.

Antes de editar os componentes, foi iniciado o ensaio `docs/visual-v1.5/repaginacao/verificar.cjs --antes`, com o bundle e CSS da versão `48f25bc` já carregados. As mesmas condições de viewport, dados e fontes serão usadas no depois.

## Melhorias de apresentação

| Área | Primeira iteração | Repaginação |
| --- | --- | --- |
| Marca e navegação | Marca pequena e abas discretas | Logotipo maior, perfil alinhado, abas com contraste e indicação ativa refinada |
| Login | Cartão isolado com ícone genérico | Composição institucional em duas áreas, logotipo oficial, grafismo de livro e formulário preservado; empilhamento no celular |
| Consulta | Pesquisa com pouca distinção das demais superfícies | Painel com acabamento institucional, título e ícone destacados, campo e ações com dimensões consistentes |
| Resultado | Ficha técnica uniforme | Título editorial, capa em superfície de destaque, miniaturas mantidas e melhor distinção entre resumo e dados técnicos |
| Cadastro | Cartões genéricos | Seções numeradas com identidade compartilhada, divisores, hierarquia de rótulos, campos compactos e barra de revisão harmonizada |
| Revisão | Lista simples de pares | Superfícies suaves para os pares rótulo/valor, preservando a ordem e a confirmação existentes |
| Histórico | Cartão de listagem uniforme | Cabeçalho e linhas mais definidos, tipografia e superfícies coerentes com a ficha do livro |
| Dashboard | Indicadores compactos e superfícies uniformes | Indicadores com hierarquia numérica maior, tabelas refinadas e painel de filtros integrado |
| Configurações | Abas sobre o fundo da página | Faixa de abas agrupada e painel institucional com hierarquia consistente |

O fundo operacional usa papel claro, mantendo a cor institucional `#1e1b32`. O logotipo oficial existente não foi editado. Os tons verde, âmbar e vermelho dos estados foram preservados. Não foram adicionados menus, campos, rotas, etapas ou módulos comerciais.

## Verificação técnica

- `npm.cmd run typecheck`: aprovado.
- `npm.cmd run lint`: aprovado. O script de lint existente executa `tsc --noEmit`; não foi introduzida outra ferramenta.
- `npm.cmd run build`: aprovado. Permanecem os avisos de tamanho do bundle e importação estática/dinâmica da base, sem intervenção fora do escopo.
- Suíte existente: **701 testes; 698 aprovados; 3 falhas preexistentes**, sem nova falha. Evidência: [regressao.json](docs/visual-v1.5/repaginacao/regressao.json).
- Falhas separadas: `infrastructureUi.test.mjs:58`, perfis admin, operator e developer, porque o mock de React não fornece `lazy`. São as mesmas três falhas reproduzidas na referência homologada e registradas na primeira iteração. Nenhum teste foi corrigido ou relaxado.
- **19 arquivos TSX com AST preservada** em relação a `48f25bc`, após retirar somente classes de apresentação e a composição estática acrescentada ao login. A comparação inclui textos funcionais, expressões, funções, atributos de acessibilidade, eventos, estados, condições, callbacks e propriedades funcionais.
- Serviços, hooks, contextos, bibliotecas, tipos, utilitários, APIs, backend, Supabase, manifests, lockfile e configurações são idênticos à versão 1.0. Evidência e roteiro: [auditoria-escopo.json](docs/visual-v1.5/repaginacao/auditoria-escopo.json), [auditar-escopo.cjs](docs/visual-v1.5/repaginacao/auditar-escopo.cjs).
- Revisão React: nenhuma nova dependência, hook, assinatura de componente, chamada de dados ou mecanismo de estado. O novo painel institucional é estático, sem controles ou callbacks. Os controles existentes mantêm labels, `aria-*`, tipos, estados disabled/readOnly, tabulação e foco visível.
- Nenhuma alteração em variáveis de ambiente, credenciais, banco, migrations, Storage, registros ou imagens de produtos.

## Inspeção visual e comparação

O roteiro usa componentes reais em isolamento, com livros autorais de ensaio, usuários fictícios e respostas de dados interceptadas em memória. Toda conexão externa do navegador é bloqueada. O antes é reconstruído diretamente de `48f25bc`, incluindo sua folha de estilos, em `node_modules/.cache/isbn-visual-before`, sem trocar arquivos do checkout. Os estilos do depois vêm do build atual.

- Perfis: Desenvolvimento, Administrador/Proprietário e Operador; abas de gestão inspecionadas somente nos perfis que já as possuem.
- Larguras: **390, 768, 1024 e 1440 px**.
- Telas: login, consulta, resultado bibliográfico, cadastro NOVO, cadastro USADO, galeria, revisão e histórico; dashboard, registros e configurações nos perfis autorizados.
- **120 combinações antes e 120 depois**, com o mesmo relógio, dados e viewports. As 22 capturas de cada etapa cobrem as telas em desktop e celular.
- A comparação verifica valores, atributos, disponibilidade e ordem dos controles, além de ausência de transbordamento horizontal da página. A tabela de registros mantém sua rolagem interna existente.
- Resultado: **120 combinações aprovadas na comparação**, com 4.088 fotografias de atributos/valores de controles em cada etapa; zero alteração nesses controles e zero transbordamento horizontal da página. Nenhum erro JavaScript foi encontrado no ensaio.
- A galeria foi exercitada pela seleção de miniatura; a revisão foi aberta pelo botão real existente, sem confirmar cadastro. O campo ISBN e o menu de conta também foram exercitados.
- As fontes remotas são bloqueadas no ensaio: aplica-se a cadeia de fontes de sistema já existente. O estilo editorial das áreas de marca e do título do livro usa Georgia, sem download adicional.

[Abrir o comparativo antes/depois](docs/visual-v1.5/repaginacao/comparativo.html) · [resultado da comparação](docs/visual-v1.5/repaginacao/comparacao.json).

Reproduzir a partir deste worktree com dependências existentes:

```text
npm.cmd run build
node docs/visual-v1.5/repaginacao/verificar.cjs --antes
node docs/visual-v1.5/repaginacao/verificar.cjs
node docs/visual-v1.5/repaginacao/comparar.cjs
node docs/visual-v1.5/repaginacao/auditar-escopo.cjs
```

## Limite da evidência e homologação pendente

A suíte de regressão existente, a identidade dos arquivos funcionais e a comparação estrutural/comportamental dão suporte à preservação do funcionamento. **Não foi realizada uma nova homologação autenticada das integrações reais.** O ensaio visual isolado não comprova autenticação real, pesquisa remota, gravação no Supabase, upload ou publicação no simulador. Não houve uso de credenciais de usuários para essa finalidade.

O responsável deverá validar os fluxos autenticados no Preview, com os três perfis, antes de homologar a PR. Nenhuma submissão ou alteração em produção é necessária para a inspeção visual.

## Publicação controlada

Entrega exclusivamente na branch e PR #4 existentes, que deve permanecer em rascunho. O push desta branch aciona somente seu Preview pela integração Git/Vercel; o SHA e o estado READY serão confirmados e informados na entrega. Sem merge, promoção, alteração de main/tag, domínio ou publicação em produção.
