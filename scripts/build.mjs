// Concatenate the src files into lib/client.js in DSH's client-module format (no bundler needed:
// the sources share one factory scope and only React/ReactDOM are external).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const files = [
  'src/pipeline.js',
  'src/client/messages.js', 'src/client/styles.js', 'src/client/prims.js', 'src/client/stores.js',
  'src/client/label.js', 'src/client/seat.js', 'src/client/settings.js', 'src/client/index.js',
]

const body = files.map((f) => {
  const text = readFileSync(join(root, f), 'utf8').replace(/^export (const|function|async function)/gm, '$1')
  return `//#region ${f}\n${text}\n//#endregion`
}).join('\n')

const indent = (s) => s.split('\n').map((l) => (l === '' ? l : `\t\t${l}`)).join('\n')

const out = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(pkg.name)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
\t\tconst React = require("react");
\t\tconst ReactDOM = require("react-dom");
\t\tconst h = React.createElement;
${indent(body)}
\t\texports.apply = apply;
\t\texports.inject = inject;
\t\treturn module.exports;
\t}
});
`
mkdirSync(join(root, 'lib'), { recursive: true })
writeFileSync(join(root, 'lib/client.js'), out)
console.log(`built lib/client.js (${out.length} bytes)`)
