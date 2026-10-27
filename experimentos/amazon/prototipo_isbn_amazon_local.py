#!/usr/bin/env python3
"""Validação experimental OFFLINE; somente biblioteca padrão, sem rede.

python prototipo_isbn_amazon_local.py livro.html --isbn 9788535914849
python prototipo_isbn_amazon_local.py --historico --saida relatorios/historico
"""
import argparse
import csv
import json
import math
import re
import unicodedata
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
FIELDS = ['titulo', 'autores', 'editora', 'ano', 'edicao', 'idioma', 'formato', 'paginas', 'sinopse']
EXTRA_FIELDS = ['data_publicacao', 'peso', 'dimensoes', 'largura', 'altura', 'profundidade',
                'subtitulo', 'categorias', 'capa', 'imagens_adicionais']
# Referências fictícias para arquivos SVG autorais deste repositório. O HTML não altera esta lista.
SYNTHETIC_IMAGES = {'https://isbn-fixtures.invalid/capa-autoral.svg',
                    'https://isbn-fixtures.invalid/contracapa-autoral.svg',
                    'https://isbn-fixtures.invalid/capa-miniatura-autoral.svg',
                    'https://isbn-fixtures.invalid/miolo-autoral.svg'}


def clean(v):
    return re.sub(r'\s+', ' ', re.sub('[\u200e\u200f\u202a-\u202e]', '', v or '')).strip()


def key(v):
    return ''.join(c for c in unicodedata.normalize('NFD', clean(v).lower())
                   if unicodedata.category(c) != 'Mn')


def clean_isbn(v):
    # Não apagar caracteres arbitrários: isso pode fabricar um ISBN válido.
    return re.sub(r'[\s-]', '', v or '').upper()


def isbn10_valid(v):
    v = clean_isbn(v)
    return v != '0000000000' and bool(re.fullmatch(r'[0-9]{9}[0-9X]', v)) and sum(
        (10 if d == 'X' else int(d)) * (10 - i) for i, d in enumerate(v)) % 11 == 0


def isbn13_valid(v):
    v = clean_isbn(v)
    return bool(re.fullmatch(r'97[89][0-9]{10}', v)) and sum(
        int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(v)) % 10 == 0


def canonical_isbn(v):
    v = clean_isbn(v)
    if isbn13_valid(v):
        return v
    if isbn10_valid(v):
        base = '978' + v[:9]
        return base + str((-sum(int(d) * (1 if i % 2 == 0 else 3)
                                for i, d in enumerate(base))) % 10)
    return None


# Mesmos aliases de src/utils/bibliographicNormalization.ts, sem importar/modificar o fluxo.
LANGUAGES = {}
for name, aliases in [
    ('Português', 'pt por portugues portuguese'), ('Inglês', 'en eng ingles english'),
    ('Espanhol', 'es spa espanhol espanol spanish'), ('Francês', 'fr fra fre frances francais french'),
    ('Alemão', 'de deu ger alemao deutsch german'), ('Italiano', 'it ita italiano italian'),
    ('Japonês', 'ja jpn japones japanese'), ('Chinês', 'zh zho chi chines chinese'),
    ('Russo', 'ru rus russo russian'), ('Árabe', 'ar ara arabe arabic'), ('Latim', 'la lat latim latin'),
]:
    LANGUAGES.update({a: name for a in aliases.split()})
FORMATS = {}
for name, aliases in [
    ('CC - Capa Convencional', ['cc', 'cc - capa convencional', 'capa convencional', 'brochura',
     'capa comum', 'capa mole', 'capa flexivel', 'paperback', 'softcover', 'soft cover', 'softback']),
    ('CD - Capa Dura', ['cd', 'cd - capa dura', 'capa dura', 'hardcover', 'hard cover', 'hardback',
     'encadernacao dura', 'encadernacao rigida']),
]:
    FORMATS.update({a: name for a in aliases})


def normalize_language(v):
    lookup = key(v)
    if re.fullmatch(r'[a-z]{2,3}(?:[-_][a-z0-9]{2,8})+', lookup):
        lookup = re.split('[-_]', lookup)[0]
    return LANGUAGES.get(lookup, v)


def normalize_format(v):
    return FORMATS.get(key(v), v)


class Node:
    def __init__(self, tag='', attrs=(), parent=None):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.line = 1
        self.children = []

    def walk(self):
        yield self
        for c in self.children:
            if isinstance(c, Node):
                yield from c.walk()

    def text(self):
        if self.tag in {'script', 'style', 'noscript', 'iframe', 'input', 'button'} or self.attrs.get('role') == 'button':
            return ''
        if 'hidden' in self.attrs or self.attrs.get('aria-hidden') == 'true':
            return ''
        return clean(' '.join(c.text() if isinstance(c, Node) else c for c in self.children))

    def visible(self):
        node = self
        while node:
            if 'hidden' in node.attrs or node.attrs.get('aria-hidden') == 'true':
                return False
            node = node.parent
        return True


class Document(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = self.current = Node()
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.current)
        node.line = self.getpos()[0]
        self.current.children.append(node)
        if tag not in self.VOID:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        node = self.current
        while node.parent:
            if node.tag == tag:
                self.current = node.parent
                return
            node = node.parent

    def handle_data(self, data):
        self.current.children.append(data)

    def by_id(self, identity):
        return [n for n in self.root.walk() if n.attrs.get('id') == identity]


