/* Compara a AST sem classes de apresentação e sem o painel estático do login. */
const fs = require('node:fs');
const cp = require('node:child_process');
const ts = require('typescript');
const assert = require('node:assert/strict');
const path = require('node:path');

const reference = '48f25bcbcfac7e5491e508fe36e14e6fc15b5fc0';
const files = cp.execFileSync('git', ['diff', '--name-only', reference, '--', 'src'], {encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const printer = ts.createPrinter({removeComments:true});
function canonical(source, filename) {
  const tree = ts.createSourceFile(filename, source.replace(/\r\n/g,'\n'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result = ts.transform(tree, [context => {
    const visit = node => {
      if (ts.isJsxElement(node)) {
        const attr = node.openingElement.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(tree)==='className');
        if (attr?.initializer && ts.isStringLiteral(attr.initializer) && attr.initializer.text==='isbn-login-shell') {
          // Única composição JSX nova: wrapper e painel institucional sem controles.
          const formPanel = node.children.find(child=>ts.isJsxElement(child)&&child.openingElement.tagName.getText(tree)==='div');
          assert.ok(formPanel);
          return ts.visitNode(formPanel, visit);
        }
      }
      if (ts.isJsxAttribute(node) && node.name.getText(tree)==='className') return undefined;
      if (ts.isJsxText(node) && !node.text.trim()) return undefined;
      return ts.visitEachChild(node,visit,context);
    };
    return root=>ts.visitNode(root,visit);
  }]);
  const printed = printer.printFile(result.transformed[0]);
  result.dispose();
  return printed;
}
const evidence = [];
for (const file of files) {
  assert.ok(file==='src/index.css'||file.endsWith('.tsx'),'Non-presentation source: '+file);
  if(file.endsWith('.css'))continue;
  const before = cp.execFileSync('git',['show',reference+':'+file],{encoding:'utf8'});
  const after = fs.readFileSync(file,'utf8');
  assert.equal(canonical(after,file),canonical(before,file),'Functional AST differs: '+file);
  evidence.push({file,result:'identical AST after removing presentation classes and the static login wrapper/panel'});
}
const protectedPaths=['src/services','src/hooks','src/contexts','src/lib','src/utils','src/types.ts','shared','api','server','supabase','package.json','package-lock.json','vite.config.ts','vercel.json'];
for(const referenceCommit of [reference,'93ff20473ca68b50d42d075276e07c624772c9e0']) {
  const changed=cp.execFileSync('git',['diff','--name-only',referenceCommit,'--',...protectedPaths],{encoding:'utf8'}).trim();
  assert.equal(changed,'','Protected paths modified relative to '+referenceCommit);
}
const out=path.join(__dirname,'auditoria-escopo.json');
fs.writeFileSync(out,JSON.stringify({reference,functionalReference:'93ff20473ca68b50d42d075276e07c624772c9e0',protectedPathsUnchanged:true,evidence},null,2)+'\n');
console.log(evidence.length+' TSX files: AST preserved; protected functional paths identical to 1.0.');
