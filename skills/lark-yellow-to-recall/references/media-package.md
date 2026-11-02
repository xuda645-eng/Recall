# 带图包工作流

此流程需要 Pillow、本地项目支持 `src/services/media-package.ts`；不连接线上 APP 或真实数据库。

1. 按既有只读流程下载原图。运行 `python3 scripts/media_package.py compress --input <原图> --output <临时分析图.webp>`，长边最多 2000 像素，WebP quality 88。保留完整红框和必要上下文，不把整图压糊以凑体积。超过 512 KB 时停止，不自动进一步降质。
2. 视觉核对压缩图；证据 JSON 的 file、sha256、归一化 bounds 必须对应实际核对图片。细字需要高清裁切时只补必要局部，原图用于校对，不重复提交全部素材。疑点待确认，不编答案。压缩图与原图的来源关系在私有检查说明中保留。
3. 使用既有 extract / archive 生成独立 Markdown 批次，保持卡片 ID、黄色模式和增量语义。当前 APP 不支持附件时只生成原流程 Markdown，明确图片未附带。
4. 对已验证批次执行 `python3 scripts/media_package.py pack --batch <批次目录> --selections <证据JSON> --output <批次目录>/cards-<批次号>.recall-media.json`。输出是单个 JSON 包，内部含 Markdown 和去重图片，最多 100 张、16 MB。Base64 仅用于便携文件，不放进卡片正文或普通同步快照。
5. 在项目根目录运行 `node scripts/verify-media-package.mjs <带图包>`，调用实际 `parseMediaPackage` 和 `planMemoryImport` 校验附件类型/尺寸/哈希、首次和重复导入；再检查压缩图文字。浏览器导入另行验证实际图片解码。更新保留进度由实际解析器测试验证。原 Markdown、manifest 不改，附件包是独立衍生产物。按已授权归档约定运行 `python3 scripts/recall_batch.py index --project <项目根目录> --confirm`，索引会同时登记批次目录内的带图包；每批新增，不覆盖旧包。
6. 用户通过“选择带图包”导入；普通 Markdown 仍可用，但单独 Markdown 无法搬运图片。完整备份使用设置中的“备份（含来源图片）”。APP 回存的带编号 Markdown 也只含图片引用，不是完整图片备份。

不将私有原图、压缩图、包或源响应提交 Git。图片下载后再压缩不能减少已发生的飞书下载流量。图片展示和同步不调用模型。
