# Projeto ISBN — Validação experimental local Amazon

Data: 26/10/2026. Escopo: `experimentos/amazon/`, exclusivamente offline.

Os dois HTMLs reais sanitizados fornecidos foram reprocessados. Ambos apresentam
9/9 campos preenchidos (100%), mas somente 8/9 passam nas verificações locais
(88,89%). As duas descrições misturam resumo da obra com material promocional
ou citações de terceiros; o campo sinopse permanece **inconsistente**, com revisão
humana obrigatória. Não houve divergência de ISBN nem dos oito campos estruturados.

Os 28 testes passaram, sem falhas, erros ou testes ignorados. Isso valida os
cenários locais cobertos; não estima a cobertura de outros livros ou layouts.

## Amostra real e comparação dos nove campos

| Campo | 1984 | O Alquimista | Estado local nos dois |
|---|---|---|---|
| Título | 1984 - Tradução de Alexandre Hubner e Heloisa Jahn | O alquimista | Válido |
| Autores | George Orwell | Paulo Coelho | Válido |
| Editora | Companhia das Letras | Paralela | Válido |
| Ano | 2009 | 2017 | Válido |
| Edição | 1ª | 1ª | Válido |
| Idioma | Português | Português | Válido |
| Formato | CC - Capa Convencional | CC - Capa Convencional | Válido |
| Número de páginas | 416 | 208 | Válido |
| Sinopse | Descrição com narrativa, elogios e citações críticas | Descrição com narrativa, promoção e depoimentos | Inconsistente; revisão humana |

| Verificação | 1984 | O Alquimista |
|---|---|---|
| ISBN pesquisado | 9788535914849 | 9788584390670 |
| ISBN-13 encontrado | 9788535914849 | 9788584390670 |
| ISBN-10 encontrado | 8535914846 | 8584390677 |
| Dígitos verificadores ISBN-10 / ISBN-13 | Ambos válidos | Ambos válidos |
| Equivalência ISBN-10 → ISBN-13 | Confirmada localmente | Confirmada localmente |
| Correspondência com a consulta | Corresponde | Corresponde |
| Preenchidos / válidos locais | 9/9 / 8/9 | 9/9 / 8/9 |

Consolidado: 18/18 preenchidos, 16/18 válidos locais, dois inconsistentes e nenhum
ausente. Correspondência confirmada localmente em 2/2 produtos. Há quatro ISBNs
com checksum válido, formando dois pares equivalentes. Não foram encontrados
conflitos entre detalhes e carrossel da mesma página. Esses blocos não são fontes
editoriais independentes.

O resultado histórico em `resultado_isbn_amazon_local.json` e o CSV anterior
foram preservados. A nova execução confirma seus oito campos estruturados e
substitui a inferência de validade da sinopse por um alerta explícito. O ano 1949
mencionado na descrição de 1984 é da publicação original da obra: o módulo utiliza
2009, declarado nos detalhes da edição analisada. Tradutores de 1984 não foram
incluídos como autores. O texto `Leia mais` foi descartado da descrição.

## Validação e proveniência

O módulo reaproveita a limpeza de texto, os nove campos, a regra de checksum
ISBN-13 e os seletores bibliográficos do protótipo. Usa `html.parser` da biblioteca
padrão no lugar de BeautifulSoup, indisponível no ambiente; nenhuma dependência
foi instalada. Requer Python 3.10 ou posterior.

As regras de referência foram lidas, sem alterações, em:

- `src/components/OwnerDashboard.tsx`: os nove campos oficiais.
- `src/utils/bibliographicNormalization.ts` e seus testes: aliases de idioma e formato.
- `src/utils/isbn.ts`: limpeza conservadora de espaços/hífens e `X` maiúsculo.
- `src/utils/draft.ts`: edição preservada como texto, sem regra operacional para convertê-la.
- `src/utils/sanitizer.ts`: remoção de scripts/estilos e markup da sinopse.

ISBN-10 usa módulo 11, inclusive `X`; ISBN-13 usa módulo 10 e prefixo 978/979.
A comparação aceita ISBN-10 equivalente ao ISBN-13, sem converter ISBN-13 de
prefixo 979 para ISBN-10. Pontuação inesperada não é apagada para fabricar um
ISBN. Campos de ISBN inválidos, pares incompatíveis ou fontes conflitantes
impedem a classificação de correspondência como confirmada.

Os campos têm estados `valido`, `ausente` ou `inconsistente`. O estado é local ao
campo; ISBN divergente aparece separadamente como impedimento de atribuição ao
produto pesquisado. Nenhum resultado autoriza atribuição automática ao catálogo.
Preenchimento conta valores presentes, incluindo inconsistentes; o percentual
de válidos locais conta somente os campos aprovados pelas heurísticas.

Os seletores são limitados aos blocos bibliográficos. O módulo lê listas, tabelas,
pares `dt/dd` e atributos do carrossel, sem buscar nomes de campos no HTML inteiro.
Cada evidência conserva o valor extraído e a origem; linhas das listas referem-se
às linhas do HTML de entrada. IDs duplicados aninhados não multiplicam a mesma
evidência. Divergências são preservadas, sem escolher silenciosamente outra edição.

