const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const read=stage=>JSON.parse(fs.readFileSync(path.join(__dirname,stage,'verificacao.json'),'utf8'));
const before=read('antes'),after=read('depois');
const key=row=>[row.role,row.width,row.view].join(':');
const previous=new Map(before.evidence.map(row=>[key(row),row]));
assert.equal(after.evidence.length,before.evidence.length);
for(const row of after.evidence){
  assert.ok(previous.has(key(row)),key(row));
  assert.equal(row.controlCount,previous.get(key(row)).controlCount,'Control count changed: '+key(row));
  assert.equal(row.controlSignature,previous.get(key(row)).controlSignature,'Control behavior changed: '+key(row));
  assert.equal(row.scrollWidth,row.width,'Horizontal page overflow: '+key(row));
}
fs.writeFileSync(path.join(__dirname,'comparacao.json'),JSON.stringify({before:'48f25bcbcfac7e5491e508fe36e14e6fc15b5fc0',combinations:after.evidence.length,controlsAndValuesIdentical:true,noPageOverflow:true,source:'isolated actual components, not authenticated functional homologation'},null,2)+'\n');
const screens=[['login','Login'],['consulta','Consulta ISBN'],['resultado','Resultado bibliográfico'],['cadastro-novo','Cadastro NOVO'],['cadastro-usado','Cadastro USADO'],['galeria','Galeria'],['revisao','Revisão'],['historico','Histórico'],['dashboard','Dashboard'],['registros','Registros'],['configuracoes','Configurações']];
const escape=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const pairs=(width)=>screens.map(([file,title])=>`<section id="${file}-${width}"><h2>${escape(title)} <small>${width} px</small></h2><div class="pair">${['antes','depois'].map(stage=>`<figure><figcaption>${stage==='antes'?'Antes · 48f25bc':'Depois · repaginação'}</figcaption><a href="${stage}/${file}-${width}.png"><img loading="lazy" src="${stage}/${file}-${width}.png" alt="${escape(title)} ${stage}, ${width} pixels"></a></figure>`).join('')}</div></section>`).join('');
fs.writeFileSync(path.join(__dirname,'comparativo.html'),`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ISBN — comparação visual da PR #4</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f4f1;color:#1e1b32;font:15px/1.6 system-ui,sans-serif}header{background:#1e1b32;color:white;padding:40px max(24px,calc((100vw - 1400px)/2))}header img{width:160px}header h1{font-size:30px;margin:20px 0 8px}header p{max-width:850px;color:#d2cde0}main{max-width:1450px;margin:auto;padding:24px}nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:32px}nav a{background:white;color:#514367;padding:8px 14px;border:1px solid #e3e0e7;border-radius:8px;text-decoration:none}h2{margin-top:40px}small{font-weight:400;color:#70697d;margin-left:12px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0;background:white;border:1px solid #e3e0e7;border-radius:12px;overflow:hidden}figcaption{padding:12px 16px;font-weight:600;border-bottom:1px solid #e3e0e7}figure img{display:block;width:100%;height:auto}a:focus-visible{outline:3px solid #71628f;outline-offset:3px}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><header><img src="../../../public/brand/livraria-sul.svg" alt="Sebo Livraria Sul"><h1>Projeto ISBN · repaginação visual</h1><p>PR #4 — comparação da apresentação em componentes reais. As imagens usam os mesmos dados de ensaio, horário e viewport. Não representam homologação autenticada das integrações.</p></header><main><nav><a href="#login-1440">Desktop · 1440 px</a><a href="#login-390">Celular · 390 px</a></nav>${pairs(1440)}${pairs(390)}</main></html>`);
console.log(after.evidence.length+' before/after combinations: control values, attributes and order unchanged; no horizontal page overflow.');
