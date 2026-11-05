# Evidência Curitiba

- `gravity-falls-detail.json`: projeção sanitizada dos campos públicos observados na auditoria anterior; não é o envelope JSON completo.
- `gravity-falls-index.html`: documento público capturado em uma única leitura controlada em 05/11/2026, HTTP 200, 1733 bytes na resposta, sem `Access-Control-Allow-Origin`. As cinco URLs vêm dos links presentes no documento, não de geração de nomes.
- `tarot-detail.json`: projeção sanitizada da ficha pública obtida por uma única sequência de bootstrap/pesquisa/ficha em 05/11/2026. Nenhum identificador da sessão pública foi conservado. A ficha contém somente diretório e miniatura.

Não foram baixados arquivos de imagens. O índice do Tarô não foi consultado, e a URL da segunda imagem histórica continua desconhecida. Testes com uma adicional `fixtures.invalid` são dados autorais para provar preservação, não evidência da URL ou fonte histórica.

Os ensaios locais podem servir o HTML de Gravity Falls em memória para testar a situação em que a fonte permite CORS. Isso não afirma que o Preview consiga ler a fonte real hoje. Não existe proxy ou bypass na implementação.
