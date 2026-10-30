import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const url=process.env.RECALL_URL||'http://127.0.0.1:4185/';
const out=process.env.RECALL_QA_DIR||'quality/chinese-mobile';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.RECALL_CHROMIUM||'/usr/local/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'en-US'});
const page=await context.newPage();const results=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
const check=async(name,fn)=>{await fn();results.push({name,status:'passed'});console.log('PASS',name);};
const snap=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('recall.snapshot.v1')));
try{
await check('默认中文与首次引导',async()=>{
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});expect(response.status()).toBe(200);
 await page.getByRole('button',{name:'开始使用',exact:true}).tap();
 await page.getByRole('button',{name:'继续',exact:true}).tap();await page.getByRole('button',{name:'下一步',exact:true}).tap();
 await page.getByRole('button',{name:'跳过',exact:true}).last().tap();await page.getByRole('button',{name:'跳过',exact:true}).last().tap();
 await page.getByRole('button',{name:'开始学习',exact:true}).tap();await expect(page.getByText('我的卡组',{exact:true})).toBeVisible();
 expect(await page.locator('html').getAttribute('lang')).toBe('zh-CN');
});
await check('中文建卡和保留原文',async()=>{
 await page.getByRole('button',{name:'新建卡组',exact:true}).first().tap();await page.getByPlaceholder('表达练习').fill('中文验收');
 await page.getByRole('dialog').getByRole('button',{name:'创建卡组',exact:true}).tap();await page.getByRole('dialog').waitFor({state:'hidden'});
 for(let i=0;i<2;i++){
 await page.getByRole('button',{name:'添加卡片',exact:true}).first().tap();await page.locator('#front-input').fill('Original text 原文 '+i);
 await page.getByRole('tab',{name:'背面',exact:true}).tap();await page.locator('#back-input').fill('先回忆再对照。\n\n'+('长段落：不要修改我的原始知识文本。\n\n').repeat(30));
 await page.getByRole('dialog').getByRole('button',{name:'创建卡片',exact:true}).tap();await page.getByRole('dialog').waitFor({state:'hidden'});
 }
});
await check('安全区内退出入口可点击且不评分',async()=>{
 await page.getByRole('button',{name:'开始复习这个卡组',exact:true}).tap();await expect(page.getByRole('button',{name:'显示答案',exact:true})).toBeVisible();
 await page.addStyleTag({content:':root { --recall-safe-top:59px; --recall-safe-bottom:34px; }'});
 const exit=page.getByRole('button',{name:'退出复习',exact:true});const box=await exit.boundingBox();expect(box.y).toBeGreaterThanOrEqual(59);expect(box.height).toBeGreaterThanOrEqual(44);
 expect(await exit.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
 const before=(await snap()).reviewLogs.length;await page.screenshot({path:out+'/01-safe-area.png',scale:'css'});await exit.tap();
 await expect(page.getByRole('heading',{name:'中文验收',exact:true})).toBeVisible();expect((await snap()).reviewLogs.length).toBe(before);
});
await check('中文评分与时长、持久化',async()=>{
 await page.getByRole('button',{name:'开始复习这个卡组',exact:true}).tap();await page.getByRole('button',{name:'显示答案',exact:true}).tap();
 for(const label of ['忘记了：完全想不起来','有点难：需要努力回忆','记住了：可以回忆起来','很熟悉：轻松回忆']) await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();
 await expect(page.getByLabel(/下次复习：/).first()).toContainText(/分钟|小时|天|个月|年/);await page.waitForTimeout(400);await page.screenshot({path:out+'/02-chinese-answer.png',scale:'css'});
 const before=(await snap()).reviewLogs.length;await page.getByRole('button',{name:'记住了：可以回忆起来',exact:true}).tap();await expect.poll(async()=>(await snap()).reviewLogs.length).toBe(before+1);
 await page.getByRole('button',{name:'退出复习',exact:true}).tap();await page.reload({waitUntil:'domcontentloaded'});expect((await snap()).reviewLogs.length).toBe(before+1);expect((await snap()).cards.some(c=>c.front==='Original text 原文 0')).toBe(true);
});
await check('中英文切换与卡片数据完全分离',async()=>{
 await page.getByRole('button',{name:'打开设置',exact:true}).tap();await expect(page.getByText('语言',{exact:true})).toBeVisible();const before=JSON.stringify((await snap()).cards);
 await page.getByRole('button',{name:'English',exact:true}).tap();await expect(page.getByText('Language',{exact:true})).toBeVisible();expect(JSON.stringify((await snap()).cards)).toBe(before);
 await page.getByRole('button',{name:'简体中文',exact:true}).tap();await page.reload({waitUntil:'domcontentloaded'});expect(await page.locator('html').getAttribute('lang')).toBe('zh-CN');expect(JSON.stringify((await snap()).cards)).toBe(before);
});
await check('无横向溢出或运行时异常',async()=>{expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);});
}catch(e){results.push({name:'当前步骤',status:'failed',error:e.message});process.exitCode=1;console.error(e);await page.screenshot({path:out+'/failure.png',scale:'css'}).catch(()=>{});}
finally{writeFileSync(out+'/results.json',JSON.stringify({url,viewport:{width:393,height:852},safeArea:'injected 59/34 CSS pixels, not physical iPhone',results,errors},null,2));await browser.close();}
