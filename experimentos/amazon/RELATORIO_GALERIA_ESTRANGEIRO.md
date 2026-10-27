# Galeria de O Estrangeiro — ISBN 9788501014863

Diagnóstico de 26/10/2026 pelo fluxo HTTP existente do laboratório, seguido de
correção exclusivamente no extrator de imagens. Serviços, arquitetura, pesquisa
bibliográfica, interface, Magazord, banco e produção não foram alterados.

## Requisições e evidências

Foram feitos **dois GETs, cada um com confirmação explícita do usuário**, ao
endpoint `/dp/8501014869`. Ambos retornaram HTTP 200, com ISBN correspondente e
extração inicial de **1 capa e 0 adicionais**. Não houve redirects, retries,
downloads de imagens nem gravação de HTML bruto.

O primeiro processo encerrou antes de produzir uma fixture; seu HTML foi
descartado. Após nova confirmação, o segundo GET sanitizou a evidência durante
a própria execução. O corpo original tinha 1.390.570 bytes. A fixture final tem
3.844 bytes e contém apenas identificadores bibliográficos públicos, estrutura
de galeria e referências de imagens sem parâmetros, credenciais ou fragmentos.

Arquivos de evidência:

- `relatorios/diagnostico_galeria_9788501014863.json`: contagens e atributos públicos.
- `tests/fixtures/amazon_estrangeiro_9788501014863_galeria_sanitizada.html`: reprodução mínima sanitizada.

## Causa comprovada

| Estrutura recebida | Observação |
|---|---|
| `#landingImage` | Um IMG, slot 0, reconhecido como capa |
| `[data-mb-pv-slot-index]` | Quatro elementos: slot 0 IMG; slots 1, 2 e 3 DIV |
| Slots 1–3 | `media-block-image-tag`, sem IMG descendente, fora de `#altImages` |
| `#altImages` | Um contêiner; suas miniaturas estão sob `aria-hidden` |
| `mbAltImage` | String presente no HTML, sem ocorrência em id/class inspecionados |
| `colorImages` | Presente em dois scripts; um contém também a chave `initial` |
| Literais JSON aceitos pelo parser atual | Nenhum array reconhecido nesses scripts |

O extrator procurava apenas elementos IMG da capa e de `#altImages`. Por isso
ignorava as referências declaradas diretamente nas DIVs dos três slots. As
miniaturas marcadas com `aria-hidden` também eram excluídas pelo filtro existente.

## Correção mínima

O extrator passou a inspecionar slots numéricos com classe
`media-block-image-tag` dentro dos blocos de produto `#imageBlock`,
`#imageBlock_feature_div` ou `#imageBlockATF` que contenham o elemento da capa.
Nesse percurso específico, aceita referências em DIV além de IMG.

Reutiliza as funções existentes para priorizar `data-old-hires`, selecionar a
maior resolução declarada em `data-a-dynamic-image`, deduplicar e excluir mídia
incompatível. O slot 0 é deduplicado com a capa já identificada. Não houve
ampliação da varredura para toda a página, execução de JavaScript, mudança no
tratamento de `aria-hidden` ou necessidade de ampliar o parser de scripts.

## Resultado e validação

| Etapa | Capa | Adicionais |
|---|---:|---:|
| Resposta HTTP com extrator anterior | 1 | 0 |
| Fixture sanitizada antes da correção | 1 | 0 |
| Mesma evidência após correção, em teste offline | 1 | 3 |

Referências selecionadas, sem baixar os arquivos:

- Capa: `91Sb5HdDL3L._SL1500_.jpg`.
- Slot 1: `91pv+3HSGRL._SL1500_.jpg`, declarado em `data-old-hires`.
- Slot 2: `81YiEHsaX1L._SL1500_.jpg`, declarado em `data-old-hires`.
- Slot 3: `31Epa894dmL.jpg`, maior área declarada no mapa de resoluções.
- Miniatura principal: referência `src` do IMG principal, identificada separadamente.

**64 testes Python e 18 testes Node aprovados.** Os quatro novos testes de
galeria verificam a reprodução real, escopo dos slots, exclusão de vídeos,
publicidade/ícones/ocultos/produtos relacionados externos ao bloco e a ausência
de scripts livres, formulários e atributos sensíveis na fixture.

```powershell
& "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" -B -m unittest discover -s experimentos/amazon/tests -p 'test_*.py'
node --test tests/amazonLab.test.mjs tests/bibliographicContract.test.mjs
```

Não houve nova requisição após a correção. O resultado posterior foi validado
offline sobre a evidência sanitizada do segundo GET.

## Autorização e limites

As quatro referências continuam com autorização de uso **não comprovada**.
Elas aparecem no diagnóstico técnico e permanecem fora dos campos de imagem
utilizáveis do `book_info`, conforme o controle anterior. O contrato BookInfo
e a distinção entre disponibilidade técnica e autorização foram preservados.
Identificar as referências não comprova o conteúdo visual dos arquivos: nenhuma
imagem foi carregada. Uso posterior continua dependente da permissão aplicável.

Sem novas dependências, commit ou deploy.
