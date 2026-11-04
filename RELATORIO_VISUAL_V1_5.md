# Projeto ISBN — identidade visual 1.5

## Controle anterior à implementação

- Base protegida: `93ff20473ca68b50d42d075276e07c624772c9e0`.
- Tag: `isbn-amazon-galeria-homologada-2026-11-04`.
- Branch exclusiva: `feat/isbn-visual-livraria-sul`.
- Worktree: `.worktrees/isbn-visual-livraria-sul`.
- A branch foi criada diretamente na base homologada; alterações de outros worktrees não foram incorporadas.
- Escopo: apresentação visual, sem alterações funcionais, dependências, ambiente, integrações, dados ou publicação.

## Inventário e conjunto mínimo

A base já oferece Tailwind, Inter, estilos centralizados, cartões, formulários e navegação responsiva. Não é necessário criar componentes ou modificar a estrutura operacional.

1. `src/index.css`: tokens de cor da família azul usados para identidade, tons neutros, sombras discretas e acabamento do cabeçalho. Cores semânticas de sucesso, aviso e erro preservadas.
2. `src/components/Header.tsx`: substituir o ícone decorativo de identidade pelo logotipo oficial, acrescentar classes de apresentação e usar o título de identidade “Projeto ISBN” com subtítulo compacto. Preservar propriedades, estados, eventos, condições e sequência dos elementos operacionais.
3. `public/brand/livraria-sul.svg`: cópia sem edição do SVG publicado pelo site oficial.
4. Este relatório: origem, escopo e resultados de verificação.
5. `docs/visual-v1.5/`: capturas, resultado JSON e roteiro de inspeção isolada, sem participação no aplicativo ou build.

## Referência e proveniência

Consultado em 04/11/2026:

- Site oficial: https://www.livrariasul.com.br/
- CSS oficial: https://livrariasul.cdn.magazord.com.br/resources/livrariasul.css
- Logotipo referenciado pelo HTML oficial: https://livrariasul.cdn.magazord.com.br/resources/Logo2.svg
- Cor do cabeçalho identificada no CSS oficial: `#1e1b32`.

O arquivo de marca é servido localmente, sem hotlink ou alteração de imagens de produtos. A origem oficial comprova a proveniência do arquivo; não constitui declaração de licença de marca.

## Verificação

- `npm.cmd run typecheck`: aprovado.
- `npm.cmd run build`: aprovado. Avisos existentes de tamanho de bundle e importação estática/dinâmica; nenhuma refatoração executada.
- Suíte completa final (`node --test --test-concurrency=1 tests/*.test.mjs`): **701 testes, 698 aprovados, 3 falhas**.
- Comparação com os dois arquivos restaurados temporariamente ao conteúdo do commit homologado, seguida de restauração integral da apresentação visual: **701 testes, 698 aprovados, as mesmas 3 falhas**.
- As três falhas são de `tests/infrastructureUi.test.mjs:58` (admin, operator e developer): o mock de React não fornece `lazy`. São reproduzíveis na base e ficaram fora do escopo.
- A primeira execução concorrente da suíte apresentou também timeout no teste de inicialização real de `amazonOnlineStartup.test.mjs:112`; a execução final sequencial passou nesse teste. Nenhum teste ou código funcional foi alterado para obter o resultado.
- Comparação por AST do TypeScript: assinatura, instruções anteriores ao retorno e todas as expressões JSX de `Header.tsx` iguais às da base, normalizando somente CRLF/LF. Isso cobre condições de perfil, callbacks e contadores.
- Auditoria do diff: apenas `Header.tsx` e `index.css` entre os arquivos preexistentes. Nenhuma alteração em serviços, hooks, permissões, contratos, Supabase, configurações, dependências ou variáveis de ambiente.
- Dependências locais já disponíveis foram reutilizadas por resolução do Node; nenhuma instalação ou atualização de dependências foi executada.
- SVG local com SHA-256 `D3117419E98F2EE4CE54BCF6977AE926B94393D0BBED099A0615C5A46EA7BAF0`.

### Inspeção visual

Roteiro em `docs/visual-v1.5/verificar.cjs`, executado com Edge headless instalado e Playwright já disponível no ambiente. Reexecução a partir deste worktree: `npm.cmd run build`, depois `node docs/visual-v1.5/verificar.cjs`.

Componentes reais renderizados com identidades fictícias e banco simulado em memória. Nenhuma autenticação real, chamada externa, consulta de produto, alteração de registro ou persistência em produção. Fontes remotas bloqueadas nesse ensaio; aplica-se o fallback de sistema já previsto na base. A renderização com Inter remoto não foi aferida.

- Perfis: Operador, Administrador/Proprietário e Desenvolvimento.
- Larguras: 360, 390, 768, 1024 e 1440 px.
- Verificações: ausência de rolagem horizontal na consulta, cor oficial do cabeçalho, carregamento local do logotipo, quantidade de abas por perfil, digitação de ISBN, habilitação visual de Buscar, navegação entre abas e abertura/fechamento do menu de conta.
- Login e formulários NOVO/USADO inspecionados em 390 e 1440 px com dados fictícios; sem submissão ou gravação.
- Resultado detalhado: [verificacao.json](docs/visual-v1.5/verificacao.json).
- Resultado: **15 combinações aprovadas**, sem erros de JavaScript; login e formulários também sem transbordamento horizontal nas duas larguras inspecionadas.
- Capturas para revisão: [consulta desktop](docs/visual-v1.5/consulta-developer-1440.png), [consulta mobile](docs/visual-v1.5/consulta-operator-390.png), [cadastro novo](docs/visual-v1.5/registration-new-1440.png), [cadastro usado](docs/visual-v1.5/registration-used-390.png) e [login](docs/visual-v1.5/login-1440.png).

Essas evidências verificam a camada de apresentação. Não substituem homologação autenticada das integrações, que não foi realizada nesta tarefa.

## Entrega e proteção

Alteração mantida exclusivamente na branch visual local, criada a partir do commit homologado. Sem push, deploy, publicação, modificação de main ou movimentação da tag. Nenhuma imagem de produto foi editada.
