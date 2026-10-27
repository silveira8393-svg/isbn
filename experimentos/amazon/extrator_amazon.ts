// Extrator experimental puro: HTML em memória → evidências → qualidade → BookInfo.
// A implementação Python permanece como referência de homologação offline.
import type { BookInfo } from '../../src/types.js';
import type { LabQuality, LabResult } from '../../src/services/amazonLabClient.js';
import { AMAZON_LAB_FIELDS } from '../../src/services/amazonLabClient.js';
import { canonicalBookIsbn, normalizeEdition } from '../../src/utils/bibliographicEvaluation.js';
import { normalizeCoverFormat, normalizeLanguage, COVER_FORMATS } from '../../src/utils/bibliographicNormalization.js';
import { cleanIsbn } from '../../src/utils/isbn.js';
import { isImageReference } from '../../src/utils/imageUrls.js';
import { clean, key, HtmlNode, parseHtml } from './html_local.js';

export const FIELDS = AMAZON_LAB_FIELDS.map(([field]) => field);
export const EXTRA_FIELDS = ['data_publicacao', 'peso', 'dimensoes', 'largura', 'altura', 'profundidade',
  'subtitulo', 'categorias', 'capa', 'imagens_adicionais'] as const;
type Value = LabQuality['valor'];
export interface Candidate { valor: string | string[]; origem: string; tipo: string; miniatura?: string | null; origem_miniatura?: string | null }
type Candidates = Record<string, Candidate[]>;
export interface Quality extends LabQuality { evidencias: Candidate[] }
interface Identity { valor: string | null; valido: boolean; conflito: boolean; evidencias: Candidate[] }
interface Image {
  referencia: string; papel: 'principal' | 'adicional'; origem: string; disponibilidade_tecnica: string;
  autorizacao_uso: string; miniatura?: string; origem_miniatura?: string; autorizacao_miniatura?: string;
}
export interface AmazonReport {
  natureza: string; arquivo: string; isbn_pesquisado: string; isbn_encontrado: Record<string, Identity>;
  correspondencia: string; titulo: Value; campos: Record<string, Quality>; complementares: Record<string, Quality>;
  preenchidos: number; validos_locais: number; total_campos: number; percentual_preenchimento: number;
  percentual_validos_locais: number; atribuicao_ao_isbn_autorizada: false; alertas: string[]; edicao_verificacao: string;
  imagens: { itens: Image[]; download_realizado: false; carregamento_remoto_permitido: false }; book_info: BookInfo;
}
const unique = <T>(values: T[]) => [...new Set(values)];
const LABELS: Record<string, string> = {
  titulo: 'titulo', title: 'titulo', autor: 'autores', autores: 'autores', editora: 'editora', publisher: 'editora',
  'data da publicacao': 'ano', 'publication date': 'ano', ano: 'ano', edicao: 'edicao', edition: 'edicao',
  idioma: 'idioma', language: 'idioma', formato: 'formato', format: 'formato', 'numero de paginas': 'paginas',
  paginas: 'paginas', 'print length': 'paginas', 'capa comum': 'paginas', 'capa dura': 'paginas', paperback: 'paginas', hardcover: 'paginas',
  'isbn-10': 'isbn10', 'isbn-13': 'isbn13', sinopse: 'sinopse', 'peso do produto': 'peso', peso: 'peso', 'item weight': 'peso',
  'dimensoes do produto': 'dimensoes', dimensoes: 'dimensoes', 'product dimensions': 'dimensoes', largura: 'largura', width: 'largura',
  altura: 'altura', height: 'altura', profundidade: 'profundidade', espessura: 'profundidade', depth: 'profundidade',
  subtitulo: 'subtitulo', categorias: 'categorias',
};
const PANELS = ['detailBullets_feature_div', 'productDetails_detailBullets_sections1',
  'productDetails_techSpec_section_1', 'richProductInformation_feature_div'];
const RPI = { publisher: 'editora', edition: 'edicao', publication_date: 'ano', language: 'idioma',
  print_length: 'paginas', binding: 'formato', isbn10: 'isbn10', isbn13: 'isbn13' };
const isValidId = (value: string, field: string) => cleanIsbn(value).length === (field === 'isbn10' ? 10 : 13) && !!canonicalBookIsbn(value);

