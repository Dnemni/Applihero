import {build} from "esbuild";
import {mkdir,copyFile} from "node:fs/promises";
await mkdir("extension/dist",{recursive:true});
await build({entryPoints:["extension/src/worker.ts","extension/src/content.ts","extension/src/panel.ts"],outdir:"extension/dist",bundle:true,format:"iife",target:"chrome120"});
for(const file of ["manifest.json","panel.html"])await copyFile(`extension/${file}`,`extension/dist/${file}`);

await copyFile('app/prepare/preparation.css','extension/dist/preparation.css');
