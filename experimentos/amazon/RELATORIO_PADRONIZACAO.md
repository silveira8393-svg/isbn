# Padronização bibliográfica e imagens — 26/10/2026

Amazon permanece **em laboratório, sem homologação definitiva e sem integração
operacional**. Esta etapa usa arquivos locais e respostas simuladas. Nenhuma
consulta externa, download de imagem, instalação de dependência, alteração em
Supabase/Magazord/histórico/estoque, commit ou deploy foi realizado.

## Contrato e campos padronizados

Foi reutilizada a interface `BookInfo` existente, sem alterar seus consumidores
operacionais. O extrator Python continua sendo a base. Sua resposta agora inclui
`book_info`, `complementares`, `imagens` e `edicao_verificacao`; `campos` e os
percentuais originais continuam abrangendo exatamente **nove campos**.

| Avaliação | BookInfo | Regras aplicadas no laboratório |
|---|---|---|
| Título | title | Ausente fica vazio; marcador de título não cadastrado não conta |
| Autores | authors | Lista sem vazios ou duplicatas |
| Editora | publisher | Sem texto comercial ou valores presumidos |
| Ano | year | Ano real da fonte; divergências com data são sinalizadas |
| Edição | edition | Ordinal normalizado; reimpressão não comprova edição |
| Idioma | language | Nomes por extenso; desconhecidos/compostos requerem revisão |
| Formato | format | CC - Capa Convencional / CD - Capa Dura; ambíguos requerem revisão |
| Páginas | pageCount | Inteiro positivo, sem extrair número de texto ambíguo |
| Sinopse | synopsis / description | Resumo substancial, sem publicidade/depoimentos; revisão humana continua necessária |

`bibliographicEvaluation.ts` centraliza a avaliação e consolidação experimental.
Reutiliza `bibliographicNormalization`, `cleanIsbn`, `sanitizeSynopsis` e
`imageReferences`. Os adaptadores puros `contrato_provedores.ts` avaliam respostas
da BrasilAPI e o BookInfo parcial da Curitiba sem consultar seus serviços. O
cliente do laboratório aplica o mesmo contrato à projeção real do Python.
Os aliases já existentes no Python são mantidos, com testes de equivalência do
contrato entre Python e TypeScript. Não se adicionou outro extrator.

## Dados adicionais extraídos

| Material local | Publicação completa | Peso | Dimensões declaradas | Eixos atribuídos |
|---|---|---|---|---|
| 1984, ISBN 9788535914849 | 2009-07-21 | 605 g | 21 x 13.6 x 2.2 cm | Nenhum; ordem desconhecida |
| O Alquimista, ISBN 9788584390670 | 2017-04-05 | 272 g | 21 x 13.8 x 1.4 cm | Nenhum; ordem desconhecida |
| Fixture sintética autoral | 2009-07-21 | 502 g (origem 0,502 kg) | 140 x 210 x 25 mm (L x A x P) | 14 / 21 / 2,5 cm |

Peso exige unidade explícita; kg é convertido para g. Medidas individuais com
eixo nomeado ou triplas com três eixos explicitamente identificados são
convertidas para cm. mm, m e polegadas também têm testes locais. Uma tripla sem
ordem conhecida fica nas evidências com estado inconsistente, sem preencher
largura, altura ou profundidade. Valores individuais e compostos divergentes
não são atribuídos ao eixo afetado.

Data completa usa ISO `AAAA-MM-DD`, validando calendário. Ano sozinho não recebe
dia ou mês. Subtítulo e categorias explícitos também são projetados; ausências
permanecem ausências. Não se separa título/subtítulo por pontuação presumida.
ISBNs exigem dígito verificador, prefixo de livro e equivalência ISBN-10/13.
ISBN pesquisado nunca vira evidência do ISBN encontrado no adaptador experimental.

## Imagens e autorização

As duas fixtures sanitizadas anteriores não contêm referências de capa/galeria
nos seletores reconhecidos. Isso significa ausência **nesses materiais**, sem
conclusão sobre páginas atuais da Amazon.

Foram criados dois SVGs simples autorais em `tests/fixtures/`, usados apenas em
`complementares_sinteticos.html`. As referências `isbn-fixtures.invalid` são
fictícias e não são resolvidas. Uma lista fixa no extrator reconhece esses dois
arquivos somente na natureza `fixture_sintetica`; o HTML não pode conceder
direitos por atributo, e habilitar HTTP não concede licença de imagens.

O diagnóstico distingue:

- **Disponibilidade técnica:** referência identificada, arquivo não verificado.
- **Autorização:** fixture sintética autoral ou não comprovada.
- **Transferência/carregamento:** nunca realizado/permitido pelo laboratório.

O extrator identifica capa pelos elementos principais e galeria em `altImages`,
prioriza `data-old-hires` sobre `src`, remove duplicatas e ignora elementos
ocultos, imagens fora desses seletores e referências inseguras. Sem imagem
principal identificada, uma adicional não vira capa por suposição no contrato.
Referências sem autorização ficam apenas no diagnóstico em memória e fora dos
campos de imagem do `book_info`. A interface apresenta referências como texto;
não cria `<img>`, link, proxy, cache ou download remoto. A exportação textual
anterior continua omitindo URLs pela função `safe`.

## Regras experimentais de consolidação

