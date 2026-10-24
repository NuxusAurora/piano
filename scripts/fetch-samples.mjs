import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile);
const directory=new URL('../public/samples/',import.meta.url);
await mkdir(directory,{recursive:true});
const names=['README',...Array.from({length:8},(_,i)=>`C${i+1}.mp3`)];
await Promise.all(names.map(async name=>{
  const {stdout:data}=await run('curl.exe',['-sSfL','--max-time','45',`https://raw.githubusercontent.com/Tonejs/audio/master/salamander/${name}`],{encoding:'buffer',maxBuffer:2*1024*1024});
  await writeFile(new URL(name,directory),data);
  console.log(`${name}: ${data.length} bytes`);
}));