export function extractAmazon(html: string): Candidates {
  const doc = parseHtml(html);
  const candidates: Candidates = Object.fromEntries([...FIELDS, 'isbn10', 'isbn13', ...EXTRA_FIELDS].map(field => [field, []]));
  function add(field: string, value: string | string[], source: string, kind = 'bibliografico', metadata = {}) {
    const candidate: Candidate = { valor: Array.isArray(value) ? value.map(clean).filter(Boolean) : clean(value), origem: source, tipo: kind, ...metadata };
    if (!candidates[field].some(item => JSON.stringify(item) === JSON.stringify(candidate))) candidates[field].push(candidate);
  }
  for (const node of doc.byId('productTitle')) add('titulo', node.text(), '#productTitle');
  for (const byline of doc.byId('bylineInfo')) {
    const names: string[] = [];
    for (const node of byline.walk()) {
      if (node.tag !== 'a') continue;
      for (let context = node.parent; context && context !== byline; context = context.parent) {
        if ([...context.walk()].filter(n => n.tag === 'a').length !== 1) break;
        if (/\((?:Autor|Autora|Author)\)/i.test(context.text())) { if (!names.includes(node.text())) names.push(node.text()); break; }
      }
    }
    if (names.length) add('autores', names, '#bylineInfo (papel Autor/Autora/Author)');
    const format = /Formato:\s*([^|()]+)/i.exec(byline.text());
    if (format) add('formato', format[1], '#bylineInfo (Formato)');
  }
  function labeled(label: string, value: string, source: string) {
    label = key(label).replace(/[ :]+$/, '');
    const field = LABELS[label];
    if (!field) return;
    add(field, field === 'autores' ? [value] : value, source, field === 'sinopse' ? 'sinopse_explicita' : 'bibliografico');
    if (field === 'ano' && ['data da publicacao', 'publication date'].includes(label)) add('data_publicacao', value, source);
    if (['capa comum', 'capa dura', 'paperback', 'hardcover'].includes(label)) add('formato', label, source + ' (encadernação)');
  }
  for (const id of PANELS) for (const panel of doc.byId(id)) for (const row of panel.walk()) {
    const source = `#${id} / ${row.tag} (linha ${row.line})`;
    if (row.tag === 'tr') {
      const cells = row.children.filter((c): c is HtmlNode => c instanceof HtmlNode && ['th', 'td'].includes(c.tag));
      if (cells.length === 2) labeled(cells[0].text(), cells[1].text(), source);
    } else if (row.tag === 'dt') {
      const siblings = row.parent!.children;
      const sibling = siblings.slice(siblings.indexOf(row) + 1).find((c): c is HtmlNode => c instanceof HtmlNode);
      if (sibling?.tag === 'dd') labeled(row.text(), sibling.text(), source);
    } else if (row.tag === 'li' && row.text().includes(':')) {
      const text = row.text(), colon = text.indexOf(':');
      labeled(text.slice(0, colon), text.slice(colon + 1), source);
    }
  }
  const rpiIds = { ...Object.fromEntries(Object.entries(RPI).map(([suffix, field]) => ['rpi-attribute-book_details-' + suffix, field])),
    'rpi-attribute-language': 'idioma', 'rpi-attribute-book_details-fiona_pages': 'paginas' };
  for (const [id, field] of Object.entries(rpiIds)) for (const node of doc.byId(id)) {
    let text = node.text();
    for (const [label, mapped] of Object.entries(LABELS).sort((a, b) => b[0].length - a[0].length)) {
      if (mapped !== field) continue;
      const match = new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s*:\\s*|\\s+)').exec(key(text));
      if (match) { text = text.slice(match[0].length); break; }
    }
    add(field, text, '#' + id);
    if (id.endsWith('publication_date')) add('data_publicacao', text, '#' + id);
  }
  for (const node of doc.byId('bookDescription_feature_div')) add('sinopse', node.text(), '#bookDescription_feature_div', 'descricao_comercial');
  for (const node of doc.byId('productSubtitle')) if (COVER_FORMATS.includes(normalizeCoverFormat(node.text()) as typeof COVER_FORMATS[number])) add('formato', node.text(), '#productSubtitle');
  for (const image of extractImages(doc, candidates)) add(image.principal ? 'capa' : 'imagens_adicionais', image.referencia,
    image.origem, 'referencia_imagem', { miniatura: image.miniatura, origem_miniatura: image.origem_miniatura });
  return candidates;
}

