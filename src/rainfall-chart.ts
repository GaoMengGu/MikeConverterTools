import type { RainOptions, RainResult } from "./core/rainfall";

const orange = "#dd6b28";
const blue = "#318ba5";
const ink = "#203447";
const muted = "#657989";
const font = 'system-ui, "Microsoft YaHei", sans-serif';

function format(value: number) {
  if (value !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) >= 1e7))
    return value.toExponential(2);
  return value.toLocaleString("en-US", {
    maximumFractionDigits: value < 1 ? 3 : 2,
  });
}

function axisMaximum(value: number) {
  if (value <= 0) return 1;
  const target = value * 1.2;
  const power = 10 ** Math.floor(Math.log10(target));
  return Math.ceil(target / power / 0.5) * 0.5 * power;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let output = text;
  while (output.length && ctx.measureText(output + "…").width > max)
    output = output.slice(0, -1);
  return output + "…";
}

/** Shared renderer for the responsive preview and the standalone PNG. No data smoothing. */
export function drawRainfallChart(
  canvas: HTMLCanvasElement,
  result: RainResult,
  options: RainOptions,
  width: number,
  height: number,
  pixelRatio = 1,
) {
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(pixelRatio, pixelRatio);
  const compact = width < 520;
  const large = width >= 900;
  const margin = compact ? 16 : large ? 44 : 24;
  const textSize = large ? 14 : compact ? 10 : 11;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = blue;
  ctx.fillRect(margin, 22, 24, 3);
  ctx.font = `600 ${textSize - 1}px ${font}`;
  ctx.fillStyle = muted;
  ctx.fillText("RAINFALL  /  HYETOGRAPH", margin + 34, 27);
  ctx.fillStyle = ink;
  ctx.font = `650 ${large ? 28 : compact ? 18 : 21}px ${font}`;
  const catalogue = result.generation?.catalogue;
  const title = catalogue
    ? `${catalogue.city} · ${catalogue.region} 暴雨过程线`
    : result.generation
      ? "设计暴雨过程线"
      : "降雨雨强过程线";
  ctx.fillText(fitText(ctx, title, width - margin * 2), margin, 59);
  ctx.font = `${textSize}px ${font}`;
  ctx.fillStyle = muted;
  ctx.fillText(
    result.generation
      ? "芝加哥雨型 · 时段平均雨强"
      : "实测 / 导入序列 · 按数据值含义绘制",
    margin,
    81,
  );

  const params = result.generation?.parameters;
  const duration = result.stats.durationSeconds;
  const average = result.stats.totalMM / (duration / 3600);
  const metrics = [
    [
      "重现期 P",
      params?.returnPeriod
        ? `${format(Number(params.returnPeriod))} 年`
        : "未指定",
    ],
    ["降雨历时", `${format(duration / 60)} min`],
    ["雨峰系数 r", params?.peakRatio ? format(Number(params.peakRatio)) : "—"],
    ["降雨总量", `${format(result.stats.totalMM)} mm`],
    ["峰值雨强", `${format(result.stats.peakMMH)} mm/h`],
    ["平均雨强", `${format(average)} mm/h`],
  ];
  const columns = compact ? 2 : 3;
  const cellWidth = (width - margin * 2) / columns;
  const cellHeight = large ? 63 : 52;
  metrics.forEach(([label, value], i) => {
    const xx = margin + (i % columns) * cellWidth;
    const yy = 99 + Math.floor(i / columns) * cellHeight;
    ctx.fillStyle = "#f4f8fa";
    ctx.fillRect(xx, yy, cellWidth - 5, cellHeight - 5);
    ctx.fillStyle = muted;
    ctx.font = `${textSize}px ${font}`;
    ctx.fillText(label, xx + 10, yy + (large ? 22 : 18));
    ctx.fillStyle = i === 4 ? orange : ink;
    ctx.font = `600 ${large ? 21 : compact ? 13 : 15}px ${font}`;
    ctx.fillText(
      fitText(ctx, value, cellWidth - 22),
      xx + 10,
      yy + cellHeight - 16,
    );
  });
  const headerEnd = 99 + Math.ceil(metrics.length / columns) * cellHeight;
  const top = headerEnd + (large ? 63 : 52);
  const bottom = height - (compact ? 88 : large ? 116 : 93);
  const left = margin + (large ? 58 : 40);
  const right = width - margin - (large ? 58 : 40);
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  if (plotWidth <= 0 || plotHeight <= 0) return;
  const maxRate = axisMaximum(result.stats.peakMMH);
  // Leave room for the intensity peak, as in an inverted cumulative-rainfall plot.
  const maxDepth = axisMaximum(result.stats.totalMM * 2.2);
  const x = (seconds: number) => left + (seconds / duration) * plotWidth;
  const y = (rate: number) => bottom - (rate / maxRate) * plotHeight;
  const depthY = (depth: number) => top + (depth / maxDepth) * plotHeight;

  ctx.font = `500 ${textSize}px ${font}`;
  ctx.fillStyle = orange;
  ctx.fillRect(left, headerEnd + 19, 17, 3);
  ctx.fillText("雨强", left + 23, headerEnd + 24);
  ctx.fillStyle = blue;
  ctx.fillRect(left + 75, headerEnd + 16, 10, 10);
  ctx.fillText(
    compact ? "累计雨量 ↓" : "累计雨量（右轴向下）",
    left + 91,
    headerEnd + 24,
  );

  const ticks = compact ? 4 : 5;
  ctx.font = `${textSize}px ${font}`;
  for (let i = 0; i <= ticks; i++) {
    const yy = bottom - (i / ticks) * plotHeight;
    if (i < ticks && i % 2 === 0) {
      ctx.fillStyle = "#f9fbfc";
      ctx.fillRect(
        left,
        yy - plotHeight / ticks,
        plotWidth,
        plotHeight / ticks,
      );
    }
    ctx.strokeStyle = "#dfe8ee";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(right, yy);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.textAlign = "right";
    ctx.fillText(format((maxRate * i) / ticks), left - 8, yy + 4);
    ctx.fillStyle = blue;
    ctx.textAlign = "left";
    ctx.fillText(format((maxDepth * (ticks - i)) / ticks), right + 8, yy + 4);
    const xx = left + (i / ticks) * plotWidth;
    ctx.strokeStyle = "#e8eef2";
    ctx.beginPath();
    ctx.moveTo(xx, top);
    ctx.lineTo(xx, bottom);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = muted;
    ctx.fillText(format(((duration / 60) * i) / ticks), xx, bottom + 22);
  }
  ctx.setLineDash([]);
  ctx.textAlign = "left";
  ctx.fillStyle = orange;
  ctx.fillText("mm/h", left, top - 12);
  ctx.textAlign = "right";
  ctx.fillStyle = blue;
  ctx.fillText("mm", right, top - 12);
  ctx.textAlign = "center";
  ctx.fillStyle = muted;
  ctx.fillText("降雨历时（min）", (left + right) / 2, bottom + 44);
  ctx.strokeStyle = "#9eafbd";
  ctx.lineWidth = 1;
  ctx.strokeRect(left, top, plotWidth, plotHeight);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, plotWidth, plotHeight);
  ctx.clip();
  const cumulative = new Path2D();
  cumulative.moveTo(left, top);
  result.preview.forEach((p) =>
    cumulative.lineTo(x(p.seconds), depthY(p.cumulativeMM)),
  );
  cumulative.lineTo(right, top);
  cumulative.closePath();
  const depthFill = ctx.createLinearGradient(
    0,
    top,
    0,
    top + plotHeight * 0.55,
  );
  depthFill.addColorStop(0, "#e6f2f8");
  depthFill.addColorStop(1, "#cce5ef");
  ctx.fillStyle = depthFill;
  ctx.fill(cumulative);
  const bars = Math.max(1, Math.floor(plotWidth / (large ? 8 : 5)));
  ctx.strokeStyle = "#94c7d9";
  ctx.lineWidth = 1;
  let index = 0;
  for (let i = 0; i <= bars; i++) {
    const seconds = (duration * i) / bars;
    while (
      index + 1 < result.preview.length &&
      result.preview[index + 1].seconds <= seconds
    )
      index++;
    const p = result.preview[index];
    ctx.beginPath();
    ctx.moveTo(x(p.seconds), top);
    ctx.lineTo(x(p.seconds), depthY(p.cumulativeMM));
    ctx.stroke();
  }
  ctx.strokeStyle = blue;
  ctx.lineWidth = large ? 2 : 1.5;
  ctx.beginPath();
  result.preview.forEach((p, i) =>
    i
      ? ctx.lineTo(x(p.seconds), depthY(p.cumulativeMM))
      : ctx.moveTo(x(p.seconds), depthY(p.cumulativeMM)),
  );
  ctx.stroke();

  const intensity = new Path2D();
  result.preview.forEach((p, i, all) => {
    if (!i) {
      intensity.moveTo(x(p.seconds), y(p.mmh));
      return;
    }
    if (options.valueType === "backward")
      intensity.lineTo(x(all[i - 1].seconds), y(p.mmh));
    if (options.valueType === "forward")
      intensity.lineTo(x(p.seconds), y(all[i - 1].mmh));
    intensity.lineTo(x(p.seconds), y(p.mmh));
  });
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = large ? 6 : 4;
  ctx.lineJoin = "round";
  ctx.stroke(intensity);
  ctx.strokeStyle = orange;
  ctx.lineWidth = large ? 3 : 2.2;
  ctx.stroke(intensity);
  if (result.preview.length <= 160) {
    ctx.fillStyle = orange;
    for (const p of result.preview) {
      ctx.beginPath();
      ctx.arc(x(p.seconds), y(p.mmh), large ? 2.4 : 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  const peak = result.preview.reduce((a, b) => (a.mmh >= b.mmh ? a : b));
  const px = x(peak.seconds),
    py = y(peak.mmh);
  if (peak.mmh > 0) {
    ctx.strokeStyle = "#eda878";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = orange;
    ctx.beginPath();
    ctx.arc(px, py, large ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    const label = `峰值 ${format(peak.mmh)}`;
    ctx.font = `600 ${textSize}px ${font}`;
    const badgeWidth = ctx.measureText(label).width + 18;
    const badgeX = Math.max(left, Math.min(right - badgeWidth, px + 10));
    const badgeY = Math.max(top + 5, py - 32);
    ctx.fillStyle = "#fff2e7";
    ctx.fillRect(badgeX, badgeY, badgeWidth, 24);
    ctx.fillStyle = "#a64c1b";
    ctx.textAlign = "left";
    ctx.fillText(label, badgeX + 9, badgeY + 16);
  }

  ctx.fillStyle = muted;
  ctx.textAlign = "left";
  ctx.font = `${textSize - 1}px ${font}`;
  ctx.fillText(
    fitText(
      ctx,
      `${result.stats.start} — ${result.stats.end}`,
      width - margin * 2,
    ),
    margin,
    height - (compact ? 31 : 37),
  );
  ctx.fillStyle = "#8a9aaa";
  const sampling =
    result.preview.length < result.stats.records
      ? " · 曲线为抽样显示，统计及累计量按完整序列计算"
      : "";
  ctx.fillText(
    fitText(
      ctx,
      `MikeConverterTools · ${result.stats.records} 个时刻${sampling}`,
      width - margin * 2,
    ),
    margin,
    height - (compact ? 13 : 17),
  );
}

export async function rainfallChartPng(
  result: RainResult,
  options: RainOptions,
): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  drawRainfallChart(canvas, result, options, 1200, 800, 2);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("图表图片生成失败，请重试。")),
      "image/png",
    ),
  );
}
