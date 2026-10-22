import RBush, { type BBox } from "rbush";
import { prefixX, zoneInfo } from "./coordinates";
import { readDxf } from "./dxf";
import { bounds, contains, densify, validateRing } from "./geometry";
import { parseLayerValues, parsePoints } from "./points";
import type {
  ConversionResult,
  Options,
  Point,
  Polyline,
  Preview,
  Stats,
  XY,
} from "./types";

function nameFor(name: string | undefined, suffix: string, zone: number) {
  return `${(name ?? "output").replace(/\.[^.]+$/, "")}${suffix}_zone${zone}.xyz`;
}
function normalize(points: Point[], zone: number) {
  return points.map(([x, y, z]) => [prefixX(x, zone), y, z] as Point);
}
function usable(poly: Polyline, zone: number) {
  if (!poly.closed)
    throw new Error(`${poly.layer}：多段线未闭合，已停止转换。`);
  if (poly.unsupported) throw new Error(`${poly.layer}：${poly.unsupported}`);
  if (poly.hasBulge)
    throw new Error(
      `${poly.layer}：含圆弧段，请先在 CAD 中离散为直线段多段线。`,
    );
  const vertices = normalize(poly.vertices, zone);
  validateRing(vertices, poly.layer);
  return vertices;
}
function stats(points: Point[], options: Options): Stats {
  const box = bounds(points);
  let zMin = Infinity,
    zMax = -Infinity;
  for (const p of points) {
    zMin = Math.min(zMin, p[2]);
    zMax = Math.max(zMax, p[2]);
  }
  return {
    ...zoneInfo(options.zone),
    points: points.length,
    input: points.length,
    filtered: 0,
    skipped: 0,
    xMin: box.minX,
    xMax: box.maxX,
    yMin: box.minY,
    yMax: box.maxY,
    zMin,
    zMax,
  };
}
function preview(points: Point[], lines: Preview["lines"] = []): Preview {
  const step = Math.max(1, Math.ceil(points.length / 6000));
  return {
    points: points.filter((_, i) => i % step === 0),
    lines,
    sampled: step > 1,
  };
}
function output(points: Point[]) {
  return (
    points.map((p) => p.map((n) => n.toFixed(6)).join(" ")).join("\n") + "\n"
  );
}
function pointWarnings(skipped: number) {
  return skipped
    ? [
        `跳过 ${skipped} 行无法解析的数据；请在报告中核查行号，确认无有效数据遗漏。`,
      ]
    : [];
}

export function inspectBoundary(text: string) {
  return readDxf(text).polylines.map((p) => ({
    id: p.id,
    layer: p.layer,
    vertices: p.vertices.length,
    closed: p.closed,
    curved: p.hasBulge,
  }));
}

export function convertBoundary(
  text: string,
  options: Options = {},
): ConversionResult {
  const zone = options.zone ?? 37;
  zoneInfo(zone);
  const { polylines, warnings } = readDxf(text);
  const candidates = polylines.filter(
    (p) => p.closed && p.vertices.length >= 3,
  );
  const selected = options.boundaryId
    ? polylines.find((p) => p.id === options.boundaryId)
    : [...candidates].sort((a, b) => b.vertices.length - a.vertices.length)[0];
  if (!selected)
    throw new Error("未找到选中的闭合边界。请检查 DXF 多段线闭合属性。");
  const original = usable(selected, zone);
  const points = densify(original, options.spacing);
  const rows = points.map(([x, y]) => `${x.toFixed(6)} ${y.toFixed(6)} 1 0 0`);
  rows.push(`${points[0][0].toFixed(6)} ${points[0][1].toFixed(6)} 0 0 0`);
  if (candidates.length > 1 && !options.boundaryId)
    warnings.push(
      `检测到 ${candidates.length} 条闭合轮廓，当前按顶点数最多选择 ${selected.layer}；请核对预览。`,
    );
  return {
    content: rows.join("\n") + "\n",
    filename: nameFor(options.name, "_mike_boundary_5col", zone),
    stats: {
      ...stats(points, options),
      input: original.length,
      layer: selected.layer,
      rows: rows.length,
    },
    warnings,
    issues: [],
    preview: preview(
      [],
      [{ layer: selected.layer, points: points.map((p) => [p[0], p[1]]) }],
    ),
  };
}

