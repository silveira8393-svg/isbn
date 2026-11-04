const fs=require('node:fs');
const cp=require('node:child_process');
const path=require('node:path');
const ts=require('typescript');
const assert=require('node:assert/strict');
const reference='8c96e2c00ebdb360142b80b49038512b42979d1c';
const printer=ts.createPrinter({removeComments:true});
function inspect(source,file){
  const tree=ts.createSourceFile(file,source.replace(/\r\n/g,'\n'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const icons=new Set();
  tree.statements.filter(ts.isImportDeclaration).filter(n=>n.moduleSpecifier.text==='lucide-react').forEach(n=>n.importClause?.namedBindings?.elements?.forEach(e=>icons.add(e.name.text)));
  const normalized=node=>{
    const t=ts.transform(node,[context=>{const visit=n=>{
      if(ts.isJsxAttribute(n)&&n.name.getText(tree)==='className')return undefined;
      if(ts.isJsxText(n)&&!n.text.trim())return undefined;
      return ts.visitEachChild(n,visit,context);
    };return n=>ts.visitNode(n,visit);}]);
    const text=printer.printNode(ts.EmitHint.Unspecified,t.transformed[0],tree);t.dispose();return text;
  };
  const declarations=[],expressions=[],controls=[];
  function visit(node){
    if(ts.isImportDeclaration(node)&&node.moduleSpecifier.text!=='lucide-react')declarations.push(normalized(node));
    if(ts.isInterfaceDeclaration(node)||ts.isTypeAliasDeclaration(node))declarations.push(normalized(node));
    if(ts.isFunctionDeclaration(node)){
      declarations.push(node.name?.text+':'+node.parameters.map(normalized).join('|'));
      declarations.push(...node.body.statements.filter(n=>!ts.isReturnStatement(n)).map(normalized));
    }
    if(ts.isJsxExpression(node)&&!ts.isJsxAttribute(node.parent))expressions.push(normalized(node));
    if(ts.isJsxExpression(node)&&ts.isJsxAttribute(node.parent)&&node.parent.name.getText(tree)!=='className')expressions.push(normalized(node));
    if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
      const tag=node.tagName.getText(tree);
      if(['input','button','select','textarea','a','option'].includes(tag)||(/^[A-Z]/.test(tag)&&!icons.has(tag))){
        controls.push({tag,attrs:node.attributes.properties.filter(a=>!ts.isJsxAttribute(a)||a.name.getText(tree)!=='className').map(normalized)});
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);
  return {declarations,expressions:expressions.sort(),controls};
}
const files=cp.execFileSync('git',['diff','--name-only',reference,'--','src'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const evidence=[];
for(const file of files){
  assert.ok(file==='src/index.css'||file.endsWith('.tsx'),'Outside presentation: '+file);
  if(file.endsWith('.css'))continue;
  const before=cp.execFileSync('git',['show',reference+':'+file],{encoding:'utf8'});
  assert.deepEqual(inspect(fs.readFileSync(file,'utf8'),file),inspect(before,file),'Functional declarations, JSX expressions or ordered control properties changed: '+file);
  evidence.push({file,functionalDeclarationsAndExpressionsUnchanged:true,orderedControlPropertiesUnchanged:true});
}
const protectedPaths=['src/services','src/hooks','src/contexts','src/lib','src/utils','src/types.ts','shared','api','server','supabase','tests','package.json','package-lock.json','vite.config.ts','vercel.json'];
for(const ref of [reference,'93ff20473ca68b50d42d075276e07c624772c9e0'])assert.equal(cp.execFileSync('git',['diff','--name-only',ref,'--',...protectedPaths],{encoding:'utf8'}).trim(),'','Protected files differ from '+ref);
const originalLogo=cp.execFileSync('git',['show',reference+':public/brand/livraria-sul.svg'],{encoding:'utf8'});
const transparentLogo=originalLogo.replace('d="M220.001 0H0.300781V82H220.001V0Z" fill="#1E1B32" stroke="#1E1B32"','d="M220.001 0H0.300781V82H220.001V0Z" fill="none" stroke="none"');
assert.equal(fs.readFileSync('public/brand/livraria-sul.svg','utf8').replace(/\r\n/g,'\n'),transparentLogo.replace(/\r\n/g,'\n'),'Official logo shapes changed beyond its rectangular background');
fs.writeFileSync(path.join(__dirname,'auditoria-escopo.json'),JSON.stringify({reference,functionalReference:'93ff20473ca68b50d42d075276e07c624772c9e0',protectedPathsUnchanged:true,evidence},null,2)+'\n');
console.log(evidence.length+' TSX files: logic, expressions and ordered controls preserved; protected paths/tests unchanged.');
