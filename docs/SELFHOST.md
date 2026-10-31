# Recall Memory 部署与验证

## 体验入口

https://recall-memory.pages.dev/

使用 Safari 打开，分享菜单选择「添加到主屏幕」。第一次联网访问需等待静态缓存下载完成，之后才能离线使用。个人部署默认中文，卡片原文不自动翻译。主设备基线为 iPhone 15 竖屏，393 x 852 CSS 像素，DPR 3。

## 当前范围

- 独立 Cloudflare Pages 项目：recall-memory。
- 不覆盖其他项目，不更换生产地址、DNS 或启用付费资源。
- 本地优先，未授权设备仍可本地使用；可选设备授权与私人 D1 同步复用专用 `recall-memory-data` 数据库和 `personal` 空间，详见 [CLOUD_SYNC.md](./CLOUD_SYNC.md)。
- 网站本身公开访问，云端卡片 API 需要设备鉴权。其他匿名访客不能读取你的本机或私人云端卡片。D1 中的内容不是端到端加密。
- 本机数据使用 `recall.snapshot.v1`，清除网站数据可能删除卡片和设备授权。定期导出 `.recall` 备份，不通过清空网站数据修复更新问题。
- 微信读书支持无凭证 JSON 和受保护的在线导入；AI 生成需显式操作，密钥只在服务端，原文保留为答案。范围、调用上限和隐私边界见 [WEREAD_IMPORT.md](./WEREAD_IMPORT.md)。

## 产品与验收

浏览器/PWA 使用 Memory Workspace，Tauri 保留旧桌面壳。多级卡组、Markdown 预览与显式更新、长卡阅读、FSRS 评分与撤销、归档和离线持久化的移动验收入口见 [PWA.md](./PWA.md)。顶栏和抽屉遵循同一 Logo/appbar 合约，移动端正文在不透明固定顶栏下方独立滚动。

## 验证边界

- 本地、线上、模拟器和真机结果分别记录，不把历史或本地结果当作当前线上验收。
- 每次发布的检查命令、数量、失败恢复、源码 SHA、部署 ID 和回退目标均在 [RELEASES.md](./RELEASES.md) 的独立记录中。
- 实体 iPhone 安装态、系统模糊、动态安全区、键盘和后台回收仍需真机验证。浏览器模拟不等于已通过真机验收。

## 源码与复跑

```sh
pnpm install --frozen-lockfile --registry=https://registry.npmjs.org
pnpm test
pnpm lint
pnpm build
pnpm exec tsc -b --noEmit
pnpm typecheck:cloud
pnpm test:cloud
pnpm test:e2e
```

使用现有安装依赖时也可直接运行对应的 `node_modules` 可执行文件，避免重装共享依赖。主移动套件是 `e2e/memory-workspace.spec.ts`；在线导入 UI 使用合成 API 的独立套件：

```sh
pnpm exec playwright test --config e2e/weread-online.config.ts
```

云同步写入测试只允许在 loopback 合成 D1 上运行，不能指向真实生产卡片库。旧 `scripts/verify-mobile.mjs` 面向桌面旧壳，不作为新 PWA 验收依据。

## 发布

使用已有 Wrangler OAuth 账号，不把凭证放入源码。先核对现有账号、项目、生产部署和生产绑定，再按 [DEPLOYMENT.md](./DEPLOYMENT.md) 与 [RELEASES.md](./RELEASES.md) 验证、commit、正常 push，最后发布同一已提交生产包：

```sh
pnpm build
CLOUDFLARE_ACCOUNT_ID=751b9fca4f5173fd70e0dfb69cff81e2 npx --yes wrangler@4.156.0 pages deploy dist --project-name recall-memory --branch main
```

不创建新项目，不使用未审查 dirty 工作区发布，不重置 D1。数据库迁移须先确认兼容性与授权；部署后只做不写真实用户数据的公网检查。更新使用应用更新提示，不清除手机网站数据。