1. A base é passada explicitamente; não existe prioridade automática da Amazon.
2. Apenas lacunas recebem valores válidos de outra fonte. Dados presentes da
   base são preservados. Dados inconsistentes exigem revisão, sem substituição
   automática. `synopsis` e `description` compartilham a rejeição de conteúdo.
3. Cada divergência gera campo, valores, fonte recebida e motivo. A proveniência
   escolhida é preservada por campo; unidades acompanham a medida selecionada.
4. ISBN inválido, par incompatível, ISBN diferente ou identidade não verificável
   bloqueiam a complementação inteira. Edições divergentes ou inconsistentes
   também bloqueiam. Conflitos de edição da Amazon continuam bloqueando mesmo
   quando o campo foi omitido da projeção BookInfo por ser inconsistente.
5. Ano e data incompatíveis entre fontes não são combinados. Nomear uma edição
   num produto não equivale a confirmação editorial independente.
6. O indicador bibliográfico não inclui ISBN, imagens, medidas ou logística.

Essas regras estão implementadas e testadas **somente para avaliação local**.
O fluxo atual BrasilAPI/Curitiba continua usando suas regras anteriores.

## Divergências identificadas no código atual dos provedores

| Comportamento observado no código/teste simulado | Consequência |
|---|---|
| BrasilAPI atribui `pt` sem idioma retornado | O adaptador experimental mantém idioma ausente |
| BrasilAPI usa ISBN solicitado ao montar o livro | O adaptador experimental valida o ISBN efetivamente retornado |
| BrasilAPI não mapeia peso/dimensões e não traz edição no contrato atual | Suporte experimental só aceita medidas com nomes/unidades explícitos; ausências não são inventadas |
| Curitiba atribui kg e cm no mapeamento atual | A avaliação converte a unidade declarada no BookInfo; confirmar semântica do payload antes de homologar |
| Curitiba mapeia `AD_QTCOMPRIMENTO` como depth | Comprimento não comprova espessura; o adaptador experimental remove esse depth e registra inconsistência |
| Curitiba pode usar o ISBN solicitado como fallback e escolhe o primeiro produto encontrado | Validar identidade no payload original continua pendência do serviço operacional |
| Merge atual preenche lacunas em título, autores, editora, ano, páginas, idioma, sinopse e imagens | Prioridade da base foi preservada no operacional |
| Merge atual sobrescreve ISBN-10, formato, edição, origem, referência, peso/medidas, unidades e proveniência | Pode misturar edição e apagar origens da base; não houve mudança silenciosa |
| Merge atual não complementa publishedDate, categories ou isbn13 | O contrato experimental considera esses campos explicitamente |
| Card/rascunho atuais usam regra por faixa para pesos declarados em kg | Contrato experimental converte kg por unidade, sem heurística por magnitude |
| Sinopses das duas fixtures sanitizadas anteriores são descrições comerciais/editoriais mistas | Continuam 8/9 válidos, com sinopse inconsistente e revisão humana |

As divergências acima resultam de inspeção local e testes simulados, sem
comparação nova com catálogos ao vivo. Os serviços e o BookDetailsCard não foram
alterados nesta etapa para preservar o isolamento solicitado.

## Validação reproduzível, sem consultas externas

```powershell
node --test tests/*.test.mjs
& "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" -B -m unittest discover -s experimentos/amazon/tests -p 'test_*.py' -v
npm.cmd run lint
npm.cmd run build
```

O teste `bibliographicContract.test.mjs` executa o extrator Python real sobre a
fixture sintética e valida a resposta no contrato TypeScript, além de simular
os serviços atuais com `fetch` controlado. Não requer credenciais nem servidor.
Os testes de interface verificam nove campos, seções complementares, origens,
permissões, erros, cancelamento e ausência de carregamento remoto. Os testes
Python anteriores permanecem preservados e a nova suíte bloqueia sockets externos.

Resultado desta entrega: **573 testes Node e 48 testes Python aprovados**,
incluindo os testes anteriores. `npm.cmd run lint` e `npm.cmd run build`
aprovados. O build apresenta aviso de tamanho do bundle principal, sem impedir
a compilação; não foi feita otimização fora do escopo. Os assets de produção
foram conferidos para ausência do laboratório. Não se repetiu o ensaio opcional
de navegador nesta etapa; a interface foi validada por testes de componentes.

## Pendências para homologação definitiva

- Revisão humana de sinopses, identificação editorial e conflitos por campo.
- Confirmar unidade real do peso e semântica de `AD_QTCOMPRIMENTO` na Curitiba;
  revisar validação do produto selecionado e proveniência do ISBN original.
- Aprovar explicitamente qualquer mudança futura das prioridades operacionais,
  abrangendo formato, edição, ISBNs, medidas e proveniência.
- Ampliar amostragem com material cuja utilização esteja autorizada, incluindo
  variações de layout e imagens. Seletores atuais não cobrem todas as galerias,
  imagens dinâmicas/JSON e formatos de data possíveis.
- Comprovar permissão aplicável antes de testes HTTP ou uso de imagens externas;
  não foi realizada nova verificação externa nesta tarefa.
- Decidir tratamento operacional de dados inconsistentes e obter autorização
  específica para eventual integração futura. Amazon permanece desabilitada no
  fluxo operacional, sem integração automática.
