# iPhone 15 PWA

## 使用与安装

在线入口：<https://recall-memory.pages.dev/>。生产平台是现有 Cloudflare
Pages 项目 `recall-memory`，GitHub 仅托管源码。

1. 在 iPhone 的 Safari 中打开入口，等待首次加载完成。
2. 使用 Safari 分享菜单中的“添加到主屏幕”，从主屏幕图标启动。
3. 新用户从空卡组开始。先创建卡组与卡片，或在“导入”中选择文件。
4. 第一次联网加载会缓存应用资源；之后可以离线打开并评分。
5. 新版本会显示更新提示。先保存未完成的编辑，再更新。

这是公网 HTTPS 地址，不要求和开发电脑连接同一个 Wi-Fi。本地优先，
内容保存到本机浏览器的 `recall.snapshot.v1`；可选私人 D1 同步需要设备
授权，详见 [CLOUD_SYNC.md](./CLOUD_SYNC.md)。未授权设备仍可本地使用。
浏览器、主屏幕安装实例、设备或网站地址之间不可假定自动共享数据。
请定期在“设置与数据”中备份 `.recall` 文件，恢复入口在
“导入 > 其他导入”。清理网站数据可能删除本机内容。
备份不包含设备同步密钥，但卡片内容是明文，请把文件保存在私人位置。

## 已实现的产品逻辑

- 纸白底色、石墨色主卡、48 x 48 Logo、48px 三段式 appbar。
- 移动端 Logo 行位于顶部安全区下方 10px。顶栏从屏幕顶端开始，
  使用全宽不透明纸色固定底面；滚动正文从顶栏下方开始，不穿过
  状态栏和 Logo 行。移动端外壳固定，不使用文档级滚动。
  抽屉关闭且动画结束后，外壳不保留 `transform` 合成层；仅在抽屉
  移动时使用变换，避免空闲顶栏仍处在变换祖先之下。
- 抽屉固定在底层，前景整页与 Logo 同步移动；移动端以 393 x 852 CSS
  像素、DPR 3 为首要基线，760px 及以下使用移动布局。
- 多级卡组将路径折叠为入口。搜索覆盖当前范围及子树，筛选与排序集中
  到一个面板。浏览和到期复习集中在底部，不重复占用目录顶部空间。
- 问答卡与回忆任务先展示提示，点击显示原文，再使用同一组评分按钮。
  可保留纯摘录作为阅读形式，不强制把所有文字编成问题。
- 智能模式使用 FSRS；固定模式提供可配置的四个递增间隔，默认是
  1 分钟、1 天、30 天、180 天。此固定方案是用户选项，不是记忆效果保证。
  配置只影响未来评分，不重排已有卡片。撤销评分恢复先前排期和记录。
- 归档不删除卡片，保留正文、进度和历史，不进入到期队列。归档后
  3 秒内可以撤销，只撤销最近一次。倒计时结束后在“已归档”中移出归档。
  移出后保留原排期，已经到期的卡片会再次进入复习队列。
- Markdown 先预览再确认；重复跳过，内容变化需要明确选择更新。
  更新保留进度、首次导入时间和归档状态，支持保存带稳定编号的文件。
- 微信读书默认显示精简连接入口，连接后以书卡搜索、筛选、排序和选书。
  书卡区分我的划线、笔记总数、标记读完与真实百分比；缺失字段不猜测。
  仅导入自己的划线，不导入其他人的热门虚线。确认范围后每批最多生成
  20 个问题，全部成功后自动导入。失败或刷新保留本机任务并暂停，重试
  不重做成功问题。其他导入方式保留无凭证 Skill JSON、手动编辑与示例。
  划线原文不改写，章节为元数据；手动路径的通用任务明确标注为非 AI。
  详见 `WEREAD_IMPORT.md`。

微信读书与火山引擎密钥只作为生产服务端加密 secret，不内置前端，
不在手机浏览器直接执行 Agent Skill。在线与 AI 功能的发布状态见
[RELEASES.md](./RELEASES.md)，调用上限与原文传输边界见
[WEREAD_IMPORT.md](./WEREAD_IMPORT.md)。Tauri 保留旧桌面壳；验证目标是浏览器 PWA。