LABELS = {
    'titulo': 'titulo', 'title': 'titulo', 'autor': 'autores', 'autores': 'autores',
    'editora': 'editora', 'publisher': 'editora', 'data da publicacao': 'ano',
    'publication date': 'ano', 'ano': 'ano', 'edicao': 'edicao', 'edition': 'edicao',
    'idioma': 'idioma', 'language': 'idioma', 'formato': 'formato', 'format': 'formato',
    'numero de paginas': 'paginas', 'paginas': 'paginas', 'print length': 'paginas',
    'capa comum': 'paginas', 'capa dura': 'paginas', 'paperback': 'paginas', 'hardcover': 'paginas',
    'isbn-10': 'isbn10', 'isbn-13': 'isbn13', 'sinopse': 'sinopse',
    'peso do produto': 'peso', 'peso': 'peso', 'item weight': 'peso',
    'dimensoes do produto': 'dimensoes', 'dimensoes': 'dimensoes', 'product dimensions': 'dimensoes',
    'largura': 'largura', 'width': 'largura', 'altura': 'altura', 'height': 'altura',
    'profundidade': 'profundidade', 'espessura': 'profundidade', 'depth': 'profundidade',
    'subtitulo': 'subtitulo', 'categorias': 'categorias',
}
PANELS = ('detailBullets_feature_div', 'productDetails_detailBullets_sections1',
          'productDetails_techSpec_section_1', 'richProductInformation_feature_div')
RPI = {'publisher': 'editora', 'edition': 'edicao', 'publication_date': 'ano',
       'language': 'idioma', 'print_length': 'paginas', 'binding': 'formato', 'isbn10': 'isbn10', 'isbn13': 'isbn13'}


def extract(html):
    doc, candidates = Document(html), {f: [] for f in FIELDS + ['isbn10', 'isbn13'] + EXTRA_FIELDS}

    def add(field, value, source, kind='bibliografico', **metadata):
        value = [clean(v) for v in value if clean(v)] if isinstance(value, list) else clean(value)
        candidate = {'valor': value, 'origem': source, 'tipo': kind, **metadata}
        if candidate not in candidates[field]:
            candidates[field].append(candidate)

    for node in doc.by_id('productTitle'):
        add('titulo', node.text(), '#productTitle')
    for byline in doc.by_id('bylineInfo'):
        names = []
        for node in byline.walk():
            if node.tag != 'a':
                continue
            context = node.parent
            # Papel por colaborador: tradutor não herda o papel de outro link.
            while context and context is not byline:
                if sum(n.tag == 'a' for n in context.walk()) != 1:
                    break
                if re.search(r'\((?:Autor|Autora|Author)\)', context.text(), re.I):
                    if node.text() not in names:
                        names.append(node.text())
                    break
                context = context.parent
        if names:
            add('autores', names, '#bylineInfo (papel Autor/Autora/Author)')
        fmt = re.search(r'Formato:\s*([^|()]+)', byline.text(), re.I)
        if fmt:
            add('formato', fmt[1], '#bylineInfo (Formato)')

    def labeled(label, value, source):
        label = key(label).rstrip(' :')
        field = LABELS.get(label)
        if field:
            add(field, [value] if field == 'autores' else value, source,
                'sinopse_explicita' if field == 'sinopse' else 'bibliografico')
            if field == 'ano' and label in {'data da publicacao', 'publication date'}:
                add('data_publicacao', value, source)
            if label in {'capa comum', 'capa dura', 'paperback', 'hardcover'}:
                add('formato', label, source + ' (encadernação)')

    for identity in PANELS:
        for panel in doc.by_id(identity):
            for row in panel.walk():
                source = f'#{identity} / {row.tag} (linha {row.line})'
                if row.tag == 'tr':
                    cells = [c for c in row.children if isinstance(c, Node) and c.tag in {'th', 'td'}]
                    if len(cells) == 2:
                        labeled(cells[0].text(), cells[1].text(), source)
                elif row.tag == 'dt':
                    siblings = row.parent.children
                    sibling = next((n for n in siblings[siblings.index(row) + 1:] if isinstance(n, Node)), None)
                    if sibling and sibling.tag == 'dd':
                        labeled(row.text(), sibling.text(), source)
                elif row.tag == 'li' and ':' in row.text():
                    label, value = row.text().split(':', 1)
                    labeled(label, value, source)
    rpi_ids = {'rpi-attribute-book_details-' + suffix: field for suffix, field in RPI.items()}
    rpi_ids.update({'rpi-attribute-language': 'idioma', 'rpi-attribute-book_details-fiona_pages': 'paginas'})
    for identity, field in rpi_ids.items():
        for node in doc.by_id(identity):
            text = node.text()
            for label, mapped in sorted(LABELS.items(), key=lambda p: -len(p[0])):
                if mapped == field:
                    match = re.match(re.escape(label) + r'(?:\s*:\s*|\s+)', key(text))
                    if match:
                        text = text[match.end():]
                        break
            add(field, text, '#' + identity)
            if identity.endswith('publication_date'):
                add('data_publicacao', text, '#' + identity)
    for node in doc.by_id('bookDescription_feature_div'):
        add('sinopse', node.text(), '#bookDescription_feature_div', 'descricao_comercial')
    for node in doc.by_id('productSubtitle'):
        if key(node.text()) in FORMATS:
            add('formato', node.text(), '#productSubtitle')
    for image in extract_product_images(doc, candidates):
        add('capa' if image['principal'] else 'imagens_adicionais', image['referencia'],
            image['origem'], 'referencia_imagem', miniatura=image['miniatura'],
            origem_miniatura=image['origem_miniatura'])
    return candidates


