"""Fluxo local e respostas HTTP simuladas; nenhuma conexão externa nos testes."""
import http.client
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import servidor_laboratorio as server


class LaboratoryTests(unittest.TestCase):
    def test_real_fixtures_and_equivalent_isbn10(self):
        lab = server.Laboratory()
        with patch.object(server, 'fetch_html', side_effect=AssertionError('Não acessar a Amazon')):
            for isbn, title, pages in [('9788584390670', 'O alquimista', 208), ('8535914846', '1984', 416)]:
                result = lab.search({'isbn': isbn, 'modo': 'fixture'})
                self.assertIn(title, result['campos']['titulo']['valor'])
                self.assertEqual(result['campos']['paginas']['valor'], pages)
                self.assertEqual(result['preenchidos'], 9)
                self.assertEqual(result['validos_locais'], 8)
                self.assertEqual(result['correspondencia'], 'corresponde')
                self.assertEqual(result['campos']['sinopse']['estado'], 'inconsistente')
                self.assertTrue(result['campos']['sinopse']['revisao_humana'])

    def test_validation_before_network(self):
        lab = server.Laboratory()
        for payload, status in [({'isbn': 'invalid'}, 422), ({'isbn': ['9788584390670']}, 400),
                                ({'isbn': '9788584390670', 'url': 'https://other.test'}, 400),
                                ({'isbn': '9788584390670', 'modo': 'batch'}, 400),
                                ({'isbn': '9780131103627'}, 404)]:
            with self.subTest(payload=payload), patch.object(server, 'fetch_html', side_effect=AssertionError('Não acessar a rede')):
                with self.assertRaises(server.LabError) as raised:
                    lab.search(payload)
                self.assertEqual(raised.exception.status, status)

    def test_http_available_without_flags_or_per_request_confirmation(self):
        html = server.FIXTURES['9788584390670'].read_text(encoding='utf-8')
        with patch.object(server, 'fetch_html', return_value=(html, {'status_http': 200})) as fetch:
            lab = server.Laboratory()
            for _ in range(2):
                result = lab.search({'isbn': '9788584390670', 'modo': 'http'})
                self.assertEqual(result['status'], 'concluida')
                self.assertEqual(result['preenchidos'], 9)
            self.assertEqual(fetch.call_count, 2)

    def test_real_gallery_fixture_projects_all_references_without_authorization(self):
        path = Path(__file__).parent / 'fixtures/amazon_estrangeiro_9788501014863_galeria_sanitizada.html'
        with patch.object(server, 'fetch_html', return_value=(path.read_text(encoding='utf-8'), {'status_http': 200})):
            result = server.Laboratory().search({'isbn': '9788501014863', 'modo': 'http'})
        items = result['imagens']['itens']
        self.assertEqual(sum(i['papel'] == 'principal' for i in items), 1)
        self.assertEqual(sum(i['papel'] == 'adicional' for i in items), 3)
        self.assertEqual(result['book_info']['coverUrl'], items[0]['referencia'])
        self.assertEqual(result['book_info']['thumbnailUrl'], items[0]['miniatura'])
        self.assertEqual(result['book_info']['additionalImages'], [i['referencia'] for i in items[1:]])
        self.assertTrue(all(i['origem'] for i in items))
        self.assertNotIn('autorizacao', json.dumps(result['imagens']))
        self.assertNotIn('carregamento_remoto_permitido', result['imagens'])

    def test_only_one_search_no_queue(self):
        lab = server.Laboratory()
        lab.lock.acquire()
        try:
            with self.assertRaises(server.LabError) as raised:
                lab.search({'isbn': '9788584390670'})
            self.assertEqual(raised.exception.status, 409)
        finally:
            lab.lock.release()
        self.assertEqual(lab.search({'isbn': '9788584390670'})['preenchidos'], 9)

    def test_isbn13_to_isbn10(self):
        self.assertEqual(server.isbn10_for('9788584390670'), '8584390677')
        self.assertEqual(server.isbn10_for('0-8044-2957-X'), '080442957X')

    def test_one_http_call_no_cookies_or_redirects(self):
        class Response:
            status = 200
            def getheader(self, *_): return 'text/html;charset=UTF-8'
            def read(self, _): return server.FIXTURES['9788584390670'].read_bytes()
        with patch.object(server.http.client, 'HTTPSConnection') as connection:
            connection.return_value.getresponse.return_value = Response()
            result = server.Laboratory().search({'isbn': '9788584390670', 'modo': 'http'})
            args, kwargs = connection.return_value.request.call_args
            self.assertEqual(args, ('GET', '/dp/8584390677'))
            self.assertEqual(connection.return_value.request.call_count, 1)
            self.assertNotIn('Cookie', kwargs['headers'])
            self.assertNotIn('Authorization', kwargs['headers'])
            self.assertEqual(result['preenchidos'], 9)

    def test_block_captcha_redirect_and_non_html_stop(self):
        for status, kind, body in [(403, 'text/html', b''), (429, 'text/html', b''), (503, 'text/html', b''),
                                   (302, 'text/html', b''), (200, 'text/html', b'<html>Robot Check CAPTCHA</html>'),
                                   (200, 'application/json', b'{}')]:
            with self.subTest(status=status, kind=kind), patch.object(server.http.client, 'HTTPSConnection') as connection:
                response = connection.return_value.getresponse.return_value
                response.status = status
                response.getheader.return_value = kind
                response.read.return_value = body
                result = server.Laboratory().search({'isbn': '9788584390670', 'modo': 'http'})
                self.assertEqual(result['status'], 'interrompida')
                self.assertNotIn('campos', result)
                self.assertEqual(connection.return_value.request.call_count, 1)

    def test_missing_fields_keep_original_quality(self):
        with patch.object(server, 'fetch_html', return_value=('<h1 id="productTitle">Livro incompleto</h1>', {'status_http': 200})):
            result = server.Laboratory().search({'isbn': '9788584390670', 'modo': 'http'})
        self.assertEqual(result['preenchidos'], 1)
        self.assertEqual(result['campos']['editora']['estado'], 'ausente')
        self.assertEqual(result['campos']['sinopse']['estado'], 'ausente')
        self.assertEqual(result['correspondencia'], 'nao_verificavel')

    def test_loopback_api_origin_headers_and_no_persistence(self):
        api = server.make_server(0)
        worker = threading.Thread(target=api.serve_forever, daemon=True)
        worker.start()
        try:
            self.assertEqual(api.server_address[0], '127.0.0.1')
            def request(method, path, payload=None, headers=None):
                connection = http.client.HTTPConnection('127.0.0.1', api.server_port, timeout=3)
                connection.request(method, path, json.dumps(payload) if payload is not None else None, headers or {})
                response = connection.getresponse()
                result = response.status, response.getheaders(), json.loads(response.read())
                connection.close()
                return result
            headers = {'Origin': 'http://127.0.0.1:3000', 'X-ISBN-Lab': 'local-development', 'Content-Type': 'application/json'}
            with patch.object(server, 'fetch_html', side_effect=AssertionError('Sem rede externa')):
                self.assertEqual(request('GET', '/__amazon_lab/health')[0], 403)
                self.assertEqual(request('GET', '/__amazon_lab/health', headers={**headers, 'Origin': 'https://evil.test'})[0], 403)
                health = request('GET', '/__amazon_lab/health', headers={'X-ISBN-Lab': 'local-development'})
                self.assertTrue(health[2]['http_habilitado'])
                self.assertFalse(health[2]['persistencia'])
                status, response_headers, payload = request('POST', '/__amazon_lab/search', {'isbn': '9788584390670'}, headers)
                self.assertEqual(status, 200)
                self.assertEqual(payload['preenchidos'], 9)
                self.assertEqual(dict(response_headers)['Cache-Control'], 'no-store')
                self.assertNotIn('Set-Cookie', dict(response_headers))
                self.assertNotIn('Access-Control-Allow-Origin', dict(response_headers))
                self.assertEqual(request('POST', '/__amazon_lab/search', {'isbn': '9788584390670'}, {**headers, 'Host': 'evil.test'})[0], 403)
                self.assertEqual(request('POST', '/__amazon_lab/search', {'isbn': '9788584390670'}, {**headers, 'Content-Type': 'text/plain'})[0], 415)
            html = server.FIXTURES['9788584390670'].read_text(encoding='utf-8')
            with patch.object(server, 'fetch_html', return_value=(html, {'status_http': 200})) as fetch:
                self.assertEqual(request('POST', '/__amazon_lab/search', {'isbn': '9788584390670', 'modo': 'http'}, headers)[0], 200)
                fetch.assert_called_once()
        finally:
            api.shutdown()
            api.server_close()
            worker.join()


if __name__ == '__main__':
    unittest.main()
