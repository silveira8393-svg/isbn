# Recuperação bibliográfica Amazon — diagnóstico em andamento

Base isolada: `fix/amazon-bibliographic-recovery`, criada de `76261ae0b7270812c3545bba2c18075a16b5a9d9` (tag 1.1 preservada). Nenhuma correção bibliográfica foi presumida/aplicada. Os arquivos pendentes das demais worktrees não foram incorporados.

## Ambiente confirmado em 05/11/2026

Metadados oficiais da Vercel, projeto `prj_pvcmEP52OoMKQhhvb5FJRWrGZv1e`, equipe `silveira8393-svgs-projects`:

| Ambiente | Configuração exigida pelo catálogo |
|---|---|
| Preview | Nomes necessários presentes: enabled, store, client ID/secret, seller, refresh e Supabase URL/chave pública; credenciais protegidas |
| Production | Nomes necessários presentes, com alternativas VITE para Supabase; não utilizado nem alterado |
| Development | Configuração SP-API ausente; não utilizado para consultar Amazon |

Foram lidos somente metadados de presença, escopo e tipo. Nenhum segredo foi recuperado, copiado ou modificado. O Preview 1.1 conhecido é READY, deployment `dpl_3VxLddBoMVeyHuvxhuDTfg1UBRgD`; o JSON histórico confirma que ele já executou o catálogo oficial. Presença de variáveis não comprova validade atual de credenciais ou disponibilidade da Amazon.

## Observabilidade restrita, ainda sem consultas reais

O endpoint existente só fornecia a projeção e não permitia comparar seus atributos de origem. Foi preparado o parâmetro temporário `diagnostic=bibliography` no mesmo GET `/api/amazon/spapi/catalog?isbn=...`:

- Somente em runtime `VERCEL_ENV=preview`, somente os dois ISBNs autorizados e após a mesma validação real de sessão, perfil ativo e vínculo Desenvolvimento/loja existentes. Não modifica autorização ou cria rota pública de debug.
- Reutiliza o único GET oficial dessa consulta, sem GET por ASIN, nova fonte, retry ou escrita. Sinopse/HTML, ofertas, preços, estoque e campos privados não entram na coleta.
- Expõe presença, tipos e valores factuais selecionados de atributos bibliográficos, summary/dimensions, mais a projeção. Não retorna payload bruto completo, headers ou tokens; não registra respostas em logs. Aplica limites de profundidade, amostragem e 32 KiB por item; truncamentos ficam explícitos.
- Diagnóstico desativado por padrão e rejeitado em Production/Development. Não é acionado pela pesquisa operacional da interface. A requisição normal conserva seu contrato.
- Este é um Preview de diagnóstico, não uma correção de recuperação nem homologação bibliográfica. A observabilidade deverá ser removida após a coleta, salvo justificativa explícita para mantê-la restrita.

Arquivos: `server/spapi/catalogDiagnostics.ts`, chamada opcional em `catalog.ts`, seleção restrita em `handler.ts`, cinco testes em `tests/spapiOfficial.test.mjs`. Parser bibliográfico, demais fontes, imagens, Curitiba, cadastro, layout e política de sinopse permanecem iguais à base.

## Validação

- TypeScript, lint e build aprovados (avisos de bundle/importações preexistentes).
- 29 testes SP-API aprovados, incluindo cinco novos de diagnóstico (autorização, ambientes, duas identidades permitidas, coleta no mesmo GET, exclusão de conteúdo/segredos, limites e preservação do contrato comum).
- Suíte geral: 766 testes, 763 aprovados, três falhas preexistentes de `React.lazy` no mock de `infrastructureUi.test.mjs` para admin/operator/developer. Cenários existentes de bibliografia, Consulta/Cadastro NOVO/USADO e galeria Curitiba aprovados. Log local ignorado: `recovery-validation.log`.
- Não repetidos os ensaios de navegador já documentados. Nenhuma consulta real SP-API ou página comercial, pesquisa operacional, registro Supabase ou cadastro realizado nesta etapa.

## Próximo passo e limites

Disponibilizar o Preview restrito e obter uma sessão legítima Desenvolvimento para a coleta. Limite: um GET por ISBN (`9798276439839` e `9798286828647`), sequenciais, separados por pelo menos 15 segundos. Interromper após erro de autenticação/403/429/restrição, sem retry. Sem botão Buscar e sem chamar `handleSearch`.

A comparação e qualquer correção dependem dessas evidências. Os registros anteriores do Lab já confirmam 503 remoto antes do parser; não serão repetidas consultas ao site comercial. Neste ponto ainda não se afirma ausência de atributos na resposta original nem recuperação de editora/páginas/peso.