def product_image_reference(value):
    if not isinstance(value, str) or not image_reference(value):
        return False
    url = urlsplit(value)
    if re.search(r'\.(?:mp4|webm|m3u8|html?|js|css|ico)$', url.path, re.I):
        return False
    if re.search(r'(?:^|[/_-])(?:icons?|sprites?|transparent[-_]pixel|spinner|play[-_]button)(?:[/_.-]|$)', url.path, re.I):
        return False
    if url.hostname in {'m.media-amazon.com', 'images-na.ssl-images-amazon.com', 'images-eu.ssl-images-amazon.com'}:
        return url.path.startswith('/images/I/')
    return True


def image_identity(reference):
    """Somente para deduplicar: nunca fabrica uma URL de alta resolução."""
    url = urlsplit(reference)
    if url.hostname in {'m.media-amazon.com', 'images-na.ssl-images-amazon.com', 'images-eu.ssl-images-amazon.com'}:
        path = re.sub(r'\._[A-Za-z0-9_,+\-]+_\.(jpg|jpeg|png|webp)$', r'.\1', url.path, flags=re.I)
        return 'amazon-image:' + path
    return reference


NON_IMAGE = r'video|vídeo|icon|ícone|sprite|advert|sponsored|patrocinad|publicidade|360|play[-_ ]?button|(?:^|\s)(?:ads?|spin)(?:\s|$)'


def image_node_allowed(node):
    if not node.visible():
        return False
    current = node
    while current:
        labels = ' '.join(current.attrs.get(k, '') for k in
                          ('id', 'class', 'alt', 'title', 'aria-label', 'data-type', 'data-media-type', 'data-action'))
        if re.search(NON_IMAGE, labels, re.I):
            return False
        if current.attrs.get('id') in {'altImages', 'imageBlock_feature_div', 'imageBlock', 'imageBlockATF'}:
            break
        current = current.parent
    width, height = node.attrs.get('width', ''), node.attrs.get('height', '')
    return not (width.isdigit() and height.isdigit() and int(width) <= 2 and int(height) <= 2)


def dynamic_images(value):
    """Um mapa de resoluções representa uma imagem, não várias fotos."""
    if not isinstance(value, dict):
        return []
    valid = []
    for reference, size in value.items():
        if (product_image_reference(reference) and isinstance(size, list) and len(size) == 2
                and all(type(n) in (int, float) and math.isfinite(n) and n > 0 for n in size)):
            valid.append((reference, size[0] * size[1]))
    return [reference for reference, _ in sorted(valid, key=lambda pair: -pair[1])]


def image_descriptor(hires, dynamic, fallback, thumbnail, source, principal=False, thumbnail_rank=1):
    dynamic = dynamic_images(dynamic)
    choices = [(hires, 5), *((reference, 4) for reference in dynamic), (fallback, 2), (thumbnail, 1)]
    choices = [(reference, rank) for reference, rank in choices if product_image_reference(reference)]
    if not choices:
        return None
    return {'referencia': choices[0][0], 'rank': choices[0][1], 'principal': principal, 'origem': source,
            'miniatura': thumbnail if product_image_reference(thumbnail) else None,
            'origem_miniatura': source if product_image_reference(thumbnail) else None,
            'thumbnail_rank': thumbnail_rank,
            'keys': {image_identity(reference) for reference, _ in choices}}


