import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const output = await build({
  stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    export * from './src/utils/metaDescription';
    export * from './src/utils/draft';
    export * from './src/utils/registrationSnapshot';
    export { default as SeoSection } from './src/components/magazord/SeoSection';
  ` }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  plugins: [{ name: 'controlled-ui', setup(builder) {
    builder.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'exports.jsx=exports.jsxs=(type,props)=>({type,props})', loader: 'js' }));
  } }],
});
const module = { exports: {} };
new Function('module', 'exports', output.outputFiles[0].text)(module, module.exports);
const api = module.exports;
const book = { id: 'book', title: 'Dom Casmurro', authors: ['Machado de Assis'], publisher: 'Ática', year: '2020', edition: '2', pageCount: 256, language: 'pt' };
const at = '2026-10-21T12:00:00Z';

test('Without a synopsis, bibliography falls back to title, principal author and secondary publisher', () => {
  const before = structuredClone(book);
  const expected = 'Conheça Dom Casmurro, de Machado de Assis. Publicado por Ática.';
  assert.equal(api.generateMetaDescription(book), expected);
  assert.equal(api.generateMetaDescription(book), expected);
  assert.ok(expected.length <= 160);
  assert.deepEqual(book, before);
  for (const condition of ['novo', 'usado']) {
    const draft = api.createRegistrationDraft(book, condition);
    assert.equal(draft.metaDescription, expected);
    assert.equal(draft.metaDescriptionEdited, false);
  }
});

test('Incomplete bibliography omits absent information and never fabricates a title or promotional claims', () => {
  assert.equal(api.generateMetaDescription({ title: 'Livro sem ficha' }), 'Conheça Livro sem ficha.');
  assert.equal(api.generateMetaDescription({ title: 'Livro', publisher: 'Editora Real' }), 'Conheça Livro. Publicado por Editora Real.');
  for (const data of [{}, { title: ' ' }, { authors: ['Autor'], publisher: 'Editora' }, { title: 'Título não cadastrado' }]) {
    assert.equal(api.generateMetaDescription(data), '');
  }
  const result = api.generateMetaDescription({ title: 'Livro', authors: [], year: 'desconhecido', pageCount: 0, language: '' });
  assert.equal(result, 'Conheça Livro.');
  assert.doesNotMatch(result, /frete|estoque|conservação|editora|autor|sinopse/i);
});

test('Source markup and whitespace are cleaned; unusable synopsis and condition notes do not enter SEO', () => {
  assert.equal(api.generateMetaDescription({ title: '<b>Livro</b>\n real', authors: [' Autora ', 'Autora'], publisher: '<i>Editora</i>',
    synopsis: 'Sinopse comercial', usedBookConditionNotes: 'Grifos no exemplar' }), 'Conheça Livro real, de Autora. Publicado por Editora.');
});

test('Long bibliography omits whole fields rather than cutting words, sentences or Unicode', () => {
  const result = api.generateMetaDescription({ ...book, publisher: 'Uma editora com nome muito extenso '.repeat(10) });
  assert.ok(result.length <= 160); assert.match(result, /^Conheça Dom Casmurro, de Machado de Assis\./);
  assert.equal(result, 'Conheça Dom Casmurro, de Machado de Assis.');
  for (const title of ['Palavra'.repeat(60), '📚'.repeat(90), 'Título muito longo '.repeat(30)]) {
    const text = api.generateMetaDescription({ title });
    assert.equal(text, ''); // no whole title fits; do not invent a shortened title
    assert.ok(text.isWellFormed());
  }
  const title = 'Título '.repeat(22).trim();
  assert.equal(api.generateMetaDescription({ title, authors: ['Autora com nome extenso'] }), `${title}.`);
});

test('Complete synopsis supplies real content before the principal author and publisher, without modifying sources', () => {
  const source = { ...book, authors: ['Machado de Assis', 'Outro autor', 'Organizadora'],
    synopsis: '<p>A obra explora as relações entre memória e ciúme.</p><p>Este trecho adicional permanece na sinopse.</p>',
    description: 'Descrição comercial preservada.', usedBookConditionNotes: 'Grifos no exemplar' };
  const before = structuredClone(source);
  const expected = 'Dom Casmurro, de Machado de Assis. A obra explora as relações entre memória e ciúme.';
  assert.equal(api.generateMetaDescription(source), expected);
  assert.equal(api.generateMetaDescription(source), expected);
  assert.doesNotMatch(expected, /Outro autor|Organizadora|Grifos|Descrição comercial/);
  assert.deepEqual(source, before);
  for (const condition of ['novo', 'usado']) {
    const draft = api.createRegistrationDraft(source, condition);
    assert.equal(draft.metaDescription, expected);
    assert.equal(draft.synopsis, 'A obra explora as relações entre memória e ciúme.\n\nEste trecho adicional permanece na sinopse.');
    const savedSynopsis = draft.synopsis, savedDescription = draft.description;
    const next = api.updateDraftWithMetaDescription(draft, { publisher: 'Outra editora' });
    assert.equal(next.synopsis, savedSynopsis);
    assert.equal(next.description, savedDescription);
  }
});

test('Short useful synopsis is copied whole; absent, incomplete or placeholder synopsis falls back safely', () => {
  assert.equal(api.generateMetaDescription({ title: 'Memórias', synopsis: 'O livro explora a memória.' }),
    'Memórias. O livro explora a memória.');
  for (const synopsis of [undefined, '', 'Breve.', 'Uma narrativa sobre', 'Uma narrativa sobre a infância e a memória…',
    'Uma narrativa sobre a infância e a memória...', 'Sinopse não disponível para esta obra.',
    'Descrição ainda não informada para este livro.', 'Compre este livro com frete grátis.']) {
    assert.equal(api.generateMetaDescription({ ...book, synopsis }), 'Conheça Dom Casmurro, de Machado de Assis. Publicado por Ática.', synopsis);
  }
  assert.equal(api.generateMetaDescription({ ...book, synopsis: 'Informações não disponíveis para esta obra. A obra explora a memória e o tempo.' }),
    'Dom Casmurro, de Machado de Assis. A obra explora a memória e o tempo.');
});

test('Synopsis content takes space before authors and publisher, and complete later sentences can fit', () => {
  const synopsis = 'A obra apresenta reflexões sobre a memória e as relações familiares ao longo de diferentes gerações.';
  const result = api.generateMetaDescription({ title: 'Memórias', synopsis,
    authors: ['Uma autora com nome extremamente longo que não cabe na descrição', 'Segundo autor'], publisher: 'Editora secundária também muito longa' });
  assert.equal(result, `Memórias. ${synopsis}`);
  assert.ok(result.length <= 160);
  assert.equal(api.generateMetaDescription({ title: 'Memórias', synopsis: `${'Uma frase muito longa sobre memórias '.repeat(10)}. A obra explora a memória e o tempo.` }),
    'Memórias. A obra explora a memória e o tempo.');
  assert.equal(api.generateMetaDescription({ title: 'Memórias', authors: [' ', 'Autora principal', 'Organizador', 'Mais um autor'] }),
    'Conheça Memórias, de Autora principal.');
});

test('Abbreviations and initials stay inside complete sentences; context-dependent continuations are skipped', () => {
  for (const synopsis of ['A obra acompanha o Dr. João em sua pesquisa sobre a memória.',
    'A obra acompanha J. Silva em sua pesquisa sobre a memória.']) {
    assert.equal(api.generateMetaDescription({ title: 'Memórias', synopsis }), `Memórias. ${synopsis}`);
  }
  const synopsis = `${'Uma frase muito longa sobre memórias '.repeat(10)}. Ele também aborda a infância.`;
  assert.equal(api.generateMetaDescription({ ...book, synopsis }), 'Conheça Dom Casmurro, de Machado de Assis. Publicado por Ática.');
});

test('Unedited suggestions follow bibliographic edits, including manual entries with no initial title', () => {
  const initial = api.createRegistrationDraft({ id: 'manual', title: '' });
  assert.equal(initial.metaDescription, '');
  const changed = api.updateDraftWithMetaDescription(initial, { title: 'Título informado', authors: ['Autora'], publisher: 'Editora' });
  assert.equal(changed.metaDescription, 'Conheça Título informado, de Autora. Publicado por Editora.');
  assert.equal(initial.metaDescription, '');
  const withSynopsis = api.updateDraftWithMetaDescription(changed, { synopsis: 'A obra explora a memória e o tempo.' });
  assert.equal(withSynopsis.metaDescription, 'Título informado, de Autora. A obra explora a memória e o tempo.');
  const cleared = api.updateDraftWithMetaDescription(withSynopsis, { synopsis: '' });
  assert.equal(cleared.metaDescription, changed.metaDescription);
  const unrelated = api.updateDraftWithMetaDescription(changed, { description: 'Texto comercial', usedBookConditionNotes: 'Marcas de uso' });
  assert.equal(unrelated.metaDescription, changed.metaDescription);
});

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return;
  if (Array.isArray(tree)) return tree.map(node => find(node, predicate)).find(Boolean);
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}

test('SEO input preserves manual text, deliberate clearing and text beyond the recommended length', () => {
  for (const manual of ['Texto SEO escrito pelo operador.', '', 'Texto manual extenso '.repeat(12)]) {
    let draft = api.createRegistrationDraft(book);
    const render = () => api.SeoSection({ draft, onChange: updates => { draft = api.updateDraftWithMetaDescription(draft, updates); } });
    const input = find(render(), node => node.type === 'textarea' && node.props.id === 'meta-description');
    assert.equal(input.props.maxLength, undefined);
    input.props.onChange({ target: { value: manual } });
    assert.equal(draft.metaDescriptionEdited, true);
    draft = api.updateDraftWithMetaDescription(draft, { title: 'Outro título', publisher: 'Outra editora', authors: ['Outro autor'], synopsis: 'A obra explora a memória e o tempo.' });
    assert.equal(find(render(), node => node.type === 'textarea').props.value, manual);
    assert.ok(find(render(), node => node.type === 'label' && node.props.htmlFor === 'meta-description'));
    const snapshot = api.createRegistrationSnapshot(draft, at);
    assert.equal(snapshot.fields.metaDescription, manual);
    assert.equal(snapshot.fields.metaDescriptionEdited, undefined);
    assert.equal(api.readRegistrationSnapshot(snapshot).fields.metaDescription, manual);
  }
});

test('Legacy snapshots and drafts retain absent SEO fields without automatic backfilling', () => {
  const legacy = { version: 1, capturedAt: at, fields: { condition: 'novo', title: book.title, synopsis: 'Sinopse histórica', description: 'Descrição histórica' } };
  const before = JSON.stringify(legacy);
  const read = api.readRegistrationSnapshot(legacy);
  assert.equal(read.version, 1); assert.equal(read.fields.metaDescription, undefined);
  assert.equal(read.fields.description, 'Descrição histórica'); assert.equal(JSON.stringify(legacy), before);
  const oldDraft = { title: book.title, metaDescription: 'Texto preexistente' };
  const updates = { publisher: 'Editora', synopsis: 'A obra explora a memória e o tempo.' };
  assert.equal(api.updateDraftWithMetaDescription(oldDraft, updates).metaDescription, 'Texto preexistente');
  assert.equal(api.updateDraftWithMetaDescription({ ...oldDraft, metaDescription: '' }, updates).metaDescription, '');
  assert.equal(api.updateDraftWithMetaDescription({ title: book.title }, updates).metaDescription, undefined);
});

// Synthetic source synopses: these fixtures exercise editorial choices, not external book metadata.
const editorialCases = [
  { genre: 'fiction', title: 'A última travessia',
    secondary: 'Esta obra apresenta uma leitura fascinante para todos os públicos.',
    central: 'Lia atravessa o sertão em busca do irmão desaparecido.', tail: 'O romance aborda escolhas e perdas.' },
  { genre: 'history', title: 'Mundos medievais',
    secondary: 'O volume reúne ensaios de leitura acessível.',
    central: 'A obra reconstitui a vida nas cidades europeias do século XIII.', tail: 'Também apresenta notas de apoio.' },
  { genre: 'biography', title: 'Caminhos de Helena',
    secondary: 'O livro apresenta uma trajetória inspiradora.',
    central: 'Helena fundou uma escola rural e liderou campanhas pela alfabetização.', tail: 'A biografia aborda dedicação e coragem.' },
  { genre: 'children', title: 'O jardim de Lia',
    secondary: 'Uma leitura que encanta crianças de todas as idades.',
    central: 'Lia aprende a cuidar de uma horta com a avó.', tail: 'A narrativa aborda a amizade.' },
  { genre: 'technical', title: 'Redes na prática',
    secondary: 'O livro apresenta exemplos complementares.',
    central: 'O manual explica protocolos TCP/IP e técnicas de diagnóstico de redes.', tail: 'O texto reúne exercícios para revisão.' },
];

for (const example of editorialCases) {
  test(`${example.genre}: ranks real subject matter over earlier generic or secondary sentences`, () => {
    const source = { title: example.title, authors: ['Ana Rocha', 'Segundo autor', 'Organizador'], publisher: 'Editora de teste',
      synopsis: [example.secondary, example.central, example.tail].join(' '), description: 'Descrição comercial original.' };
    const before = structuredClone(source);
    const expected = `${example.title}, de Ana Rocha. ${example.central}`;
    assert.equal(api.generateMetaDescription(source), expected);
    assert.equal(api.generateMetaDescription(source), expected);
    assert.ok(expected.length <= 160);
    assert.ok(source.synopsis.includes(example.central)); // selected sentence is copied verbatim
    assert.doesNotMatch(expected, /Segundo autor|Organizador|Publicado por|…/);
    assert.deepEqual(source, before);
    // Position alone must not determine which candidate wins.
    assert.equal(api.generateMetaDescription({ ...source, synopsis: [example.central, example.tail, example.secondary].join(' ') }), expected);
  });
}

test('Maldon reference selects the poem and medieval battle rather than complementary essays, without ISBN rules', () => {
  const central = 'O volume traduz o poema que narra uma batalha medieval.';
  const secondary = 'Também apresenta ensaios que complementam o entendimento do texto.';
  const source = { title: 'A batalha de Maldon e o regresso de Beorhtnoth', authors: ['J.R.R. Tolkien'],
    synopsis: `${secondary} ${central}` };
  const expected = `${source.title}, de J.R.R. Tolkien. ${central}`;
  assert.equal(api.generateMetaDescription(source), expected);
  assert.ok(expected.length <= 160);
  assert.doesNotMatch(expected, /ensaios|complementam|991|vikings/);
  const otherBook = { ...source, title: 'Poemas medievais', authors: ['Outra autora'] };
  assert.equal(api.generateMetaDescription(otherBook), `Poemas medievais, de Outra autora. ${central}`);
});

test('Ranks later central information above an earlier informative sentence that also fits', () => {
  const title = 'A batalha de Maldon';
  const secondary = 'A obra apresenta comentários sobre leitura.';
  const central = 'O poema narra a batalha medieval de Maldon, travada em 991.';
  assert.ok(`${title}. ${secondary}`.length <= 160);
  assert.ok(`${title}. ${central}`.length <= 160);
  assert.equal(api.generateMetaDescription({ title, synopsis: `${secondary} ${central}` }), `${title}. ${central}`);
});

test('Generic, context-dependent and fragment-only synopses use the existing bibliography fallback', () => {
  for (const synopsis of ['Uma obra imperdível.', 'Também apresenta ensaios sobre a cultura medieval.',
    'Complementa o entendimento do texto.', 'Neste livro você encontrará histórias e reflexões.',
    'A obra também apresenta ensaios sobre literatura.', 'Neste livro você encontrará uma obra que explora a história medieval.',
    'O livro apresenta uma leitura fascinante para todas as idades.', 'Sua pesquisa analisa a cultura medieval.',
    'Assim, a obra explica os protocolos de redes.', 'A histórica batalha medieval de Maldon.',
    'O livro apresenta uma obra.', 'Que narra uma batalha medieval.',
    'Sobre o poema que narra uma batalha medieval.', 'Incluindo uma história que narra uma batalha medieval.']) {
    assert.equal(api.generateMetaDescription({ ...book, synopsis }), 'Conheça Dom Casmurro, de Machado de Assis. Publicado por Ática.', synopsis);
  }
});

test('A source sentence that names the full title is preserved without repeating it in a new heading', () => {
  const title = 'A ponte de pedra';
  const synopsis = 'O romance A ponte de pedra acompanha Clara durante uma viagem pelo interior.';
  const source = { title, authors: ['Ana Rocha'], publisher: 'Editora de teste', synopsis };
  assert.equal(api.generateMetaDescription(source), synopsis);
  assert.equal(api.generateMetaDescription(source).split(title).length - 1, 1);
  assert.equal(api.generateMetaDescription({ title: 'Redes', synopsis: 'O manual explica redes de computadores e protocolos.' }),
    'Redes. O manual explica redes de computadores e protocolos.');
});

test('Length fitting never rewrites, truncates or extracts unsupported clauses from a long sentence', () => {
  const title = 'Mundos medievais';
  const longSentence = `A obra reconstitui a vida nas cidades europeias do século XIII, ${'com estudos documentais detalhados e contextualizados '.repeat(6).trim()}.`;
  const short = 'O livro explora o comércio medieval.';
  const source = { title, authors: ['Um nome de autor muito extenso '.repeat(6)], synopsis: `${longSentence} ${short}` };
  assert.equal(api.generateMetaDescription(source), `${title}. ${short}`);
  assert.equal(api.generateMetaDescription({ ...book, synopsis: longSentence }), 'Conheça Dom Casmurro, de Machado de Assis. Publicado por Ática.');
  for (const length of [159, 160, 161]) {
    const prefix = 'O manual explica ';
    const excerpt = prefix + 'a'.repeat(length - title.length - 2 - prefix.length - 1) + '.';
    const result = api.generateMetaDescription({ title, synopsis: excerpt });
    assert.equal(result, length <= 160 ? `${title}. ${excerpt}` : `Conheça ${title}.`);
    assert.ok(result.length <= 160);
    assert.ok(result.endsWith('.'));
    assert.doesNotMatch(result, /…/);
  }
});

test('Equal editorial scores keep source order deterministically without filling spare space', () => {
  const first = 'A obra explora a memória e o tempo.';
  const second = 'A obra explora a infância e o medo.';
  for (const [preferred, other] of [[first, second], [second, first]]) {
    const source = { title: 'Temas', publisher: 'Editora de teste', synopsis: `${preferred} ${other}` };
    assert.equal(api.generateMetaDescription(source), `Temas. ${preferred}`);
  }
});

test('Accented endings are sentence boundaries, not author initials', () => {
  for (const central of ['Lia aprende a cuidar de uma horta com a avó.', 'Helena liderou campanhas pela alfabetização.']) {
    const secondary = 'Também apresenta ensaios que complementam o entendimento do texto.';
    assert.equal(api.generateMetaDescription({ title: 'Memórias', synopsis: `${central} ${secondary}` }), `Memórias. ${central}`);
  }
});

test('New editorial ranking never replaces manual or historical SEO, including deliberate clearing', () => {
  const synopsis = 'Uma obra imperdível. O poema narra uma batalha medieval.';
  for (const manual of ['SEO manual com escolha editorial própria.', '']) {
    const draft = api.createRegistrationDraft(book);
    const edited = api.updateDraftWithMetaDescription(draft, { metaDescription: manual });
    const updated = api.updateDraftWithMetaDescription(edited, { synopsis, title: 'Outro livro', authors: ['Outra autora'] });
    assert.equal(updated.metaDescription, manual);
    assert.equal(edited.synopsis, draft.synopsis);
    assert.equal(updated.description, draft.description);
    const snapshot = api.createRegistrationSnapshot(updated, at);
    const before = structuredClone(snapshot);
    assert.equal(api.readRegistrationSnapshot(snapshot).fields.metaDescription, manual);
    assert.deepEqual(snapshot, before);
    const historic = { ...updated };
    delete historic.metaDescriptionEdited;
    assert.equal(api.updateDraftWithMetaDescription(historic, { synopsis }).metaDescription, manual);
  }
});
