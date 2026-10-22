# MikeConverterTools 实现计划

目标：把原 Windows 转换工具重构为 GitHub Pages 托管的浏览器本地工具。

架构：TypeScript 转换核心与 UI 分离，文件在 Web Worker 内解析和转换。
采用 Vite、dxf-parser、RBush、稳健几何谓词，Vitest 和 Playwright 验证。
用户已批准 GitHub Pages＋浏览器方案，远程仓库为 GaoMengGu/MikeConverterTools。

## 顺序与验收

- [x] 为边界、点转换、分区赋值、分带校验、非法输入和兼容样例建立失败测试。
- [x] 实现 src/core 下的坐标、点文件、DXF、几何及转换函数。
- [x] 实现 Worker 文件处理、进度、取消、预览、输出和报告。
- [x] 实现三个功能页、输入与参数、预览、错误及下载状态。
- [x] 执行单元测试、旧工具样例对比、生产构建与桌面/移动浏览器测试。
- [x] 写明输入格式、坐标能力边界、Linux 开发及 GitHub Pages 部署方式。
- [x] 提交源码、推送远程，配置 Pages Actions 并核验在线站点。

## 文件职责

src/core：纯计算；src/worker.ts：文件解码和计算调度；src/main.ts：页面状态；
src/preview.ts：真实点线预览；src/style.css：响应式界面；tests：纯计算验收；
e2e：文件选择、错误、取消及下载工作流；.github/workflows：CI 和 Pages。

第一版仅生成文本 XYZ/报告，不宣称生成 DFSU/DFS2，不执行实际坐标重投影。
分区范围是独立简单闭合多段线；嵌套孔洞和块变换不作自动猜测。