def extract_product_images(doc, candidates):
    """Galeria do produto, sem rede, execução de JavaScript ou varredura genérica de URLs."""
    images = []

    def merge(item):
        if not item:
            return
        matches = [image for image in images if image['keys'] & item['keys']]
        if not matches:
            images.append(item)
            return
        target = matches[0]
        for other in [*matches[1:], item]:
            target['keys'].update(other['keys'])
            target['principal'] |= other['principal']
            if other['rank'] > target['rank']:
                for prop in ('referencia', 'rank', 'origem'):
                    target[prop] = other[prop]
            if other['miniatura'] and (not target['miniatura'] or other['thumbnail_rank'] > target['thumbnail_rank']):
                target['miniatura'] = other['miniatura']
                target['origem_miniatura'] = other['origem_miniatura']
                target['thumbnail_rank'] = other['thumbnail_rank']
            if other is not item:
                images.remove(other)

    def from_node(node, source, principal=False, media_slot=False):
        if (node.tag != 'img' and not (media_slot and node.tag == 'div')) or not image_node_allowed(node):
            return None
        try:
            dynamic = json.loads(node.attrs.get('data-a-dynamic-image', '{}'))
        except (ValueError, TypeError, RecursionError):
            dynamic = {}
        return image_descriptor(node.attrs.get('data-old-hires'), dynamic, node.attrs.get('src'),
                                node.attrs.get('src'), source, principal, 1 if principal else 2)

    for identity in ('landingImage', 'imgBlkFront', 'ebooksImgBlkFront'):
        for node in doc.by_id(identity):
            item = from_node(node, '#' + identity, True)
            if item and not any(image['principal'] for image in images):
                merge(item)
    for panel in doc.by_id('altImages'):
        for node in panel.walk():
            merge(from_node(node, f'#altImages / img (linha {node.line})'))

    # O layout Media Block declara fotos adicionais em divs, fora de #altImages.
    # Só aceita slots do bloco que contém a capa principal identificada.
    for identity in ('imageBlock', 'imageBlock_feature_div', 'imageBlockATF'):
        for panel in doc.by_id(identity):
            if not any(n.attrs.get('id') in {'landingImage', 'imgBlkFront', 'ebooksImgBlkFront'} for n in panel.walk()):
                continue
            for node in panel.walk():
                slot = node.attrs.get('data-mb-pv-slot-index', '')
                if re.fullmatch(r'[0-9]+', slot) and 'media-block-image-tag' in node.attrs.get('class', '').split():
                    merge(from_node(node, f'#{identity} / data-mb-pv-slot-index={slot} (linha {node.line})', media_slot=True))

    known_isbns = {canonical_isbn(c['valor']) for field in ('isbn10', 'isbn13') for c in candidates[field]}
    known_isbns.discard(None)
    # Lê somente arrays JSON literais reconhecidos; nunca eval, JS externo ou recomendações.
    pattern = r'''["']colorImages["']\s*:\s*\{\s*["']initial["']\s*:\s*|(?:["']imageGalleryData["']\s*:|\bimageGalleryData\s*=)\s*'''
    for script in doc.root.walk():
        if script.tag != 'script' or script.attrs.get('src') or not image_node_allowed(script):
            continue
        text = ''.join(child for child in script.children if isinstance(child, str))
        for match in re.finditer(pattern, text):
            try:
                entries, _ = json.JSONDecoder().raw_decode(text[match.end():])
            except (ValueError, RecursionError):
                continue
            if not isinstance(entries, list):
                continue
            gallery = []
            for index, entry in enumerate(entries):
                if not isinstance(entry, dict) or entry.get('isVideo') or re.search(NON_IMAGE, ' '.join(
                    str(entry.get(k, '')) for k in ('mediaType', 'type', 'variant')), re.I):
                    continue
                item = image_descriptor(entry.get('hiRes'), entry.get('main'), entry.get('large'), entry.get('thumb'),
                                        f'script / galeria inicial[{index}] (linha {script.line})',
                                        entry.get('variant') == 'MAIN', 3)
                if item:
                    gallery.append(item)
            declared = {canonical_isbn(value) for value in re.findall(r'''["']asin["']\s*:\s*["']([0-9Xx-]+)["']''', text)} - {None}
            if known_isbns and declared and declared != known_isbns:
                continue
            main_keys = set().union(*(image['keys'] for image in images if image['principal']))
            anchored = any(main_keys & image['keys'] for image in gallery)
            # Sem ligação à capa do DOM, exige ISBN explícito do produto no bloco.
            if not anchored and not (known_isbns and declared == known_isbns):
                continue
            for item in gallery:
                if item['principal'] and main_keys and not item['keys'] & main_keys:
                    continue  # Outra capa/variante não substitui a capa principal identificada.
                merge(item)
    return images


def publication_date(value):
    text = key(value)
    months = {name: i for i, names in enumerate([
        'janeiro january', 'fevereiro february', 'marco march', 'abril april', 'maio may',
        'junho june', 'julho july', 'agosto august', 'setembro september',
        'outubro october', 'novembro november', 'dezembro december'], 1) for name in names.split()}
    iso = re.fullmatch(r'([12][0-9]{3})-([0-9]{2})-([0-9]{2})', text)
    br = re.fullmatch(r'([0-9]{1,2})/([0-9]{1,2})/([12][0-9]{3})', text)
    named = re.fullmatch(r'([0-9]{1,2}) (?:de )?([a-z]+) (?:de )?([12][0-9]{3})', text)
    try:
        if iso:
            return date(*map(int, iso.groups())).isoformat()
        if br:
            return date(int(br[3]), int(br[2]), int(br[1])).isoformat()
        if named and named[2] in months:
            return date(int(named[3]), months[named[2]], int(named[1])).isoformat()
    except ValueError:
        pass
    return None


def measurement(value, weight=False):
    units = {'g': 1, 'grama': 1, 'gramas': 1, 'kg': 1000, 'quilogramas': 1000,
             'kilograms': 1000, 'grams': 1} if weight else {'cm': 1, 'centimetros': 1, 'mm': .1, 'm': 100,
                                                           'in': 2.54, 'inches': 2.54, 'polegadas': 2.54}
    match = re.fullmatch(r'([0-9]+(?:[.,][0-9]+)?)\s*(' + '|'.join(units) + ')', key(value))
    if match and (number := float(match[1].replace(',', '.'))) > 0:
        return round(number * units[match[2]], 6)
    return None


