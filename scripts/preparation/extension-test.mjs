import {chromium} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const token=process.env.PREPARATION_DEMO_TOKEN;
if(!token)throw Error('Set PREPARATION_DEMO_TOKEN to the running local server key');
const profile=await mkdtemp(join(tmpdir(),'applihero-mv3-'));
const extension=resolve('extension/dist');
const context=await chromium.launchPersistentContext(profile,{headless:true,...(process.env.PREPARATION_TEST_CHROMIUM?{executablePath:process.env.PREPARATION_TEST_CHROMIUM}:{channel:'chromium'}),ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const extensionId=new URL(worker.url()).host;
 let panel=await context.newPage();await panel.goto(`chrome-extension://${extensionId}/panel.html`);
 const fixture=await context.newPage();await fixture.goto('http://localhost:3000/preparation-fixtures/advanced.html');await fixture.bringToFront();
 async function command(message){const r=await panel.evaluate(message=>chrome.runtime.sendMessage(message),message);assert(!r.error,r.error);return r.data;}
 await command({action:'connect',token});
 const captured=await command({action:'capture'});assert(captured.capture.fields.length>6);
 const application=captured.applicationId,headers={Authorization:`Bearer ${token}`};
 const endpoint=`http://localhost:3000/api/preparation?application=${application}`;
 async function state(){const r=await context.request.get(endpoint,{headers});assert(r.ok());return r.json();}
 async function post(data){const r=await context.request.post(endpoint,{headers,data});const response=await r.json();assert(r.ok(),JSON.stringify(response));return response;}
 let current=await state();
 current=await post({action:'draft',id:'id:first',value:'MV3 Demo',revision:current.revision});
 current=await post({action:'approve',id:'id:first',revision:current.revision});
 const before=current.revision;
 // Trigger a genuine DOM mutation. The observer/worker must sync it without another Capture action.
 await fixture.getByRole('button',{name:'Show next question'}).click();
 let synced=false;
 for(let i=0;i<24;i++){current=await state();if(current.revision>before&&current.capture.fields.find(f=>f.id==='id:follow')?.actionable){synced=true;break;}await new Promise(r=>setTimeout(r,250));}
 assert(synced,'Mutation observer did not sync the revealed question');
 const preview=await command({action:'preview'});assert(preview.plan.fields.some(f=>f.field.id==='id:first'),'Unchanged approval was lost');
 const result=await command({action:'fill'});assert.equal(result.results.find(r=>r.id==='id:first').code,'filled_verified');assert.equal(await fixture.locator('#first').inputValue(),'MV3 Demo');
 await panel.close();panel=await context.newPage();await panel.goto(`chrome-extension://${extensionId}/panel.html`);await fixture.bringToFront();
 const status=await command({action:'status'});assert.equal(status.connected,true);assert.equal(status.applicationId,application);
 await command({action:'preview'});
 const other=await context.newPage();await other.goto('http://localhost:3000/preparation-fixtures/generic.html');await other.bringToFront();
 const blocked=await panel.evaluate(()=>chrome.runtime.sendMessage({action:'fill'}));assert(blocked.error,'Cross-tab fill should be rejected');
 await fixture.bringToFront();await command({action:'signout'});
 const disconnected=await panel.evaluate(()=>chrome.runtime.sendMessage({action:'preview'}));assert(disconnected.error);
 console.log('PASS: loaded MV3 capture, automatic mutation sync, unchanged approval reuse, verified fill, panel reopen, cross-tab rejection, sign-out rejection');
}finally{await context.close();await rm(profile,{recursive:true,force:true});}
