import RBush, { type BBox } from "rbush";
import classifyPoint from "robust-point-in-polygon";
import { orient2d } from "robust-predicates";
import type { Point, XY } from "./types";

export function bounds(points: readonly (Point | XY)[]): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function onSegment(a: XY, b: XY, p: XY) {
  return (
    p[0] >= Math.min(a[0], b[0]) &&
    p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) &&
    p[1] <= Math.max(a[1], b[1])
  );
}
function intersects(a: XY, b: XY, c: XY, d: XY) {
  const o1 = orient2d(...a, ...b, ...c),
    o2 = orient2d(...a, ...b, ...d);
  const o3 = orient2d(...c, ...d, ...a),
    o4 = orient2d(...c, ...d, ...b);
  return (
    (o1 === 0 && onSegment(a, b, c)) ||
    (o2 === 0 && onSegment(a, b, d)) ||
    (o3 === 0 && onSegment(c, d, a)) ||
    (o4 === 0 && onSegment(c, d, b)) ||
    (Math.sign(o1) !== Math.sign(o2) && Math.sign(o3) !== Math.sign(o4))
  );
}

export function validateRing(points: Point[], layer: string) {
  if (points.length < 3)
    throw new Error(`${layer}：闭合轮廓至少需要 3 个顶点。`);
  if (points.some((p) => p.some((n) => !Number.isFinite(n))))
    throw new Error(`${layer}：存在无效顶点坐标。`);
  type Segment = BBox & { a: XY; b: XY; index: number };
  const tree = new RBush<Segment>();
  const seen = new Set<string>();
  let area = 0;
  const origin = points[0];
  for (let i = 0; i < points.length; i++) {
    const a: XY = [points[i][0], points[i][1]];
    const b: XY = [
      points[(i + 1) % points.length][0],
      points[(i + 1) % points.length][1],
    ];
    const key = `${a[0]},${a[1]}`;
    if (seen.has(key)) throw new Error(`${layer}：轮廓存在重复顶点或自交。`);
    seen.add(key);
    if (a[0] === b[0] && a[1] === b[1])
      throw new Error(`${layer}：存在零长度边。`);
    area +=
      (a[0] - origin[0]) * (b[1] - origin[1]) -
      (b[0] - origin[0]) * (a[1] - origin[1]);
    const segment = { ...bounds([a, b]), a, b, index: i };
    for (const other of tree.search(segment)) {
      if (
        other.index === i - 1 ||
        (i === points.length - 1 && other.index === 0)
      )
        continue;
      if (intersects(a, b, other.a, other.b))
        throw new Error(
          `${layer}：轮廓自交或非相邻边相交，请先在 CAD 中修复。`,
        );
    }
    tree.insert(segment);
  }
  if (Math.abs(area) < 1e-10) throw new Error(`${layer}：轮廓面积为零或无效。`);
  return Math.abs(area) / 2;
}

export function contains(points: XY[], x: number, y: number) {
  return classifyPoint(points, [x, y]) <= 0;
}

export function densify(points: Point[], spacing?: number): Point[] {
  if (spacing === undefined) return points;
  if (!Number.isFinite(spacing) || spacing <= 0)
    throw new Error("最大采样间距须大于 0。");
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / spacing),
    );
    if (result.length + steps > 2_000_000)
      throw new Error("加密后超过 200 万顶点，请增大采样间距。");
    for (let j = 0; j < steps; j++)
      result.push([
        a[0] + ((b[0] - a[0]) * j) / steps,
        a[1] + ((b[1] - a[1]) * j) / steps,
        0,
      ]);
  }
  return result;
}
