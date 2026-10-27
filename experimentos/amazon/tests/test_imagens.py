"""Seletores de galeria: somente HTML local, sockets bloqueados e sem execução de JS."""
import contextlib
import json
from pathlib import Path
import re
import socket
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import prototipo_isbn_amazon_local as extractor

FIXTURES = Path(__file__).parent / 'fixtures'
DOM = (FIXTURES / 'galeria_dom_sintetica.html').read_text(encoding='utf-8')
SCRIPT = (FIXTURES / 'galeria_script_sintetica.html').read_text(encoding='utf-8')
REAL_MEDIA_BLOCK = (FIXTURES / 'amazon_estrangeiro_9788501014863_galeria_sanitizada.html').read_text(encoding='utf-8')
ISBN = '8501014869'
PREFIX = 'https://isbn-fixtures.invalid/'


def report(html):
    return extractor.validate(extractor.extract(html), ISBN, 'galeria_sintetica', 'fixture_sintetica')


def counts(result):
    items = result['imagens']['itens']
    return tuple(sum(item['papel'] == role for item in items) for role in ('principal', 'adicional'))


class GalleryTests(unittest.TestCase):
    def setUp(self):
        self.network = contextlib.ExitStack()
        for name in ('connect', 'connect_ex'):
            self.network.enter_context(patch.object(socket.socket, name, side_effect=AssertionError('Sem rede')))
        self.network.enter_context(patch('socket.create_connection', side_effect=AssertionError('Sem rede')))
        self.addCleanup(self.network.close)

    def test_dom_gallery_returns_cover_distinct_thumbnail_and_two_additional_images(self):
        result = report(DOM)
        self.assertEqual(counts(result), (1, 2))
        self.assertEqual(result['book_info']['coverUrl'], PREFIX + 'capa-autoral.svg')
        self.assertEqual(result['book_info']['thumbnailUrl'], PREFIX + 'capa-miniatura-autoral.svg')
        self.assertEqual(result['book_info']['additionalImages'], [PREFIX + 'contracapa-autoral.svg', PREFIX + 'miolo-autoral.svg'])
        self.assertIn('landingImage', result['book_info']['provenance']['coverUrl'])
        self.assertEqual(len(result['campos']), 9)

    def test_script_initial_gallery_merges_resolutions_and_preserves_spine(self):
        result = report(SCRIPT)
        self.assertEqual(counts(result), (1, 2))
        main, back, spine = result['imagens']['itens']
        self.assertTrue(main['referencia'].endswith('/ISBNFixtureCapa.jpg'))
        self.assertTrue(main['miniatura'].endswith('/ISBNFixtureCapa._SX38_SY50_.jpg'))
        self.assertTrue(back['referencia'].endswith('/ISBNFixtureVerso.jpg'))
        self.assertTrue(spine['referencia'].endswith('/ISBNFixtureLombada.jpg'))
        self.assertTrue(all('script' in item['origem'] for item in (main, back, spine)))
        self.assertTrue(all(item['autorizacao_uso'] == 'nao_comprovada' for item in (main, back, spine)))
        self.assertNotIn('coverUrl', result['book_info'])
        self.assertNotIn('thumbnailUrl', result['book_info'])
        self.assertNotIn('additionalImages', result['book_info'])

    def test_filters_do_not_admit_video_icon_ads_hidden_or_unrelated_product(self):
        refs = json.dumps(report(DOM)['imagens']) + json.dumps(report(SCRIPT)['imagens'])
        for name in ('video-poster', 'icon.png', 'publicidade', 'oculta', 'recomendacao',
                     'ISBNFixtureVideo', 'ISBNFixtureIcon', 'ISBNFixturePixel', 'ISBNFixtureSpin',
                     'ISBNFixtureOutraEdicao', 'ISBNFixtureOutroLivro'):
            self.assertNotIn(name, refs)

    def test_dynamic_image_resolutions_are_one_photo_not_multiple(self):
        html = '<img id="landingImage" data-a-dynamic-image=\'{"' + PREFIX + 'capa-autoral.svg":[800,1200],"' + PREFIX + 'capa-miniatura-autoral.svg":[40,60]}\'>'
        result = report(html)
        self.assertEqual(counts(result), (1, 0))
        self.assertEqual(result['book_info']['coverUrl'], PREFIX + 'capa-autoral.svg')
        self.assertNotIn('thumbnailUrl', result['book_info'], 'Não inventar miniatura a partir de outra resolução')

    def test_bad_dynamic_json_or_invalid_hires_falls_back_to_valid_src(self):
        for value in ('{bad', '[]', '{"https://invalid.local/photo.jpg":[false,20]}'):
            html = f'<img id="landingImage" data-old-hires="javascript:alert(1)" data-a-dynamic-image=\'{value}\' src="{PREFIX}capa-autoral.svg">'
            self.assertEqual(report(html)['book_info']['coverUrl'], PREFIX + 'capa-autoral.svg')

    def test_script_can_identify_explicit_main_without_dom_when_isbn_matches(self):
        result = report(re.sub(r'<img id="landingImage"[^>]+>', '', SCRIPT))
        self.assertEqual(counts(result), (1, 2))
        self.assertTrue(result['imagens']['itens'][0]['referencia'].endswith('/ISBNFixtureCapa.jpg'))

    def test_image_gallery_data_literal_requires_and_uses_product_anchor(self):
        entries = [{'variant': 'MAIN', 'hiRes': PREFIX + 'capa-autoral.svg', 'thumb': PREFIX + 'capa-miniatura-autoral.svg'},
                   {'variant': 'BACK', 'hiRes': PREFIX + 'contracapa-autoral.svg'}]
        for prefix, suffix in [('var imageGalleryData = ', ';'), ('var data={"imageGalleryData":', '};')]:
            html = f'<img id="landingImage" src="{PREFIX}capa-autoral.svg"><script>{prefix}{json.dumps(entries)}{suffix}</script>'
            result = report(html)
            self.assertEqual(counts(result), (1, 1))
            self.assertEqual(result['book_info']['thumbnailUrl'], PREFIX + 'capa-miniatura-autoral.svg')

    def test_unanchored_or_wrong_edition_script_is_not_used(self):
        unanchored = '<script>var data={"colorImages":{"initial":[{"variant":"MAIN","hiRes":"' + PREFIX + 'capa-autoral.svg"}]}};</script>'
        self.assertEqual(counts(report(unanchored)), (0, 0))
        wrong = SCRIPT.replace("'asin': '8501014869'", "'asin': '8584390677'")
        result = report(wrong)
        self.assertEqual(counts(result), (1, 1), 'Somente as referências do DOM permanecem')
        self.assertNotIn('ISBNFixtureLombada', json.dumps(result['imagens']))

    def test_no_javascript_evaluation_or_external_script_loading(self):
        for content in ('function(){throw new Error("nao executar");}', '__import__("os")', '{"large":"https://invalid.local/x"},'):
            html = '<script>var x={"colorImages":{"initial":[' + content + ']}};</script>'
            self.assertEqual(counts(report(html)), (0, 0))
        self.assertEqual(counts(report('<script src="https://invalid.local/gallery.js"></script>')), (0, 0))

    def test_gallery_without_primary_never_promotes_additional_image(self):
        result = report(f'<div id="altImages"><img src="{PREFIX}contracapa-autoral.svg"><img src="{PREFIX}miolo-autoral.svg"></div>')
        self.assertEqual(counts(result), (0, 2))
        self.assertNotIn('coverUrl', result['book_info'])
        self.assertNotIn('thumbnailUrl', result['book_info'])

    def test_thumbnail_authorization_is_independent_from_authorized_cover(self):
        result = report(f'<img id="landingImage" data-old-hires="{PREFIX}capa-autoral.svg" src="https://unlicensed.invalid/thumbnail.jpg">')
        self.assertIn('coverUrl', result['book_info'])
        self.assertNotIn('thumbnailUrl', result['book_info'])
        self.assertEqual(result['imagens']['itens'][0]['autorizacao_miniatura'], 'nao_comprovada')
        self.assertFalse(result['imagens']['download_realizado'])
        self.assertFalse(result['imagens']['carregamento_remoto_permitido'])

    def test_existing_cover_fallback_selectors_still_work(self):
        for identity in ('imgBlkFront', 'ebooksImgBlkFront'):
            self.assertEqual(counts(report(f'<img id="{identity}" src="{PREFIX}capa-autoral.svg">')), (1, 0))

    def test_observed_media_block_div_slots_recover_three_additional_images(self):
        result = report(REAL_MEDIA_BLOCK)
        self.assertEqual(result['correspondencia'], 'corresponde')
        self.assertEqual(counts(result), (1, 3))
        images = result['imagens']['itens']
        self.assertEqual([item['referencia'].rsplit('/', 1)[1] for item in images], [
            '91Sb5HdDL3L._SL1500_.jpg', '91pv+3HSGRL._SL1500_.jpg',
            '81YiEHsaX1L._SL1500_.jpg', '31Epa894dmL.jpg'])
        self.assertTrue(images[0]['miniatura'].endswith('/61cFRircgZL._SY445_SX342_ML2_.jpg'))
        self.assertTrue(all('data-mb-pv-slot-index' in item['origem'] for item in images[1:]))
        self.assertTrue(all(item['autorizacao_uso'] == 'nao_comprovada' for item in images))
        for field in ('coverUrl', 'thumbnailUrl', 'additionalImages'):
            self.assertNotIn(field, result['book_info'])
        self.assertFalse(result['imagens']['download_realizado'])
        self.assertFalse(result['imagens']['carregamento_remoto_permitido'])

    def test_media_slots_require_primary_product_block_and_media_class(self):
        slot = '<div class="media-block-image-tag" data-mb-pv-slot-index="1" data-old-hires="' + PREFIX + 'contracapa-autoral.svg"></div>'
        main = '<img id="landingImage" src="' + PREFIX + 'capa-autoral.svg">'
        for html in (main + slot, main + '<div id="imageBlock">' + slot + '</div>',
                     '<div id="imageBlock">' + main + slot.replace('media-block-image-tag', 'relatedProduct') + '</div>'):
            self.assertEqual(counts(report(html)), (1, 0))
        result = report('<div id="imageBlock">' + main + slot + slot + '</div>')
        self.assertEqual(counts(result), (1, 1), 'Slots repetidos não duplicam imagens')

    def test_media_slots_preserve_exclusion_of_video_ads_icons_hidden_and_external_related(self):
        main = '<img id="landingImage" src="' + PREFIX + 'capa-autoral.svg">'
        slot = '<div class="media-block-image-tag" data-mb-pv-slot-index="1" data-old-hires="' + PREFIX + 'contracapa-autoral.svg"></div>'
        for marker in ('videoThumbnail', 'sponsored', 'a-icon'):
            self.assertEqual(counts(report('<div id="imageBlock">' + main + '<div class="' + marker + '">' + slot + '</div></div>')), (1, 0))
        self.assertEqual(counts(report('<div id="imageBlock">' + main + '<div hidden>' + slot + '</div></div>')), (1, 0))
        self.assertEqual(counts(report('<div id="imageBlock">' + main + '</div><aside id="relatedProducts">' + slot + '</aside>')), (1, 0))

    def test_sanitized_real_fixture_contains_no_free_scripts_forms_or_sensitive_attributes(self):
        doc = extractor.Document(REAL_MEDIA_BLOCK)
        allowed = {'id', 'class', 'src', 'data-old-hires', 'data-a-dynamic-image', 'data-mb-pv-slot-index',
                   'data-media-type', 'aria-hidden', 'hidden', 'width', 'height'}
        for node in doc.root.walk():
            self.assertNotIn(node.tag, {'script', 'input', 'form', 'iframe'})
            self.assertTrue(set(node.attrs) <= allowed)
            for key, value in node.attrs.items():
                if key in {'src', 'data-old-hires'}:
                    self.assertTrue(extractor.product_image_reference(value))
                elif key == 'data-a-dynamic-image':
                    self.assertTrue(all(extractor.product_image_reference(url) for url in json.loads(value)))


if __name__ == '__main__':
    unittest.main()
