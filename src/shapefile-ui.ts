import type { ShpResult } from "./core/shapefile";
import { sampleDxf } from "./sample";
export function mountShapefile(root: HTMLElement) {
  root.innerHTML =
    '<div class="page-title"><div><div class="breadcrumb">工作空间 / DXF 转 SHP</div><h1>DXF 转 SHP</h1><p>本地点线面转换 · Shapefile ZIP</p></div><button class="button secondary" id="shp-example">载入 SHP 示例</button></div>' +
    '<section class="input-section"><div class="section-title"><span class="section-step">01</span><h2>CAD 底图</h2><span>ASCII DXF</span></div>' +
    '<div class="file-group"><label class="field-label" for="shp-file">本地 DXF 文件</label><label class="file-drop" id="shp-drop" for="shp-file"><input type="file" id="shp-file" accept=".dxf"/><span class="file-copy"><strong id="shp-filename">选择文件或拖放至此</strong><small>每文件最多 100 MB · 点、直线、普通多段线</small></span><span class="file-action">浏览</span></label></div>' +
    '<div class="settings"><div class="setting-row"><label for="shp-encoding">文本编码</label><select id="shp-encoding"><option value="auto">自动识别 UTF-8 / GBK</option><option value="utf-8">UTF-8</option><option value="gb18030">GBK / GB18030</option></select></div>' +
    '<div class="setting-row"><label for="shp-coordinates">坐标处理</label><select id="shp-coordinates"><option value="original">保留原始坐标（未指定坐标系）</option>' +
    Array.from(
      { length: 21 },
      (_, i) =>
        '<option value="' +
        (i + 25) +
        '">已确认 CGCS2000 ' +
        (i + 25) +
        " 带 · 仅补带号</option>",
    ).join("") +
    "</select></div>" +
    '<div class="setting-row"><label for="shp-closed">闭合多段线</label><select id="shp-closed"><option value="lines">闭合线（适用于一般底图）</option><option value="polygons">独立简单面（不推断孔洞）</option></select></div><div class="setting-row"><label for="shp-prj">源坐标系 WKT（选填）</label><textarea id="shp-prj" rows="3" placeholder="有明确源坐标资料时粘贴 PRJ 内容"></textarea></div></div>' +
    '<p class="tool-note">保留原始坐标时不生成 .prj。仅在测量资料已确认源坐标为所选 CGCS2000 分带时选择补带号；此操作不重投影。输出二维几何，高程范围写入属性。块引用、圆和其他复杂实体列入未导出统计；文字导出定位点及 TEXT 原文属性；需要的块请先在 CAD 中炸开。圆弧多段线、网格及非世界平面对象会报错。</p>' +
    '<div class="error" id="shp-error" role="alert" hidden></div><div class="run-row"><button class="button primary" id="shp-convert" disabled>开始转换</button><button class="button secondary" id="shp-cancel" hidden>取消</button><span id="shp-state" role="status">等待文件</span></div></section>' +
    '<section class="output-section"><div class="section-title"><span class="section-step">02</span><h2>转换结果</h2><span>SHP / SHX / DBF / CPG</span></div><p id="shp-summary">等待转换结果</p><div id="shp-warnings"></div><p class="tool-note">ZIP 按点、线、面拆分，属性含图层名、实体句柄、类型与高程范围。请解压后在 GIS 中核对要素数、坐标与未导出统计。</p><div class="output-row"><button class="button primary" id="shp-download" disabled>下载 SHP 压缩包</button></div></section>';
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector<T>("#" + id)!;
  let file: File | undefined,
    worker: Worker | undefined,
    result: ShpResult | undefined,
    busy = false;
  const value = (id: string) => $<HTMLInputElement>(id).value;
  function clear() {
    result = undefined;
    $<HTMLButtonElement>("shp-download").disabled = true;
    $("shp-error").hidden = true;
    $("shp-summary").textContent = "等待转换结果";
    $("shp-warnings").replaceChildren();
  }
  function state(v: boolean) {
    busy = v;
    root
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLButtonElement
      >("input,select,textarea,#shp-example")
      .forEach((e) => (e.disabled = v));
    document
      .querySelectorAll<HTMLButtonElement>('[role="tab"]')
      .forEach((e) => (e.disabled = v));
    $("shp-cancel").hidden = !v;
    $<HTMLButtonElement>("shp-convert").disabled = v || !file;
  }
  function stop() {
    worker?.terminate();
    worker = undefined;
    state(false);
  }
  function select(next: File) {
    clear();
    file = undefined;
    if (next.size > 100 * 1024 * 1024) {
      $("shp-error").textContent = "文件超过 100 MB，请拆分后重试。";
      $("shp-error").hidden = false;
    } else {
      file = next;
      $("shp-filename").textContent = next.name;
      $("shp-state").textContent = "文件已就绪";
    }
    state(false);
  }
  $("shp-file").addEventListener("change", () => {
    const f = $<HTMLInputElement>("shp-file").files?.[0];
    if (f) select(f);
  });
  $("shp-drop").addEventListener("dragover", (e) => e.preventDefault());
  $("shp-drop").addEventListener("drop", (e) => {
    e.preventDefault();
    if (busy) return;
    const f = (e as DragEvent).dataTransfer?.files[0];
    if (f) select(f);
  });
  $("shp-example").addEventListener("click", () =>
    select(new File([sampleDxf], "sample.dxf")),
  );
  for (const id of ["shp-encoding", "shp-coordinates", "shp-closed", "shp-prj"])
    $(id).addEventListener("change", () => {
      clear();
      $("shp-state").textContent = file ? "文件已就绪" : "等待文件";
    });
  $("shp-prj").addEventListener("input", () => clear());
  $("shp-convert").addEventListener("click", () => {
    if (!file || busy) return;
    clear();
    state(true);
    $("shp-state").textContent = "正在转换…";
    try {
      worker = new Worker(new URL("./shapefile-worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = ({ data }) => {
        stop();
        if (data.error) {
          $("shp-error").textContent = data.error;
          $("shp-error").hidden = false;
          $("shp-state").textContent = "请检查输入";
          return;
        }
        result = data.result;
        const r = result!.report;
        $("shp-summary").textContent =
          "点 " +
          r.counts.points +
          " · 线 " +
          r.counts.lines +
          " · 面 " +
          r.counts.polygons +
          " · 图层 " +
          r.layers.length;
        $("shp-warnings").replaceChildren(
          ...[
            ...r.warnings,
            ...Object.entries(r.skipped).map(
              ([k, n]) => "未导出 " + k + "：" + n,
            ),
          ].map((w) => {
            const p = document.createElement("p");
            p.className = "warning";
            p.textContent = w;
            return p;
          }),
        );
        $("shp-state").textContent = "转换完成";
        $<HTMLButtonElement>("shp-download").disabled = false;
      };
      worker.onerror = () => {
        stop();
        $("shp-error").textContent = "转换 Worker 发生错误，请重试。";
        $("shp-error").hidden = false;
      };
      worker.postMessage({
        file,
        prj: value("shp-prj").trim() || undefined,
        encoding: value("shp-encoding"),
        zone:
          value("shp-coordinates") === "original"
            ? undefined
            : Number(value("shp-coordinates")),
        closedAsLines: value("shp-closed") === "lines",
      });
    } catch (e) {
      stop();
      $("shp-error").textContent = String(e);
      $("shp-error").hidden = false;
    }
  });
  $("shp-cancel").addEventListener("click", () => {
    stop();
    clear();
    $("shp-state").textContent = "已取消";
  });
  $("shp-download").addEventListener("click", () => {
    if (!result) return;
    const a = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob([result.archive], { type: "application/zip" }),
      );
    a.href = url;
    a.download =
      (file?.name.replace(/\.dxf$/i, "") ?? "drawing") + "_shapefile.zip";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
  return { isBusy: () => busy };
}