def labeled_dimensions(value):
    # Uma tripla numérica sem eixos explícitos nunca define largura/altura/profundidade.
    text = key(value)
    axes = {'largura': 'width', 'width': 'width', 'l': 'width', 'w': 'width',
            'altura': 'height', 'height': 'height', 'a': 'height', 'h': 'height',
            'profundidade': 'depth', 'espessura': 'depth', 'depth': 'depth', 'p': 'depth', 'd': 'depth'}
    match = re.fullmatch(r'([\d.,]+)\s*[x×]\s*([\d.,]+)\s*[x×]\s*([\d.,]+)\s*'
                         r'(cm|mm|m|in|inches|polegadas)\s*\(([^)]+)\)', text)
    if not match:
        return None
    labels = re.split(r'\s*[x×]\s*', match[5])
    if len(labels) != 3 or any(label not in axes for label in labels) or len({axes[label] for label in labels}) != 3:
        return None
    numbers = [measurement(match[i] + ' ' + match[4]) for i in (1, 2, 3)]
    return dict(zip((axes[label] for label in labels), numbers)) if all(numbers) else None


def image_reference(value):
    try:
        url = urlsplit(value)
        return (url.scheme == 'https' and bool(url.hostname) and not url.username and not url.password
                and not url.query and not url.fragment and bool(url.path.strip('/')))
    except ValueError:
        return False


PLACEHOLDERS = {'', '-', 'n/a', 'nao informado', 'nao disponivel', 'indisponivel', 'null', 'none', 'desconhecido'}
COMMERCIAL = r'\b(?:compre|frete|oferta|desconto|carrinho|mais vendido|best.?seller|imperdivel|obra.prima|milhoes de exemplares)\b'
ENDORSEMENT = r'classico contemporaneo|transformando a vida de milhoes|[”"]\s*[–-]'
NARRATIVE = r'\b(?:personage\w*|historia|romance|narra\w*|enredo|jovem|aborda|analisa|discute|apresenta|explora|ensina)\b'


def normalize(field, value):
    if field == 'autores':
        return list(dict.fromkeys(clean(v) for v in value if key(v) not in PLACEHOLDERS)) or None
    if key(value) in PLACEHOLDERS:
        return None
    if field == 'data_publicacao':
        if re.fullmatch(r'[12][0-9]{3}', key(value)):
            return None
        return publication_date(value) or value
    if field == 'peso':
        number = measurement(value, weight=True)
        return number if number is not None else value
    if field in {'largura', 'altura', 'profundidade'}:
        number = measurement(value)
        return number if number is not None else value
    if field == 'dimensoes':
        return labeled_dimensions(value) or value
    if field == 'categorias':
        return list(dict.fromkeys(v.strip() for v in value.split(';') if v.strip()))
    if field == 'idioma':
        return normalize_language(value)
    if field == 'formato':
        return normalize_format(value)
    if field.startswith('isbn'):
        return clean_isbn(value)
    if field == 'edicao':
        m = re.fullmatch(r'([1-9][0-9]{0,2})\s*(?:[ªaºo°.]\s*)?(?:edicao|edition|ed\.?)?', key(value))
        return f'{int(m[1])}ª' if m else value
    if field == 'paginas':
        m = re.fullmatch(r'([1-9][0-9]{0,4})\s*(?:paginas|pages|p\.?)?', key(value))
        return int(m[1]) if m else value
    if field == 'ano':
        text = key(value)
        if re.fullmatch(r'[12][0-9]{3}', text):
            return int(text)
        parsed = publication_date(value)
        return int(parsed[:4]) if parsed else value
    return value


def issue(field, value, candidate):
    text = ' '.join(value) if isinstance(value, list) else str(value)
    if field in {'capa', 'imagens_adicionais'}:
        return None if image_reference(value) else 'Referência de imagem inválida ou com parâmetros não permitidos.'
    if re.search(r'https?://|cookie|token|session|sessao|bearer|csrf', key(text)):
        return 'Conteúdo técnico/sensível no lugar de dado bibliográfico.'
    if field in {'titulo', 'editora', 'autores'}:
        if len(text) < 2 or re.search(COMMERCIAL, key(text)):
            return 'Texto genérico ou comercial no lugar do dado bibliográfico.'
        if field != 'titulo' and re.fullmatch(r'[\d\W]+', text):
            return 'Nome bibliográfico inválido.'
    if field == 'ano' and (not isinstance(value, int) or not 1450 <= value <= date.today().year + 1):
        return 'Ano ambíguo ou fora da faixa experimental.'
    if field == 'edicao' and not re.fullmatch(r'[1-9][0-9]{0,2}ª', str(value)):
        return 'Edição não reconhecida; não confundir edição com reimpressão.'
    if field == 'idioma' and value not in LANGUAGES.values():
        return 'Idioma desconhecido ou composto; requer revisão.'
    if field == 'formato' and value not in FORMATS.values():
        return 'Formato sem equivalência oficial conhecida; valor preservado.'
    if field == 'paginas' and (not isinstance(value, int) or not 1 <= value <= 20000):
        return 'Número de páginas inválido, ambíguo ou fora da faixa experimental.'
    if field == 'data_publicacao' and not publication_date(str(value)):
        return 'Data completa inválida ou não informada; não inventar dia e mês.'
    if field in {'peso', 'largura', 'altura', 'profundidade'} and not isinstance(value, (float, int)):
        return 'Medida inválida ou sem unidade explícita.'
    if field == 'dimensoes' and not isinstance(value, dict):
        return 'Ordem dos eixos ou unidade não identificada; medidas brutas preservadas sem atribuição.'
    if field == 'sinopse':
        if len(text) < 80 or re.search(COMMERCIAL + '|' + ENDORSEMENT, key(text)):
            return 'Descrição curta/comercial ou mista; não comprova sinopse.'
        if not re.search(NARRATIVE, key(text)):
            return 'Texto sem indícios suficientes de resumo da obra; exige revisão humana.'
        if candidate['tipo'] != 'sinopse_explicita':
            return 'Descrição editorial candidata a sinopse; exige validação humana do conteúdo.'
    return None


