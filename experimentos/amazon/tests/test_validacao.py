"""Fixtures negativas são construídas localmente; acesso à rede é bloqueado."""
import contextlib
import csv
import io
import json
import socket
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import prototipo_isbn_amazon_local as module

FIXTURES = Path(__file__).parent / 'fixtures'
REAL_1984 = ROOT / 'fixtures/amazon_1984_9788535914849.html'
REAL_ALQUIMISTA = ROOT / 'fixtures/amazon_o_alquimista_9788584390670.html'
BASE = (FIXTURES / '1984_sintetico.html').read_text(encoding='utf-8')
ISBN = '9788535914849'
SYNOPSIS = ('Um personagem atravessa uma cidade desconhecida, encontra antigos amigos e descobre '
            'que as lembranças de sua família podem mudar o rumo de sua viagem e de suas escolhas.')


def report(html=BASE, isbn=ISBN):
    return module.validate(module.extract(html), isbn, 'fixture_sintetica.html', 'fixture_sintetica')


class OfflineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.network = contextlib.ExitStack()
        for name in ('connect', 'connect_ex'):
            cls.network.enter_context(patch.object(socket.socket, name, side_effect=AssertionError('Rede proibida nos testes')))
        cls.network.enter_context(patch('socket.create_connection', side_effect=AssertionError('Rede proibida nos testes')))

    @classmethod
    def tearDownClass(cls):
        cls.network.close()

    def test_1984_synthetic(self):
        r = report()
        self.assertEqual(r['correspondencia'], 'corresponde')
        self.assertEqual(r['preenchidos'], 9)
        self.assertEqual(r['validos_locais'], 8)
        self.assertEqual(r['campos']['autores']['valor'], ['George Orwell'])
        self.assertEqual(r['campos']['paginas']['valor'], 416)
        self.assertEqual(r['campos']['sinopse']['estado'], 'inconsistente')
        self.assertTrue(all(r['campos'][f]['origens'] for f in module.FIELDS))

    def test_alquimista_synthetic(self):
        r = module.parse(FIXTURES / 'alquimista_sintetico.html', '9788584390670', 'fixture_sintetica')
        self.assertEqual(r['campos']['titulo']['valor'], 'O alquimista')
        self.assertEqual(r['campos']['autores']['valor'], ['Paulo Coelho'])
        self.assertEqual(r['campos']['editora']['valor'], 'Paralela')
        self.assertEqual(r['campos']['ano']['valor'], 2017)
        self.assertEqual(r['campos']['edicao']['valor'], '1ª')
        self.assertEqual(r['campos']['idioma']['valor'], 'Português')
        self.assertEqual(r['campos']['formato']['valor'], 'CC - Capa Convencional')
        self.assertEqual(r['campos']['paginas']['valor'], 208)
        self.assertEqual(r['validos_locais'], 8)
        self.assertEqual(r['correspondencia'], 'corresponde')

    def test_empty_and_incomplete(self):
        for html in ('', '<html><h1 id="productTitle">Livro incompleto</h1>'):
            with self.subTest(html=html):
                r = report(html)
                self.assertEqual(r['correspondencia'], 'nao_verificavel')
                self.assertEqual(r['campos']['editora']['estado'], 'ausente')
                self.assertEqual(r['campos']['sinopse']['estado'], 'ausente')
                self.assertLessEqual(r['preenchidos'], 1)

    def test_isbn_checksums_and_normalization(self):
        for valid in ('8535914846', '8584390677', '0-8044-2957-x'):
            self.assertTrue(module.isbn10_valid(valid), valid)
        for invalid in ('8535914847', '853591484X', '１２３４５６７８９０', 'ISBN 8535914846', '000000000X', '0000000000'):
            self.assertFalse(module.isbn10_valid(invalid), invalid)
        for valid in (ISBN, '978-8584390670'):
            self.assertTrue(module.isbn13_valid(valid), valid)
        for invalid in ('9788535914840', '4006381333931', '9788535914849junk', '0000000000000'):
            self.assertFalse(module.isbn13_valid(invalid), invalid)
        self.assertEqual(module.canonical_isbn('8535914846'), ISBN)
        self.assertEqual(report(isbn='8535914846')['correspondencia'], 'corresponde')

    def test_invalid_searched_isbn(self):
        self.assertEqual(report(isbn='9788535914840')['correspondencia'], 'isbn_pesquisado_invalido')

    def test_invalid_product_isbn(self):
        r = report(BASE.replace(ISBN[:3] + '-' + ISBN[3:], '9788535914840'))
        self.assertFalse(r['isbn_encontrado']['isbn13']['valido'])
        self.assertEqual(r['correspondencia'], 'inconsistente')

    def test_divergent_isbn(self):
        r = report(isbn='9788584390670')
        self.assertEqual(r['correspondencia'], 'divergente')
        self.assertFalse(r['atribuicao_ao_isbn_autorizada'])
        self.assertTrue(any('Não atribuir' in a for a in r['alertas']))

    def test_incompatible_isbn_pair(self):
        r = report(BASE.replace('8535914846', '8584390677'))
        self.assertEqual(r['correspondencia'], 'inconsistente')
        self.assertTrue(any('mesma edição' in a for a in r['alertas']))

    def test_missing_publisher_edition_pages(self):
        for label, field in [('Editora', 'editora'), ('Edição', 'edicao'), ('Número de páginas', 'paginas')]:
            with self.subTest(field=field):
                html = module.re.sub(r'<li><span class="a-text-bold">' + label + r':</span>.*?</li>', '', BASE)
                r = report(html)
                self.assertEqual(r['campos'][field]['estado'], 'ausente')
                self.assertEqual(r['preenchidos'], 8)

    def test_blank_and_placeholders(self):
        for v in (' ', '&nbsp;', 'Não informado', 'N/A'):
            with self.subTest(value=v):
                self.assertEqual(report(BASE.replace('Companhia das Letras', v))['campos']['editora']['estado'], 'ausente')

    def test_formats_and_languages(self):
        for raw, expected in [('Capa dura', 'CD - Capa Dura'), ('paperback', 'CC - Capa Convencional'),
                              ('hard cover', 'CD - Capa Dura')]:
            with self.subTest(raw=raw):
                item = report(BASE.replace('Formato: Capa comum', 'Formato: ' + raw))['campos']['formato']
                self.assertEqual(item['valor'], expected)
                self.assertEqual(item['estado'], 'valido')
        for raw in ('Não é capa dura', 'Brochura ou capa dura', 'Espiral', 'Kindle'):
            item = report(BASE.replace('Formato: Capa comum', 'Formato: ' + raw))['campos']['formato']
            self.assertEqual(item['estado'], 'inconsistente')
            self.assertEqual(item['valor'], raw)
        for raw, expected in [('en-US', 'Inglês'), ('pt_BR', 'Português'), ('Français', 'Francês')]:
            self.assertEqual(module.normalize_language(raw), expected)
        for raw in ('pt e en', 'xx-ZZ', 'Português / Inglês'):
            self.assertEqual(report(BASE.replace('> Português<', '> ' + raw + '<'))['campos']['idioma']['estado'], 'inconsistente')

    def test_simple_structure_changes(self):
        changed = BASE.replace('<h1 ', '<div ').replace('</h1>', '</div>')
        changed = changed.replace('class="a-text-bold"', 'class="outro"').replace('Editora:</span>', 'Editora</span>:')
        changed = changed.replace('Companhia das Letras', '<em>Companhia das Letras</em>')
        for field in module.FIELDS:
            for prop in ('valor', 'estado'):
                self.assertEqual(report(changed)['campos'][field][prop], report()['campos'][field][prop])

    def test_definition_list_layout(self):
        html = '<dl id="detailBullets_feature_div"><dt>Editora</dt><dd>Paralela</dd><dt>Páginas</dt><dd>208</dd></dl>'
        r = report(html)
        self.assertEqual(r['campos']['editora']['valor'], 'Paralela')
        self.assertEqual(r['campos']['paginas']['valor'], 208)

    def test_rpi_layout(self):
        html = ('<div id="rpi-attribute-book_details-publisher"><b>Editora</b><span>Paralela</span></div>'
                '<div id="rpi-attribute-book_details-language">Idioma: pt-BR</div>'
                '<div id="rpi-attribute-book_details-edition">Edição 2ª</div>'
                '<div id="rpi-attribute-book_details-print_length">Número de páginas 208 páginas</div>')
        r = report(html)
        self.assertEqual(r['campos']['editora']['valor'], 'Paralela')
        self.assertEqual(r['campos']['idioma']['valor'], 'Português')
        self.assertEqual(r['campos']['edicao']['valor'], '2ª')
        self.assertEqual(r['campos']['paginas']['valor'], 208)

    def test_no_synopsis(self):
        html = module.re.sub(r'<div id="bookDescription_feature_div">.*?</div>', '', BASE)
        r = report(html)
        self.assertEqual(r['campos']['sinopse']['estado'], 'ausente')
        self.assertEqual(r['preenchidos'], 8)
        self.assertEqual(r['percentual_preenchimento'], 88.89)

    def test_commercial_text_is_not_synopsis(self):
        for text in ('Compre agora com frete grátis!', 'O livro mais vendido. ' + SYNOPSIS):
            html = module.re.sub(r'<div id="bookDescription_feature_div">.*?</div>',
                                 '<div id="bookDescription_feature_div">' + text + '</div>', BASE)
            self.assertEqual(report(html)['campos']['sinopse']['estado'], 'inconsistente')

    def test_explicit_synopsis_still_needs_human_review(self):
        r = report('<table id="productDetails_detailBullets_sections1"><tr><th>Sinopse</th><td>' + SYNOPSIS + '</td></tr></table>')
        self.assertEqual(r['campos']['sinopse']['estado'], 'valido')
        self.assertTrue(r['campos']['sinopse']['revisao_humana'])
        self.assertEqual(r['campos']['sinopse']['valor'], SYNOPSIS)

    def test_other_editions_and_conflicting_details(self):
        for label, value, field in [('Editora', 'Outra Editora', 'editora'), ('Edição', '2ª', 'edicao'),
                                    ('Número de páginas', '208', 'paginas'), ('ISBN-13', '9788584390670', None)]:
            with self.subTest(field=label):
                html = BASE + '<table id="productDetails_detailBullets_sections1"><tr><th>' + label + '</th><td>' + value + '</td></tr></table>'
                r = report(html)
                if field:
                    self.assertEqual(r['campos'][field]['estado'], 'inconsistente')
                    self.assertEqual(len(r['campos'][field]['evidencias']), 2)
                else:
                    self.assertEqual(r['correspondencia'], 'inconsistente')

    def test_invalid_values_are_not_counted_as_valid(self):
        for old, new, field in [('416 páginas', '416 páginas ou 208', 'paginas'), ('416 páginas', '-2', 'paginas'),
                                ('1ª', '2ª reimpressão', 'edicao'), ('21 julho 2009', '2009 ou 2017', 'ano'),
                                ('Companhia das Letras', 'Compre com desconto', 'editora')]:
            with self.subTest(new=new):
                self.assertEqual(report(BASE.replace(old, new))['campos'][field]['estado'], 'inconsistente')

    def test_publication_date_requires_a_real_date(self):
        for raw in ('31 fevereiro 2009', '2009 reais', '99 julho 2009', '2009-02-30'):
            self.assertEqual(report(BASE.replace('21 julho 2009', raw))['campos']['ano']['estado'], 'inconsistente')
        for raw in ('21 de julho de 2009', '2009-07-21', '21/07/2009', '2009'):
            self.assertEqual(report(BASE.replace('21 julho 2009', raw))['campos']['ano']['valor'], 2009)

    def test_real_carousel_only_layout(self):
        # Negativo sintético: remove os detalhes principais, preserva variantes reais do carrossel.
        html = ('<div id="rpi-attribute-language">Idioma Português</div>'
                '<div id="rpi-attribute-book_details-fiona_pages">Número de páginas 416 páginas</div>')
        r = report(html)
        self.assertEqual(r['campos']['idioma']['valor'], 'Português')
        self.assertEqual(r['campos']['paginas']['valor'], 416)

    def test_unrelated_page_text_does_not_fill_fields(self):
        r = report('<aside>ISBN-13: ' + ISBN + ' Editora: Paralela 208 páginas</aside>')
        self.assertEqual(r['preenchidos'], 0)
        self.assertEqual(r['correspondencia'], 'nao_verificavel')

    def test_scripts_and_hidden_credentials_are_not_exported(self):
        html = BASE.replace('Companhia das Letras', 'Companhia das Letras<script>token=SECRET1</script>'
                            '<input value="SECRET2"><span hidden>cookie=SECRET3</span>')
        r = report(html)
        self.assertEqual(r['campos']['editora']['valor'], 'Companhia das Letras')
        html = html.replace('Companhia das Letras', 'cookie=SECRET4 session-id=SECRET5 https://invalid.local/?token=SECRET6')
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            module.write_reports([report(html)], tmp)
            contents = ''.join(p.read_text(encoding='utf-8-sig') for p in Path(tmp).iterdir())
            for secret in ('SECRET1', 'SECRET2', 'SECRET3', 'SECRET4', 'SECRET5', 'SECRET6'):
                self.assertNotIn(secret, contents)
            self.assertNotIn('<html', contents)
        self.assertEqual(module.safe('Cookie: a=SECRET; sid=OTHER; c=FINAL'),
                         '[conteúdo omitido: possível URL ou dado sensível]')

    def test_outputs_and_csv_formula_escaping(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            r = report(BASE.replace('Companhia das Letras', '=1+1'))
            consolidated = module.write_reports([r, report()], tmp)
            self.assertEqual(consolidated['total_campos'], 18)
            self.assertEqual(len(list(Path(tmp).glob('*.md'))), 2)
            data = json.loads((Path(tmp) / 'consolidado.json').read_text(encoding='utf-8'))
            self.assertEqual(data['preenchidos'], 18)
            rows = list(csv.reader(io.StringIO((Path(tmp) / 'comparativo.csv').read_text(encoding='utf-8-sig')), delimiter=';'))
            self.assertEqual(next(row for row in rows if row[0] == 'editora_valor')[1], "'=1+1")
        with self.assertRaises(ValueError):
            module.write_reports([], ROOT.parent)

    def test_historical_data_is_not_revalidated_html(self):
        records = module.historical_reports()
        self.assertEqual(len(records), 2)
        for r in records:
            self.assertEqual(r['natureza'], 'historico_nao_revalidado')
            self.assertIsNone(r['isbn_pesquisado'])
            self.assertEqual(r['validos_locais'], 0)
            self.assertEqual(r['preenchidos'], 9)
            self.assertEqual(r['correspondencia'], 'nao_revalidada_modo_historico')

    def test_cli_local_files(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            run = subprocess.run([sys.executable, '-B', str(ROOT / 'prototipo_isbn_amazon_local.py'),
                                  str(FIXTURES / '1984_sintetico.html'), '--isbn', ISBN, '--saida', tmp],
                                 capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertTrue((Path(tmp) / 'consolidado.json').is_file())

    def test_original_1984(self):
        self.check_real(REAL_1984, ISBN, {
            'titulo': '1984 - Tradução de Alexandre Hubner e Heloisa Jahn', 'autores': ['George Orwell'],
            'editora': 'Companhia das Letras', 'ano': 2009, 'edicao': '1ª', 'idioma': 'Português',
            'formato': 'CC - Capa Convencional', 'paginas': 416})

    def test_original_alquimista(self):
        self.check_real(REAL_ALQUIMISTA, '9788584390670', {
            'titulo': 'O alquimista', 'autores': ['Paulo Coelho'], 'editora': 'Paralela',
            'ano': 2017, 'edicao': '1ª', 'idioma': 'Português',
            'formato': 'CC - Capa Convencional', 'paginas': 208})

    def check_real(self, path, isbn, expected):
        r = module.parse(path, isbn, 'real_html_sanitizado')
        self.assertEqual(r['natureza'], 'real_html_sanitizado')
        self.assertEqual(r['correspondencia'], 'corresponde')
        self.assertTrue(r['isbn_encontrado']['isbn10']['valido'])
        self.assertTrue(r['isbn_encontrado']['isbn13']['valido'])
        for field, value in expected.items():
            with self.subTest(book=path.name, field=field):
                self.assertEqual(r['campos'][field]['valor'], value)
                self.assertEqual(r['campos'][field]['estado'], 'valido')
        self.assertEqual(r['preenchidos'], 9)
        self.assertEqual(r['validos_locais'], 8)
        self.assertEqual(r['campos']['sinopse']['estado'], 'inconsistente')
        self.assertNotIn('Leia mais', r['campos']['sinopse']['valor'])
        self.assertTrue(all(r['campos'][field]['origens'] for field in module.FIELDS))
        # IDs repetidos/nested não multiplicam a mesma evidência.
        self.assertEqual(len(r['campos']['editora']['evidencias']), 2)


if __name__ == '__main__':
    unittest.main()
