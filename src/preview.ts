import type { ConversionResult, Preview } from "./core/types";

export function drawPreview(
  canvas: HTMLCanvasElement,
  preview: Preview,
  mode: string,
) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ratio, ratio);
  const w = rect.width,
    h = rect.height;
  ctx.fillStyle = "#f8faf9";
  ctx.fillRect(0, 0, w, h);
  const all = [
    ...preview.points.map((p) => [p[0], p[1]]),
    ...preview.lines.flatMap((l) => l.points),
  ];
  if (!all.length) return;
  let xmin = Infinity,
    xmax = -Infinity,
    ymin = Infinity,
    ymax = -Infinity;
  for (const [x, y] of all) {
    xmin = Math.min(xmin, x);
    xmax = Math.max(xmax, x);
    ymin = Math.min(ymin, y);
    ymax = Math.max(ymax, y);
  }
  const scale = Math.min(
    (w - 72) / Math.max(xmax - xmin, 1),
    (h - 72) / Math.max(ymax - ymin, 1),
  );
  const xOffset = (w - (xmax - xmin) * scale) / 2,
    yOffset = (h - (ymax - ymin) * scale) / 2;
  const x = (v: number) => xOffset + (v - xmin) * scale,
    y = (v: number) => h - yOffset - (v - ymin) * scale;
  ctx.strokeStyle = "#e7ece9";
  ctx.lineWidth = 1;
  for (let col = 0; col < w; col += 32) {
    ctx.beginPath();
    ctx.moveTo(col, 0);
    ctx.lineTo(col, h);
    ctx.stroke();
  }
  for (let row = 0; row < h; row += 32) {
    ctx.beginPath();
    ctx.moveTo(0, row);
    ctx.lineTo(w, row);
    ctx.stroke();
  }
  const palette = ["#13785a", "#d16c43", "#486bbb", "#a569b4", "#b08b22"];
  const categories = [...new Set(preview.points.map((p) => p[2]))].sort(
    (a, b) => a - b,
  );
  let min = Infinity,
    max = -Infinity;
  for (const p of preview.points) {
    min = Math.min(min, p[2]);
    max = Math.max(max, p[2]);
  }
  for (const p of preview.points) {
    ctx.fillStyle =
      mode === "assign"
        ? palette[categories.indexOf(p[2]) % palette.length]
        : `hsl(${155 - ((p[2] - min) / (max - min || 1)) * 110} 43% 43%)`;
    ctx.beginPath();
    ctx.arc(
      x(p[0]),
      y(p[1]),
      preview.points.length > 2000 ? 1.3 : 2.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  for (const line of preview.lines) {
    ctx.strokeStyle = mode === "boundary" ? "#13785a" : "#506c60";
    ctx.lineWidth = mode === "boundary" ? 2.5 : 1;
    ctx.beginPath();
    line.points.forEach(([px, py], i) =>
      i ? ctx.lineTo(x(px), y(py)) : ctx.moveTo(x(px), y(py)),
    );
    ctx.closePath();
    ctx.stroke();
    if (mode === "boundary" && line.points.length < 500)
      for (const [px, py] of line.points) {
        ctx.fillStyle = "#13785a";
        ctx.beginPath();
        ctx.arc(x(px), y(py), 3, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  ctx.fillStyle = "#64776d";
  ctx.font = "11px system-ui";
  ctx.fillText("N ↑", w - 38, 23);
  ctx.fillText("X / Y · m", 12, h - 13);
  const distance = 80 / scale;
  ctx.fillText(`${distance.toFixed(distance < 10 ? 1 : 0)} m`, w - 104, h - 27);
  ctx.strokeStyle = "#64776d";
  ctx.beginPath();
  ctx.moveTo(w - 104, h - 19);
  ctx.lineTo(w - 24, h - 19);
  ctx.stroke();
}

export function drawEmpty(canvas: HTMLCanvasElement) {
  drawPreview(
    canvas,
    {
      points: [],
      lines: [
        {
          layer: "example",
          points: [
            [0, 0],
            [7, 1],
            [10, 4],
            [9, 8],
            [5, 10],
            [1, 8],
            [-1, 4],
          ],
        },
      ],
      sampled: false,
    },
    "boundary",
  );
}

export function formatNumber(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function summarize(result: ConversionResult) {
  return `CGCS2000 / 3-degree GK zone ${result.stats.zone} · EPSG:${result.stats.epsg}`;
}
