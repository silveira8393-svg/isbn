// Árvore mínima para os seletores do protótipo. Não executa scripts nem carrega recursos.
// Mantém inclusive DIVs dentro de blocos de imagem e linhas das evidências Python.
export const clean = (value = '') => value.replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/\s+/gu, ' ').trim();
export const key = (value = '') => clean(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function decode(value: string): string {
  const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: '\u00a0',
    ndash: '–', mdash: '—', copy: '©', reg: '®', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (original, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity] ?? original;
    const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number) : '\ufffd';
  });
}

export class HtmlNode {
  children: (HtmlNode | string)[] = [];
  constructor(public tag = '', public attrs: Record<string, string> = {}, public parent?: HtmlNode, public line = 1) {}
  *walk(): Generator<HtmlNode> {
    yield this;
    for (const child of this.children) if (child instanceof HtmlNode) yield* child.walk();
  }
  text(): string {
    if (['script', 'style', 'noscript', 'iframe', 'input', 'button'].includes(this.tag) || this.attrs.role === 'button'
      || 'hidden' in this.attrs || this.attrs['aria-hidden'] === 'true') return '';
    return clean(this.children.map(child => child instanceof HtmlNode ? child.text() : child).join(' '));
  }
  visible(): boolean {
    for (let node: HtmlNode | undefined = this; node; node = node.parent)
      if ('hidden' in node.attrs || node.attrs['aria-hidden'] === 'true') return false;
    return true;
  }
}

export function parseHtml(html: string) {
  const root = new HtmlNode();
  let current = root, line = 1, offset = 0;
  const voidTags = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  const tokens = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\?[^>]*>|<\/[a-z][^>]*>|<[a-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/gi;
  let token: RegExpExecArray | null;
  while ((token = tokens.exec(html))) {
    const gap = html.slice(offset, token.index);
    if (gap) current.children.push(decode(gap));
    line += (gap.match(/\n/g) || []).length;
    const source = token[0], startLine = line;
    offset = tokens.lastIndex;
    line += (source.match(/\n/g) || []).length;
    if (/^<(!|\?)/.test(source)) continue;
    const tag = /^<\/?([a-z][\w:-]*)/i.exec(source)![1].toLowerCase();
    if (source.startsWith('</')) {
      for (let node = current; node.parent; node = node.parent) {
        if (node.tag === tag) { current = node.parent; break; }
      }
      continue;
    }
    const attrs: Record<string, string> = {};
    const attrPattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    const attrText = source.slice(tag.length + 1).replace(/\/?\s*>$/, '');
    for (const attr of attrText.matchAll(attrPattern)) attrs[attr[1].toLowerCase()] = decode(attr[2] ?? attr[3] ?? attr[4] ?? '');
    const node = new HtmlNode(tag, attrs, current, startLine);
    current.children.push(node);
    if (!voidTags.has(tag) && !/\/\s*>$/.test(source)) current = node;
    if (['script', 'style'].includes(tag) && current === node) {
      const close = new RegExp(`</${tag}\\s*>`, 'gi');
      close.lastIndex = offset;
      const end = close.exec(html);
      const raw = html.slice(offset, end?.index ?? html.length);
      node.children.push(raw); // JSON literal: entidades e sinais < não são HTML.
      const consumed = html.slice(offset, end ? close.lastIndex : html.length);
      line += (consumed.match(/\n/g) || []).length;
      offset = end ? close.lastIndex : html.length;
      tokens.lastIndex = offset;
      current = node.parent!;
    }
  }
  if (offset < html.length) current.children.push(decode(html.slice(offset)));
  const nodes = [...root.walk()];
  return { root, byId: (id: string) => nodes.filter(node => node.attrs.id === id) };
}
