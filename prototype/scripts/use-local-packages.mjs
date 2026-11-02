// Offline development helper. Copies only public installed packages; never project source.
import fs from 'node:fs';
import path from 'node:path';
const source = process.argv[2];
if (!source || !fs.existsSync(path.join(source, 'react', 'package.json'))) throw new Error('Pass an existing node_modules containing React.');
const target = path.resolve('node_modules');
const seen = new Set();
function find(name, base) {
  for (let p = base; ; p = path.dirname(p)) {
    const candidate = path.join(p, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (p === path.dirname(p)) break;
  }
  const fallback = path.join(source, name);
  if (fs.existsSync(path.join(fallback, 'package.json'))) return fallback;
}
function copy(name, dir) {
  if (seen.has(name)) return;
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  seen.add(name);
  const dest = path.join(target, name); fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(dir, dest, { recursive: true, dereference: true });
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
    const resolved = find(dep, dir);
    if (resolved) copy(dep, resolved);
    else if (pkg.dependencies?.[dep]) throw new Error(`Missing dependency ${dep} of ${name}`);
  }
}
for (const name of ['react', 'react-dom', 'lucide-react', 'typescript', 'vite', '@types/react', '@types/react-dom', '@types/node']) {
  const dir = find(name, path.dirname(source)); if (!dir) throw new Error(`Missing ${name}`); copy(name, dir);
}
console.log(`Copied ${seen.size} installed packages for offline development.`);
