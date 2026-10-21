import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const token=process.env.PREPARATION_DEMO_TOKEN||randomBytes(32).toString('hex');
console.log('Fixture-only preparation workspace: http://localhost:3000/prepare');
console.log('Local development key (paste into workspace and extension):',token);
console.log('Set PREPARATION_EXTENSION_ID to the unpacked extension ID before connecting.');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3000'],{stdio:'inherit',env:{...process.env,PREPARATION_LOCAL_DEMO:'1',PREPARATION_DEMO_TOKEN:token}});
child.on('exit',code=>process.exit(code??1));
