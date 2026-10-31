import { chromium, webkit, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertBrowserLaunchAllowed } from './browser-runtime.mjs';

assertBrowserLaunchAllowed();
const url = process.env.RECALL_URL || 'https://recall-memory.pages.dev/';
const out = resolve(process.env.RECALL_QA_DIR || 'quality/mobile');
mkdirSync(out,{recursive:true});
const results=[]; const errors=[]; const failedRequests=[];
const isWebKit = process.env.RECALL_ENGINE === 'webkit';
const browser = isWebKit ? await webkit.launch({headless:true}) : await chromium.launch({executablePath:process.env.RECALL_CHROMIUM || '/usr/local/bin/chromium',headless:true,args:['--no-sandbox']});
const viewport = {width:Number(process.env.RECALL_WIDTH || 390),height:Number(process.env.RECALL_HEIGHT || 844)};
const context=await browser.newContext({viewport,screen:viewport,deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'en-US'});
const page=await context.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror',err=>errors.push(err.message));
page.on('requestfailed',req=>failedRequests.push({url:req.url(),reason:req.failure()?.errorText}));
const shot=async name=>{await page.waitForTimeout(250);await page.screenshot({path:resolve(out,name+'.png'),scale:'css'});};
const check=async(name,fn)=>{await fn();results.push({name,status:'passed'});console.log('PASS',name);};
const snapshot=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('recall.snapshot.v1')||'null'));
const mobileNav=()=>page.getByRole('navigation',{name:'Mobile navigation'});
async function noOverflow(){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
try {
await check('生产入口与首次引导',async()=>{
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});expect(response.status()).toBe(200);
 await page.getByRole('button',{name:/Get Started/i}).waitFor({state:'visible',timeout:90000});
 await page.getByRole('button',{name:/Get Started/i}).tap();
 await page.getByRole('button',{name:/^Continue$/i}).tap();
 await page.getByRole('button',{name:/^Next$/i}).tap();
 await page.getByRole('button',{name:/^Skip$/i}).last().tap();
 await page.getByRole('button',{name:/^Skip$/i}).last().tap();
 await page.getByRole('button',{name:/Start Learning/i}).tap();
 await expect(page.getByText('Your Decks',{exact:true})).toBeVisible();await noOverflow();await shot('01-dashboard');
});
await check('触控创建独立卡组',async()=>{
 await page.getByRole('button',{name:/New Deck|Create New Deck/i}).first().tap();
 await page.getByPlaceholder('Systems Design').fill('移动验证卡组');
 await page.getByRole('dialog').getByRole('button',{name:/^Create deck$/i}).tap();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await expect(page.getByRole('heading',{name:'移动验证卡组',exact:true})).toBeVisible();await noOverflow();
});
const longFront='段落开头：为什么读过不等于能表达？\n\n'+Array.from({length:16},(_,i)=>`第${i+1}段：先隐藏答案，用自己的话解释，再检查遗漏。阅读产生熟悉感，主动回忆才暴露表达缺口。每段要有清晰提示，复习时按真实回忆程度反馈。`).join('\n\n')+'\n\n段落结尾：练习结束。';
const longBack='答案开头：先口述，再对照。\n\n'+Array.from({length:18},(_,i)=>`第${i+1}段：把知识点整理成可复述段落，使用问题触发回忆。忘记就重学，吃力就缩短复习间隔，正常回忆按计划复习，轻松回忆再延长间隔。`).join('\n\n')+'\n\n答案结尾：完成对照。';
await check('正反面多行中文卡片编辑与保存',async()=>{
 for(let i=0;i<4;i++){
 await page.getByRole('button',{name:/^Add Card$/i}).first().tap();
 await page.locator('#front-input').fill(i===0?longFront:`问题${i+1}：用自己的话说明主动回忆。`);
 await page.getByRole('tab',{name:'Back',exact:true}).tap();
 await page.locator('#back-input').fill(i===0?longBack:`答案${i+1}：先不看材料复述，再对照知识点。`);
 await page.getByRole('dialog').getByRole('button',{name:'Create card',exact:true}).tap();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 }
 const data=await snapshot();expect(data.cards.filter(c=>c.front.startsWith('问题')||c.front.startsWith('段落开头')).length).toBe(4);await noOverflow();await shot('02-deck');
});
await check('刷新后卡组与卡片仍保留',async()=>{
 await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByText('Your Decks',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/Open deck: 移动验证卡组/}).tap();await expect(page.getByRole('heading',{name:'移动验证卡组',exact:true})).toBeVisible();
 const data=await snapshot();expect(data.cards.some(c=>c.front===longFront&&c.back===longBack)).toBe(true);
});
await check('进入复习并定位长内容',async()=>{
 await page.getByRole('button',{name:'Start studying this deck',exact:true}).tap();await expect(page.getByRole('button',{name:'Reveal',exact:true})).toBeVisible();
 const text=await page.locator('.study-card-face[aria-hidden="false"]').innerText();console.log('ACTIVE FRONT',text.slice(0,100));
 await shot('03-study-front');await noOverflow();
});
const activeFront=page.locator('.study-card-face[aria-hidden="false"]');
if((await activeFront.innerText()).includes('段落开头')) {
 await check('超长正面首行可见且可滚动',async()=>{
 const metric=await activeFront.evaluate(el=>{const child=el.querySelector('p');return {scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,scrollTop:el.scrollTop,top:el.getBoundingClientRect().top,firstTop:child?.getBoundingClientRect().top};});
 console.log('LONG METRICS',JSON.stringify(metric));expect(metric.scrollHeight).toBeGreaterThan(metric.clientHeight);expect(metric.firstTop).toBeGreaterThanOrEqual(metric.top-1);
 const before=(await snapshot()).reviewLogs.length;const box=await activeFront.boundingBox();
 if(isWebKit){await activeFront.evaluate(el=>el.scrollBy(0,200));}
 else {
 const cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height-30}]});
 for(let step=1;step<=10;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height-30-step*20}]});await page.waitForTimeout(30);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 await page.waitForTimeout(300);
 expect((await snapshot()).reviewLogs.length).toBe(before);await expect(page.getByRole('button',{name:'Reveal',exact:true})).toBeVisible();
 expect(await activeFront.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 });
}
await check('翻面与四档评分按钮可用',async()=>{
 await page.getByRole('button',{name:'Reveal',exact:true}).tap();await expect(page.getByRole('button',{name:/Rate as Again/})).toBeVisible();
 for(const rating of ['Again','Hard','Good','Easy']){const button=page.getByRole('button',{name:new RegExp('Rate as '+rating)});expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);}
 await shot('04-study-answer');await noOverflow();
});
if((await page.locator('.study-card-face[aria-hidden="false"]').innerText()).includes('答案开头')){
await check('超长答案纵向滚动不写入评分',async()=>{
 const face=page.locator('.study-card-face[aria-hidden="false"]');const before=(await snapshot()).reviewLogs.length;
 await face.evaluate(el=>{const p=el.getBoundingClientRect();const send=(type,y)=>{const e=new Event(type,{bubbles:true});Object.defineProperty(e,'touches',{value:type==='touchend'?[]:[{clientX:p.x+80,clientY:y}]});el.dispatchEvent(e);};send('touchstart',p.y+240);el.scrollTop=150;send('touchmove',p.y+40);send('touchend',p.y+40);});
 await page.waitForTimeout(300);expect((await snapshot()).reviewLogs.length).toBe(before);await expect(page.getByRole('button',{name:/Rate as Good/})).toBeVisible();
});}
await check('评分写入与撤销恢复',async()=>{
 const before=(await snapshot()).reviewLogs.length;await page.getByRole('button',{name:/Rate as Good/}).tap();await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeVisible();await expect.poll(async()=>(await snapshot()).reviewLogs.length).toBe(before+1);
 await page.getByRole('button',{name:'Undo',exact:true}).tap();await expect.poll(async()=>(await snapshot()).reviewLogs.length).toBe(before);
 await page.getByRole('button',{name:'Reveal',exact:true}).tap();await page.getByRole('button',{name:/Rate as Good/}).tap();
});
await check('剩余评分及本次学习总结',async()=>{
 for(const rating of ['Hard','Again','Easy']){await page.getByRole('button',{name:'Reveal',exact:true}).tap();await page.getByRole('button',{name:new RegExp('Rate as '+rating)}).tap();}
 await expect(page.getByRole('dialog')).toBeVisible();await shot('05-summary');console.log('SUMMARY',await page.getByRole('dialog').innerText());
 const data=await snapshot();const deck=data.decks.find(d=>d.name==='移动验证卡组');const logs=data.reviewLogs.filter(r=>data.cards.find(c=>c.id===r.cardId)?.deckId===deck.id);expect(logs.length).toBe(4);expect(new Set(logs.map(r=>r.rating)).size).toBe(4);
});
await check('PWA manifest 与 Service Worker',async()=>{
 await page.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return r?.active?.state==='activated';},{},{timeout:180000});
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:20000});
 expect(await page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);const manifest=await (await context.request.get(new URL('manifest.webmanifest',url).href)).json();expect(manifest.display).toBe('standalone');expect(manifest.start_url).toBe('/');
});
await check('断网刷新、打开本地卡组并继续复习',async()=>{
 await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await expect(page.getByText('Your Decks',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:/Open deck: 移动验证卡组/}).tap();await expect(page.getByRole('heading',{name:'移动验证卡组',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Start studying this deck',exact:true}).tap();await page.getByRole('button',{name:'Reveal',exact:true}).tap();await expect(page.getByRole('button',{name:/Rate as Good/})).toBeVisible();await shot('06-offline');await noOverflow();await context.setOffline(false);
});
await check('核心流程无运行时异常',async()=>expect(errors).toEqual([]));
} catch(error){results.push({name:'当前执行步骤',status:'failed',error:error.message});console.error(error);await shot('failure').catch(()=>{});process.exitCode=1;}
finally {writeFileSync(resolve(out,'results.json'),JSON.stringify({url,viewport,engine:`${isWebKit?'WebKit':'Chromium'} ${browser.version()} mobile emulation (not physical iPhone)`,results,errors,failedRequests},null,2));await browser.close();}
