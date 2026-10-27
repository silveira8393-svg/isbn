"""Contrato complementar e imagens sintéticas: nenhuma rede permitida."""
import contextlib
import json
from pathlib import Path
import socket
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import prototipo_isbn_amazon_local as extractor
import servidor_laboratorio as server

BASE = (Path(__file__).parent / 'fixtures/complementares_sinteticos.html').read_text(encoding='utf-8')
ISBN = '9788535914849'


def report(html=BASE, isbn=ISBN, nature='fixture_sintetica'):
    return extractor.validate(extractor.extract(html), isbn, 'fixture_sintetica', nature)


class ComplementaryTests(unittest.TestCase):
    def setUp(self):
        self.network = contextlib.ExitStack()
        for name in ('connect', 'connect_ex'):
            self.network.enter_context(patch.object(socket.socket, name, side_effect=AssertionError('Sem rede')))
        self.network.enter_context(patch('socket.create_connection', side_effect=AssertionError('Sem rede')))
        self.addCleanup(self.network.close)

    def test_book_info_units_provenance_and_nine_field_indicator(self):
        result = report()
        book = result['book_info']
        self.assertEqual(result['validos_locais'], 9)
        self.assertEqual(len(result['campos']), 9)
        self.assertEqual(book['weight'], 502)
        self.assertEqual(book['weightUnit'], 'g')
        self.assertEqual((book['width'], book['height'], book['depth'], book['dimensionsUnit']), (14, 21, 2.5, 'cm'))
        self.assertEqual(book['publishedDate'], '2009-07-21')
        self.assertEqual(book['categories'], ['Ficção', 'Literatura'])
        self.assertEqual(book['subtitle'], 'Um exemplo para testes')
        self.assertEqual(book['format'], 'CC - Capa Convencional')
        self.assertEqual(book['language'], 'Português')
        for field in set(book) - {'id', 'provider', 'provenance'}:
            self.assertTrue(book['provenance'][field], field)

    def test_dimensions_never_guess_axes_or_units(self):
        for raw in ('14 x 21 x 2,5 cm', '14 x 21 x 2,5', '14 x 21 x 2,5 cm (C x L x A)',
                    '14 x 21 x 2,5 cm (L x L x A)', '14 x 21 x 0 cm (L x A x P)'):
            result = report(BASE.replace('140 x 210 x 25 mm (L x A x P)', raw))
            self.assertEqual(result['complementares']['dimensoes']['estado'], 'inconsistente')
            self.assertNotIn('width', result['book_info'])
            self.assertNotIn('height', result['book_info'])
            self.assertNotIn('depth', result['book_info'])
            self.assertEqual(result['validos_locais'], 9)

    def test_individually_labeled_dimensions_and_invalid_weights(self):
        result = report('<dl id="detailBullets_feature_div"><dt>Largura</dt><dd>140 mm</dd>'
                        '<dt>Altura</dt><dd>0,21 m</dd><dt>Profundidade</dt><dd>1 in</dd></dl>')
        self.assertEqual((result['book_info']['width'], result['book_info']['height'], result['book_info']['depth']), (14, 21, 2.54))
        for weight in ('502', '-5 g', '0 kg', '1 kg ou 502 g'):
            result = report(BASE.replace('0,502 kg', weight))
            self.assertEqual(result['complementares']['peso']['estado'], 'inconsistente')
            self.assertNotIn('weight', result['book_info'])

    def test_dates_without_invention(self):
        for raw in ('2009-07-21', '21/07/2009', '21 julho 2009'):
            self.assertEqual(report(BASE.replace('21 de julho de 2009', raw))['book_info']['publishedDate'], '2009-07-21')
        for raw in ('2009', '31 fevereiro 2009', '2009-02-30'):
            self.assertNotIn('publishedDate', report(BASE.replace('21 de julho de 2009', raw))['book_info'])
        self.assertEqual(report(BASE.replace('21 de julho de 2009', '2009'))['complementares']['data_publicacao']['estado'], 'ausente')

    def test_authoral_images_are_separate_from_technical_availability(self):
        result = report()
        self.assertEqual(len(result['imagens']['itens']), 2)
        self.assertEqual(result['book_info']['coverUrl'], 'https://isbn-fixtures.invalid/capa-autoral.svg')
        self.assertEqual(result['book_info']['additionalImages'], ['https://isbn-fixtures.invalid/contracapa-autoral.svg'])
        for image in result['imagens']['itens']:
            self.assertEqual(image['autorizacao_uso'], 'fixture_sintetica_autoral')
            self.assertIn('nao_verificada', image['disponibilidade_tecnica'])
        self.assertFalse(result['imagens']['download_realizado'])
        self.assertFalse(result['imagens']['carregamento_remoto_permitido'])

    def test_html_and_http_permission_never_grant_image_rights(self):
        result = report(nature='http_local_experimental')
        self.assertNotIn('coverUrl', result['book_info'])
        self.assertEqual(result['imagens']['itens'][0]['autorizacao_uso'], 'nao_comprovada')
        remote = BASE.replace('isbn-fixtures.invalid', 'images.example.invalid').replace('<img id=', '<img data-permission="authorized" id=')
        result = report(remote)
        self.assertEqual(len(result['imagens']['itens']), 2)
        self.assertNotIn('coverUrl', result['book_info'])
        self.assertNotIn('additionalImages', result['book_info'])

    def test_absent_hidden_unrelated_and_unsafe_images(self):
        for html in ('', '<img src="https://example.invalid/recomendacao.png">',
                     '<img id="landingImage" src="javascript:alert(1)">',
                     '<img id="landingImage" src="https://example.invalid/x?token=secret">',
                     '<div hidden><img id="landingImage" src="https://example.invalid/x"></div>'):
            result = report(html)
            self.assertEqual(result['imagens']['itens'], [])
            self.assertNotIn('coverUrl', result['book_info'])

    def test_isbn_edition_and_conflicting_measures(self):
        result = report(isbn='9788584390670')
        self.assertEqual(result['correspondencia'], 'divergente')
        self.assertNotIn('isbn13', result['book_info'])
        self.assertEqual(result['edicao_verificacao'], 'nao_verificavel')
        result = report(BASE.replace('</table>', '<tr><th>Edição</th><td>2ª</td></tr></table>'))
        self.assertEqual(result['edicao_verificacao'], 'inconsistente')
        self.assertNotIn('edition', result['book_info'])
        result = report(BASE.replace('</table>', '<tr><th>Largura</th><td>15 cm</td></tr></table>'))
        self.assertNotIn('width', result['book_info'])
        self.assertEqual(result['complementares']['largura']['estado'], 'inconsistente')
        self.assertTrue(any('medidas explícitas divergentes' in alert for alert in result['alertas']))

    def test_existing_fixtures_gain_dates_weight_without_guessing_dimensions(self):
        for name, isbn, weight, published in [('amazon_1984_9788535914849.html', ISBN, 605, '2009-07-21'),
                                             ('amazon_o_alquimista_9788584390670.html', '9788584390670', 272, '2017-04-05')]:
            result = extractor.parse(extractor.ROOT / 'fixtures' / name, isbn)
            self.assertEqual(result['book_info']['weight'], weight)
            self.assertEqual(result['book_info']['publishedDate'], published)
            self.assertEqual(result['complementares']['dimensoes']['estado'], 'inconsistente')
            self.assertNotIn('depth', result['book_info'])
            self.assertEqual(result['imagens']['itens'], [])
            self.assertEqual(result['validos_locais'], 8)

    def test_conflicting_year_cannot_authorize_full_date(self):
        result = report(BASE.replace('</table>', '<tr><th>Ano</th><td>2010</td></tr></table>'))
        self.assertEqual(result['campos']['ano']['estado'], 'inconsistente')
        self.assertEqual(result['complementares']['data_publicacao']['estado'], 'inconsistente')
        self.assertNotIn('publishedDate', result['book_info'])

    def test_api_delivers_complements_and_image_references_without_network(self):
        # Simula o HTML da fixture existente, sem conexão externa.
        with patch.object(Path, 'read_text', return_value=BASE):
            result = server.Laboratory().search({'isbn': ISBN})
        self.assertEqual(result['book_info']['publishedDate'], '2009-07-21')
        self.assertEqual(result['book_info']['weight'], 502)
        self.assertEqual(result['book_info']['coverUrl'], result['imagens']['itens'][0]['referencia'])
        self.assertNotIn('autorizacao_uso', result['imagens']['itens'][0])
        self.assertEqual(result['preenchidos'], 9)
        self.assertNotIn('<html', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
