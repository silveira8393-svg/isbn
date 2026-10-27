#!/usr/bin/env python3
"""Laboratório somente local, sem persistência. HTTP real disponível diretamente."""
import argparse
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import ssl
import sys
import threading
import time

sys.dont_write_bytecode = True
import prototipo_isbn_amazon_local as extractor

ROOT = Path(__file__).resolve().parent
PREFIX = '/__amazon_lab/'
FIXTURES = {
    '9788535914849': ROOT / 'fixtures/amazon_1984_9788535914849.html',
    '9788584390670': ROOT / 'fixtures/amazon_o_alquimista_9788584390670.html',
}
MAX_BYTES = 8 * 1024 * 1024


class LabError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def isbn10_for(value):
    value = extractor.clean_isbn(value)
    if extractor.isbn10_valid(value):
        return value
    if not extractor.isbn13_valid(value) or not value.startswith('978'):
        raise LabError(422, 'A consulta HTTP por /dp/ exige ISBN-10 ou ISBN-13 com prefixo 978.')
    base = value[3:12]
    digit = (-sum(int(d) * (10 - i) for i, d in enumerate(base))) % 11
    return base + ('X' if digit == 10 else str(digit))


def fetch_html(isbn):
    """Uma chamada, sem proxy, cookies, redirects, retries ou gravação do corpo."""
    path = '/dp/' + isbn10_for(isbn)
    connection = http.client.HTTPSConnection('www.amazon.com.br', timeout=25, context=ssl.create_default_context())
    try:
        connection.request('GET', path, headers={
            'User-Agent': 'ProjetoISBN-Laboratorio/1.0 Agent/ProjetoISBN-Laboratorio',
            'Accept': 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity', 'Connection': 'close',
        })
        response = connection.getresponse()
        status, content_type = response.status, response.getheader('Content-Type', '')
        if status != 200:
            return None, {'status_http': status, 'mensagem': 'Resposta não 200; interrompido sem redirecionamento ou nova tentativa.'}
        if not re.match(r'(text/html|application/xhtml\+xml)(?:;|$)', content_type, re.I):
            return None, {'status_http': status, 'mensagem': 'Resposta sem conteúdo HTML; consulta interrompida.'}
        body = response.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            return None, {'status_http': status, 'mensagem': 'Resposta acima de 8 MiB; leitura interrompida.'}
        html = body.decode('utf-8', errors='replace')
        if re.search(r'captcha|validatecaptcha|robot check|automated access|acesso automatizado', html, re.I):
            return None, {'status_http': status, 'mensagem': 'CAPTCHA ou restrição detectada; nenhuma tentativa de contorno.'}
        return html, {'status_http': status, 'tamanho_bytes': len(body)}
    except (OSError, http.client.HTTPException):
        raise LabError(502, 'Falha de transporte ao consultar a Amazon; não houve nova tentativa.') from None
    finally:
        connection.close()


