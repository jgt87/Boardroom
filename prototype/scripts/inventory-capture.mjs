import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve('evidence-private/files');
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else{const bytes=fs.readFileSync(file);const name=entry.name;const group=/Compute|Computed|FrameWidget|DiagramWidget|diagram-as-code|TableRemoteGateway|DataTable/i.test(name)?'widget and tool logic':/vendor|library-|script-/i.test(name)?'library and vendor':/Board|canvas|appEntry/i.test(name)?'board runtime':'other client module';files.push({path:path.relative(root,file).replaceAll('\\','/'),name,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),group,status:'awaiting full-pass REA coverage result'});}}}
walk(root);files.sort((a,b)=>a.path.localeCompare(b.path));fs.mkdirSync('analysis',{recursive:true});fs.writeFileSync('analysis/extracted-inventory.json',JSON.stringify({generated:'2026-11-02',scope:'Distinct local files only; does not count unavailable browser scripts or prove feature completeness.',files},null,2)+'\n');
console.log(JSON.stringify({files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),groups:Object.fromEntries([...new Set(files.map(f=>f.group))].map(g=>[g,files.filter(f=>f.group===g).length]))}));
