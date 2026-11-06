# Amazon SP-API — equivalência de registros

Base: `7381f91de19e4170ccbaf395253c4a76955ba231`.
Branch isolada: `fix/isbn-v1.4-amazon-equivalence`.

## Regra generalizável

O cliente pode selecionar um registro existente quando todos os candidatos retornados:

1. Têm ASIN válido, marketplace brasileiro e identificadores ISBN válidos e equivalentes à consulta. Identificadores EAN/GTIN declarados também não podem contradizer o ISBN.
2. Compartilham título completo, sem retirar subtítulos ou expressões de edição; normalizam-se somente caixa, acentos e pontuação.
3. Compartilham autores ou editora, além de pelo menos uma âncora de edição: data válida, encadernação reconhecida, edição ou número positivo de páginas.
4. Não apresentam valores bibliográficos preenchidos conflitantes: título, autores, editora, idioma, data, edição, encadernação, páginas ou medidas do item/embalagem.
5. Permitem selecionar um candidato que contenha todos os fatos preenchidos nos demais. Fatos distribuídos entre registros não são unidos. Conversões de unidades diferentes podem provocar revisão conservadora.

Resultados paginados/incompletos (`hasMore`) permanecem em revisão. Entre candidatos já equivalentes e igualmente completos, a presença de MAIN e depois a ordenação estável do ASIN apenas desempata; não comprova identidade. Não há condição por ISBN, título, autor, ASIN ou quantidade fixa. A rotina de registro único foi preservada.

Após seleção, reutiliza-se o mapeamento existente para título, autores, páginas, encadernação, medidas e galeria. A MAIN de maior resolução é escolhida; resoluções do mesmo ativo Amazon não viram imagens adicionais. A consolidação continua preenchendo lacunas e preservando campos existentes, incluindo idioma português confirmado e campos manuais.

## Limitação do caso informado

Os ASINs `8551003666` e `B0CQGHT4VD` continuam exigindo revisão: títulos completos diferentes, sem autoria/editora ou âncora de edição compartilhadas com o registro escasso. Igualdade do ISBN, ASIN numérico, completude e imagens não eliminam essa incerteza. Nenhum dado, imagem ou idioma `english` desses duplicados é incorporado automaticamente. A fixture real resumida não contém URLs e valores de medidas; eles não foram inventados.

Menor alternativa operacional: conservar as outras fontes e utilizar a edição/fotos verificadas no formulário existente. Uma futura evidência independente que vincule ambos os registros à mesma edição pode permitir revisar o critério; não foi criado seletor ou outro painel.

## Formato DIGITAL

Não há atribuição padrão de DIGITAL no mapeamento Amazon: `hardcover` vira `Capa dura`, `ebook`/`kindle_edition` viram `Livro digital`. BrasilAPI copia `data.format`; Curitiba fornece `AD_DSFORMATO` e sua consolidação pode substituir o formato anterior. O complemento Amazon preenche somente campos ausentes. Portanto, um DIGITAL já preenchido permanece, sobretudo quando Amazon é ambígua.

Sem a resposta ou a proveniência da consulta visual original, não se comprova qual fonte retornou aquele DIGITAL nem que ele era incorreto. Não foi imposta uma conversão de digital para físico. Quando um registro Amazon aceito discorda da classificação físico/digital anterior, acrescenta-se aviso pelo mecanismo existente e preservam-se valor e proveniência. Formato ausente recebe capa dura quando comprovado pelo registro aceito; ebook legítimo continua digital.

## Validação

Testes offline com registros fictícios, em dois ISBNs diferentes do exemplo, incluindo 2, 3 e 7 candidatos e inversão de ordem; conflitos de título, autoria, editora, data, encadernação, edição, páginas, idioma, identificadores, medidas e embalagem; identificadores inválidos, paginação e proibição de mescla. Integração do cliente, Consulta e NOVO/USADO, MAIN e resoluções, dados físicos/digitais, idioma, prioridades e fixture diagnóstica anterior.

125 testes direcionados aprovados (SP-API integrada/oficial, fontes/links e Laboratório), typecheck e build aprovados. Build conserva avisos preexistentes de bundle e importação Supabase estática/dinâmica. Nenhuma nova consulta bibliográfica externa ou sessão automatizada foi utilizada. Validação autenticada no Preview fica para homologação do responsável.

Somente cliente Amazon, testes e este registro foram alterados; sem alteração de layout, transporte/autorização, demais fontes, banco, credenciais ou Production. Metadados Vercel confirmam chave Google Books para Preview sem restrição de branch; nenhum valor foi lido ou alterado.
