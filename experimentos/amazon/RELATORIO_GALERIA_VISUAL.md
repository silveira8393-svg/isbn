# Visualização da galeria no laboratório — 26/10/2026

> Registro histórico. Os bloqueios de autorização descritos abaixo foram
> removidos na [simplificação do laboratório](RELATORIO_SIMPLIFICACAO_LABORATORIO.md).

A seção “Capa e imagens adicionais” ganhou a apresentação compartilhada
`BookImageGallery`, extraída do cabeçalho do `BookDetailsCard`. O card da consulta
BrasilAPI/Curitiba mantém sua escolha de capa, seleção, deduplicação e tratamento
de falhas. O laboratório reutiliza o mesmo componente e padrão visual: imagem
em destaque, miniaturas com seleção por teclado/clique e indicação da seleção.
O diagnóstico com referências e origens fica em um `details` recolhido por padrão.

## Autorização verificada e comportamento atual

O serviço Python continua retornando `carregamento_remoto_permitido: false`.
As imagens reais de O Estrangeiro permanecem com `autorizacao_uso: nao_comprovada`.
**Não foi habilitado carregamento remoto dessas imagens.** Na configuração atual,
o laboratório mantém apenas a mensagem de indisponibilidade e o diagnóstico
textual; não cria IMG, link de carregamento, iframe, prefetch ou proxy de imagens.

Para renderizar, o componente exige simultaneamente o indicador remoto exatamente
`true`, o estado de autorização de uso conhecido pelo laboratório e uma referência
HTTPS válida sem credenciais, parâmetros ou fragmentos. O único estado de uso
comprovado atualmente definido é `fixture_sintetica_autoral`. Estados ausentes ou
desconhecidos não concedem permissão. A miniatura tem sua própria autorização.
Permissão para consulta HTTP não concede permissão para carregar imagens.

Não foram criados novos estados de autorização, botões de liberação ou configuração
automática. A tipagem do cliente apenas passou a representar o indicador como
booleano e a descrever metadados de miniatura já retornados pelo serviço. O
contrato BookInfo e os campos bibliográficos não foram alterados.

Se o indicador ou a autorização forem retirados, referências já selecionadas
deixam imediatamente de gerar elementos de imagem. Falhas de carregamento usam
somente alternativas autorizadas e mantêm o endereço e a origem no diagnóstico,
sem criar novas URLs nem repetir automaticamente uma referência que falhou.

## Validação

- **27 testes Node aprovados**: nove novos de galeria, nove de interface/cliente
  do laboratório e nove de contrato bibliográfico.
- **Navegador Chrome headless aprovado** com componentes React reais e SVGs
  autorais locais: uma capa e três adicionais, seleção das miniaturas, retorno
  à capa, diagnóstico recolhido e bloqueio inicial/revogação sem carregar imagens.
- O estado permitido desse ensaio existe somente na resposta sintética do teste.
  As quatro URLs fictícias foram interceptadas e atendidas com arquivos SVG locais;
  todas as outras solicitações de recurso foram bloqueadas. Zero conexões externas
  e zero erros JavaScript. Nenhuma imagem Amazon foi baixada ou exibida.
- `npm.cmd run lint` e `npm.cmd run build` aprovados. O build continua apresentando
  o aviso de tamanho do bundle principal. Conferido que os assets de produção
  não incluem o cliente ou a interface exclusiva do laboratório.
- Revisão React: hooks no topo, estado de seleção local, dados derivados sem
  efeitos adicionais, atualizações funcionais, callbacks e botões acessíveis,
  referências recebidas imutáveis e bloqueio avaliado antes de emitir IMG.

```powershell
node --test tests/amazonGallery.test.mjs tests/amazonLab.test.mjs tests/bibliographicContract.test.mjs
# Requer o build local e Playwright/Chrome já disponíveis, sem instalar pacotes:
node experimentos/amazon/tests/verificar_galeria_visual.mjs
```

Evidências: `relatorios/galeria_autoral_visual.png` e
`relatorios/verificacao_galeria_visual.json`. A captura mostra somente material
sintético autoral, não a página ou as imagens reais de O Estrangeiro.

Extrator, consultas bibliográficas, confirmação HTTP, BookInfo, Magazord e banco
permaneceram sem alterações. Sem novas dependências, infraestrutura, commit ou deploy.
