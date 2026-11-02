import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const target = resolve(process.argv[2] || '/tmp/recall-image-preview-dist-20261101');
await mkdir(target, { recursive: true });
if ((await readdir(target)).length) throw new Error('Preview output must be empty; choose a new task-specific directory');
await cp('dist', target, { recursive: true });
const image = await readFile('e2e/fixtures/source-screenshot.png');
const id = createHash('sha256').update(image).digest('hex') + '.png';
const markdown = `# 图片体验示例\n\n<!-- recall:card {"id":"synthetic-media-demo-1"} -->\n问题：为什么保留来源截图？\n\n保留原文上下文；多张卡共用同一图片，不随评分重复上传。\n\n![合成红框截图](recall://${id})\n<!-- recall:end -->\n\n<!-- recall:card {"id":"synthetic-media-demo-2"} -->\n问题：图片与文字应该如何同步？\n\n文字和复习记录优先同步，图片单独传输并缓存。\n\n![合成红框截图](recall://${id})\n<!-- recall:end -->`;
await writeFile(resolve(target, 'synthetic.recall-media.json'), JSON.stringify({ format: 'recall-media', version: 1, markdown, images: [{ id, mime: 'image/png', base64: image.toString('base64') }] }));
await writeFile(resolve(target, '_worker.js'), `export default { async fetch(request, env) { const path = new URL(request.url).pathname; if (path === '/api' || path.startsWith('/api/')) return Response.json({ error: 'PREVIEW_LOCAL_ONLY: preview has no cloud, credentials or AI connection' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }); return env.ASSETS.fetch(request); } };\n`);
await writeFile(resolve(target, 'media-demo.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Recall 图片任务预览</title><style>body{margin:0;background:#f5f4ee;color:#353532;font:18px/1.7 sans-serif;padding:calc(24px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom));max-width:640px}a{display:block;padding:14px 18px;margin:16px 0;border-radius:14px;background:#353532;color:#fff;text-decoration:none}small{display:block;color:#77776b}</style></head><body><h1>来源截图体验</h1><p>这是独立开发预览，不是正式版。只使用合成材料，不连接生产卡片库、云端同步或付费 AI。</p><a href="/synthetic.recall-media.json" download>1. 下载合成带图包</a><a href="/#import">2. 打开 Recall 导入</a><p>选择带图包，确认导入两张卡片。打开项目菜单，进入全部卡片，点问题、显示答案，再点击截图放大。可测试编辑附图与设置里的带图备份恢复。</p><small>云端同步在此预览禁用；开发工作树的本地 D1 测试另行验证。数据只保存在此预览域名的本机浏览器，与正式版隔离。不要导入个人材料作为公开测试证据。</small></body></html>`);
console.log(`Prepared local-only synthetic preview: ${target}`);
