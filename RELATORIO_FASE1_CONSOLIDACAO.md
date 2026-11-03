# Consolidação e proteção da Fase 1

## Marco anterior à consolidação

HEAD homologado da PR #2: `80eb18e1d3277d782d2f1745310e830dcd7c875f`.
Preservado, sem sobrescrever referências existentes, na tag anotada `isbn-fase1-head-homologado-80eb18e` publicada no GitHub antes do merge.

## Seleção explícita e isolamento

- `UserContext` consulta perfil, vínculos ativos e lojas ativas sob as permissões existentes. Com uma única loja, mantém o acesso direto. Com várias, exige escolha pelo nome; nenhuma loja é escolhida por ordenação de UUID.
- A escolha é revalidada antes de entrar no aplicativo e nas renovações de sessão. Se o vínculo selecionado deixar de existir, o aplicativo solicita nova escolha em vez de migrar silenciosamente para outra loja. Para mudar de loja, sair e entrar novamente evita transportar um cadastro em edição.
- A loja operacional aparece no aplicativo; o contexto/subárvore é identificado por usuário e loja. Histórico, operações, imagens e auditoria existentes mantêm seu escopo. Perfis técnicos continuam com recursos de desenvolvimento/laboratório conforme seus vínculos autorizados.
- Modelos e administração usam exclusivamente a loja operacional. Removido o uso de `VITE_CONDITION_TEMPLATES_STORE_ID`, sem fallback ou cópia de dados entre lojas. Uma declaração obsoleta no ambiente de Preview não interfere no código.
- Administração de usuários: o cliente informa a loja em `X-ISBN-Store-Id`. A função existente `manage-store-users` valida perfil, vínculo, role e loja ativa; todas as revalidações usam a mesma loja. Clientes antigos sem cabeçalho só podem usar um vínculo único e inequívoco. JWT permanece obrigatório. Não foram alterados usuários, vínculos, permissões ou políticas RLS.
- Autorização do laboratório deixa de depender do primeiro UUID e verifica vínculo developer ativo. O fluxo SP-API oficial mantém a autorização da loja técnica já configurada, independente da loja de cadastro escolhida.
- Catálogo, saldo e modos do simulador local ficam separados por loja. Chaves antigas sem identificação da loja são preservadas e não recebem atribuição automática. A interface informa sua existência. Não houve migração, exclusão ou alteração de produtos/estoques existentes nem chamadas reais Magazord.

## Proteção permanente e validação

- Adicionados testes do contexto real: duas lojas exigem escolha, ordem de UUID não decide identidade, escolha é revalidada e mantida na renovação, revogação não muda silenciosamente de loja, e usuários comerciais de loja única preservam seus acessos.
- Adicionados testes de isolamento do simulador e administração por loja. Atualizados os testes de histórico para consultar a mesma instância de loja usada pelo aplicativo.
- O teste de modos Magazord, relacionado à mudança, teve seu harness atualizado para normalizar CRLF e representar os imports atuais; seus 12 casos passam.
- Adicionado contrato permanente do formulário real NOVO/USADO: identidade, categorias, comercial, bibliografia, dimensões, imagens, conservação/sinopse, SEO e fiscal devem continuar presentes. Padrões cBenef, quantidade e preço inicial também são verificados.
- Regressão selecionada: **674 testes aprovados, nenhuma falha**, abrangendo ISBN/BrasilAPI/Curitiba/Amazon, cadastro, imagens/uploads, códigos, modelos/administração, SEO, idiomas, centavos, cBenef, revisão/snapshots/auditoria, permissões e simulador.
- Suíte completa: **684 aprovados de 687**, com apenas as três falhas preexistentes de mock `React.lazy` em `infrastructureUi.test.mjs`. Esse arquivo foi excluído da execução selecionada; suas dez verificações que passam continuam passando na suíte completa. Falhas não relacionadas não foram corrigidas.
- TypeScript, lint, build e `git diff --check`: aprovados. Aviso conhecido de bundle grande mantido fora do escopo.
- Consulta real transacional sob a role `authenticated` e claims da identidade técnica confirmou os dois vínculos developer ativos: Sebo Livraria Sul tem **18 modelos ativos**, incluindo os **17 originais ativos, cada texto exatamente uma vez**; a loja de laboratório tem zero modelos. Somente leituras, encerradas com rollback. Isso testa o escopo RLS real e não substitui uma interação visual com login real.

## Publicação e marco final

A publicação deve corresponder ao commit de merge da PR #2 validado no deployment de produção READY e no domínio `isbn.silveiralab.com.br`. A tag anotada `isbn-fase1-homologada` deve apontar para esse mesmo commit, sem sobrescrever tag existente. A identificação final do merge/deployment será registrada na anotação da tag e no relatório de entrega.

Funcionalidades protegidas pela Fase 1: ISBN e fontes homologadas, cadastro NOVO/USADO, galeria/uploads, códigos Pai/Filho, modelos de conservação e administração, Meta Description, idiomas por extenso, máscara de centavos, cBenef editável, revisão, snapshots, auditoria, permissões, isolamento de lojas e Magazord simulada.

Regra permanente: nenhuma funcionalidade homologada pode ser removida ou substituída silenciosamente. Pesquisa por título não foi iniciada e deve ficar em branch separada.
