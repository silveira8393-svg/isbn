#!/usr/bin/env python3
"""Diagnóstico pontual: um GET fixo, sem redirects, retries, cookies ou proxy.

Não grava HTML nem cabeçalhos de sessão. Não representa licença de reutilização.
Usa somente biblioteca padrão e o extrator local, sem modificá-lo.
"""
import http.client
import json
from pathlib import Path
import re
import ssl
import sys
import time
from datetime import datetime, timezone

sys.dont_write_bytecode = True
import prototipo_isbn_amazon_local as extractor

ROOT = Path(__file__).resolve().parent
URL = 'https://www.amazon.com.br/dp/8584390677'
ISBN = '9788584390670'
MAX_BYTES = 8 * 1024 * 1024
OUTPUT = ROOT / 'relatorios/diagnostico_http_direto.json'


def inspect_html(html, result):
    if re.search(r'captcha|validatecaptcha|robot check|automated access|acesso automatizado', html, re.I):
        result.update(resultado='restricao_detectada', restricao='Possível CAPTCHA ou aviso de acesso automatizado; interrompido.')
        return
    document = extractor.Document(html)
    result['elementos'] = {name: bool(document.by_id(name)) for name in (
        'productTitle', 'detailBullets_feature_div', 'bookDescription_feature_div')}
    parsed = extractor.validate(extractor.extract(html), ISBN, 'resposta_em_memoria', 'diagnostico_http_direto')
    result.update(
        resultado='html_recebido',
        correspondencia_isbn=parsed['correspondencia'],
        isbn_encontrado={name: {'valor': item['valor'], 'valido': item['valido'], 'conflito': item['conflito']}
                         for name, item in parsed['isbn_encontrado'].items()},
        campos_identificados=parsed['preenchidos'],
        campos_validos_locais=parsed['validos_locais'],
        campos={name: {'estado': item['estado'], 'revisao_humana': item['revisao_humana'],
                       'valor': extractor.safe(item['valor']) if name != 'sinopse' else '[texto omitido]',
                       'caracteres': len(item['valor'] or '') if name == 'sinopse' else None}
                for name, item in parsed['campos'].items()},
    )
    baseline = ROOT / 'relatorios/reais/02_9788584390670.json'
    if baseline.is_file():
        previous = json.loads(baseline.read_text(encoding='utf-8'))
        result['comparacao_referencia_chrome_sanitizada'] = {
            name: {'valor_diferente': parsed['campos'][name]['valor'] != previous['campos'][name]['valor'],
                   'estado_anterior': previous['campos'][name]['estado'],
                   'estado_atual': parsed['campos'][name]['estado']}
            for name in extractor.FIELDS
        }


def main():
    result = {
        'instante_utc': datetime.now(timezone.utc).isoformat(),
        'url_solicitada': URL,
        'isbn_pesquisado': ISBN,
        'metodo': 'GET',
        'tentativas_http': 0,
        'status_http': None,
        'duracao_ms': None,
        'tamanho_resposta_bytes': None,
        'url_final': None,
        'tipo_conteudo': None,
        'elementos': None,
        'campos_identificados': None,
        'correspondencia_isbn': 'nao_avaliada',
        'comparacao_referencia_chrome_sanitizada': None,
        'autorizacao_uso_comercial': 'nao_estabelecida_pelo_diagnostico',
    }
    started = time.perf_counter()
    connection = http.client.HTTPSConnection('www.amazon.com.br', timeout=25,
                                             context=ssl.create_default_context())
    try:
        # http.client não lê proxies do ambiente e não tem cookie jar ou redirects.
        result['tentativas_http'] = 1
        connection.request('GET', '/dp/8584390677', headers={
            'User-Agent': 'ProjetoISBN-Diagnostico/1.0 Agent/ProjetoISBN-Diagnostico',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Encoding': 'identity',
            'Connection': 'close',
        })
        response = connection.getresponse()
        result.update(status_http=response.status, url_final=URL,
                      tipo_conteudo=(response.getheader('Content-Type') or '')[:150])
        body = response.read(MAX_BYTES + 1)
        result['tamanho_resposta_bytes'] = len(body)
        result['duracao_ms'] = round((time.perf_counter() - started) * 1000, 2)
        if len(body) > MAX_BYTES:
            result.update(resultado='limite_de_leitura', tamanho_resposta_bytes=None,
                          bytes_lidos=len(body), restricao='Resposta excedeu 8 MiB; leitura interrompida.')
        elif 300 <= response.status < 400:
            # Não seguir: isso produziria outro GET e poderia introduzir sessão.
            result.update(resultado='redirecionamento_nao_seguido', url_final=None,
                          url_resposta=URL)
        elif response.status != 200:
            result.update(resultado='http_nao_200', restricao='Resposta não 200; interrompido sem nova tentativa.')
        elif ('text/html' not in result['tipo_conteudo'].lower()
              and 'application/xhtml+xml' not in result['tipo_conteudo'].lower()):
            result.update(resultado='conteudo_nao_html')
        else:
            # Somente memória: nada do corpo, cookies ou cabeçalhos é persistido.
            inspect_html(body.decode('utf-8', errors='replace'), result)
        del body
    except (OSError, http.client.HTTPException) as exc:
        # Não exportar texto arbitrário de erros/servidores nem dados de conexão.
        result.update(resultado='erro_transporte', erro_tipo=type(exc).__name__,
                      erro_numero=getattr(exc, 'errno', None))
    finally:
        connection.close()
        if result['duracao_ms'] is None:
            result['duracao_ms'] = round((time.perf_counter() - started) * 1000, 2)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == '__main__':
    main()