function imageReference(value: unknown): value is string {
  if (!isImageReference(value)) return false;
  const url = new URL(value);
  return url.protocol === 'https:' && !url.search && !url.hash && !!url.pathname.replaceAll('/', '');
}
const amazonHosts = new Set(['m.media-amazon.com', 'images-na.ssl-images-amazon.com', 'images-eu.ssl-images-amazon.com']);
function productImage(value: unknown): value is string {
  if (!imageReference(value)) return false;
  const url = new URL(value);
  return !/\.(?:mp4|webm|m3u8|html?|js|css|ico)$/i.test(url.pathname)
    && !/(?:^|[/_-])(?:icons?|sprites?|transparent[-_]pixel|spinner|play[-_]button)(?:[/_.-]|$)/i.test(url.pathname)
    && (!amazonHosts.has(url.hostname) || url.pathname.startsWith('/images/I/'));
}
function imageIdentity(reference: string) {
  const url = new URL(reference);
  return amazonHosts.has(url.hostname) ? 'amazon-image:' + url.pathname.replace(/\._[A-Za-z0-9_,+\-]+_\.(jpg|jpeg|png|webp)$/i, '.$1') : reference;
}
const NON_IMAGE = /video|vídeo|icon|ícone|sprite|advert|sponsored|patrocinad|publicidade|360|play[-_ ]?button|(?:^|\s)(?:ads?|spin)(?:\s|$)/i;
function allowedImageNode(node: HtmlNode) {
  if (!node.visible()) return false;
  for (let current: HtmlNode | undefined = node; current; current = current.parent) {
    if (NON_IMAGE.test(['id', 'class', 'alt', 'title', 'aria-label', 'data-type', 'data-media-type', 'data-action'].map(k => current!.attrs[k] || '').join(' '))) return false;
    if (['altImages', 'imageBlock_feature_div', 'imageBlock', 'imageBlockATF'].includes(current.attrs.id)) break;
  }
  const { width = '', height = '' } = node.attrs;
  return !(/^\d+$/.test(width) && /^\d+$/.test(height) && Number(width) <= 2 && Number(height) <= 2);
}
interface Descriptor {
  referencia: string; rank: number; principal: boolean; origem: string; miniatura: string | null;
  origem_miniatura: string | null; thumbnail_rank: number; keys: Set<string>;
}
function descriptor(hires: unknown, dynamic: unknown, fallback: unknown, thumb: unknown, source: string, principal = false, thumbRank = 1): Descriptor | null {
  const resolutions = dynamic && typeof dynamic === 'object' && !Array.isArray(dynamic) ? Object.entries(dynamic).filter(([ref, size]) =>
    productImage(ref) && Array.isArray(size) && size.length === 2 && size.every(n => typeof n === 'number' && Number.isFinite(n) && n > 0))
    .sort((a, b) => b[1][0] * b[1][1] - a[1][0] * a[1][1]).map(([ref]) => ref) : [];
  const choices = [[hires, 5], ...resolutions.map(ref => [ref, 4]), [fallback, 2], [thumb, 1]]
    .filter((pair): pair is [string, number] => productImage(pair[0]));
  if (!choices.length) return null;
  return { referencia: choices[0][0], rank: choices[0][1], principal, origem: source,
    miniatura: productImage(thumb) ? thumb : null, origem_miniatura: productImage(thumb) ? source : null,
    thumbnail_rank: thumbRank, keys: new Set(choices.map(([ref]) => imageIdentity(ref))) };
}
const intersects = (a: Set<string>, b: Set<string>) => [...a].some(value => b.has(value));
// Extrai apenas um array JSON balanceado. Nenhum eval ou execução de JavaScript.
function jsonArray(text: string): unknown {
  const start = /^\s*\[/.exec(text);
  if (!start) return null;
  let level = 0, quoted = false, escaped = false;
  for (let i = text.indexOf('['); i < text.length; i++) {
    const char = text[i];
    if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; }
    else if (char === '"') quoted = true;
    else if (char === '[' || char === '{') level++;
    else if (char === ']' || char === '}') {
      if (--level === 0) { try { return JSON.parse(text.slice(0, i + 1)); } catch { return null; } }
    }
  }
  return null;
}
function extractImages(doc: ReturnType<typeof parseHtml>, candidates: Candidates) {
  const images: Descriptor[] = [];
  function merge(item: Descriptor | null) {
    if (!item) return;
    const matches = images.filter(image => intersects(image.keys, item.keys));
    if (!matches.length) { images.push(item); return; }
    const target = matches[0];
    for (const other of [...matches.slice(1), item]) {
      other.keys.forEach(value => target.keys.add(value));
      target.principal ||= other.principal;
      if (other.rank > target.rank) { target.referencia = other.referencia; target.rank = other.rank; target.origem = other.origem; }
      if (other.miniatura && (!target.miniatura || other.thumbnail_rank > target.thumbnail_rank)) {
        target.miniatura = other.miniatura; target.origem_miniatura = other.origem_miniatura; target.thumbnail_rank = other.thumbnail_rank;
      }
      if (other !== item) images.splice(images.indexOf(other), 1);
    }
  }
  function fromNode(node: HtmlNode, source: string, principal = false, slot = false) {
    if ((node.tag !== 'img' && !(slot && node.tag === 'div')) || !allowedImageNode(node)) return null;
    let dynamic: unknown = {};
    try { dynamic = JSON.parse(node.attrs['data-a-dynamic-image'] || '{}'); } catch { /* src permanece como alternativa */ }
    return descriptor(node.attrs['data-old-hires'], dynamic, node.attrs.src, node.attrs.src, source, principal, principal ? 1 : 2);
  }
  for (const id of ['landingImage', 'imgBlkFront', 'ebooksImgBlkFront']) for (const node of doc.byId(id)) {
    const item = fromNode(node, '#' + id, true);
    if (item && !images.some(image => image.principal)) merge(item);
  }
  for (const panel of doc.byId('altImages')) for (const node of panel.walk()) merge(fromNode(node, `#altImages / img (linha ${node.line})`));
  for (const id of ['imageBlock', 'imageBlock_feature_div', 'imageBlockATF']) for (const panel of doc.byId(id)) {
    if (![...panel.walk()].some(node => ['landingImage', 'imgBlkFront', 'ebooksImgBlkFront'].includes(node.attrs.id))) continue;
    for (const node of panel.walk()) {
      const slot = node.attrs['data-mb-pv-slot-index'] || '';
      if (/^[0-9]+$/.test(slot) && (node.attrs.class || '').split(/\s+/).includes('media-block-image-tag'))
        merge(fromNode(node, `#${id} / data-mb-pv-slot-index=${slot} (linha ${node.line})`, false, true));
    }
  }
  const known = new Set(['isbn10', 'isbn13'].flatMap(field => candidates[field].map(c => canonicalBookIsbn(String(c.valor)))).filter(Boolean));
  const pattern = /["']colorImages["']\s*:\s*\{\s*["']initial["']\s*:\s*|(?:["']imageGalleryData["']\s*:|\bimageGalleryData\s*=)\s*/g;
  for (const script of doc.root.walk()) {
    if (script.tag !== 'script' || script.attrs.src || !allowedImageNode(script)) continue;
    const text = script.children.filter(child => typeof child === 'string').join('');
    for (const match of text.matchAll(pattern)) {
      const entries = jsonArray(text.slice(match.index! + match[0].length));
      if (!Array.isArray(entries)) continue;
      const gallery = entries.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) || entry.isVideo || NON_IMAGE.test(['mediaType', 'type', 'variant'].map(k => entry[k] || '').join(' '))) return null;
        return descriptor(entry.hiRes, entry.main, entry.large, entry.thumb, `script / galeria inicial[${index}] (linha ${script.line})`, entry.variant === 'MAIN', 3);
      }).filter((item): item is Descriptor => !!item);
      const declared = new Set([...text.matchAll(/["']asin["']\s*:\s*["']([0-9Xx-]+)["']/g)].map(m => canonicalBookIsbn(m[1])).filter(Boolean));
      const sameIds = declared.size === known.size && [...declared].every(id => known.has(id));
      if (known.size && declared.size && !sameIds) continue;
      const mainKeys = new Set(images.filter(image => image.principal).flatMap(image => [...image.keys]));
      if (!gallery.some(image => intersects(mainKeys, image.keys)) && !(known.size && sameIds)) continue;
      for (const item of gallery) if (!(item.principal && mainKeys.size && !intersects(mainKeys, item.keys))) merge(item);
    }
  }
  return images;
}

export function publicationDate(value: string): string | null {
  const text = key(value);
  const months = ['janeiro january', 'fevereiro february', 'marco march', 'abril april', 'maio may', 'junho june',
    'julho july', 'agosto august', 'setembro september', 'outubro october', 'novembro november', 'dezembro december'];
  const iso = /^([12][0-9]{3})-([0-9]{2})-([0-9]{2})$/.exec(text);
  const br = /^([0-9]{1,2})\/([0-9]{1,2})\/([12][0-9]{3})$/.exec(text);
  const named = /^([0-9]{1,2}) (?:de )?([a-z]+) (?:de )?([12][0-9]{3})$/.exec(text);
  const parts = iso ? [+iso[1], +iso[2], +iso[3]] : br ? [+br[3], +br[2], +br[1]] : named
    ? [+named[3], months.findIndex(month => month.split(' ').includes(named[2])) + 1, +named[1]] : null;
  if (!parts) return null;
  const [year, month, day] = parts, date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}
function measurement(value: string, weight = false): number | null {
  const units: Record<string, number> = weight ? { g: 1, grama: 1, gramas: 1, kg: 1000, quilogramas: 1000, kilograms: 1000, grams: 1 }
    : { cm: 1, centimetros: 1, mm: .1, m: 100, in: 2.54, inches: 2.54, polegadas: 2.54 };
  const match = new RegExp('^([0-9]+(?:[.,][0-9]+)?)\\s*(' + Object.keys(units).join('|') + ')$').exec(key(value));
  if (!match) return null;
  const number = Number(match[1].replace(',', '.')) * units[match[2]];
  return Number.isFinite(number) && number > 0 ? Math.round(number * 1e6) / 1e6 : null;
}
function labeledDimensions(value: string): Record<string, number> | null {
  const axes = { largura: 'width', width: 'width', l: 'width', w: 'width', altura: 'height', height: 'height', a: 'height', h: 'height',
    profundidade: 'depth', espessura: 'depth', depth: 'depth', p: 'depth', d: 'depth' };
  const match = /^([\d.,]+)\s*[x×]\s*([\d.,]+)\s*[x×]\s*([\d.,]+)\s*(cm|mm|m|in|inches|polegadas)\s*\(([^)]+)\)$/.exec(key(value));
  if (!match) return null;
  const labels = match[5].split(/\s*[x×]\s*/).map(label => axes[label as keyof typeof axes]);
  const numbers = [1, 2, 3].map(i => measurement(match[i] + ' ' + match[4]));
  return labels.length === 3 && labels.every(Boolean) && new Set(labels).size === 3 && numbers.every(Boolean)
    ? Object.fromEntries(labels.map((label, i) => [label, numbers[i]!])) : null;
}
const PLACEHOLDERS = new Set(['', '-', 'n/a', 'nao informado', 'nao disponivel', 'indisponivel', 'null', 'none', 'desconhecido']);
function normalize(field: string, raw: string | string[]): Value {
  if (field === 'autores') return unique((Array.isArray(raw) ? raw : [raw]).map(clean).filter(v => !PLACEHOLDERS.has(key(v)))).length
    ? unique((Array.isArray(raw) ? raw : [raw]).map(clean).filter(v => !PLACEHOLDERS.has(key(v)))) : null;
  const value = String(raw);
  if (PLACEHOLDERS.has(key(value))) return null;
  if (field === 'data_publicacao') return /^[12][0-9]{3}$/.test(key(value)) ? null : publicationDate(value) || value;
  if (field === 'peso') return measurement(value, true) ?? value;
  if (['largura', 'altura', 'profundidade'].includes(field)) return measurement(value) ?? value;
  if (field === 'dimensoes') return labeledDimensions(value) || value;
  if (field === 'categorias') return unique(value.split(';').map(v => v.trim()).filter(Boolean));
  if (field === 'idioma') return normalizeLanguage(value);
  if (field === 'formato') return normalizeCoverFormat(value);
  if (field.startsWith('isbn')) return cleanIsbn(value);
  if (field === 'edicao') return normalizeEdition(value) ?? value;
  if (field === 'paginas') { const match = /^([1-9][0-9]{0,4})\s*(?:paginas|pages|p\.?)?$/.exec(key(value)); return match ? +match[1] : value; }
  if (field === 'ano') return /^[12][0-9]{3}$/.test(key(value)) ? Number(value) : publicationDate(value) ? +publicationDate(value)!.slice(0, 4) : value;
  return value;
}
const COMMERCIAL = /\b(?:compre|frete|oferta|desconto|carrinho|mais vendido|best.?seller|imperdivel|obra.prima|milhoes de exemplares)\b/;
function issue(field: string, value: Value, candidate: Candidate): string | undefined {
  const text = Array.isArray(value) ? value.join(' ') : String(value), normalized = key(text);
  if (['capa', 'imagens_adicionais'].includes(field)) return imageReference(value) ? undefined : 'Referência de imagem inválida ou com parâmetros não permitidos.';
  if (/https?:\/\/|cookie|token|session|sessao|bearer|csrf/.test(normalized)) return 'Conteúdo técnico/sensível no lugar de dado bibliográfico.';
  if (['titulo', 'editora', 'autores'].includes(field)) {
    if (text.length < 2 || COMMERCIAL.test(normalized)) return 'Texto genérico ou comercial no lugar do dado bibliográfico.';
    if (field !== 'titulo' && /^[\d\P{L}_]+$/u.test(text)) return 'Nome bibliográfico inválido.';
  }
  if (field === 'ano' && (!Number.isInteger(value) || Number(value) < 1450 || Number(value) > new Date().getFullYear() + 1)) return 'Ano ambíguo ou fora da faixa experimental.';
  if (field === 'edicao' && !/^[1-9][0-9]{0,2}ª$/.test(text)) return 'Edição não reconhecida; não confundir edição com reimpressão.';
  if (field === 'idioma' && !['Português', 'Inglês', 'Espanhol', 'Francês', 'Alemão', 'Italiano', 'Japonês', 'Chinês', 'Russo', 'Árabe', 'Latim'].includes(text)) return 'Idioma desconhecido ou composto; requer revisão.';
  if (field === 'formato' && !COVER_FORMATS.includes(text as typeof COVER_FORMATS[number])) return 'Formato sem equivalência oficial conhecida; valor preservado.';
  if (field === 'paginas' && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 20000)) return 'Número de páginas inválido, ambíguo ou fora da faixa experimental.';
  if (field === 'data_publicacao' && !publicationDate(text)) return 'Data completa inválida ou não informada; não inventar dia e mês.';
  if (['peso', 'largura', 'altura', 'profundidade'].includes(field) && typeof value !== 'number') return 'Medida inválida ou sem unidade explícita.';
  if (field === 'dimensoes' && (typeof value !== 'object' || Array.isArray(value))) return 'Ordem dos eixos ou unidade não identificada; medidas brutas preservadas sem atribuição.';
  if (field === 'sinopse') {
    if (text.length < 80 || COMMERCIAL.test(normalized) || /classico contemporaneo|transformando a vida de milhoes|[”"]\s*[–-]/.test(normalized)) return 'Descrição curta/comercial ou mista; não comprova sinopse.';
    if (!/\b(?:personage\w*|historia|romance|narra\w*|enredo|jovem|aborda|analisa|discute|apresenta|explora|ensina)\b/.test(normalized)) return 'Texto sem indícios suficientes de resumo da obra; exige revisão humana.';
    if (candidate.tipo !== 'sinopse_explicita') return 'Descrição editorial candidata a sinopse; exige validação humana do conteúdo.';
  }
}
const stable = (value: Value) => JSON.stringify(value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
const percent = (count: number) => Math.round(count / 9 * 10000) / 100;

export function validateAmazon(candidates: Candidates, searchedIsbn: string, filename = 'memoria', nature = 'html_local'): AmazonReport {
  const searched = cleanIsbn(searchedIsbn), alerts: string[] = [], ids: Record<string, Identity> = {}, fields: Record<string, Quality> = {};
  for (const [field, values] of Object.entries(candidates)) {
    const available = values.map(candidate => ({ value: normalize(field, candidate.valor), candidate })).filter(item => item.value !== null);
    let chosen: Value = available[0]?.value ?? null;
    const conflicts = field !== 'imagens_adicionais' && new Set(available.map(item => stable(item.value))).size > 1;
    if (field === 'imagens_adicionais') chosen = available.length ? unique(available.map(item => String(item.value))) : null;
    if (field.startsWith('isbn')) {
      ids[field] = { valor: chosen as string | null, valido: !!chosen && isValidId(String(chosen), field), conflito: conflicts, evidencias: values };
      if (conflicts || available.some(item => !isValidId(String(item.value), field))) alerts.push(`${field}: valores inválidos ou conflitantes no produto.`);
      continue;
    }
    const reasons = available.map(item => issue(field, item.value, item.candidate)).filter((reason): reason is string => !!reason);
    if (conflicts) reasons.push('Fontes bibliográficas discordam; possível informação de outra edição.');
    fields[field] = { valor: chosen, estado: chosen === null ? 'ausente' : reasons.length ? 'inconsistente' : 'valido',
      motivos: unique(reasons), origens: unique(values.map(c => c.origem)), evidencias: values, revisao_humana: field === 'sinopse' || !!reasons.length };
  }
  const found = Object.values(ids).filter(id => id.valido).map(id => canonicalBookIsbn(id.valor!));
  const expected = canonicalBookIsbn(searched);
  const match = !expected ? 'isbn_pesquisado_invalido' : !found.length ? 'nao_verificavel' : new Set(found).size > 1
    || Object.values(ids).some(id => id.conflito || (id.valor && !id.valido)) ? 'inconsistente' : found[0] === expected ? 'corresponde' : 'divergente';
  if (match !== 'corresponde') alerts.push('Correspondência ISBN: ' + match + '. Não atribuir automaticamente os dados ao ISBN pesquisado.');
  if (new Set(found).size > 1) alerts.push('ISBN-10 e ISBN-13 não representam a mesma edição.');
  for (const [field, item] of Object.entries(fields)) if (item.estado === 'inconsistente') alerts.push(`${field}: ${item.motivos.join('; ')}`);
  const extras: Record<string, Quality> = {};
  for (const field of EXTRA_FIELDS) if (fields[field]) { extras[field] = fields[field]; delete fields[field]; }
  const present = FIELDS.filter(field => fields[field].valor !== null).length, valid = FIELDS.filter(field => fields[field].estado === 'valido').length;
  const report: AmazonReport = { natureza: nature, arquivo: filename, isbn_pesquisado: searched, isbn_encontrado: ids,
    correspondencia: match, titulo: fields.titulo.valor, campos: fields, preenchidos: present, validos_locais: valid, total_campos: 9,
    percentual_preenchimento: percent(present), percentual_validos_locais: percent(valid), atribuicao_ao_isbn_autorizada: false,
    alertas: [...alerts, 'Validade local é heurística; não confirma identidade editorial nem autoriza integração.'], complementares: extras,
    edicao_verificacao: fields.edicao.estado === 'inconsistente' ? 'inconsistente' : match !== 'corresponde' || fields.edicao.estado === 'ausente'
      ? 'nao_verificavel' : 'declarada_no_produto_sem_confirmacao_independente',
    imagens: { itens: [], download_realizado: false, carregamento_remoto_permitido: false }, book_info: { id: '', title: '' } };
  if (fields.ano.estado === 'inconsistente' && extras.data_publicacao?.estado === 'valido') Object.assign(extras.data_publicacao,
    { estado: 'inconsistente', revisao_humana: true, motivos: ['Ano de publicação divergente nos detalhes do produto.'] });
  const authoral = new Set(['capa-autoral.svg', 'contracapa-autoral.svg', 'capa-miniatura-autoral.svg', 'miolo-autoral.svg'].map(file => 'https://isbn-fixtures.invalid/' + file));
  const authorization = (ref: string) => nature === 'fixture_sintetica' && authoral.has(ref) ? 'fixture_sintetica_autoral' : 'nao_comprovada';
  const seen = new Set<string>();
  for (const field of ['capa', 'imagens_adicionais']) for (const evidence of extras[field]?.evidencias || []) {
    const ref = evidence.valor;
    if (!productImage(ref) || seen.has(imageIdentity(ref))) continue;
    seen.add(imageIdentity(ref));
    const item: Image = { referencia: ref, papel: field === 'capa' ? 'principal' : 'adicional', disponibilidade_tecnica: 'referencia_identificada_nao_verificada', autorizacao_uso: authorization(ref), origem: evidence.origem };
    if (field === 'capa' && productImage(evidence.miniatura)) Object.assign(item, { miniatura: evidence.miniatura,
      origem_miniatura: evidence.origem_miniatura || evidence.origem, autorizacao_miniatura: authorization(evidence.miniatura) });
    report.imagens.itens.push(item);
  }
  report.book_info = projectBook(report);
  return report;
}

function projectBook(report: AmazonReport): BookInfo {
  const book: BookInfo = { id: 'amazon-lab-' + (report.isbn_pesquisado || 'sem-isbn'), title: '', provider: 'Amazon (laboratório)', provenance: {} };
  const mapping = { titulo: 'title', autores: 'authors', editora: 'publisher', ano: 'year', edicao: 'edition', idioma: 'language',
    formato: 'format', paginas: 'pageCount', sinopse: 'synopsis', data_publicacao: 'publishedDate', peso: 'weight',
    largura: 'width', altura: 'height', profundidade: 'depth', subtitulo: 'subtitle', categorias: 'categories' } as const;
  const all = { ...report.campos, ...report.complementares };
  for (const [field, target] of Object.entries(mapping)) if (all[field]?.estado === 'valido') {
    book[target] = all[field].valor as never; book.provenance![target] = 'Amazon: ' + all[field].origens.join('; ');
  }
  if (all.dimensoes?.estado === 'valido') for (const [target, value] of Object.entries(all.dimensoes.valor as Record<string, number>)) {
    const axis = target as 'width' | 'height' | 'depth';
    if (axis in book && book[axis] !== value) {
      Object.assign(all[({ width: 'largura', height: 'altura', depth: 'profundidade' })[axis]], { estado: 'inconsistente', revisao_humana: true, motivos: ['Medida individual e dimensão composta divergem.'] });
      delete book[axis]; delete book.provenance![axis]; report.alertas.push(axis + ': medidas explícitas divergentes; não atribuir.');
    } else { book[axis] = value; book.provenance![axis] = 'Amazon: ' + all.dimensoes.origens.join('; '); }
  }
  if ('weight' in book) { book.weightUnit = 'g'; book.provenance!.weightUnit = book.provenance!.weight; }
  if (['width', 'height', 'depth'].some(axis => axis in book)) { book.dimensionsUnit = 'cm'; book.provenance!.dimensionsUnit = 'Amazon: medidas com eixos e unidades explícitos'; }
  if (report.correspondencia === 'corresponde') for (const [field, item] of Object.entries(report.isbn_encontrado)) if (item.valido) {
    book[field as 'isbn10' | 'isbn13'] = item.valor!; book.provenance![field] = 'Amazon: ' + item.evidencias.map(c => c.origem).join('; ');
  }
  if ('synopsis' in book) { book.description = book.synopsis; book.provenance!.description = book.provenance!.synopsis; }
  for (const image of report.imagens.itens) {
    if (image.autorizacao_uso !== 'fixture_sintetica_autoral') continue;
    const target = image.papel === 'principal' ? 'coverUrl' : 'additionalImages';
    if (target === 'coverUrl' && all.capa.estado !== 'valido') continue;
    if (target === 'coverUrl') {
      book.coverUrl = image.referencia;
      if (image.autorizacao_miniatura === 'fixture_sintetica_autoral') { book.thumbnailUrl = image.miniatura; book.provenance!.thumbnailUrl = 'Amazon: ' + image.origem_miniatura; }
    } else (book.additionalImages ??= []).push(image.referencia);
    book.provenance![target] = 'Amazon: ' + image.origem;
  }
  return book;
}

export function parseAmazonHtml(html: string, isbn: string, filename = 'memoria', nature = 'html_local') {
  return validateAmazon(extractAmazon(html), isbn, filename, nature);
}

// Mesma sanitização do servidor de referência; URLs públicas de imagens só no canal técnico.
export function safe<T>(value: T): T {
  if (Array.isArray(value)) return value.map(safe) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, safe(v)])) as T;
  if (typeof value === 'string' && /https?:\/\/|\b(?:cookies?|set-cookie|tokens?|(?:access|refresh)[_-]?token|session[\w-]*|sess[aã]o|csrf[\w-]*|authorization|bearer|api[_-]?key|sid|ubid|x-amz[\w-]*|jwt)\b/i.test(value)) return '[conteúdo omitido: possível URL ou dado sensível]' as T;
  return value;
}
export function toLabResult(report: AmazonReport, mode: 'fixture' | 'http', duration = 0, statusHttp: number | null = null): LabResult {
  const items = report.imagens.itens.map(({ referencia, papel, origem, disponibilidade_tecnica, miniatura, origem_miniatura }) =>
    ({ referencia, papel, origem, disponibilidade_tecnica, ...(miniatura ? { miniatura, origem_miniatura } : {}) }));
  const book = safe(report.book_info);
  for (const field of ['coverUrl', 'thumbnailUrl', 'additionalImages'] as const) { delete book[field]; delete book.provenance![field]; }
  for (const item of items) {
    const field = item.papel === 'principal' ? 'coverUrl' : 'additionalImages';
    if (field === 'coverUrl') {
      if (book.coverUrl) continue;
      book.coverUrl = item.referencia;
      if (item.miniatura) { book.thumbnailUrl = item.miniatura; book.provenance!.thumbnailUrl = 'Amazon: ' + item.origem_miniatura; }
    } else (book.additionalImages ??= []).push(item.referencia);
    book.provenance![field] = 'Amazon: ' + item.origem;
  }
  return { status: 'concluida', modo: mode, isbn_pesquisado: report.isbn_pesquisado, duracao_ms: duration, status_http: statusHttp,
    total_campos: 9, correspondencia: report.correspondencia, preenchidos: report.preenchidos, validos_locais: report.validos_locais,
    percentual_preenchimento: report.percentual_preenchimento, percentual_validos_locais: report.percentual_validos_locais,
    alertas: safe(report.alertas), isbn_encontrado: Object.fromEntries(Object.entries(report.isbn_encontrado).map(([field, item]) => [field, { valor: safe(item.valor), valido: item.valido }])),
    campos: Object.fromEntries(Object.entries(report.campos).map(([field, item]) => [field, safe({ valor: item.valor, estado: item.estado, motivos: item.motivos, origens: item.origens, revisao_humana: item.revisao_humana })])) as LabResult['campos'],
    complementares: safe(report.complementares), book_info: book, imagens: { itens: items, download_realizado: false }, edicao_verificacao: report.edicao_verificacao } as LabResult;
}
