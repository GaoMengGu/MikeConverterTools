import {
  createIcons,
  FileInput,
  Upload,
  ArrowRight,
  Download,
  FileText,
  X,
  RotateCcw,
} from "lucide";
import {
  localMidnight,
  type RainOptions,
  type RainResult,
} from "./core/rainfall";
import type { RainJob } from "./rainfall-worker";
import { drawRainfallChart, rainfallChartPng } from "./rainfall-chart";
import { formulaTemplates, type ChicagoParameters } from "./core/chicago";

import {
  cityFormulas,
  resolveCityFormula,
  type CityFormula,
} from "./core/city-formulas";

const sample = "时间(hh:mm) 雨强(mm/h)\n00:00 0\n00:01 60\n00:02 0\n";
const icons = {
  FileInput,
  Upload,
  ArrowRight,
  Download,
  FileText,
  X,
  RotateCcw,
};
const icon = (name: string) =>
  `<i data-lucide="${name}" aria-hidden="true"></i>`;

export function mountRainfall(root: HTMLElement) {
  root.innerHTML = `
    <div class="page-title"><div><div class="breadcrumb">工作空间 <span>/</span> 降雨序列</div><h1>降雨序列</h1><p>雨强与时间 · MIKE ASCII 时间序列</p></div><button class="button secondary" id="rain-example">${icon("file-input")}<span>载入示例</span></button></div>
    <div class="editor-grid">
      <section class="input-section"><div class="section-title"><span class="section-step">01</span><h2>输入文件</h2><span>DAT / TXT / CSV</span></div>
        <div class="file-group"><label class="field-label" for="rain-file">降雨文件 <span>DAT / TXT / CSV</span></label><label class="file-drop" id="rain-drop" for="rain-file"><input id="rain-file" type="file" accept=".dat,.txt,.csv"/><span class="file-icon">${icon("upload")}</span><span class="file-copy"><strong id="rain-file-name">选择文件或拖放至此</strong><small id="rain-file-size">时间、雨强两列，或单列雨强</small></span><span class="file-action">浏览</span></label></div>
        <div class="settings"><div class="settings-title">转换参数</div><div id="rain-settings">
          <div class="setting-row"><label for="rain-source">序列来源</label><select id="rain-source"><option value="file">已有降雨文件</option><option value="formula">暴雨公式 · 芝加哥雨型</option></select></div>
          <div id="chicago-settings" hidden>
            <div class="formula-picker">
              <div class="setting-row"><label for="city-search">搜索公式</label><input id="city-search" type="search" placeholder="城市、分区或版本" autocomplete="off" aria-describedby="city-match-count"/></div>
              <div class="setting-row"><label for="city-filter">城市</label><select id="city-filter"><option value="">全部城市</option></select></div>
              <div class="setting-row"><label for="city-formula">分区 / 版本</label><select id="city-formula"><option value="manual">手动填写公式</option></select></div>
              <p id="city-match-count" class="tool-note" role="status"></p>
            </div>
            <div id="city-evidence" class="tool-note" hidden></div>
            <div class="setting-row"><label for="chicago-formula">公式模板</label><select id="chicago-formula">${formulaTemplates.map((f) => `<option value="${f.id}">${f.label}</option>`).join("")}</select></div>
            <div class="setting-row"><label for="chicago-unit">公式输出单位</label><select id="chicago-unit"><option value="mmh">mm/h</option><option value="mmmin">mm/min</option><option value="lsha">L/(s·ha)</option></select></div>
            <fieldset class="formula-editor" id="chicago-equation" aria-label="暴雨强度公式">
              <legend>暴雨强度公式</legend>
              <div class="formula-expression">
                <span class="formula-symbol" id="chicago-symbol">i</span><span>=</span>
                <div class="formula-fraction">
                  <div class="formula-numerator">
                    <input class="formula-coefficient" id="chicago-a" type="number" step="any" placeholder="A" aria-label="系数 A" title="系数 A / Aₚ"/>
                    <span class="formula-period" id="chicago-c-row"><span>(1 +</span><input class="formula-coefficient" id="chicago-c" type="number" step="any" placeholder="C" aria-label="重现期系数 C" title="重现期系数 C"/><span>lg P)</span></span>
                  </div>
                  <div class="formula-denominator"><span class="formula-base"><span>(t +</span><input id="chicago-b" type="number" step="any" placeholder="b" aria-label="历时修正参数 b，分钟" title="历时修正参数 b · min"/><span>)</span></span><sup><input id="chicago-n" type="number" step="any" placeholder="n" aria-label="指数 n" title="指数 n > 0；n > 1 时须满足总历时 T ≤ b/(n−1)"/></sup></div>
                </div>
              </div>
              <div class="formula-units"><span id="chicago-equation-unit">mm/h</span><span>t、b：min · lg：以 10 为底</span></div>
            </fieldset>
            <p id="city-coefficients-note" class="tool-note" hidden></p>
            <div class="chicago-parameters">
            <div class="setting-row" id="chicago-p-row"><label for="chicago-p">重现期 P · 年</label><input id="chicago-p" type="number" step="any" placeholder="填写设计重现期"/></div>
            <div class="setting-row"><label for="chicago-duration">降雨历时 · min</label><input id="chicago-duration" type="number" step="any" placeholder="填写总历时"/></div>
            <div class="setting-row"><label for="chicago-r">雨峰系数 r</label><input id="chicago-r" type="number" step="any" placeholder="0 &lt; r &lt; 1"/></div>
            <div class="setting-row"><label for="chicago-step">采样步长 · s</label><input id="chicago-step" type="number" step="1" placeholder="须能整除总历时"/></div>
            </div>
            <div class="setting-row"><label for="chicago-reference">公式来源 / 版本</label><input id="chicago-reference" type="text" placeholder="选填，可追溯来源"/></div>
            <div class="assignment-rule"><span>数据值类型</span><strong>时段平均 · MeanStepBackward</strong></div>
          </div>
          <div class="setting-row"><label for="rain-encoding">文本编码</label><select id="rain-encoding"><option value="auto">自动识别（UTF-8 / GBK）</option><option value="utf-8">UTF-8</option><option value="gb18030">GBK / GB18030</option></select></div>
          <div class="setting-row"><label for="rain-time-mode">时间格式</label><select id="rain-time-mode"><option value="elapsed">相对时间＋雨强</option><option value="absolute">日期时间＋雨强</option><option value="index">单列雨强＋采样间隔</option></select></div>
          <div class="setting-row" id="rain-elapsed-row"><label for="rain-elapsed-unit">数值时间单位</label><select id="rain-elapsed-unit"><option value="minutes">分钟（HH:mm 始终为时:分）</option><option value="seconds">秒（HH:mm 始终为时:分）</option></select></div>
          <div class="setting-row" id="rain-start-row"><label for="rain-start">起始日期时间</label><input id="rain-start" type="datetime-local" step="1" value="${localMidnight()}"/></div>
          <div class="setting-row" id="rain-interval-row" hidden><label for="rain-interval">采样间隔 · s</label><input id="rain-interval" type="number" min="1" step="1" value="60"/></div>
          <div class="setting-row"><label for="rain-data-row">数据起始行</label><input id="rain-data-row" type="number" min="1" step="1" value="1"/></div>
          <div class="setting-row"><label for="rain-input-unit">输入雨强单位</label><select id="rain-input-unit"><option value="mmh">mm/h</option><option value="ms">m/s</option></select></div>
          <div class="setting-row"><label for="rain-value-type">数据值含义</label><select id="rain-value-type"><option value="instant">瞬时雨强（梯形积分）</option><option value="backward">前一时段平均（后端点）</option><option value="forward">后一时段平均（前端点）</option></select></div>
          <div class="setting-row"><label for="rain-output-unit">输出雨强单位</label><select id="rain-output-unit"><option value="mmh">mm/h</option><option value="ms">m/s</option></select></div>
          <div class="setting-row"><label for="rain-delimiter">输出分隔符</label><select id="rain-delimiter"><option value="comma">CSV · 逗号</option><option value="tab">TXT · Tab 制表符</option></select></div>
        </div></div>
        <div class="error" id="rain-error" role="alert" hidden></div>
        <div class="run-row"><button class="button primary" id="rain-convert">${icon("arrow-right")}<span>开始转换</span></button><button class="icon-button" id="rain-reset" aria-label="重置降雨输入" title="重置降雨输入">${icon("rotate-ccw")}</button><span id="rain-run-state">等待文件</span><button class="button secondary" id="rain-cancel" hidden>${icon("x")}取消</button></div>
      </section>
      <section class="preview-section"><div class="section-title"><span class="section-step">02</span><h2>雨强过程</h2><span class="preview-badge" id="rain-chart-state">未生成</span></div><div class="canvas-wrap rain-chart"><canvas id="rain-canvas" role="img" aria-label="降雨雨强与累计雨量过程图" aria-describedby="rain-chart-description"></canvas><div class="empty-preview" id="rain-empty"><p>等待降雨序列</p><span>暂无时间序列</span></div></div><div class="rain-chart-toolbar"><p id="rain-chart-description">橙色：雨强 · mm/h；蓝色：累计雨量 · mm（右轴向下）</p><button class="button secondary" id="rain-chart-export" disabled>${icon("download")}导出图表 PNG</button></div><pre id="rain-output-preview" class="rain-output-preview" hidden></pre></section>
    </div>
    <section class="output-section"><div class="section-title"><span class="section-step">03</span><h2>转换结果</h2><span class="result-state" id="rain-result-state">待转换</span></div>
      <div class="stats"><div><span>记录数</span><strong id="rain-records">—</strong></div><div><span>总雨量</span><strong id="rain-total">—</strong></div><div><span>最大雨强</span><strong id="rain-peak">—</strong></div><div><span>时间间隔</span><strong id="rain-step">—</strong></div></div>
      <div class="result-details" id="rain-details" hidden><p id="rain-time-range"></p><p id="rain-peak-time"></p><div id="rain-warnings"></div></div>
      <div class="output-row"><div class="output-field"><label for="rain-output-name">输出文件名</label><input id="rain-output-name" value="rainfall_mmh.csv" spellcheck="false"/></div><button class="button secondary" id="rain-report" disabled>${icon("file-text")}下载报告</button><button class="button primary" id="rain-download" disabled>${icon("download")}下载降雨文件</button></div>
    </section>
    <section class="rain-import"><div class="section-title"><h2>MIKE 导入设置</h2><a href="https://github.com/GaoMengGu/MikeConverterTools/blob/main/docs/rainfall.md" target="_blank" rel="noopener">格式说明 ↗</a></div><div id="rain-import-settings"><p>等待转换结果</p></div><button class="button secondary" id="rain-guide" disabled>${icon("file-text")}下载导入说明</button></section>`;
  createIcons({ icons, root });
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>(`#${id}`)!;
  const citySelect = $<HTMLSelectElement>("city-filter");
  function durationLabel(f: CityFormula) {
    if (!f.duration) return "历时范围未明确";
    const [min, max] = f.duration;
    return `${min === null ? "" : `${min} ${f.durationMinExclusive ? "<" : "≤"} `}t${max === null ? "" : ` ${f.durationMaxExclusive ? "<" : "≤"} ${max}`} min${min === null || max === null ? "（另一边界未明确）" : ""}`;
  }
  function periodLabel(f: CityFormula) {
    if (!f.periods.length) return "P范围未明确";
    return f.discrete
      ? `P = ${f.periods.join("、")} 年`
      : `${f.periods[0]} ${f.periodMinExclusive ? "<" : "≤"} P ≤ ${f.periods[1]} 年`;
  }
  for (const city of [...new Set(cityFormulas.map((f) => f.city))].sort(
    (a, b) => a.localeCompare(b, "zh-CN"),
  ))
    citySelect.add(new Option(city, city));
  function populateFormulaOptions() {
    const query = $<HTMLInputElement>("city-search")
      .value.trim()
      .toLocaleLowerCase();
    const city = citySelect.value;
    const entries = cityFormulas.filter(
      (f) =>
        (!city || f.city === city) &&
        `${f.city} ${f.label} ${f.scope} ${f.source.version}`
          .toLocaleLowerCase()
          .includes(query),
    );
    const select = $<HTMLSelectElement>("city-formula");
    const current = select.value;
    select.replaceChildren(new Option("手动填写公式", "manual"));
    for (const f of entries) {
      select.add(
        new Option(
          `${f.city} · ${f.label} · ${periodLabel(f)} · ${durationLabel(f)} · ${f.source.version}`,
          f.id,
        ),
      );
    }
    select.value = entries.some((f) => f.id === current) ? current : "manual";
    $("city-match-count").textContent =
      `${entries.length} 个公式条目${entries.length ? " · 可选择分区与版本" : " · 请调整搜索词或城市"}`;
  }
  populateFormulaOptions();
  let file: File | undefined,
    result: RainResult | undefined,
    worker: Worker | undefined,
    busy = false;
  let lastOptions: RainOptions = {},
    lastEncoding = "auto";
  let lastChicago: ChicagoParameters | undefined;
  const number = (v: number) =>
    v.toLocaleString("en-US", { maximumFractionDigits: 6 });
  const value = (id: string) => $<HTMLInputElement>(id).value;
  const text = (id: string, value: string) => {
    $(id).textContent = value;
  };
  function ready() {
    $<HTMLButtonElement>("rain-convert").disabled =
      busy || (value("rain-source") !== "formula" && !file);
  }
  function clear() {
    result = undefined;
    for (const id of [
      "rain-download",
      "rain-report",
      "rain-guide",
      "rain-chart-export",
    ])
      $<HTMLButtonElement>(id).disabled = true;
    for (const id of ["rain-records", "rain-total", "rain-peak", "rain-step"])
      text(id, "—");
    for (const id of ["rain-error", "rain-details", "rain-output-preview"])
      $(id).hidden = true;
    text("rain-result-state", "待转换");
    text("rain-chart-state", "未生成");
    text("rain-import-settings", "等待转换结果");
    $("rain-empty").hidden = false;
    const canvas = $<HTMLCanvasElement>("rain-canvas");
    canvas.width = Math.max(1, canvas.clientWidth);
    text(
      "rain-run-state",
      value("rain-source") === "formula"
        ? "等待公式参数"
        : file
          ? "文件已就绪"
          : "等待文件",
    );
  }
  function error(message: string) {
    text("rain-error", message);
    $("rain-error").hidden = false;
    text("rain-run-state", "请检查输入");
  }
  function setBusy(state: boolean) {
    busy = state;
    for (const el of root.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >(
      "#rain-settings input,#rain-settings select,#rain-settings button,#rain-file,#rain-example,#rain-reset",
    ))
      el.disabled = state;
    for (const el of document.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    ))
      el.disabled = state;
    $("rain-cancel").hidden = !state;
    presetLocks();
    ready();
  }
  function stop() {
    worker?.terminate();
    worker = undefined;
    setBusy(false);
  }
  function selectFile(next: File) {
    if (busy) return;
    file = undefined;
    clear();
    if (next.size > 100 * 1024 * 1024) {
      $<HTMLInputElement>("rain-file").value = "";
      text("rain-file-name", "选择文件或拖放至此");
      text("rain-file-size", "请选择不超过 100 MB 的文件");
      ready();
      error("文件超过 100 MB，请拆分后重试。");
      return;
    }
    file = next;
    text("rain-file-name", next.name);
    text("rain-file-size", `${number(next.size / 1024)} KB`);
    text("rain-run-state", "文件已就绪");
    ready();
  }
  function options(): RainOptions {
    return {
      name: file?.name,
      timeMode: value("rain-time-mode") as RainOptions["timeMode"],
      elapsedUnit: value("rain-elapsed-unit") as RainOptions["elapsedUnit"],
      start: value("rain-start"),
      intervalSeconds: Number(value("rain-interval")),
      startRow: Number(value("rain-data-row")),
      inputUnit: value("rain-input-unit") as RainOptions["inputUnit"],
      outputUnit: value("rain-output-unit") as RainOptions["outputUnit"],
      valueType: value("rain-value-type") as RainOptions["valueType"],
      delimiter: value("rain-delimiter") as RainOptions["delimiter"],
    };
  }
  function preset() {
    return cityFormulas.find((f) => f.id === value("city-formula"));
  }
  function presetLocks() {
    const active = !!preset();
    for (const id of [
      "chicago-a",
      "chicago-b",
      "chicago-c",
      "chicago-n",
      "chicago-unit",
      "chicago-formula",
      "chicago-reference",
    ])
      $<HTMLInputElement>(id).disabled = busy || active;
  }
  function syncPreset() {
    const f = preset();
    $("city-evidence").hidden = !f;
    $("city-coefficients-note").hidden = !f;
    if (!f) {
      $<HTMLInputElement>("chicago-reference").value = "";
      presetLocks();
      return;
    }
    $("city-evidence").replaceChildren();
    const add = (s: string) => {
      const p = document.createElement("p");
      p.textContent = s;
      $("city-evidence").append(p);
    };
    add(
      f.city +
        " · " +
        f.label +
        " | " +
        f.source.version +
        " | 发布 " +
        f.source.published +
        " | 资料核对 " +
        f.source.checked,
    );

    add("适用地域：" + f.scope);
    add("来源：" + f.source.title + "；原文位置：" + f.source.location);
    add("收录范围：" + durationLabel(f) + "；" + periodLabel(f));
    add(f.note);
    for (const [label, url] of [
      ["来源原文", f.source.url],
      ["来源附件", f.source.attachment],
    ])
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.textContent = label + " ↗ ";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        $("city-evidence").append(a);
      }
    const period = Number(value("chicago-p"));
    const validPeriod = f.discrete
      ? f.periods.includes(period)
      : Number.isFinite(period) &&
        period > 0 &&
        (!f.periods.length ||
          (period >= f.periods[0] && period <= f.periods[1])) &&
        !(f.periodMinExclusive && period === f.periods[0]);
    const previewPeriod = validPeriod
      ? period
      : (f.periods[0] ?? 10) + (f.periodMinExclusive ? 1 : 0);
    const previewDuration =
      f.calculationRule === "海口总公式II" && previewPeriod <= 10
        ? 181
        : f.duration?.[0] != null
          ? f.duration[0] + (f.durationMinExclusive ? 1 / 60 : 0)
          : Math.min(
              60,
              (f.duration?.[1] ?? 60) - (f.durationMaxExclusive ? 1 / 60 : 0),
            );
    const p = resolveCityFormula(f.id, previewPeriod, previewDuration);
    $("city-coefficients-note").textContent =
      f.discrete && !validPeriod
        ? "请填写目录中列出的重现期后显示系数。"
        : `当前系数按 P = ${previewPeriod} 年${validPeriod ? "" : "预览，请填写设计重现期"}${f.calculationRule ? `；已应用${f.calculationRule}修正` : ""}。`;
    for (const [id, v] of Object.entries({
      a: p.a,
      b: p.b,
      c: p.c ?? "",
      n: p.n,
      unit: p.unit,
      formula: p.formula,
      reference: p.source ?? "",
    }))
      $<HTMLInputElement>("chicago-" + id).value = String(v);
    if (f.discrete && !validPeriod)
      for (const id of ["a", "b", "n"])
        $<HTMLInputElement>("chicago-" + id).value = "";
    presetLocks();
  }
  function settingsVisibility() {
    const formula = value("rain-source") === "formula";
    $("chicago-settings").hidden = !formula;
    $("rain-file").closest<HTMLElement>(".file-group")!.hidden = formula;
    for (const id of [
      "rain-encoding",
      "rain-time-mode",
      "rain-data-row",
      "rain-input-unit",
      "rain-value-type",
    ])
      $(id).closest<HTMLElement>(".setting-row")!.hidden = formula;
    $("chicago-c-row").hidden = value("chicago-formula") === "direct";
    $("chicago-p-row").hidden =
      value("chicago-formula") === "direct" && !preset();
    text("chicago-symbol", value("chicago-unit") === "lsha" ? "q" : "i");
    text(
      "chicago-equation-unit",
      { mmh: "mm/h", mmmin: "mm/min", lsha: "L/(s·ha)" }[
        value("chicago-unit")
      ]!,
    );
    $<HTMLInputElement>("chicago-a").placeholder =
      value("chicago-formula") === "direct" ? "Aₚ" : "A";
    $("rain-elapsed-row").hidden = value("rain-time-mode") !== "elapsed";
    $("rain-start-row").hidden = value("rain-time-mode") === "absolute";
    $("rain-interval-row").hidden = value("rain-time-mode") !== "index";
    if (formula) {
      $("rain-elapsed-row").hidden = true;
      $("rain-interval-row").hidden = true;
      $("rain-start-row").hidden = false;
    }
    ready();
  }
  function show() {
    if (!result) return;
    const s = result.stats;
    text("rain-result-state", "转换完成");
    text("rain-chart-state", "已生成");
    text("rain-run-state", "转换完成");
    text("rain-records", number(s.records));
    text("rain-total", `${number(s.totalMM)} mm`);
    text("rain-peak", `${number(s.peakMMH)} mm/h`);
    text(
      "rain-step",
      s.stepSeconds === null ? "非等间隔" : `${number(s.stepSeconds)} s`,
    );
    text(
      "rain-time-range",
      `${s.start} 至 ${s.end} · ${number(s.durationSeconds / 60)} min · ${s.records - 1} 个区间`,
    );
    text(
      "rain-peak-time",
      `峰值时刻 ${s.peakTime} · 总雨量按所选数据值含义积分`,
    );
    if (result.generation)
      text(
        "rain-peak-time",
        `公式雨峰 ${number(result.generation.peakSeconds / 60)} min · 采样峰值时刻 ${s.peakTime} · 理论总雨量 ${number(result.generation.theoreticalTotalMM)} mm · 差值 ${result.generation.differenceMM.toExponential(2)} mm`,
      );
    $("rain-warnings").replaceChildren(
      ...result.warnings.map((w) => {
        const p = document.createElement("p");
        p.className = "warning";
        p.textContent = w;
        return p;
      }),
    );
    $("rain-details").hidden = false;
    $("rain-empty").hidden = true;
    $<HTMLInputElement>("rain-output-name").value = result.filename;
    text(
      "rain-output-preview",
      result.content.split("\n").slice(0, 6).join("\n"),
    );
    $("rain-output-preview").hidden = false;
    const guide = document.createElement("pre");
    guide.textContent = result.guide;
    $("rain-import-settings").replaceChildren(guide);
    for (const id of [
      "rain-download",
      "rain-report",
      "rain-guide",
      "rain-chart-export",
    ])
      $<HTMLButtonElement>(id).disabled = false;
    draw();
  }
  function draw() {
    if (!result || root.hidden) return;
    const canvas = $<HTMLCanvasElement>("rain-canvas");
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    drawRainfallChart(
      canvas,
      result,
      lastOptions,
      rect.width,
      rect.height,
      Math.min(devicePixelRatio || 1, 2),
    );
  }
  function download(
    content: string | Blob,
    name: string,
    type = "text/plain;charset=utf-8",
  ) {
    const url = URL.createObjectURL(
        content instanceof Blob ? content : new Blob([content], { type }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function runWorker(job: RainJob) {
    const current = new Worker(
      new URL("./rainfall-worker.ts", import.meta.url),
      { type: "module" },
    );
    worker = current;
    current.onmessage = ({ data }) => {
      if (worker !== current) return;
      stop();
      if (data.type === "result") {
        result = data.data;
        show();
      } else error(data.data);
    };
    current.onerror = () => {
      if (worker !== current) return;
      stop();
      error("降雨转换线程异常，请重试或缩小文件。");
    };
    current.postMessage(job);
  }
  $("rain-settings").addEventListener("input", (e) => {
    if (["city-search", "city-filter"].includes((e.target as HTMLElement).id))
      populateFormulaOptions();
    clear();
    if (
      ["city-formula", "chicago-p", "city-search", "city-filter"].includes(
        (e.target as HTMLElement).id,
      )
    )
      syncPreset();
    settingsVisibility();
  });
  $("rain-settings").addEventListener("change", (e) => {
    if (["city-search", "city-filter"].includes((e.target as HTMLElement).id))
      populateFormulaOptions();
    clear();
    if (
      ["city-formula", "chicago-p", "city-search", "city-filter"].includes(
        (e.target as HTMLElement).id,
      )
    )
      syncPreset();
    settingsVisibility();
  });
  $("rain-file").addEventListener("change", () => {
    const next = $<HTMLInputElement>("rain-file").files?.[0];
    if (next) selectFile(next);
  });
  $("rain-drop").addEventListener("dragover", (e) => e.preventDefault());
  $("rain-drop").addEventListener("drop", (e) => {
    e.preventDefault();
    const next = (e as DragEvent).dataTransfer?.files[0];
    if (next) selectFile(next);
  });
  $("rain-convert").addEventListener("click", () => {
    const formula = value("rain-source") === "formula";
    if ((!formula && !file) || busy) return;
    clear();
    lastOptions = options();
    lastChicago = undefined;
    lastEncoding = value("rain-encoding");
    setBusy(true);
    text("rain-run-state", "正在转换…");
    try {
      if (formula) {
        const required = (id: string) => {
          if (!value(id).trim())
            throw new Error(
              `请填写${$(id).getAttribute("aria-label") ?? $(id).closest(".setting-row")!.querySelector("label")!.textContent}。`,
            );
          return Number(value(id));
        };
        const selected = preset();
        if (selected)
          resolveCityFormula(
            selected.id,
            required("chicago-p"),
            required("chicago-duration"),
          );
        const full = value("chicago-formula") === "return-period";
        lastChicago = {
          formula: value("chicago-formula") as ChicagoParameters["formula"],
          a: required("chicago-a"),
          c: full ? required("chicago-c") : undefined,
          b: required("chicago-b"),
          n: required("chicago-n"),
          returnPeriod: full ? required("chicago-p") : undefined,
          unit: value("chicago-unit") as ChicagoParameters["unit"],
          durationMinutes: required("chicago-duration"),
          peakRatio: required("chicago-r"),
          stepSeconds: required("chicago-step"),
          source: value("chicago-reference"),
        };
        lastOptions = {
          ...lastOptions,
          name: "chicago_rainfall",
          valueType: "backward",
          timeMode: "index",
          inputUnit: "mmh",
          intervalSeconds: lastChicago.stepSeconds,
          startRow: 1,
        };
      }
      runWorker({
        cityFormulaId: preset()?.id,
        cityReturnPeriod: preset() ? Number(value("chicago-p")) : undefined,
        file,
        chicago: lastChicago,
        options: lastOptions,
        encoding: lastEncoding,
      } as RainJob);
    } catch (e) {
      stop();
      error((e as Error).message);
    }
  });
  $("rain-cancel").addEventListener("click", () => {
    stop();
    clear();
    text("rain-run-state", "已取消");
  });
  $("rain-example").addEventListener("click", () => {
    $<HTMLSelectElement>("rain-source").value = "file";
    $<HTMLSelectElement>("rain-input-unit").value = "mmh";
    $<HTMLSelectElement>("rain-value-type").value = "instant";
    $<HTMLSelectElement>("rain-encoding").value = "auto";
    $<HTMLSelectElement>("rain-time-mode").value = "elapsed";
    $<HTMLInputElement>("rain-data-row").value = "1";
    $<HTMLInputElement>("rain-file").value = "";
    settingsVisibility();
    selectFile(
      new File([sample], "sample_rainfall.dat", { type: "text/plain" }),
    );
  });
  $("rain-reset").addEventListener("click", () => {
    file = undefined;
    $<HTMLInputElement>("rain-file").value = "";
    clear();
    text("rain-file-name", "选择文件或拖放至此");
    text("rain-file-size", "时间、雨强两列，或单列雨强");
    ready();
  });
  $("rain-download").addEventListener("click", () => {
    if (!result) return;
    const name = value("rain-output-name")
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
    if (!name) {
      error("请输入输出文件名。");
      return;
    }
    const ext = lastOptions.delimiter === "tab" ? ".txt" : ".csv";
    download(
      result.content,
      name.toLowerCase().endsWith(ext)
        ? name
        : name.replace(/\.[^.]+$/, "") + ext,
    );
  });
  $("rain-guide").addEventListener("click", () => {
    if (result)
      download(
        result.guide,
        result.filename.replace(/\.[^.]+$/, ".mike-import.txt"),
      );
  });
  $("rain-chart-export").addEventListener("click", async () => {
    if (!result) return;
    const snapshot = result;
    const button = $<HTMLButtonElement>("rain-chart-export");
    const name =
      value("rain-output-name")
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .replace(/\.[^.]+$/, "") || "rainfall";
    button.disabled = true;
    try {
      const blob = await rainfallChartPng(snapshot, { ...lastOptions });
      if (result === snapshot) download(blob, name + ".png");
    } catch (e) {
      if (result === snapshot) error((e as Error).message);
    } finally {
      button.disabled = !result;
    }
  });
  $("rain-report").addEventListener("click", () => {
    if (!result) return;
    const { content, preview, guide, ...report } = result;
    download(
      JSON.stringify(
        {
          tool: "MikeConverterTools",
          mode: "rainfall",
          createdAt: new Date().toISOString(),
          options: lastOptions,
          encoding: lastEncoding,
          input: lastChicago
            ? { source: "formula" }
            : { name: file?.name, bytes: file?.size },
          ...report,
        },
        null,
        2,
      ),
      result.filename.replace(/\.[^.]+$/, ".report.json"),
      "application/json",
    );
  });
  new ResizeObserver(draw).observe($("rain-canvas"));
  ready();
  return { isBusy: () => busy, redraw: draw };
}
