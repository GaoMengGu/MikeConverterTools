import {
  createIcons,
  FileInput,
  Map,
  ScanLine,
  ArrowRight,
  Download,
  Upload,
  CodeXml as Github,
  Check,
  X,
  CircleHelp,
  ChevronDown,
  FileText,
  Layers,
  MapPin,
  ShieldCheck,
  RotateCcw,
  LoaderCircle,
  Copy,
  CheckCheck,
  CloudRain,
} from "lucide";
import type { ConversionResult, Mode, Options } from "./core/types";
import type { Job } from "./worker";
import { drawPreview, formatNumber, summarize } from "./preview";
import { sampleDxf, samplePoints, sampleValues } from "./sample";
import { mountRainfall } from "./rainfall-ui";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
const icons = {
  FileInput,
  Map,
  ScanLine,
  ArrowRight,
  Download,
  Upload,
  Github,
  Check,
  X,
  CircleHelp,
  ChevronDown,
  FileText,
  Layers,
  MapPin,
  ShieldCheck,
  RotateCcw,
  LoaderCircle,
  Copy,
  CheckCheck,
  CloudRain,
};
const icon = (name: string) =>
  `<i data-lucide="${name}" aria-hidden="true"></i>`;
const descriptions = {
  boundary: {
    title: "边界转换",
    tag: "DXF → MIKE XYZ",
    sub: "闭合多段线 · 五列边界文件",
  },
  points: {
    title: "地形点转换",
    tag: "TXT / CSV → XYZ",
    sub: "高程散点 · 三列点文件",
  },
  assign: {
    title: "分区赋值",
    tag: "XYZ + DXF + TXT",
    sub: "图层优先级 · 空间参数文件",
  },
};
let mode: Mode = "boundary";
let files: Job["files"] = {};
let result: ConversionResult | undefined;
let worker: Worker | undefined;
let jobId = 0;
let busy = false;
let inspecting = false;
let elapsedTimer: ReturnType<typeof setInterval> | undefined;
let lastMode: Mode = "boundary";
let lastOptions: Options = {};
let lastEncoding = "auto";
const fileNames: Record<string, string> = {
  boundary: "boundary-file",
  points: "points-file",
  areas: "areas-file",
  values: "values-file",
};
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const formatBytes = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="./" aria-label="MikeConverterTools 首页"><img src="./favicon.png" width="32" height="32" alt=""/><span>MikeConverter<span class="brand-light">Tools</span></span></a>
    <div class="header-right"><span class="privacy">${icon("shield-check")} 本地文件处理</span><a class="icon-button" href="https://github.com/GaoMengGu/MikeConverterTools" target="_blank" rel="noopener" title="GitHub 仓库" aria-label="GitHub 仓库">${icon("github")}</a><button class="icon-button" id="help" title="格式与转换规则" aria-label="格式与转换规则">${icon("circle-help")}</button></div>
  </header>
  <div class="workspace">
    <aside class="sidebar">
      <div class="sidebar-label">转换工具 <span>04</span></div>
      <nav role="tablist" aria-label="转换功能">
        <button role="tab" aria-selected="true" data-mode="boundary" class="nav-item active">${icon("scan-line")}<span>边界转换<small>DXF → XYZ</small></span>${icon("arrow-right")}</button>
        <button role="tab" aria-selected="false" data-mode="points" class="nav-item">${icon("map-pin")}<span>地形点转换<small>TXT / CSV → XYZ</small></span>${icon("arrow-right")}</button>
        <button role="tab" aria-selected="false" data-mode="assign" class="nav-item">${icon("layers")}<span>分区赋值<small>区域参数 → XYZ</small></span>${icon("arrow-right")}</button>
        <button role="tab" aria-selected="false" id="rain-tab" class="nav-item">${icon("cloud-rain")}<span>降雨序列<small>DAT / TXT → CSV</small></span>${icon("arrow-right")}</button>
      </nav>
      <div class="side-bottom"><span class="status-dot"></span>浏览器计算<span class="version">v1.0.0</span></div>
    </aside>
    <main id="spatial-main">
      <div class="page-title"><div><div class="breadcrumb">工作空间 <span>/</span> <span id="breadcrumb">边界转换</span></div><h1 id="mode-title">边界转换</h1><p id="mode-subtitle">闭合多段线 · 五列边界文件</p></div><button class="button secondary" id="load-example">${icon("file-input")}<span>载入示例</span></button></div>
      <section class="coordinate-bar" aria-label="坐标设置"><div class="coordinate-label">${icon("map")}<span>目标坐标</span></div><span class="datum">CGCS2000</span><label class="select-label" for="zone">三度分带<select id="zone" aria-label="三度分带">${Array.from({ length: 21 }, (_, i) => `<option value="${i + 25}" ${i + 25 === 37 ? "selected" : ""}>${i + 25} 带</option>`).join("")}</select></label><span class="coordinate-meta" id="zone-meta">中央经线 111°E <span>·</span> EPSG:4525</span><span class="coordinate-note">仅补带号</span></section>
      <div class="editor-grid">
        <section class="input-section" aria-labelledby="input-title"><div class="section-title"><span class="section-step">01</span><h2 id="input-title">输入文件</h2><span id="format-tag">DXF → MIKE XYZ</span></div><div id="file-fields"></div>
          <div class="settings"><div class="settings-title">转换参数</div><div class="setting-row"><label for="encoding">文本编码</label><select id="encoding"><option value="auto">自动识别（UTF-8 / GBK）</option><option value="utf-8">UTF-8</option><option value="gb18030">GBK / GB18030</option></select></div><div id="mode-settings"></div></div>
          <div id="error" class="error" role="alert" hidden></div>
          <div class="run-row"><button class="button primary" id="convert">${icon("arrow-right")}<span>开始转换</span></button><button class="icon-button reset-button" id="reset" title="重置当前输入" aria-label="重置当前输入">${icon("rotate-ccw")}</button><span id="run-state">等待文件</span><button class="button secondary" id="cancel" hidden>${icon("x")}取消</button></div>
          <div id="progress-wrap" hidden><progress id="progress" value="0" max="100"></progress><span id="progress-message"></span></div>
        </section>
        <section class="preview-section" aria-labelledby="preview-title"><div class="section-title"><span class="section-step">02</span><h2 id="preview-title">空间预览</h2><span class="preview-badge" id="preview-badge">未生成</span><button class="icon-button fit" id="fit" title="缩放至全部范围" aria-label="缩放至全部范围">${icon("scan-line")}</button></div><div class="canvas-wrap" id="result-preview"><canvas id="preview-canvas" aria-label="转换结果空间预览"></canvas><div class="empty-preview" id="empty-preview"><div class="empty-icon">${icon("map")}</div><p>等待转换结果</p><span>暂无空间数据</span></div></div><div class="preview-footer"><span class="legend-dot"></span><span id="preview-legend">边界与顶点</span><span id="preview-scale">X / Y · 米</span></div></section>
      </div>
      <section class="output-section" aria-labelledby="output-title"><div class="section-title"><span class="section-step">03</span><h2 id="output-title">转换结果</h2><span id="result-state" class="result-state">待转换</span><span class="output-format">.xyz</span></div><div class="stats"><div><span>输出点数</span><strong id="stat-count">—</strong></div><div><span>X 范围 <small>m</small></span><strong class="range" id="stat-x">—</strong></div><div><span>Y 范围 <small>m</small></span><strong class="range" id="stat-y">—</strong></div><div><span id="z-label">输出行数</span><strong id="stat-extra">—</strong></div></div><div id="result-details" class="result-details" hidden></div><div class="output-row"><div class="output-field"><label for="output-name">输出文件名</label><input id="output-name" value="boundary_mike_boundary_5col_zone37.xyz" spellcheck="false"/></div><button class="button secondary" id="download-report" disabled>${icon("file-text")}<span>下载报告</span></button><button class="button primary" id="download" disabled>${icon("download")}<span>下载 XYZ</span></button></div></section>
      <footer class="footer"><span>${icon("shield-check")} 文件留在当前浏览器，不上传服务器</span><span>MIKE 模型输入文件转换 <span class="footer-dot">·</span> 米制坐标</span></footer>
    </main>
  </div>
  <dialog id="help-dialog"><div class="dialog-head"><h2>格式与转换规则</h2><button class="icon-button" id="close-help" aria-label="关闭说明">${icon("x")}</button></div><div class="dialog-content"><h3>坐标</h3><p>仅为已属于所选三度分带投影的坐标补带号；不执行重投影。无带号 X 加「带号 × 1,000,000」，已有相同带号保留，其他带号报错。Y 与地形 Z 保持不变，单位为米。</p><h3>边界 DXF</h3><p>支持 ASCII R12 POLYLINE 与 LWPOLYLINE。选择闭合普通多段线；不读取块变换、孔洞关系或圆弧凸度。圆弧需在 CAD 离散，输出不保留 Z。可选择轮廓并按最大间距加密。</p><pre>X Y 1 0 0\n…\n起点X 起点Y 0 0 0</pre><h3>地形点</h3><p>自动识别三列 XYZ、四列点号 XYZ、五列点号 XYZ 描述。其他格式请指定列号。过滤仅删除 Z 小于阈值的点；跳过行在报告中列出，须核查。</p><h3>分区赋值</h3><p>TXT 每行「图层名 数值」，从上到下优先；边界上的点计入。未覆盖点使用最后一条有效记录的值。目标图层有开口多段线即停止。第三列将替换为参数值，不再是地形高程，不直接生成 DFSU / DFS2。</p><h3>处理规模</h3><p>每文件最多 100 MB，最多 200 万点。实际容量取决于设备内存。预览最多抽样约 6,000 点，输出保留全部有效点。支持取消，文件和结果不会持久保存。</p><h3>隐私</h3><p>转换使用本地 Web Worker。页面不上传输入文件，不使用外部地图或统计服务。下载的报告含输入文件名、参数与统计信息。</p><a href="https://github.com/GaoMengGu/MikeConverterTools#readme" target="_blank" rel="noopener">项目文档 ↗</a></div></dialog>`;

function refreshIcons() {
  createIcons({ icons });
}
function fileField(
  key: keyof Job["files"],
  title: string,
  accept: string,
  subtitle: string,
) {
  return `<div class="file-group"><label class="field-label" for="${fileNames[key]}">${title}<span>${accept.toUpperCase().replaceAll(".", "")}</span></label><label class="file-drop" data-key="${key}" for="${fileNames[key]}"><input type="file" id="${fileNames[key]}" accept="${accept}"/><span class="file-icon">${icon("upload")}</span><span class="file-copy"><strong>${files[key] ? escape(files[key]!.name) : "选择文件或拖放至此"}</strong><small>${files[key] ? formatBytes(files[key]!.size) : subtitle}</small></span><span class="file-action">${files[key] ? icon("check") : "浏览"}</span></label></div>`;
}
function renderInputs() {
  const desc = descriptions[mode];
  $("#mode-title").textContent = desc.title;
  $("#mode-subtitle").textContent = desc.sub;
  $("#breadcrumb").textContent = desc.title;
  $("#format-tag").textContent = desc.tag;
  $("#file-fields").innerHTML =
    mode === "boundary"
      ? fileField("boundary", "边界文件", ".dxf", "ASCII R12 · 闭合多段线")
      : mode === "points"
        ? fileField(
            "points",
            "地形点文件",
            ".txt,.csv,.xyz",
            "TXT / CSV / XYZ · X Y Z",
          )
        : fileField(
            "points",
            "输入点文件",
            ".xyz,.txt,.csv",
            "XYZ · 待赋值点",
          ) +
          fileField("areas", "分区轮廓", ".dxf", "DXF · 闭合多段线及图层") +
          fileField("values", "图层值表", ".txt,.csv", "TXT · 从上到下优先");
  $("#mode-settings").innerHTML =
    mode === "boundary"
      ? `<div class="setting-row"><label for="boundary-select">边界轮廓</label><select id="boundary-select"><option value="">自动选择（顶点最多）</option></select></div><div class="setting-row"><label for="spacing">最大采样间距 <small>m</small></label><input id="spacing" type="number" min="0.001" step="any" placeholder="保留原顶点"/></div>`
      : `<div class="setting-row"><label for="column-mode">点文件列序</label><select id="column-mode"><option value="auto">自动识别</option><option value="custom">自定义列号</option></select></div><div class="column-fields" id="columns" hidden><label>X 列<input type="number" min="1" value="1" id="column-x"/></label><label>Y 列<input type="number" min="1" value="2" id="column-y"/></label><label>Z 列<input type="number" min="1" value="3" id="column-z"/></label></div>${mode === "points" ? '<div class="setting-row"><label class="checkbox-label"><input type="checkbox" id="filter-enabled"/>过滤低值点</label><div class="number-unit"><span>Z &lt;</span><input id="min-z" type="number" step="any" placeholder="高程阈值" disabled/><span>m</span></div></div>' : '<div class="assignment-rule"><span>优先级</span><strong>TXT 首行最高 · 末行值作默认</strong></div>'}`;
  for (const label of document.querySelectorAll<HTMLElement>(
    "#file-fields .file-drop",
  )) {
    const key = label.dataset.key as keyof Job["files"];
    label.querySelector("input")!.addEventListener("change", (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) selectFile(key, file);
    });
    label.addEventListener("dragover", (event) => {
      event.preventDefault();
      label.classList.add("dragging");
    });
    label.addEventListener("dragleave", () =>
      label.classList.remove("dragging"),
    );
    label.addEventListener("drop", (event) => {
      event.preventDefault();
      label.classList.remove("dragging");
      const file = event.dataTransfer?.files[0];
      if (file) selectFile(key, file);
    });
  }
  if (mode !== "boundary")
    $("#column-mode").addEventListener("change", () => {
      $("#columns").hidden =
        $<HTMLSelectElement>("#column-mode").value !== "custom";
      invalidate();
    });
  if (mode === "points")
    $("#filter-enabled").addEventListener("change", () => {
      $<HTMLInputElement>("#min-z").disabled =
        !$<HTMLInputElement>("#filter-enabled").checked;
      invalidate();
    });
  suggestName();
  refreshIcons();
  updateReady();
  if (mode === "boundary" && files.boundary) inspect();
}
function updateReady() {
  const ready =
    mode === "boundary"
      ? !!files.boundary
      : mode === "points"
        ? !!files.points
        : !!(files.points && files.areas && files.values);
  $<HTMLButtonElement>("#convert").disabled = busy || inspecting || !ready;
  if (!busy)
    $("#run-state").textContent = inspecting
      ? "检查轮廓…"
      : ready
        ? "文件已就绪"
        : "等待文件";
}
function suggestName() {
  const source = mode === "boundary" ? files.boundary : files.points;
  const stem = (
    source?.name ??
    (mode === "boundary"
      ? "boundary"
      : mode === "points"
        ? "terrain"
        : "parameters")
  ).replace(/\.[^.]+$/, "");
  const suffix =
    mode === "boundary"
      ? "_mike_boundary_5col"
      : mode === "assign"
        ? "_dxf_values"
        : "";
  $<HTMLInputElement>("#output-name").value =
    `${stem}${suffix}_zone${$<HTMLSelectElement>("#zone").value}.xyz`;
}
function invalidate() {
  result = undefined;
  $("#result-state").textContent = "待转换";
  $("#result-state").className = "result-state";
  $("#error").hidden = true;
  $<HTMLButtonElement>("#download").disabled = true;
  $<HTMLButtonElement>("#download-report").disabled = true;
  $("#stat-count").textContent = "—";
  $("#stat-x").textContent = "—";
  $("#stat-y").textContent = "—";
  $("#stat-extra").textContent = "—";
  $("#result-details").hidden = true;
  $("#empty-preview").hidden = false;
  $("#preview-badge").textContent = "未生成";
  clearCanvas();
}
function clearCanvas() {
  const canvas = $<HTMLCanvasElement>("#preview-canvas");
  canvas.width = Math.max(1, canvas.clientWidth);
  canvas.height = Math.max(1, canvas.clientHeight);
  canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
}
function selectFile(key: keyof Job["files"], file: File) {
  if (busy) return;
  stopWorker();
  invalidate();
  if (file.size > 100 * 1024 * 1024) {
    delete files[key];
    $<HTMLInputElement>(`#${fileNames[key]}`).value = "";
    const label = document.querySelector<HTMLElement>(
      `.file-drop[data-key="${key}"]`,
    )!;
    label.querySelector("strong")!.textContent = "选择文件或拖放至此";
    label.querySelector("small")!.textContent = "请选择不超过 100 MB 的文件";
    label.querySelector(".file-action")!.textContent = "浏览";
    if (key === "boundary")
      $("#boundary-select").innerHTML =
        '<option value="">自动选择（顶点最多）</option>';
    updateReady();
    showError("文件超过 100 MB，请拆分后重试。");
    return;
  }
  files[key] = file;
  const label = document.querySelector<HTMLElement>(
    `.file-drop[data-key="${key}"]`,
  )!;
  label.querySelector("strong")!.textContent = file.name;
  label.querySelector("small")!.textContent = formatBytes(file.size);
  label.querySelector(".file-action")!.innerHTML = icon("check");
  suggestName();
  refreshIcons();
  updateReady();
  if (key === "boundary") inspect();
}
function stopWorker() {
  worker?.terminate();
  worker = undefined;
  inspecting = false;
  jobId++;
}
function newWorker() {
  stopWorker();
  worker = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  const id = jobId;
  worker.addEventListener("error", () => {
    if (id !== jobId) return;
    finishBusy();
    showError("转换线程异常，请刷新后重试或缩小输入文件。");
    stopWorker();
    updateReady();
  });
  return worker;
}
function inspect() {
  if (!files.boundary) return;
  const current = newWorker();
  inspecting = true;
  updateReady();
  const id = jobId;
  current.onmessage = ({ data }) => {
    if (data.id !== jobId) return;
    if (data.type === "inspection") {
      const select = $<HTMLSelectElement>("#boundary-select");
      select.innerHTML = '<option value="">自动选择（顶点最多）</option>';
      for (const item of data.data) {
        const option = new Option(
          `${item.layer} · ${item.vertices} 顶点 · ${item.closed ? "闭合" : "开口"}${item.curved ? " · 圆弧" : ""}`,
          item.id,
        );
        option.disabled = !item.closed;
        select.add(option);
      }
    } else if (data.type === "error") showError(data.data);
    else return;
    inspecting = false;
    current.terminate();
    if (worker === current) worker = undefined;
    updateReady();
  };
  current.postMessage({
    id,
    type: "inspect",
    mode,
    files: { boundary: files.boundary },
    options: {},
    encoding: $<HTMLSelectElement>("#encoding").value,
  });
}
function showError(message: string) {
  $("#error").textContent = message;
  $("#error").hidden = false;
  $("#run-state").textContent = "请检查输入";
}
function setBusy(value: boolean) {
  busy = value;
  for (const el of document.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLButtonElement
  >(
    '#file-fields input,#mode-settings input,#mode-settings select,#zone,#encoding,[role="tab"],#load-example,#reset',
  ))
    el.disabled = value;
  $("#cancel").hidden = !value;
  $("#progress-wrap").hidden = !value;
  if (!value && mode === "points")
    $<HTMLInputElement>("#min-z").disabled =
      !$<HTMLInputElement>("#filter-enabled").checked;
  updateReady();
}
function finishBusy() {
  if (elapsedTimer) clearInterval(elapsedTimer);
  setBusy(false);
}
function run() {
  try {
    invalidate();
    const options: Options = {
      zone: Number($<HTMLSelectElement>("#zone").value),
      name: (mode === "boundary" ? files.boundary : files.points)?.name,
    };
    if (mode === "boundary") {
      const value = $<HTMLInputElement>("#spacing").value;
      if (value) options.spacing = Number(value);
      options.boundaryId =
        $<HTMLSelectElement>("#boundary-select").value || undefined;
    } else {
      if ($<HTMLSelectElement>("#column-mode").value === "custom")
        options.columns = ["x", "y", "z"].map((v) =>
          Number($<HTMLInputElement>(`#column-${v}`).value),
        ) as [number, number, number];
      if (mode === "points" && $<HTMLInputElement>("#filter-enabled").checked) {
        if (!$<HTMLInputElement>("#min-z").value)
          throw new Error("请输入低值过滤阈值。");
        options.minZ = Number($<HTMLInputElement>("#min-z").value);
      }
    }
    const current = newWorker();
    setBusy(true);
    const started = performance.now();
    elapsedTimer = setInterval(() => {
      $("#run-state").textContent =
        `正在处理 · ${((performance.now() - started) / 1000).toFixed(1)} s`;
    }, 200);
    const id = jobId;
    lastMode = mode;
    lastOptions = structuredClone(options);
    lastEncoding = $<HTMLSelectElement>("#encoding").value;
    current.onmessage = ({ data }) => {
      if (data.id !== jobId) return;
      if (data.type === "progress") {
        $<HTMLProgressElement>("#progress").value = data.data.percent;
        $("#progress-message").textContent = data.data.message;
      } else if (data.type === "result") {
        finishBusy();
        result = data.data;
        renderResult();
        current.terminate();
        worker = undefined;
      } else if (data.type === "error") {
        finishBusy();
        showError(data.data);
        current.terminate();
        worker = undefined;
      }
    };
    current.postMessage({
      id,
      type: "convert",
      mode,
      files,
      options,
      encoding: $<HTMLSelectElement>("#encoding").value as Job["encoding"],
    } satisfies Job);
  } catch (error) {
    finishBusy();
    showError(error instanceof Error ? error.message : String(error));
  }
}
function renderResult() {
  if (!result) return;
  const s = result.stats;
  $("#result-state").innerHTML = `${icon("check-check")}转换完成`;
  $("#result-state").className = "result-state complete";
  $("#stat-count").textContent = formatNumber(s.points);
  $("#stat-x").textContent =
    `${formatNumber(s.xMin)} — ${formatNumber(s.xMax)}`;
  $("#stat-y").textContent =
    `${formatNumber(s.yMin)} — ${formatNumber(s.yMax)}`;
  $("#z-label").textContent =
    mode === "boundary"
      ? "输出行数"
      : mode === "assign"
        ? "参数值范围"
        : "高程范围 · m";
  $("#stat-extra").textContent =
    mode === "boundary"
      ? formatNumber(s.rows!)
      : `${formatNumber(s.zMin!)} — ${formatNumber(s.zMax!)}`;
  $<HTMLInputElement>("#output-name").value = result.filename;
  $<HTMLButtonElement>("#download").disabled = false;
  $<HTMLButtonElement>("#download-report").disabled = false;
  $("#empty-preview").hidden = true;
  $("#preview-badge").textContent = result.preview.sampled
    ? "抽样预览"
    : "已生成";
  $("#preview-legend").textContent =
    mode === "boundary"
      ? `${s.layer} · ${s.points} 顶点`
      : mode === "points"
        ? "高程散点"
        : `分区参数 · ${Object.keys(s.hits ?? {}).length} 图层`;
  $("#run-state").textContent = "转换完成";
  const details = [
    `${summarize(result)} · 输入 ${s.input.toLocaleString()} 点 · 跳过 ${s.skipped} 行 · 过滤 ${s.filtered} 点`,
  ];
  if (mode === "assign")
    details.push(
      `多边形命中 ${s.matched} 点 · 默认赋值 ${s.unmatched} 点（${s.defaultValue}）`,
    );
  const hitEntries = Object.entries(s.hits ?? {});
  if (hitEntries.length)
    details.push(
      hitEntries.map(([key, value]) => `${escape(key)}：${value}`).join("　"),
    );
  $("#result-details").innerHTML =
    details.map((text) => `<p>${text}</p>`).join("") +
    result.warnings
      .map((text) => `<p class="warning">${escape(text)}</p>`)
      .join("");
  $("#result-details").hidden = false;
  drawPreview($<HTMLCanvasElement>("#preview-canvas"), result.preview, mode);
  refreshIcons();
}
function download(
  content: string,
  name: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
$("#convert").addEventListener("click", run);
$("#download").addEventListener("click", () => {
  if (!result) return;
  const name = $<HTMLInputElement>("#output-name")
    .value.trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
  if (!name) {
    showError("请输入输出文件名。");
    return;
  }
  download(result.content, name.endsWith(".xyz") ? name : `${name}.xyz`);
});
$("#download-report").addEventListener("click", () => {
  if (!result) return;
  const { content, preview, ...report } = result;
  download(
    JSON.stringify(
      {
        tool: "MikeConverterTools",
        version: "1.0.0",
        createdAt: new Date().toISOString(),
        mode: lastMode,
        options: lastOptions,
        encoding: lastEncoding,
        inputs: Object.fromEntries(
          Object.entries(files).map(([key, file]) => [
            key,
            { name: file.name, bytes: file.size },
          ]),
        ),
        ...report,
      },
      null,
      2,
    ),
    result.filename.replace(/\.xyz$/, ".report.json"),
    "application/json",
  );
});
$("#cancel").addEventListener("click", () => {
  stopWorker();
  finishBusy();
  invalidate();
  $("#run-state").textContent = "已取消";
});
$("#reset").addEventListener("click", () => {
  stopWorker();
  files = {};
  invalidate();
  renderInputs();
});
$("#zone").addEventListener("change", () => {
  const zone = Number($<HTMLSelectElement>("#zone").value);
  $("#zone-meta").textContent = `中央经线 ${zone * 3}°E · EPSG:${4488 + zone}`;
  invalidate();
  suggestName();
});
$("#encoding").addEventListener("change", () => {
  invalidate();
  if (mode === "boundary" && files.boundary) inspect();
});
$("#mode-settings").addEventListener("input", () => invalidate());
$("#mode-settings").addEventListener("change", () => invalidate());
for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-mode]"))
  tab.addEventListener("click", () => {
    if (busy || rain.isBusy()) return;
    rainMain.hidden = true;
    $("#spatial-main").hidden = false;
    stopWorker();
    mode = tab.dataset.mode as Mode;
    for (const item of document.querySelectorAll('[role="tab"]')) {
      const active = item === tab;
      item.setAttribute("aria-selected", String(active));
      item.classList.toggle("active", active);
    }
    invalidate();
    renderInputs();
  });
