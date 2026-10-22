# 第一版验收记录

验收日期：2026-10-22。

## 本地验证

- `npm run check`：18 项核心测试通过，TypeScript 检查和 Vite 生产构建通过。
- `npm run test:browser`：桌面与手机各 8 项，共 16 项通过。
- 浏览器验收包含实际 XYZ 下载、低值过滤、分带错误、优先级及默认值、开口线拒绝、
  JSON 报告参数、输入变更清除结果、超限替换清除旧结果、取消后恢复、GBK 中文图层。
- 桌面及手机截图检查无水平溢出，Canvas 像素检查确认实际几何已绘制。
- 合成 R12 矩形、带点号的测点和重叠分区，在 37/39 带下与原 Python 核心逐字比较：
  边界五列输出、过滤后地形点、分区赋值三项各两组，共 6 组一致。
  对比数据及旧程序不提交仓库；没有使用真实工程数据发布或测试线上服务。

## 可重复检查

GitHub Ubuntu CI 使用运行镜像预装的 Chrome，通过 `PLAYWRIGHT_CHANNEL=chrome`
运行同一套测试，避免在每次发布时从 Ubuntu 软件源重装系统依赖。
浏览器测试默认先构建，再通过 4174 端口检查生产包；开发服务可独立运行。

```bash
npm ci
npm run check
npx playwright install --with-deps chromium
npm run test:browser
```

发布后可复用同一套浏览器测试，检查项目子路径下的真实生产资源、Worker 和下载：

```bash
PLAYWRIGHT_BASE_URL=https://gaomenggu.github.io/MikeConverterTools/ npm run test:browser
```

## 线上验收

- [GitHub Actions 首次成功部署](https://github.com/GaoMengGu/MikeConverterTools/actions/runs/39790352575)：
  Ubuntu 上核心测试、构建、16 项 Chrome 浏览器测试及 Pages 部署均通过。
- 对 [正式网址](https://gaomenggu.github.io/MikeConverterTools/) 再执行同一套 16 项测试，
  全部通过；确认项目子路径、生产 Worker、文件下载及桌面/手机预览可用。
- 早期部署两次未完成：一次取消了软件源下载过慢的系统依赖安装；一次开发服务
  依赖重优化触发页面刷新使首个文件选择丢失。最终改为预装 Chrome、生产包验收，
  并预声明 Worker 开发依赖，已通过上述本地和线上检查。

## 验收范围

本次验证覆盖浏览器转换与文本输出，不包含 MIKE 2024 桌面软件实际导入试验。
后续应在 MIKE Mesh Generator 中用项目小样核对闭合边界、点数、范围及高程；
分区赋值第三列是参数而不是地形高程。分带前缀处理没有执行坐标重投影。
新版对圆弧、自交和不明确格式的拒绝是主动约束，与旧版宽松解析不完全相同。