Idiomas e encadernações usam os aliases conhecidos do projeto. Valores desconhecidos
são preservados como inconsistentes. Edições numéricas inequívocas, como `1a edição`,
viram `1ª`; reimpressões não viram edições. Páginas exigem inteiro positivo até
20.000. Datas precisam ser reconhecíveis e possíveis no calendário; o ano é limitado
a 1450 até o próximo ano. Esses limites são heurísticas experimentais documentadas,
não regras novas do sistema operacional.

Descrição comercial não é promovida automaticamente a sinopse. Texto curto,
promocional, misto ou sem indícios de resumo é sinalizado; até uma sinopse
explicitamente rotulada e aprovada pelas heurísticas conserva revisão humana.
Os relatórios contêm texto bibliográfico, sem HTML integral, atributos de sessão,
scripts ou imagens. Conteúdos com possíveis URLs/credenciais são omitidos na
exportação; o CSV também neutraliza prefixos de fórmulas. Saídas são restritas a
subpastas deste experimento.

## Testes e execução

Evidência: [tests/resultado_testes.txt](tests/resultado_testes.txt).

Cobertura: os dois HTMLs reais sanitizados, dois exemplos sintéticos positivos,
HTML vazio/incompleto, campos vazios/placeholders, editora/edição/páginas ausentes,
ISBNs inválidos ou divergentes, par ISBN-10/13 incompatível, normalização de aliases,
formatos desconhecidos, edição versus reimpressão, datas inválidas, conflitos entre
blocos/edições, listas/tabelas/carrosséis, pequenas mudanças de tags/classes,
ausência de sinopse, descrição promocional, exclusão de tradutores, evidências,
exportações, proteção de dados de sessão e execução pela CLI. Os testes em processo
bloqueiam conexões de socket; o programa não contém cliente de rede.

Na raiz do repositório, com um Python disponível:

```powershell
python -B -m unittest discover -s experimentos/amazon/tests -v

python -B experimentos/amazon/prototipo_isbn_amazon_local.py `
  experimentos/amazon/fixtures/amazon_1984_9788535914849.html `
  experimentos/amazon/fixtures/amazon_o_alquimista_9788584390670.html `
  --isbn 9788535914849 --isbn 9788584390670 `
  --tipo real_html_sanitizado --saida relatorios/reais
```

Nesta sessão, o comando `python` aponta para um alias do Windows sem interpretador.
Foi utilizado o Python já presente em
`C:/Users/Silveira/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`.
Não foi necessário instalar software. `--isbn` é obrigatório para cada arquivo,
na mesma ordem. `--historico` relata apenas o JSON antigo, sem revalidar HTML;
as métricas deste relatório foram geradas a partir dos dois HTMLs reais.

## Fragilidades, revisão humana e maturidade

- Dois livros, no mesmo idioma e encadernação, formam uma amostra muito pequena.
- HTML sanitizado não testa bloqueios, carregamento dinâmico ou HTML bruto completo.
- IDs desconhecidos, mudanças amplas de layout e HTML muito malformado podem perder campos.
- O parser não executa JavaScript, não lê dados ocultos em scripts/JSON-LD e não resolve recomendações/variações dinamicamente.
- Classificação de sinopse e nomes bibliográficos usa heurísticas: há falsos positivos e negativos.
- ISBN com checksum correto não comprova registro editorial, autenticidade ou qualidade dos metadados.
- Sem fonte editorial independente, informações internamente coerentes de uma edição errada podem passar.
- Edições por extenso/romanos, formatos digitais, idiomas compostos e paginações especiais exigem revisão.

A revisão humana deve selecionar e aprovar a sinopse, retirando promoção e
depoimentos; conferir título/subtítulo, papel dos colaboradores e identidade
editorial da edição; e resolver todos os campos inconsistentes ou divergências.
Não houve divergência bibliográfica estruturada observável nesta amostra.

Maturidade recomendada: **módulo experimental apto a ampliar testes locais
supervisionados**. A amostra não sustenta prontidão para produção ou integração.
Próxima avaliação: novos HTMLs fornecidos manualmente, incluindo formatos e idiomas
diferentes e edições conflitantes, com comparação humana de referência.

## Arquivos da entrega

Modificados:

- `prototipo_isbn_amazon_local.py` — extração, normalização, validação e CLI offline.
- `RELATORIO_PROTOTIPO_AMAZON_ISBN.md` — identificado como registro histórico, com link para esta avaliação.

Criados:

- `RELATORIO_VALIDACAO_AMAZON.md` — esta avaliação.
- `.gitignore` — ignora somente `__pycache__/` no experimento.
- `tests/test_validacao.py` — suíte local.
- `tests/fixtures/1984_sintetico.html` e `tests/fixtures/alquimista_sintetico.html` — exemplos sintéticos; negativos gerados em memória.
- `tests/resultado_testes.txt` — evidência da execução.
- `relatorios/reais/01_9788535914849.json` e `.md` — relatório de 1984.
- `relatorios/reais/02_9788584390670.json` e `.md` — relatório de O Alquimista.
- `relatorios/reais/consolidado.json` e `comparativo.csv` — amostra consolidada.

Os HTMLs e `fixtures/LEIA-ME.txt` fornecidos foram lidos sem modificações.
Todas as alterações desta tarefa ficaram em `experimentos/amazon/`. Não foram
executados scraping, chamadas à Amazon, downloads de imagens, alterações em
BrasilAPI/Curitiba/Magazord, banco, deploy ou commits.
