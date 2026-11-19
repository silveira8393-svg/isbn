import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`export * from './shared/ncm';export * from './shared/magazordRegistration';export * from './src/utils/draft';export * from './src/utils/registrationSnapshot';`},bundle:true,write:false,platform:'node',format:'esm'});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const store='22222222-2222-4222-8222-222222222222';
const draft={parentCode:'NCM-P',childCode:'NCM-C',title:'Livro fixture',condition:'novo',category:'Categoria fixture',price:'30,00',quantity:1,
  magazordCategoryId:6,magazordCategoryStoreId:store,fiscalOrigin:'0 - Nacional',unit:'UN',ncm:'4901.99.00',synopsis:'',ean:'',authors:[],additionalImageUrls:[]};
const wire=d=>JSON.parse(JSON.stringify(api.registrationInput(d,1,1)));
const invalid=[undefined,null,49019900,{},[],true,'4901990','490199000','4901.99.0','4901.99.000','4901.99.A0','a49019900','49019900a',
  '4901-99-00','4901/99/00','4901 99 00','49.019.900','490199.00','4.9.0.1.9.9.0.0','4901..99.00',' 49019900','49019900 ','49019900\n','4901.99.00\r\n','４９０１９９００','4901.99.00<script>'];
test('NCM accepts only eight digits or the exact conventional dotted mask, retaining leading zeroes',()=>{
  for(const [text,expected] of [['4901.99.00','49019900'],['49019900','49019900'],['0123.45.67','01234567'],['01234567','01234567'],['','']]){
    assert.equal(api.normalizeNcm(text),expected);assert.equal(api.normalizeNcm(expected),expected);
  }
  for(const text of invalid)assert.equal(api.normalizeNcm(text),undefined);
});
test('form validation accepts dotted/undotted NCM and rejects invalid content without silently stripping it',()=>{
  for(const ncm of ['4901.99.00','49019900',''])assert.equal(api.validateRegistrationDraft({...draft,ncm}).errors.ncm,undefined);
  for(const ncm of invalid){
    assert.ok(api.validateRegistrationDraft({...draft,ncm}).errors.ncm);
    assert.throws(()=>api.registrationPayload({...wire(draft),ncm}),error=>error.code===undefined&&error.fields.includes('ncm'));
  }
  const malformed={...draft,ncm:'4901.99.A0'};assert.equal(wire(malformed).ncm,'4901.99.A0');
});
test('parent payload canonicalizes raw backend input too, preserving all other fields and the child',()=>{
  for(const condition of ['novo','usado']){
    const original=Object.freeze({...draft,condition});const input=Object.freeze(wire(original));
    assert.equal(input.ncm,'49019900');assert.equal(original.ncm,'4901.99.00');
    const canonical=api.registrationPayload(input),direct=Object.freeze({...input,ncm:'4901.99.00'});
    assert.deepEqual(api.registrationPayload(direct),canonical);assert.equal(direct.ncm,'4901.99.00');
    assert.equal(canonical.parent.ncm,'49019900');assert.equal(canonical.parent.origemFiscal,0);assert.equal(canonical.parent.unidadeMedida,'UN');
    assert.equal(canonical.parent.ativo,false);assert.equal(canonical.child.ativo,false);assert.equal(Object.hasOwn(canonical.child,'ncm'),false);
    const fingerprint=payload=>createHash('sha256').update(JSON.stringify({storeId:store,condition,payload})).digest('hex');
    assert.equal(fingerprint(canonical),fingerprint(api.registrationPayload(direct)));
    assert.equal(Object.hasOwn(api.registrationPayload({...input,ncm:''}).parent,'ncm'),false);
  }
});
test('recovered snapshots retain editable originals and produce the same canonical payload without data migrations',()=>{
  for(const ncm of ['4901.99.00','49019900','']){
    const source={...draft,ncm},snapshot=api.createRegistrationSnapshot(source,'2026-11-19T12:00:00Z');
    const restored=api.readRegistrationSnapshot(JSON.parse(JSON.stringify(snapshot)));
    assert.equal(restored.fields.ncm,ncm);
    assert.deepEqual(api.registrationPayload(wire({...draft,...restored.fields})),api.registrationPayload(wire(source)));
  }
  const restored=api.readRegistrationSnapshot(api.createRegistrationSnapshot({...draft,ncm:'4901.99.A0'},'2026-11-19T12:00:00Z'));
  assert.equal(restored.fields.ncm,'4901.99.A0');assert.ok(api.validateRegistrationDraft({...draft,...restored.fields}).errors.ncm);
});
