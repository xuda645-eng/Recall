# Recall Memory 部署说明

- 体验入口：https://recall-memory.pages.dev/
- 上游：Madlezz/Recall，MIT，起点提交 9e1b5131bfbfe61aa3183edc0ac90dda66d13ac7。
- 此仓库是用户自己的独立 fork，不发布到上游。
- Cloudflare 使用独立 recall-memory Pages 项目，不复用已有项目数据库、DNS 或收费资源。
- 当前首版不包含设备通行码，不启用云同步。个人卡片与进度仅存在浏览器本地。
- 本次修复：超长卡片开头不可滚动到；长卡纵向阅读误触评分；网页复习记录未立即持久化。
- 详细测试结果会在完整验收后同步。

## 本地运行

Node >=22，pnpm >=10。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm lint
pnpm build
```

## 发布

使用官方 Wrangler 授权，不把 Token 写入仓库。执行时确认当前账号是项目所在账号。

```sh
pnpm build
npx wrangler pages deploy dist --project-name recall-memory --branch main
```

网页端当前版本实际使用 localStorage 存储卡片快照，不是 README 所描述的 Dexie。应定期手动备份，清除网站数据会删除本地卡片。访问不同域名不是同一数据空间。
