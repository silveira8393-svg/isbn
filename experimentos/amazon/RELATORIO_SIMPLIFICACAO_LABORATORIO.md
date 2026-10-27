# Laboratório Amazon — remoção de bloqueios internos — 26/10/2026

O laboratório consulta HTTP e exibe as referências de imagem diretamente.
O fluxo é: Configurações → Laboratório Amazon → HTTP real → Pesquisar → galeria.
Não existem mais confirmações por consulta ou estados de autorização exigidos
para exibir a capa, a miniatura principal e as imagens adicionais.

## Alterações

- Removidos checkbox, estado de confirmação, envio de `permissao_confirmada`,
  desmarcação após a tentativa e bloqueio do botão de pesquisa por permissão.
- Removidos `allow_http` e a opção obrigatória `--permitir-http` do serviço.
  Os comandos individuais e `npm.cmd run dev:amazon:online` continuam existentes.
- HTTP é o modo inicial da interface; o modo fixture continua disponível.
  A resposta de saúde apenas informa conexão, sem condicionar a seleção HTTP.
- Removidas verificações de `carregamento_remoto_permitido`, `autorizacao_uso`
  e autorização da miniatura na galeria. Metadados legados, mesmo presentes
  em respostas antigas, não impedem a renderização.
- Removidas mensagens de indisponibilidade e de permissão pendente associadas
  aos bloqueios anteriores. URLs e origens continuam no diagnóstico recolhível.
- A resposta do serviço local usa as referências técnicas já extraídas para
  preencher os campos de imagem existentes de BookInfo. Não propaga os estados
  de autorização da projeção histórica do extrator para a interface.

O extrator validado e `src/types.ts` permaneceram byte a byte iguais ao início
desta etapa. A transformação acima fica no serviço do laboratório; nenhum
seletor, parser ou regra bibliográfica foi alterado. O componente compartilhado
e o card operacional da consulta também não foram alterados.

Permanecem validações técnicas de URLs/ISBN, deduplicação, seleção e falhas de
imagem, timeout, limites de leitura e tratamento de erros HTTP/CAPTCHA.
Serviço e proxy continuam locais, sem persistência ou integração operacional.
`download_realizado: false` descreve o serviço Python; o carregamento visual
ocorre diretamente no navegador.

## Evidências

| Verificação | Resultado |
|---|---|
| Interface/cliente, galeria e contrato bibliográfico | 27 testes Node aprovados |
| Inicialização, portas, falhas e encerramento | 11 testes Node aprovados |
| Extrator e serviço Python | 65 testes aprovados |
| TypeScript (`npm.cmd run lint`) | Aprovado |
| Build de produção | Aprovado; aviso preexistente de tamanho do bundle |
| Navegador: painel → proxy → Python → fixtures | Duas consultas, nove campos por livro, sem checkbox e sem erros JavaScript |
| Navegador: SVGs autorais locais | Uma capa e três adicionais, seleção e consultas sucessivas sem confirmação |
| Navegador: imagens reais de O Estrangeiro | Uma capa e três adicionais, mais miniatura principal; cinco referências com HTTP 200 |
| Consulta HTTP real pelo proxy Vite, sem confirmação | HTTP 200, ISBN correspondente, uma capa e três adicionais, também presentes no BookInfo |

As imagens reais foram carregadas no Chrome pelos componentes reais da interface,
usando a resposta extraída offline da fixture sanitizada já existente. Não houve
novo GET à página do livro. O ensaio permitiu somente as referências de imagens
declaradas na evidência; outros recursos externos foram bloqueados. Não houve
download para arquivo, captura ou armazenamento das imagens reais.

Dimensões efetivamente decodificadas pelo navegador:

| Referência | Papel | Dimensões (px) |
|---|---|---|
| `91Sb5HdDL3L._SL1500_.jpg` | Capa | 970 × 1500 |
| `61cFRircgZL._SY445_SX342_ML2_.jpg` | Miniatura principal | 287 × 445 |
| `91pv+3HSGRL._SL1500_.jpg` | Adicional 1 | 968 × 1500 |
| `81YiEHsaX1L._SL1500_.jpg` | Adicional 2 | 936 × 1500 |
| `31Epa894dmL.jpg` | Adicional 3 | 375 × 500 |

Evidências: `relatorios/verificacao_consulta_direta.json`, `relatorios/verificacao_galeria_real.json`,
`relatorios/verificacao_galeria_visual.json`, `relatorios/verificacao_interface.json`
e captura exclusivamente sintética `relatorios/galeria_autoral_visual.png`.
O primeiro ensaio remoto no sandbox não concluiu o carregamento; a execução
com acesso de rede aprovou as cinco referências acima, sem desativar TLS.

As portas estavam ocupadas pela instância anterior do próprio laboratório.
Após identificar seus comandos/processos, ela foi encerrada para aplicar as
alterações; os 11 testes de inicialização então passaram. O laboratório foi
reiniciado com o comando existente em `http://127.0.0.1:3000`.

Além das respostas simuladas dos testes, foi feita a conferência do fluxo HTTP
real pelo endpoint do proxy Vite, enviando somente ISBN e modo. A primeira
tentativa, no processo sem acesso de rede do sandbox, retornou falha de transporte
(502 local). Após reiniciar o laboratório com acesso de rede, a consulta retornou
HTTP 200 da Amazon, ISBN correspondente, uma capa e três adicionais. A resposta
BookInfo incluiu a capa e os três adicionais e preservou as origens. O HTML bruto
permaneceu em memória; a evidência salva contém somente contagens e indicadores.
Não houve retry automático ou confirmação por consulta. O laboratório foi deixado
ativo com acesso de rede em `http://127.0.0.1:3000`.

Não há pendência de bloqueio interno; disponibilidade externa continua sujeita
à resposta efetiva do servidor da Amazon.

Sem alterações em Magazord, Supabase, histórico, estoque ou pesquisa operacional.
Sem dependências novas, commit ou deploy.