export function convertPoints(
  text: string,
  options: Options = {},
): ConversionResult {
  const zone = options.zone ?? 37;
  zoneInfo(zone);
  if (options.minZ !== undefined && !Number.isFinite(options.minZ))
    throw new Error("过滤阈值须为有限数值。");
  const parsed = parsePoints(text, options);
  if (!parsed.points.length)
    throw new Error("没有读取到有效点，请核对列顺序和分隔符。");
  const normalized = normalize(parsed.points, zone);
  const points = normalized.filter(
    (p) => options.minZ === undefined || p[2] >= options.minZ,
  );
  if (!points.length) throw new Error("过滤后没有剩余点，请检查阈值。");
  return {
    content: output(points),
    filename: nameFor(options.name, "", zone),
    stats: {
      ...stats(points, options),
      input: normalized.length,
      skipped: parsed.skipped,
      filtered: normalized.length - points.length,
    },
    warnings: pointWarnings(parsed.skipped),
    issues: parsed.issues,
    preview: preview(points),
  };
}

export function assignValues(
  pointText: string,
  dxfText: string,
  valuesText: string,
  options: Options = {},
): ConversionResult {
  const zone = options.zone ?? 37;
  zoneInfo(zone);
  const layers = parseLayerValues(valuesText);
  const priorities = new Map(
    layers.map((r, rank) => [r.layer, { ...r, rank }]),
  );
  const { polylines, warnings } = readDxf(dxfText);
  type Area = BBox & {
    vertices: XY[];
    layer: string;
    value: number;
    rank: number;
  };
  const areas: Area[] = [];
  const lines: Preview["lines"] = [];
  const present = new Set<string>();
  for (const poly of polylines) {
    const entry = priorities.get(poly.layer.toUpperCase());
    if (!entry) continue;
    const vertices = usable(poly, zone);
    const xy = vertices.map((p) => [p[0], p[1]] as XY);
    present.add(entry.layer);
    areas.push({ ...bounds(vertices), vertices: xy, ...entry });
    if (lines.length < 200) lines.push({ layer: entry.layer, points: xy });
  }
  if (!areas.length)
    throw new Error("图层值 TXT 与 DXF 中的闭合分区没有匹配，请核对图层名。");
  for (const row of layers)
    if (!present.has(row.layer))
      warnings.push(
        `图层 ${row.layer} 未找到闭合分区${row === layers.at(-1) ? "，其值仍用作默认值" : ""}。`,
      );
  const tree = new RBush<Area>().load(areas);
  const parsed = parsePoints(pointText, options);
  if (!parsed.points.length)
    throw new Error("没有读取到有效点，请核对点文件。");
  const points = normalize(parsed.points, zone);
  const fallback = layers.at(-1)!.value;
  const hits = Object.fromEntries(layers.map((r) => [r.layer, 0]));
  let matched = 0;
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    let selected: Area | undefined;
    for (const area of tree.search({ minX: x, maxX: x, minY: y, maxY: y })) {
      if (
        (!selected || area.rank < selected.rank) &&
        contains(area.vertices, x, y)
      )
        selected = area;
    }
    if (selected) {
      matched++;
      hits[selected.layer]++;
    }
    result.push([x, y, selected?.value ?? fallback]);
    if (i % 5000 === 0)
      options.progress?.(
        20 + (65 * i) / points.length,
        `分区赋值 ${i.toLocaleString()} / ${points.length.toLocaleString()}`,
      );
  }
  return {
    content: output(result),
    filename: nameFor(options.name, "_dxf_values", zone),
    stats: {
      ...stats(result, options),
      skipped: parsed.skipped,
      matched,
      unmatched: result.length - matched,
      hits,
      defaultValue: fallback,
    },
    warnings: [...warnings, ...pointWarnings(parsed.skipped)],
    issues: parsed.issues,
    preview: preview(result, lines),
  };
}