def validate(candidates, searched_isbn, filename, nature='html_local'):
    searched = clean_isbn(searched_isbn)
    alerts, ids, fields = [], {}, {}
    for field, values in candidates.items():
        available = [(v, c) for c in values if (v := normalize(field, c['valor'])) is not None]
        chosen = available[0][0] if available else None
        conflicts = field != 'imagens_adicionais' and len({json.dumps(v, ensure_ascii=False, sort_keys=True) for v, _ in available}) > 1
        if field == 'imagens_adicionais':
            chosen = list(dict.fromkeys(v for v, _ in available)) or None
        if field.startswith('isbn'):
            valid = isbn10_valid if field == 'isbn10' else isbn13_valid
            ids[field] = {'valor': chosen, 'valido': bool(chosen and valid(chosen)),
                          'conflito': conflicts, 'evidencias': values}
            if conflicts or any(not valid(v) for v, _ in available):
                alerts.append(f'{field}: valores inválidos ou conflitantes no produto.')
            continue
        reasons = [reason for v, c in available if (reason := issue(field, v, c))]
        if conflicts:
            reasons.append('Fontes bibliográficas discordam; possível informação de outra edição.')
        fields[field] = {'valor': chosen, 'estado': 'ausente' if chosen is None else
                         'inconsistente' if reasons else 'valido', 'motivos': list(dict.fromkeys(reasons)),
                         'origens': list(dict.fromkeys(c['origem'] for c in values)), 'evidencias': values,
                         'revisao_humana': field == 'sinopse' or bool(reasons)}
    found = [canonical_isbn(v['valor']) for v in ids.values() if v['valido']]
    expected = canonical_isbn(searched)
    if not expected:
        match = 'isbn_pesquisado_invalido'
    elif not found:
        match = 'nao_verificavel'
    elif len(set(found)) > 1 or any(v['conflito'] or (v['valor'] and not v['valido']) for v in ids.values()):
        match = 'inconsistente'
    else:
        match = 'corresponde' if found[0] == expected else 'divergente'
    if match != 'corresponde':
        alerts.append('Correspondência ISBN: ' + match + '. Não atribuir automaticamente os dados ao ISBN pesquisado.')
    if len(set(found)) > 1:
        alerts.append('ISBN-10 e ISBN-13 não representam a mesma edição.')
    alerts.extend(f"{field}: {'; '.join(item['motivos'])}" for field, item in fields.items()
                  if item['estado'] == 'inconsistente')
    extras = {f: fields.pop(f) for f in EXTRA_FIELDS if f in fields}
    present = sum(fields[f]['valor'] is not None for f in FIELDS)
    valid_count = sum(fields[f]['estado'] == 'valido' for f in FIELDS)
    report = {'natureza': nature, 'arquivo': filename, 'isbn_pesquisado': searched,
            'isbn_encontrado': ids, 'correspondencia': match, 'titulo': fields['titulo']['valor'],
            'campos': fields, 'preenchidos': present, 'validos_locais': valid_count, 'total_campos': 9,
            'percentual_preenchimento': round(present / 9 * 100, 2),
            'percentual_validos_locais': round(valid_count / 9 * 100, 2),
            'atribuicao_ao_isbn_autorizada': False,
            'alertas': alerts + ['Validade local é heurística; não confirma identidade editorial nem autoriza integração.']}
    report['complementares'] = extras
    if fields['ano']['estado'] == 'inconsistente' and extras.get('data_publicacao', {}).get('estado') == 'valido':
        extras['data_publicacao'].update(estado='inconsistente', revisao_humana=True,
                                       motivos=['Ano de publicação divergente nos detalhes do produto.'])
    report['edicao_verificacao'] = ('inconsistente' if fields['edicao']['estado'] == 'inconsistente' else
                                   'nao_verificavel' if match != 'corresponde' or fields['edicao']['estado'] == 'ausente'
                                   else 'declarada_no_produto_sem_confirmacao_independente')
    report['imagens'] = image_status(extras, nature)
    report['book_info'] = book_info(report)
    return report


def image_status(extras, nature):
    images = []
    seen = set()
    for field in ('capa', 'imagens_adicionais'):
        for evidence in extras.get(field, {}).get('evidencias', []):
            reference = evidence['valor']
            if not product_image_reference(reference) or image_identity(reference) in seen:
                continue
            seen.add(image_identity(reference))
            # O HTML e seus atributos nunca concedem autorização. Sem download nem render remoto.
            images.append({'referencia': reference, 'papel': 'principal' if field == 'capa' else 'adicional',
                           'disponibilidade_tecnica': 'referencia_identificada_nao_verificada',
                           'autorizacao_uso': 'fixture_sintetica_autoral' if nature == 'fixture_sintetica' and reference in SYNTHETIC_IMAGES
                           else 'nao_comprovada', 'origem': evidence['origem']})
            thumbnail = evidence.get('miniatura')
            if field == 'capa' and product_image_reference(thumbnail):
                images[-1].update(miniatura=thumbnail, origem_miniatura=evidence.get('origem_miniatura') or evidence['origem'],
                                  autorizacao_miniatura='fixture_sintetica_autoral' if nature == 'fixture_sintetica'
                                  and thumbnail in SYNTHETIC_IMAGES else 'nao_comprovada')
    return {'itens': images, 'download_realizado': False, 'carregamento_remoto_permitido': False}


