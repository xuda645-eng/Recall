# Recall Memory 首版部署与验证

## 体验入口

https://recall-memory.pages.dev/

使用 Safari 打开，分享菜单选择「添加到主屏幕」。第一次联网访问需等待静态缓存下载完成，之后才能离线使用。首次显示英文引导，中文卡片内容可以正常输入和阅读。

## 当前范围

- 独立 Cloudflare Pages 项目：recall-memory。
- 不覆盖 KidAdventure 或其他项目，不绑定既有数据库、DNS 或付费资源。
- 不启用云同步或设备通行码；这些功能留待下一轮。
- 网站本身公开访问，但卡片与学习进度仅在当前浏览器设备本地。其他访客不能读取你的本地卡片。
- 当前下载版本实际使用 localStorage，清除网站数据会丢失卡片，定期使用导出备份。

## 已修复

1. 超长卡片内容居中导致第一段位于滚动起点之外。
2. 上下阅读长卡片时误触发翻面或 FSRS 评分。
3. 网页端评分只更新内存，未立即保存卡片调度与复习记录。
4. Service Worker 首次安装后不主动接管已有页面。

## 验证边界

- 原始版本 807 项单测通过；增加手势与持久化回归后 813 项单测通过。
- 生产构建通过；修改代码的定向 ESLint 无错误。上游全量 lint 有 131 条 warning，不宣称零 warning。
- Chromium 在 390×844 CSS 像素、触控仿真、设备像素比 3 下，对同一生产包完成 13 项检查，含首次引导、建卡、中文长段落、刷新恢复、四档评分、撤销、总结、Service Worker 激活及断网刷新继续学习。
- WebKit 同尺寸完成核心交互和 Service Worker 激活检查，但断网刷新触发测试运行时内部错误，不宣称 iOS 离线真机通过。
- 线上早期版本核心交互已通过；最终完整线上复验遭遇本环境间歇性 502 和资源加载超时，不能将本地验证标作最终线上全通过。
- 未使用实体 iPhone，未覆盖真实 Safari 键盘、系统后台回收和添加主屏安装弹窗。

## 源码与复跑

```sh
pnpm install --frozen-lockfile --registry=https://registry.npmjs.org
pnpm test
pnpm lint
pnpm build
pnpm exec playwright install chromium webkit
node scripts/verify-mobile.mjs
```

验证本地生产包时先运行 `pnpm exec vite preview --host 127.0.0.1 --port 4185 --strictPort`，然后：

```sh
RECALL_URL=http://127.0.0.1:4185/ RECALL_QA_DIR=quality/local-production node scripts/verify-mobile.mjs
```

iPhone 15 尺寸补充验证可用 `RECALL_WIDTH=393 RECALL_HEIGHT=852`；测试引擎为 `RECALL_ENGINE=webkit`。浏览器依赖与运行环境必须可用。

## 发布

官方 Wrangler 账号授权，不把凭证放入源码。确认账号后发布独立项目：

```sh
pnpm build
npx wrangler@4.156.0 pages deploy dist --project-name recall-memory --branch main
```

若出现 502，不应清除手机网站数据以排障，避免删除本地卡片。