## 开发验证

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test:coverage
pnpm exec tsc -b
pnpm exec playwright install --with-deps chromium webkit
pnpm test:e2e
```

Playwright 默认启动站点根路径 `/` 的生产构建与预览，与 Cloudflare
Pages 生产地址一致。主套件是
`e2e/memory-workspace.spec.ts`，覆盖 Chromium 和 WebKit 的 iPhone 15
尺寸、归档与撤销、导入、配置、触摸滚动、字体与焦点、安全区压力、
窄屏、断点、横屏、桌面及 PWA 离线持久化。测试只写独立浏览器上下文
中的临时本机数据，不向服务器保存卡片。

### macOS 测试浏览器启动保护

macOS 上的 Codex Seatbelt 沙箱不能正常完成测试浏览器的系统 GUI 注册，
即使使用 headless 也可能在页面加载前崩溃。系统显示的“Playwright”是
WebKit 测试宿主，不是 Recall；“Google Chrome for Testing”是 Chromium
测试宿主。每个测试再次启动浏览器会产生新的崩溃报告，点“忽略”不能
阻止下一次启动。不要关闭 macOS 崩溃报告、删除缓存或重装普通 Chrome
来掩盖这个权限问题。

`pnpm test:e2e`、正式配置和旧截图脚本会在启动前拒绝该沙箱环境，输出
`RECALL_BROWSER_SANDBOX` 并失败退出，不启动浏览器、不计为验收通过。
Codex 应通过 `exec_command` 的 `sandbox_permissions=require_escalated`
重新执行同一条命令并遵守工具审批；也可以在普通 macOS 终端执行。
不要手动清除 `CODEX_SANDBOX`，也不要在沙箱 `node_repl` 中反复重试。

正式套件还会在 worker 启动前逐项验证浏览器启动、独立移动上下文和
空白页渲染；任何引擎失败会以 `RECALL_BROWSER_PREFLIGHT` 终止整套测试，
避免损坏的浏览器安装引发逐测试崩溃。此检查不访问生产数据，不替代
iPhone 15 功能测试或真机验收。新原型配置应复用相同保护，并通过
`pnpm test:e2e --config <原型配置路径>` 运行。

Chromium 使用浏览器离线模式验证原站点重开。当前 macOS Playwright
WebKit 的离线开关会在导航时产生引擎内部错误，因此 WebKit 以相同
生产构建启动独立静态服务器，完成缓存后关闭服务器，并验证无网络
重载和评分。这个检查证明构建的缓存行为，不是 iPhone 真机断网验收。

验证已发布版本可使用：

```bash
RECALL_URL=https://recall-memory.pages.dev/ pnpm test:e2e
```

本地验收每项限时 30 秒；设置 `RECALL_URL` 的公网验收每项限时
300 秒，为慢网络首次下载和缓存应用资源留出时间，不跳过缓存就绪或离线检查。
界面断言本地限时 5 秒，公网限时 30 秒，以覆盖首次懒加载；浏览器运行
错误与应用错误边界检查不变。此时限是 Playwright 的测试预算，不是
Cloudflare 部署限制，也不改变应用 API 的请求超时。超时仍视为失败，
不通过无限等待、自动重试或移除离线断言来确保发布。

首屏只加载工作区所需模块；阅读器、富文本/公式、统计、设置和其他导入
按需加载。Service Worker 注册位于应用根部，不再等待工作区脚本完成。
首次缓存仍包含全部 JS/CSS、界面字体和公式的 WOFF2，保证缓存完成后
离线首次进入这些页面。界面字体保留 Latin/Latin-ext 子集，覆盖现有
英文和印尼文界面；中文及其他文字使用系统回退字体，不改变卡片正文。
不再预缓存重复的 WOFF 兼容格式。

验收导航先等待 `domcontentloaded`，再分别检查界面可见、SW 接管和缓存
就绪，不用总体 `load` 或 `networkidle` 代替这些条件。失败附件仅含
文档/SW 状态和缓存数量，不含卡片、Cookie 或设备授权。慢脚本注册回归
只在本地拦截请求；离线回归检查未打开过的页面和公式字体。
这些改动减少下载依赖，不改变 Chromium 自身的网络失败行为。

只有明确检查 GitHub Pages 备用预览时才使用
`RECALL_BUILD_MODE=pages pnpm test:e2e`。备用构建使用 `/Recall/` 子路径，
不能上传到 Cloudflare 根路径站点。

模拟浏览器结果不等于真机验收。实际 iPhone Safari 的主屏幕安装、
动态安全区、系统键盘、离线冷启动和更新提示仍需在手机检查。
原有 `scripts/verify-mobile.mjs`、`scripts/verify-chinese-mobile.mjs`
与旧 `e2e/recall.spec.ts` 面向桌面旧壳，不能证明新 PWA 验收通过。

## 2026-10-31 顶部间距修复发布

- 生产地址仍为 `https://recall-memory.pages.dev/`，部署 ID 为
  `8adde351-c4c8-4c8d-aa5b-cdd100a3affe`，分支 `main`。
- 发布工作区中的顶部样式修复；源码未另行 commit/push。现有 D1、
  生产密钥和空间标识保持不变，没有迁移、重置或测试数据写入。
- 本地通过 1131 项单测及 40 项 Chromium/WebKit 移动端验收；类型检查、
  生产构建通过，lint 为 0 errors、131 条既有 warnings。
- 线上首页返回 200，Manifest 为根路径，3 个图标可访问；样式和
  Service Worker 文件与发布包逐字节一致，匿名 API 返回 401。
- Chromium/WebKit 线上定向检查通过：393 x 852、DPR 3，模拟顶部
  安全区 59px 时三个控件均从 69px 开始，高 48px，无横向溢出，
  抽屉开合保持顶距。该检查未证明 Service Worker 接管或离线可用。
- 公网完整回归在首次加载或等待 Service Worker 接管时超时，随后
  停止运行；不记为通过。实体 iPhone 的系统模糊、安装态和更新仍未验证。
- 上一生产部署 `8e3a2d28-e70e-49af-bea1-c609038fed7e` 保留作回退参照。
- 用户随后提供安装态 iPhone 截图，确认 Logo 顶边仍受模糊影响。
  这次只增加间距的修复未解决真机问题，不作为已验收版本。