def book_info(report):
    """Projeção BookInfo experimental; candidatos inconsistentes permanecem só nas evidências."""
    book = {'id': 'amazon-lab-' + (report['isbn_pesquisado'] or 'sem-isbn'), 'title': '',
            'provider': 'Amazon (laboratório)', 'provenance': {}}
    mapping = {'titulo': 'title', 'autores': 'authors', 'editora': 'publisher', 'ano': 'year',
               'edicao': 'edition', 'idioma': 'language', 'formato': 'format', 'paginas': 'pageCount',
               'sinopse': 'synopsis', 'data_publicacao': 'publishedDate', 'peso': 'weight',
               'largura': 'width', 'altura': 'height', 'profundidade': 'depth',
               'subtitulo': 'subtitle', 'categorias': 'categories'}
    all_fields = {**report['campos'], **report['complementares']}
    for field, target in mapping.items():
        item = all_fields.get(field)
        if item and item['estado'] == 'valido':
            book[target] = item['valor']
            book['provenance'][target] = 'Amazon: ' + '; '.join(item['origens'])
    dimensions = all_fields.get('dimensoes')
    if dimensions and dimensions['estado'] == 'valido':
        for target, value in dimensions['valor'].items():
            if target in book and book[target] != value:
                field = {'width': 'largura', 'height': 'altura', 'depth': 'profundidade'}[target]
                all_fields[field].update(estado='inconsistente', revisao_humana=True,
                                         motivos=['Medida individual e dimensão composta divergem.'])
                book.pop(target)
                book['provenance'].pop(target, None)
                report['alertas'].append(target + ': medidas explícitas divergentes; não atribuir.')
            else:
                book[target] = value
                book['provenance'][target] = 'Amazon: ' + '; '.join(dimensions['origens'])
    if 'weight' in book:
        book['weightUnit'] = 'g'
        book['provenance']['weightUnit'] = book['provenance']['weight']
    if any(axis in book for axis in ('width', 'height', 'depth')):
        book['dimensionsUnit'] = 'cm'
        book['provenance']['dimensionsUnit'] = 'Amazon: medidas com eixos e unidades explícitos'
    if report['correspondencia'] == 'corresponde':
        for field, item in report['isbn_encontrado'].items():
            if item['valido']:
                book[field] = item['valor']
                book['provenance'][field] = 'Amazon: ' + '; '.join(c['origem'] for c in item['evidencias'])
    if 'synopsis' in book:
        book['description'] = book['synopsis']
        book['provenance']['description'] = book['provenance']['synopsis']
    for image in report['imagens']['itens']:
        if image['autorizacao_uso'] != 'fixture_sintetica_autoral':
            continue
        target = 'coverUrl' if image['papel'] == 'principal' else 'additionalImages'
        if target == 'coverUrl' and all_fields['capa']['estado'] != 'valido':
            continue
        if target == 'coverUrl':
            book[target] = image['referencia']
            if image.get('autorizacao_miniatura') == 'fixture_sintetica_autoral':
                book['thumbnailUrl'] = image['miniatura']
                book['provenance']['thumbnailUrl'] = 'Amazon: ' + image['origem_miniatura']
        else:
            book.setdefault(target, []).append(image['referencia'])
        book['provenance'][target] = 'Amazon: ' + image['origem']
    # URLs de imagens sem licença ficam exclusivamente no diagnóstico técnico, fora do BookInfo.
    return book


def parse(path, searched_isbn, nature='html_local'):
    path = Path(path)
    return validate(extract(path.read_text(encoding='utf-8', errors='replace')), searched_isbn, path.name, nature)


def historical_reports():
    """Resultados anteriores nunca substituem os HTMLs."""
    records = json.loads((ROOT / 'resultado_isbn_amazon_local.json').read_text(encoding='utf-8'))
    reports = []
    for record in records:
        candidates = {f: [] for f in FIELDS + ['isbn10', 'isbn13']}
        for field in candidates:
            v = record['campos'].get(field) if field in FIELDS else record.get(field)
            if v is not None:
                candidates[field].append({'valor': str(v) if isinstance(v, int) else v,
                    'origem': 'resultado_isbn_amazon_local.json (histórico; sem consulta ao HTML)', 'tipo': 'historico'})
        report = validate(candidates, record.get('isbn13'), record['arquivo'], 'historico_nao_revalidado')
        report['correspondencia'] = 'nao_revalidada_modo_historico'
        report['isbn_pesquisado'] = None
        report['isbn_referencia_historica'] = record.get('isbn13')
        for field in report['campos'].values():
            if field['valor'] is not None:
                field.update(estado='inconsistente', revisao_humana=True,
                             motivos=['Valor histórico não revalidado: modo histórico não consulta HTML.'])
        report['validos_locais'] = report['percentual_validos_locais'] = 0
        report['book_info'] = book_info(report)
        report['alertas'] = ['ISBN pesquisado não foi registrado no artefato anterior.',
                            'Modo histórico: origem DOM e semântica não revalidadas.',
                            'Preenchimento histórico de 9/9 não significa validade bibliográfica.']
        reports.append(report)
    return reports


