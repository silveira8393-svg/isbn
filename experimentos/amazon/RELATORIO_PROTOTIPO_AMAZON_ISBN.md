> **Registro histórico da primeira execução.** A validação atual está em
> [RELATORIO_VALIDACAO_AMAZON.md](RELATORIO_VALIDACAO_AMAZON.md).
> A contagem antiga de 9/9 representa presença, não validade dos nove campos.
> O módulo atual usa somente a biblioteca padrão; a instalação de BeautifulSoup
> descrita neste registro histórico deixou de ser necessária.

# Projeto ISBN — Registro histórico do protótipo offline Amazon

**Data:** 26/10/2026  
**Escopo:** análise de dois documentos HTML enviados manualmente. Nenhuma requisição à Amazon foi realizada, nenhuma integração foi alterada e nenhuma imagem foi capturada.

## Resultado

| Campo | 1984 | O Alquimista |
|---|---|---|
| ISBN-13 | 9788535914849 | 9788584390670 |
| ISBN-10 | 8535914846 | 8584390677 |
| Título | 1984 - Tradução de Alexandre Hubner e Heloisa Jahn | O alquimista |
| Autores | George Orwell | Paulo Coelho |
| Editora | Companhia das Letras | Paralela |
| Ano de publicação | 2009 | 2017 |
| Edição | 1ª | 1ª |
| Idioma | Português | Português |
| Formato normalizado | CC - Capa Convencional | CC - Capa Convencional |
| Número de páginas | 416 | 208 |
| Descrição editorial | Presente | Presente |
| Campos preenchidos | **9/9** | **9/9** |
| Dígito verificador ISBN-13 | Válido | Válido |

**Importante:** 9/9 é cobertura da **amostra de dois HTMLs**, não taxa de sucesso da pesquisa por ISBN, nem estimativa de cobertura geral da Amazon. Não foi verificada licença para reutilizar a descrição editorial, cuja reprodução foi omitida nos arquivos de saída.

## Mapeamento preliminar dos elementos

- `#productTitle`: título.
- `#bylineInfo`: autor e colaboradores; o parser considera apenas autores explicitamente rotulados “Autor”.
- `#detailBullets_feature_div`: editora, data, edição, idioma, páginas e ISBNs.
- `#bookDescription_feature_div`: presença da descrição editorial.
- `#richProductInformation_feature_div`: estrutura auxiliar para confirmação de detalhes.

## Funcionamento do protótipo

O programa `prototipo_isbn_amazon_local.py` lê arquivos HTML **já presentes no computador**, normaliza dados e emite um JSON e um CSV de comparação. Não contém funções HTTP, automação de navegador, bypass de bloqueios, autenticação ou operações na Magazord. O arquivo antigo do leitor Kindle foi excluído do teste por não representar uma página bibliográfica de produto.

### Executar localmente

Instalar dependência, se necessário: `python -m pip install beautifulsoup4`.

Executar na pasta dos arquivos:

```bash
python prototipo_isbn_amazon_local.py "Texto colado(3).txt" "Texto colado(4).txt"
```

Arquivos gerados: `resultado_isbn_amazon_local.json` e `comparativo_isbn_amazon_local.csv`.

## Limitações e verificações futuras

1. O HTML pode mudar, exigindo ajuste dos seletores e do tratamento de campos.
2. A classificação de **sinopse** neste teste significa presença de uma **descrição editorial**, que pode incluir comentários e material promocional. Ela precisa de revisão humana.
3. O ISBN-13 teve o dígito verificador conferido, mas não foram realizados testes de identidade de edição com fontes editoriais independentes.
4. Não houve avaliação de acesso automatizado, estabilidade de requisições, volume de pesquisas ou operação na Vercel.
5. O uso comercial dos dados, especialmente a descrição, continua dependendo de autorização e licenças aplicáveis. A abertura normal de páginas não equivale a uma licença de extração.
6. Para obter conclusões sobre confiabilidade, repetir um teste offline com amostra mais variada (outras editoras, livros sem descrição, formatos diferentes, títulos homônimos, ISBNs ausentes), sem acessar automaticamente o site.

**Conclusão:** a leitura e normalização offline dos dois documentos HTML é tecnicamente demonstrada. Não autoriza nem valida uma integração de scraping ao vivo.
