import { readFile } from 'node:fs/promises';
const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
export async function equivalenceCases() {
  const files = [
    ['fixtures/amazon_1984_9788535914849.html', '9788535914849', 'real_html_sanitizado'],
    ['fixtures/amazon_o_alquimista_9788584390670.html', '9788584390670', 'real_html_sanitizado'],
    ['tests/fixtures/amazon_estrangeiro_9788501014863_galeria_sanitizada.html', '9788501014863', 'real_html_sanitizado'],
    ...['1984_sintetico', 'alquimista_sintetico', 'complementares_sinteticos', 'galeria_dom_sintetica', 'galeria_script_sintetica'].map(name =>
      ['tests/fixtures/' + name + '.html', name.includes('alquimista') ? '9788584390670' : name.includes('galeria') ? '8501014869' : '9788535914849', 'fixture_sintetica']),
  ];
  const cases = await Promise.all(files.map(async ([file, isbn, nature]) => ({ name: file, html: await read(file), isbn, nature })));
  const base = cases.find(c => c.name.includes('complementares_sinteticos')).html;
  const script = cases.find(c => c.name.includes('galeria_script')).html;
  const add = (name, html, isbn = '9788535914849') => cases.push({ name, html, isbn, nature: 'fixture_sintetica' });
  for (const isbn of ['8535914846', '9788584390670', '9788535914840', 'ISBN 8535914846', '0000000000', '0-8044-2957-x', '9791090636071']) add('isbn:' + isbn, base, isbn);
  for (const [from, values] of [
    ['21 de julho de 2009', ['2009', '2009-07-21', '21/07/2009', '31 fevereiro 2009', '2009-02-30']],
    ['140 x 210 x 25 mm (L x A x P)', ['14 x 21 x 2,5 cm', '14 x 21 x 2,5', '14 x 21 x 2,5 cm (C x L x A)', '14 x 21 x 2,5 cm (L x L x A)', '14 x 21 x 0 cm (L x A x P)', '14 x 21 x 1 in (W x H x D)']],
    ['0,502 kg', ['502', '-5 g', '0 kg', '1 kg ou 502 g', '502 gramas']],
    ['pt-BR', ['eng', 'desconhecido', 'Português / Inglês']],
    ['1ª', ['2 edição', '3rd', 'reimpressão']],
    ['416 páginas', ['0 páginas', 'vinte', '20001 pages']],
    ['8535914846', ['8584390677', '8535914847']],
    ['Editora Sintética', ['cookie=SECRET_SESSION', '1234', 'Compre agora']],
  ]) for (const value of values) add('substituir:' + from + ':' + value, base.replace(from, value));
  for (const row of ['<tr><th>Edição</th><td>2ª</td></tr>', '<tr><th>Ano</th><td>2010</td></tr>', '<tr><th>Largura</th><td>15 cm</td></tr>',
    '<tr><th>ISBN-13</th><td>9788584390670</td></tr>']) add('conflito:' + row, base.replace('</table>', row + '</table>'));
  add('campos vazios', '');
  add('texto fora dos painéis', '<aside>ISBN-13: 9788535914849 Editora: Paralela 208 páginas</aside>');
  add('ocultos/scripts/controles', base.replace('Editora Sintética</td>', 'Editora Sintética<script>token=SECRET1</script><input value="SECRET2"><span hidden>cookie=SECRET3</span></td>'));
  add('entidades numéricas', base.replace('Livro sintético', 'Livro &#x1F4DA; &amp; &#233;'));
  const prefix = 'https://isbn-fixtures.invalid/';
  for (const dynamic of ['{bad', '[]', '{"' + prefix + 'capa-autoral.svg":[false,20]}']) add('dynamic inválido:' + dynamic,
    `<img id="landingImage" data-old-hires="javascript:alert(1)" data-a-dynamic-image='${dynamic}' src="${prefix}capa-autoral.svg">`);
  add('dynamic maior resolução', `<img id="landingImage" data-a-dynamic-image='{"${prefix}capa-autoral.svg":[800,1200],"${prefix}capa-miniatura-autoral.svg":[40,60]}'>`);
  const main = `<img id="landingImage" src="${prefix}capa-autoral.svg">`;
  const slot = `<div class="media-block-image-tag" data-mb-pv-slot-index="1" data-old-hires="${prefix}contracapa-autoral.svg"></div>`;
  for (const marker of ['videoThumbnail', 'sponsored', 'a-icon']) add('slot excluído:' + marker, `<div id="imageBlock">${main}<div class="${marker}">${slot}</div></div>`);
  add('slot oculto', `<div id="imageBlock">${main}<div hidden>${slot}</div></div>`);
  add('slot externo', `<div id="imageBlock">${main}</div><aside id="relatedProducts">${slot}</aside>`);
  add('slot repetido', `<div id="imageBlock">${main}${slot}${slot}</div>`);
  add('script sem âncora', '<script>var x={"colorImages":{"initial":[{"variant":"MAIN","hiRes":"' + prefix + 'capa-autoral.svg"}]}};</script>');
  add('script ISBN divergente', script.replace("'asin': '8501014869'", "'asin': '8584390677'"), '8501014869');
  add('script MAIN sem DOM', script.replace(/<img id="landingImage"[^>]+>/, ''), '8501014869');
  for (const content of ['function(){throw new Error("nao executar");}', '__import__("os")', '{"large":"https://invalid.local/x"},']) add('script não JSON:' + content, '<script>var x={"colorImages":{"initial":[' + content + ']}};</script>');
  for (const [start, end] of [['var imageGalleryData = ', ';'], ['var data={"imageGalleryData":', '};']]) add('array literal:' + start,
    main + '<script>' + start + JSON.stringify([{ variant: 'MAIN', hiRes: prefix + 'capa-autoral.svg', thumb: prefix + 'capa-miniatura-autoral.svg' }, { variant: 'BACK', hiRes: prefix + 'contracapa-autoral.svg' }]) + end + '</script>');
  add('eixos individuais', '<dl id="detailBullets_feature_div"><dt>Largura</dt><dd>140 mm</dd><dt>Altura</dt><dd>0,21 m</dd><dt>Profundidade</dt><dd>1 in</dd></dl>');
  return cases;
}
