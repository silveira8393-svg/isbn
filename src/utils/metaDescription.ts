import type { RegistrationDraft } from '../types';
import { sanitizeSynopsis } from './sanitizer';

type SeoSource = Partial<Pick<RegistrationDraft, 'title' | 'authors' | 'publisher' | 'synopsis'>>;
const seoFields = ['title', 'authors', 'publisher', 'synopsis'] as const;
const maxLength = 160;
const minimumSynopsisScore = 5.5; // A content predicate (5) plus at least one subject word (0.5).

function plainText(value?: string): string {
  return sanitizeSynopsis(value).replace(/\s+/g, ' ').trim();
}

function sentence(value: string): string {
  return /[.!?][”"')\]]*$/.test(value) ? value : `${value}.`;
}

function comparisonText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const commonWords = new Set(('ainda alem apresenta aborda acompanha analisa conta descreve explica explora narra reune ' +
  'obra obras livro livros texto textos volume romance narrativa leitura leitor leitores historia historias ' +
  'este esta esse essa neste nesta nesse nessa sobre entre para pela pelo pelas pelos como mais muito uma umas ' +
  'todos todas seus suas tambem voce encontrara entendimento complemento complementares').split(' '));

function subjectWords(value: string): string[] {
  return [...new Set(comparisonText(value).split(' ').filter(word => word.length >= 4 && !commonWords.has(word)))];
}

function containsTitle(text: string, title: string): boolean {
  const normalizedTitle = comparisonText(title);
  // For one-word titles, retain case to avoid mistaking a generic topic for the book's name.
  if (!normalizedTitle.includes(' ')) return text.split(/[^\p{L}\p{N}]+/u).includes(title);
  return ` ${comparisonText(text)} `.includes(` ${normalizedTitle} `);
}

/** Editorial signals rank verbatim sentences, never infer facts or turn a clause into a new assertion. */
function synopsisScore(text: string, title: string): number {
  const normalized = comparisonText(text);
  // These continuations need an antecedent; a high keyword count cannot make them stand alone.
  if (/^(?:ele|ela|eles|elas|isso|isto|seu|sua|seus|suas|esse|essa|esses|essas|porem|contudo|portanto|alem disso|tambem|ainda|assim|complementa|complementam|com isso|por isso|dessa forma|nesse sentido|o que|que|sobre|acerca de|incluindo|por exemplo|bem como)\b/.test(normalized)) return 0;

  const content = /\b(?:aborda|explora|analisa|investiga|examina|estuda|explica|descreve|discute|retrata|reconstitui|documenta|narra|conta|acompanha|ensina|apresenta|reune|traduz|contem|inclui|trata|percorre|revela)(?:m)?\b/.test(normalized);
  const events = /\b(?:enfrenta|descobre|parte|viaja|busca|encontra|resolve|vive|luta|atravessa|aprende|cuida|evita|compara|demonstra)(?:m)?\b|\b(?:nasceu|cresceu|liderou|fundou|desenvolveu|viveu|criou|publicou|descobriu|enfrentou)\b/.test(normalized);
  // A topic noun or a date alone is insufficient evidence of a complete informative statement.
  if (!content && !events) return 0;

  let score = (content ? 5 : 0) + (events ? 5 : 0);
  if (/\b(?:batalha|guerra|revolucao|medieval|seculo|historico|historica|cultural|cientifico|cientifica|pesquisa|teoria|metodo|algoritmos?|protocolos?|traducao|poema|poesia|biografia|alfabetizacao)\b/.test(normalized)) score += 3;
  if (/\b\d{3,4}\b|\bseculo\s+[ivxlcdm]+\b/.test(normalized)) score += 2;
  const words = subjectWords(text);
  score += Math.min(3, words.length / 2);
  score += Math.min(3, subjectWords(title).filter(word => words.includes(word)).length);

  if (/\b(?:imperdivel|indispensavel|fascinante|inspirador|inspiradora|maravilhoso|maravilhosa|encantador|encantadora|envolvente|emocionante)\b|\b(?:todos os publicos|todas as idades|voce encontrara|voce vai encontrar)\b/.test(normalized)) score -= 8;
  if (/\b(?:tambem|complementa|complementam|complementares|entendimento do texto|prefacio|posfacio|apendice|notas editoriais|exercicios para revisao)\b/.test(normalized)) score -= 6;
  return score;
}

/** Copy complete source sentences only. Unfinished excerpts and placeholders use the bibliography fallback. */
function synopsisSentences(value?: string): string[] {
  const text = plainText(value);
  const segments = new Intl.Segmenter('pt-BR', { granularity: 'sentence' }).segment(text);
  const sentences: string[] = [];
  let pending = '';
  for (const { segment } of segments) {
    pending += segment;
    // Sentence segmentation can split "Dr. João" or an author's initials.
    if (/(?:^|[^\p{L}\p{N}])(?:dr|dra|sr|sra|srta|prof|profa|etc|vol|pág|págs|ed|org|orgs|trad|coord|ex|\p{L})\.\s*$/iu.test(pending)) continue;
    sentences.push(pending.trim());
    pending = '';
  }
  return sentences.filter(text =>
    text.length >= 20 && (text.match(/\p{L}+/gu)?.length ?? 0) >= 4 &&
    /[.!?][”"')\]]*$/.test(text) && !/(?:\.{2,}|…|https?:|www\.|ISBN)/i.test(text) &&
    !/\b(?:sinopse|resumo|descrição|informações?)\s+(?:(?:não|ainda|está|estão)\s+)*(?:disponível|disponíveis|indisponível|indisponíveis|cadastrad[oa]s?|informad[oa]s?)\b/i.test(text) &&
    !/^(?:compre|adquira|aproveite|confira|saiba mais)\b/i.test(text)
  );
}

/** Local, deterministic suggestion; synopsis content precedes author and publisher. */
export function generateMetaDescription(book: SeoSource): string {
  const title = plainText(book.title);
  // BrasilAPI uses this placeholder when the actual title is missing.
  if (!title || title.toLowerCase() === 'título não cadastrado') return '';
  const author = (book.authors ?? []).map(plainText).find(Boolean);
  const publisher = plainText(book.publisher);
  const titleSentence = sentence(title);
  // A title that cannot fit whole is never silently truncated into another title.
  if (titleSentence.length > maxLength) return '';

  const excerpt = synopsisSentences(book.synopsis)
    .map((text, index) => ({ text, index, score: synopsisScore(text, title) }))
    .filter(({ text, score }) => score >= minimumSynopsisScore && (containsTitle(text, title) ? text : `${titleSentence} ${text}`).length <= maxLength)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.text;
  let text: string;
  if (excerpt) {
    text = containsTitle(excerpt, title) ? excerpt : `${titleSentence} ${excerpt}`;
    if (author && !containsTitle(excerpt, title)) {
      const withAuthor = `${sentence(`${title}, de ${author}`)} ${excerpt}`;
      if (withAuthor.length <= maxLength) text = withAuthor;
    }
  } else {
    text = sentence(`Conheça ${title}${author ? `, de ${author}` : ''}`);
    if (text.length > maxLength) text = sentence(`Conheça ${title}`);
    if (text.length > maxLength) text = titleSentence;
  }
  if (!excerpt && publisher && `${text} Publicado por ${sentence(publisher)}`.length <= maxLength) {
    text += ` Publicado por ${sentence(publisher)}`;
  }
  return text;
}

/** An explicit edit (including clearing) takes precedence over all subsequent suggestions. */
export function updateDraftWithMetaDescription(draft: RegistrationDraft, updates: Partial<RegistrationDraft>): RegistrationDraft {
  const next = { ...draft, ...updates };
  if (Object.prototype.hasOwnProperty.call(updates, 'metaDescription')) {
    return { ...next, metaDescriptionEdited: true };
  }
  if (next.metaDescriptionEdited === false && seoFields.some(key => Object.prototype.hasOwnProperty.call(updates, key))) {
    next.metaDescription = generateMetaDescription(next);
  }
  return next;
}
