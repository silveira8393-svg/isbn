// Homologação explícita contra a referência Python. Não faz parte da execução do laboratório.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { loadTypeScript } from '../runtime_typescript.mjs';
import { equivalenceCases } from './casos_equivalencia.mjs';
const { parseAmazonHtml, toLabResult } = await loadTypeScript(new URL('../extrator_amazon.ts', import.meta.url));
const bundled = path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python = [process.env.ISBN_TEST_PYTHON, existsSync(bundled) ? bundled : null, 'python', 'python3'].filter(Boolean)
  .find(command => spawnSync(command, ['-c', 'import sys; raise SystemExit(sys.version_info < (3, 10))'], { windowsHide: true, timeout: 5000 }).status === 0);
assert.ok(python, 'Referência Python 3.10+ necessária apenas para esta homologação.');
const cases = await equivalenceCases();
const run = spawnSync(python, ['-B', '-c', `
import json, socket, sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, 'experimentos/amazon')
import prototipo_isbn_amazon_local as e
import servidor_laboratorio as s
cases = json.load(sys.stdin)
out = []
with patch.object(socket.socket, 'connect', side_effect=AssertionError('Sem rede')), patch('socket.create_connection', side_effect=AssertionError('Sem rede')):
    for c in cases:
        report = e.validate(e.extract(c['html']), c['isbn'], 'memoria', c['nature'])
        lab = None
        if e.canonical_isbn(c['isbn']):
            with patch.object(s, 'fetch_html', return_value=(c['html'], {'status_http': 200})):
                lab = s.Laboratory().search({'isbn': c['isbn'], 'modo': 'http'})
                lab['duracao_ms'] = 0
        out.append({'report': report, 'lab': lab})
print(json.dumps(out, ensure_ascii=False))
`], { input: JSON.stringify(cases), encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024,
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
assert.equal(run.status, 0, run.stderr);
const expected = JSON.parse(run.stdout), results = [];
for (const [index, c] of cases.entries()) {
  const result = { caso: c.name, extrator_equivalente: true, contrato_laboratorio_equivalente: null };
  try {
    const actual = parseAmazonHtml(c.html, c.isbn, 'memoria', c.nature);
    assert.deepEqual(actual, expected[index].report);
    if (expected[index].lab) {
      const httpReport = parseAmazonHtml(c.html, c.isbn, 'memoria', 'http_local_experimental');
      assert.deepEqual(toLabResult(httpReport, 'http', 0, 200), expected[index].lab);
      result.contrato_laboratorio_equivalente = true;
    }
    result.preenchidos = actual.preenchidos;
    result.validos_locais = actual.validos_locais;
    result.imagens = actual.imagens.itens.map(({ referencia, papel, origem }) => ({ referencia, papel, origem }));
  } catch (error) {
    result.extrator_equivalente = false;
    result.erro = error.message;
    console.error(c.name + '\n' + error.message.slice(0, 3000));
  }
  results.push(result);
}
const evidence = { escopo: 'offline_sem_rede', data: new Date().toISOString(), casos: cases.length,
  aprovados: results.filter(r => r.extrator_equivalente).length, reprovados: results.filter(r => !r.extrator_equivalente).length,
  comparacao: 'Igualdade estrutural integral: valores, estados, motivos, evidências, origens, ISBNs, métricas, BookInfo e imagens; contrato HTTP sem duração variável.', resultados: results };
await writeFile(new URL('../relatorios/migracao_typescript_equivalencia.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
console.log(`${evidence.aprovados}/${evidence.casos} casos equivalentes; ${evidence.reprovados} divergências.`);
assert.equal(evidence.reprovados, 0);
