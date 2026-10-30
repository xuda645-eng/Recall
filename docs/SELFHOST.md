# Recall 中文版部署与验证

正式入口：https://recall-memory.pages.dev/

本项目为独立静态 Cloudflare Pages 部署，不修改 KidventureMap 或 WechatMoment，不启用设备通行码或云同步。卡片保存在当前浏览器的 localStorage，清除网站数据会删除卡片，请定期导出备份。

## 中文与安全区

- 使用 i18next + react-i18next，新增完整 zh-CN 语言包，保留英文和原有印尼语选择。
- 这个个人部署默认中文，语言偏好使用 recall.ui.language，和卡片快照 recall.snapshot.v1 分离。
- 菜单、按钮、提示、评分、时间单位、设置、状态与辅助名称已中文化；用户原文与内置语言学习卡片不会自动翻译。
- 退出按钮显示明确文字，触控区域至少 72×48 CSS 像素；复习页面为顶部和底部安全区预留空间，通知避让顶部操作区。
- 保留长卡片首段可读、长卡纵向滚动不评分、浏览器评分落盘和 Service Worker 接管的修复。

## 验证

GitHub 源码独立解包后，类型检查、56 个测试文件共 816 项单测及生产构建通过。同一生产包通过 393×852 中文六组检查和英文十三组回归，包含创建、保存、评分、撤销、退出、语言切换、长段落和断网刷新继续复习。安全区使用 59/34 CSS 像素注入检验，不是实体 iPhone。

最终线上全流程在本环境受资源加载超时影响，不能宣称线上完整验收通过。实际 iOS 安装、系统键盘、后台回收仍待真机核验。上游 lint warning 保留，不宣称全项目零 warning。

## 复跑与发布

```sh
pnpm install --frozen-lockfile --registry=https://registry.npmjs.org
pnpm test
pnpm build
pnpm exec vite preview --host 127.0.0.1 --port 4185 --strictPort
RECALL_URL=http://127.0.0.1:4185/ node scripts/verify-chinese-mobile.mjs
npx wrangler@4.156.0 pages deploy dist --project-name recall-memory --branch main
```

手机若仍为旧英文版本，联网重新打开并使用更新提示（旧版为 Update）。不要清除网站数据以更新。