class Laboratory:
    def __init__(self):
        self.lock = threading.Lock()

    def search(self, payload):
        if not isinstance(payload, dict) or set(payload) - {'isbn', 'modo'}:
            raise LabError(400, 'Informe somente ISBN e modo.')
        isbn = payload.get('isbn')
        if not isinstance(isbn, str) or len(isbn) > 40:
            raise LabError(400, 'Informe um único ISBN-10 ou ISBN-13.')
        isbn = extractor.clean_isbn(isbn)
        canonical = extractor.canonical_isbn(isbn)
        if not canonical:
            raise LabError(422, 'ISBN inválido: confira o formato e o dígito verificador.')
        mode = payload.get('modo', 'fixture')
        if mode not in ('fixture', 'http'):
            raise LabError(400, 'Modo de consulta inválido.')
        if not self.lock.acquire(blocking=False):
            raise LabError(409, 'Há uma pesquisa em andamento. Aguarde sua conclusão; não há fila.')
        started = time.perf_counter()
        try:
            metadata = {'status_http': None}
            if mode == 'fixture':
                path = FIXTURES.get(canonical)
                if not path:
                    raise LabError(404, 'Fixture não disponível. Use 9788535914849 ou 9788584390670.')
                html = path.read_text(encoding='utf-8')
                nature = 'real_html_sanitizado'
            else:
                html, metadata = fetch_html(isbn)
                nature = 'http_local_experimental'
            result = {'modo': mode, 'isbn_pesquisado': isbn, 'total_campos': 9, **metadata}
            if html is None:
                return {**result, 'status': 'interrompida', 'duracao_ms': round((time.perf_counter() - started) * 1000, 2)}
            parsed = extractor.validate(extractor.extract(html), isbn, 'memoria', nature)
            result.update(status='concluida', correspondencia=parsed['correspondencia'],
                          preenchidos=parsed['preenchidos'], validos_locais=parsed['validos_locais'],
                          percentual_preenchimento=parsed['percentual_preenchimento'],
                          percentual_validos_locais=parsed['percentual_validos_locais'],
                          alertas=extractor.safe(parsed['alertas']),
                          isbn_encontrado={k: {'valor': extractor.safe(v['valor']), 'valido': v['valido']}
                                           for k, v in parsed['isbn_encontrado'].items()},
                          campos={k: {prop: extractor.safe(v[prop]) for prop in (
                              'valor', 'estado', 'motivos', 'origens', 'revisao_humana')} for k, v in parsed['campos'].items()})
            # Usa as referências técnicas, sem estados de autorização da projeção
            # histórica. A extração e a normalização bibliográfica ficam intactas.
            items = [{key: value for key, value in item.items() if key in (
                'referencia', 'papel', 'origem', 'disponibilidade_tecnica', 'miniatura', 'origem_miniatura')}
                for item in parsed['imagens']['itens']]
            book = extractor.safe(parsed['book_info'])
            for field in ('coverUrl', 'thumbnailUrl', 'additionalImages'):
                book.pop(field, None)
                book['provenance'].pop(field, None)
            for item in items:
                field = 'coverUrl' if item['papel'] == 'principal' else 'additionalImages'
                if field == 'coverUrl':
                    if field in book:
                        continue  # Mesma capa principal escolhida pela galeria.
                    book[field] = item['referencia']
                    if item.get('miniatura'):
                        book['thumbnailUrl'] = item['miniatura']
                        book['provenance']['thumbnailUrl'] = 'Amazon: ' + item['origem_miniatura']
                else:
                    book.setdefault(field, []).append(item['referencia'])
                book['provenance'][field] = 'Amazon: ' + item['origem']
            result.update(complementares=extractor.safe(parsed['complementares']),
                          book_info=book, imagens={'itens': items, 'download_realizado': False},
                          edicao_verificacao=parsed['edicao_verificacao'])
            return {**result, 'duracao_ms': round((time.perf_counter() - started) * 1000, 2)}
        finally:
            self.lock.release()


def make_server(port=8765, origin='http://127.0.0.1:3000'):
    lab = Laboratory()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Nenhum log de consultas, dados bibliográficos ou sessões.

        def reply(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def authorized_origin(self):
            host = self.headers.get('Host')
            return (host in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')
                    and (self.headers.get('Origin') == origin or (self.command == 'GET' and self.headers.get('Origin') is None))
                    and self.headers.get('X-ISBN-Lab') == 'local-development')

        def do_GET(self):
            if not self.authorized_origin():
                return self.reply(403, {'mensagem': 'Acesso restrito à interface local de desenvolvimento.'})
            if self.path != PREFIX + 'health':
                return self.reply(404, {'mensagem': 'Rota não encontrada.'})
            self.reply(200, {'http_habilitado': True, 'fixtures': list(FIXTURES), 'persistencia': False})

        def do_POST(self):
            if not self.authorized_origin():
                return self.reply(403, {'mensagem': 'Acesso restrito à interface local de desenvolvimento.'})
            if self.path != PREFIX + 'search':
                return self.reply(404, {'mensagem': 'Rota não encontrada.'})
            if self.headers.get_content_type() != 'application/json':
                return self.reply(415, {'mensagem': 'Utilize application/json.'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 1 <= length <= 1024:
                    return self.reply(413, {'mensagem': 'Solicitação inválida ou acima de 1 KiB.'})
                self.connection.settimeout(5)
                payload = json.loads(self.rfile.read(length))
                self.reply(200, lab.search(payload))
            except (ValueError, UnicodeDecodeError):
                self.reply(400, {'mensagem': 'Solicitação JSON inválida.'})
            except LabError as exc:
                self.reply(exc.status, {'mensagem': exc.message})
            except Exception:
                self.reply(500, {'mensagem': 'Falha local no laboratório; nenhum dado foi persistido.'})

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--porta', type=int, default=8765)
    parser.add_argument('--origem', choices=['http://127.0.0.1:3000', 'http://localhost:3000'], default='http://127.0.0.1:3000')
    args = parser.parse_args()
    server = make_server(args.porta, args.origem)
    print(f'Laboratorio em 127.0.0.1:{server.server_port}; HTTP real disponivel.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