def safe(value):
    """Exportação somente textual; sem URLs ou credenciais de sessão."""
    if isinstance(value, dict):
        return {k: safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [safe(v) for v in value]
    if isinstance(value, str):
        if re.search(r'https?://|\b(?:cookies?|set-cookie|tokens?|(?:access|refresh)[_-]?token|session[\w-]*|'
                     r'sess[aã]o|csrf[\w-]*|authorization|bearer|api[_-]?key|sid|ubid|x-amz[\w-]*|jwt)\b', value, re.I):
            return '[conteúdo omitido: possível URL ou dado sensível]'
        return value
    return value


def write_reports(reports, output):
    output = Path(output).resolve()
    if not output.is_relative_to(ROOT) or output == ROOT:
        raise ValueError('Saída deve ser uma subpasta de experimentos/amazon/.')
    output.mkdir(parents=True, exist_ok=True)
    reports = safe(reports)
    consolidated = {'escopo': 'experimental_offline', 'total_livros': len(reports),
                    'total_campos': 9 * len(reports), 'preenchidos': sum(r['preenchidos'] for r in reports),
                    'validos_locais': sum(r['validos_locais'] for r in reports),
                    'correspondencias_confirmadas_locais': sum(r['correspondencia'] == 'corresponde' for r in reports),
                    'livros': reports}
    for metric in ('preenchidos', 'validos_locais'):
        consolidated['percentual_' + metric] = round(consolidated[metric] / consolidated['total_campos'] * 100, 2) if reports else 0
    for index, report in enumerate(reports, 1):
        name = f"{index:02d}_{report.get('isbn_pesquisado') or report.get('isbn_referencia_historica') or 'sem_isbn'}"
        name = re.sub(r'[^0-9A-Z_]', '_', name.upper())[:70]
        (output / (name + '.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        lines = [f"# Qualidade — {report['titulo'] or 'Título ausente'}", '',
                 f"Natureza: {report['natureza']}. ISBN pesquisado: {report['isbn_pesquisado'] or 'não registrado'}.",
                 f"ISBN encontrado: {', '.join(str(v['valor']) for v in report['isbn_encontrado'].values())}.",
                 f"Correspondência: {report['correspondencia']}.",
                 f"Preenchimento: {report['preenchidos']}/9 ({report['percentual_preenchimento']}%). "
                 f"Válidos locais: {report['validos_locais']}/9 ({report['percentual_validos_locais']}%).", '',
                 '| Campo | Valor | Estado | Origem | Motivo |', '|---|---|---|---|---|']
        for field, item in report['campos'].items():
            cells = [field, json.dumps(item['valor'], ensure_ascii=False), item['estado'],
                     '; '.join(item['origens']) or 'não localizada', '; '.join(item['motivos'])]
            lines.append('| ' + ' | '.join(c.replace('|', '\\|').replace('\n', ' ') for c in cells) + ' |')
        lines += ['', *('- ' + a for a in report['alertas']), '',
                  'Revisão humana: sinopse, identidade da edição e campos inconsistentes. Uso exclusivamente experimental.']
        (output / (name + '.md')).write_text('\n'.join(lines) + '\n', encoding='utf-8')
    (output / 'consolidado.json').write_text(json.dumps(consolidated, ensure_ascii=False, indent=2), encoding='utf-8')
    with (output / 'comparativo.csv').open('w', newline='', encoding='utf-8-sig') as handle:
        writer = csv.writer(handle, delimiter=';')
        def cell(v):
            text = ', '.join(map(str, v)) if isinstance(v, list) else '' if v is None else str(v)
            return "'" + text if text.startswith(('=', '+', '-', '@', '\t', '\r')) else text
        writer.writerow(['campo'] + [cell(r['titulo']) for r in reports])
        for field in FIELDS:
            for prop in ('valor', 'estado', 'origens'):
                writer.writerow([field + '_' + prop] + [cell(r['campos'][field][prop]) for r in reports])
    return consolidated


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('arquivos', nargs='*', type=Path)
    parser.add_argument('--isbn', action='append', default=[], help='Um por arquivo, na mesma ordem.')
    parser.add_argument('--historico', action='store_true')
    parser.add_argument('--tipo', choices=['html_local', 'real_html_sanitizado', 'fixture_sintetica'], default='html_local')
    parser.add_argument('--saida', type=Path, default=Path('relatorios/locais'))
    args = parser.parse_args()
    if args.historico:
        if args.arquivos or args.isbn:
            parser.error('--historico não aceita HTMLs nem ISBNs pesquisados.')
        reports = historical_reports()
    else:
        if not args.arquivos or len(args.arquivos) != len(args.isbn):
            parser.error('Informe um --isbn por HTML local, na mesma ordem dos arquivos.')
        reports = [parse(p, isbn, args.tipo) for p, isbn in zip(args.arquivos, args.isbn)]
    output = args.saida if args.saida.is_absolute() else ROOT / args.saida
    result = write_reports(reports, output)
    print(f"{result['total_livros']} livros; {result['preenchidos']}/{result['total_campos']} preenchidos; "
          f"{result['validos_locais']} válidos locais. Uso experimental.")


if __name__ == '__main__':
    main()
