// Static syntax/import check only. It does NOT replace npm run build / device testing.
const fs=require('fs'), path=require('path');
let ts;
try { ts=require('typescript'); } catch {
 if (!process.env.TYPESCRIPT_JS_PATH) throw new Error('Install TypeScript outside the app or set TYPESCRIPT_JS_PATH to typescript.js');
 ts=require(process.env.TYPESCRIPT_JS_PATH);
}
const root=path.resolve(__dirname,'../frontend/src');let count=0,errors=[];
function walk(dir){ for(const d of fs.readdirSync(dir,{withFileTypes:true})){
 const f=path.join(dir,d.name);
 if(d.isDirectory()){walk(f);continue;}
 if(!/\.(jsx?|tsx?)$/.test(f))continue;
 const s=fs.readFileSync(f,'utf8'); const ast=ts.createSourceFile(f,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 for(const e of ast.parseDiagnostics) errors.push(`${f}: ${ts.flattenDiagnosticMessageText(e.messageText,' ')}`);
 function check(node){
 if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)){
 const spec=node.moduleSpecifier.text;
 if(spec.startsWith('.')||spec.startsWith('@/')){
 const base=spec.startsWith('@/')?path.join(root,spec.slice(2)):path.resolve(path.dirname(f),spec);
 if(!['','.js','.jsx','.ts','.tsx','.json','/index.js','/index.jsx'].some(ext=>fs.existsSync(base+ext))) errors.push(`${f}: unresolved local import ${spec}`);
 }}ts.forEachChild(node,check);
 }check(ast);count++;
 }}walk(root);
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`${count} JS/JSX source files parsed; local imports resolved.`);