$("#load-example").addEventListener("click", () => {
  stopWorker();
  files =
    mode === "boundary"
      ? {
          boundary: new File([sampleDxf], "sample_boundary.dxf", {
            type: "text/plain",
          }),
        }
      : mode === "points"
        ? {
            points: new File([samplePoints], "sample_terrain.txt", {
              type: "text/plain",
            }),
          }
        : {
            points: new File([samplePoints], "sample_centers.xyz"),
            areas: new File([sampleDxf], "sample_zones.dxf"),
            values: new File([sampleValues], "sample_values.txt"),
          };
  invalidate();
  renderInputs();
});
$("#fit").addEventListener("click", () => {
  if (result)
    drawPreview(
      $<HTMLCanvasElement>("#preview-canvas"),
      result.preview,
      lastMode,
    );
});
const dialog = $<HTMLDialogElement>("#help-dialog");
$("#help").addEventListener("click", () => dialog.showModal());
$("#close-help").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
new ResizeObserver(() => {
  if (result)
    drawPreview(
      $<HTMLCanvasElement>("#preview-canvas"),
      result.preview,
      lastMode,
    );
  else clearCanvas();
}).observe($("#result-preview"));
renderInputs();
const rainMain = document.createElement("main");
rainMain.id = "rain-main";
rainMain.hidden = true;
$(".workspace").append(rainMain);
const rain = mountRainfall(rainMain);
$("#rain-tab").addEventListener("click", () => {
  if (busy || rain.isBusy()) return;
  stopWorker();
  $("#spatial-main").hidden = true;
  rainMain.hidden = false;
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    const active = tab.id === "rain-tab";
    tab.setAttribute("aria-selected", String(active));
    tab.classList.toggle("active", active);
  }
  rain.redraw();
});
refreshIcons();
