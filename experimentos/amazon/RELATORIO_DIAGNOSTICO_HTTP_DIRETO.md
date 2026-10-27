# Diagnóstico HTTP direto — acesso comprovado

Data: 26/10/2026, 15:50:08 (America/Sao_Paulo).
URL: `https://www.amazon.com.br/dp/8584390677`. ISBN: `9788584390670`.

Foi criado `diagnostico_http_direto.py`, usando somente a biblioteca padrão e o
extrator existente, sem modificá-lo. Há um único ponto de GET, com identificação
explícita de agente, TLS verificado, sem proxy, cookies, login, redirecionamentos
ou novas tentativas. O corpo fica em memória; apenas métricas e resultados
bibliográficos são exportados. CAPTCHA ou resposta não 200 encerram o diagnóstico.

**O acesso HTTP direto funcionou.** Após a confirmação explícita do usuário de
que o teste pontual estava autorizado, o script foi executado no ambiente Windows
local com permissão de rede. Houve exatamente uma tentativa de GET, sem Chrome,
sessão previamente aberta, credenciais, cookies, proxy ou redirecionamentos.

| Resultado solicitado | Resultado observado |
|---|---|
| Acesso HTTP direto funcionou? | Sim |
| Status HTTP do produto | 200 |
| Duração HTTP, incluindo leitura do corpo | 4.913,24 ms |
| Tamanho do corpo recebido | 1.695.131 bytes |
| URL final | https://www.amazon.com.br/dp/8584390677 |
| Tipo de conteúdo | text/html;charset=UTF-8 |
| productTitle | Presente |
| detailBullets_feature_div | Presente |
| bookDescription_feature_div | Presente |
| Campos identificados | 9/9 (100%) |
| Campos válidos locais | 8/9 (88,89%) |
| Identidade da edição pelo ISBN | Corresponde: ISBN-10 8584390677 e ISBN-13 9788584390670, ambos válidos e sem conflitos |
| Diferença em relação ao Chrome | Nenhuma nos nove valores extraídos nem nos estados de qualidade |
| Impedimento técnico observado | Nenhum nesta consulta; sem CAPTCHA ou aviso de restrição detectado |

| Campo | Valor recebido | Estado preservado |
|---|---|---|
| Título | O alquimista | valido |
| Autores | Paulo Coelho | valido |
| Editora | Paralela | valido |
| Ano | 2017 | valido |
| Edição | 1ª | valido |
| Idioma | Português | valido |
| Formato | CC - Capa Convencional | valido |
| Páginas | 208 | valido |
| Sinopse | Descrição com 1.309 caracteres; texto omitido do diagnóstico | inconsistente; revisão humana |

A análise usou `extract` e `validate` do extrator existente diretamente em memória,
sem refatoração. A comparação leu o resultado anterior
`relatorios/reais/02_9788584390670.json`; não repetiu a validação dos HTMLs locais.
A igualdade se refere aos campos normalizados e seus estados, não ao HTML inteiro.
A sinopse continuou inconsistente por misturar resumo, promoção e depoimentos.

O registro estruturado está em `relatorios/diagnostico_http_direto.json`.
Não foram gravados HTML bruto, cookies, tokens ou cabeçalhos de sessão, nem
baixadas imagens. Os únicos arquivos desta etapa são o script, esse JSON e este
relatório. Não houve investigação da SP-API, deploy, commit, mudança de banco,
dependências novas ou alteração operacional.

A tentativa anterior de iniciar o processo havia sido rejeitada pela revisão
automática, antes de qualquer GET. A confirmação posterior do usuário resolveu
esse impedimento de aprovação; a execução autorizada retornou os resultados acima.
O 503 anterior, da ferramenta web ao ler um documento de condições, não foi uma
resposta desta página de produto nem do processo local.

Não foi observado impedimento técnico para outro teste pontual autorizado.
Um único sucesso não demonstra estabilidade, cobertura ou permissão para coleta
recorrente. A confirmação recebida cobre este teste; o acesso técnico **não
estabelece autorização para uso comercial ou republicação dos dados**.
