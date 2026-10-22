import DxfParser from "dxf-parser";
import type { Point, Polyline } from "./types";

interface Entity {
  type: string;
  handle?: string;
  layer?: string;
  shape?: boolean;
  vertices?: { x: number; y: number; z?: number; bulge?: number }[];
  is3dPolygonMesh?: boolean;
  isPolyfaceMesh?: boolean;
  includesCurveFitVertices?: boolean;
  includesSplineFitVertices?: boolean;
  extrusionDirection?: { x: number; y: number; z: number };
  extrusionDirectionX?: number;
  extrusionDirectionY?: number;
  extrusionDirectionZ?: number;
}

export function readDxf(text: string): {
  polylines: Polyline[];
  warnings: string[];
} {
  if (text.startsWith("AutoCAD Binary DXF"))
    throw new Error("仅支持 ASCII 文本 DXF，请从 CAD 导出 ASCII R12 DXF。");
  let entities: Entity[];
  try {
    const parsed = new DxfParser().parseSync(text.replace(/^\uFEFF/, ""));
    if (!parsed) throw new Error();
    entities = parsed.entities as unknown as Entity[];
  } catch {
    throw new Error(
      "无法解析 DXF。请使用 ASCII R12 DXF，且只导出模型空间中的普通多段线。",
    );
  }
  const warnings: string[] = [];
  if (entities.some((e) => e.type === "INSERT"))
    warnings.push(
      "DXF 含块引用；本工具只读取模型中的直接多段线，请在 CAD 中另存并炸开需要的块。",
    );
  const polylines: Polyline[] = [];
  for (const [index, entity] of entities.entries()) {
    if (!["POLYLINE", "LWPOLYLINE"].includes(entity.type)) continue;
    const vertices = (entity.vertices ?? []).map(
      (v) => [v.x, v.y, v.z ?? 0] as Point,
    );
    const first = vertices[0],
      last = vertices.at(-1);
    const repeated =
      !!first &&
      vertices.length > 1 &&
      Math.abs(first[0] - last![0]) < 1e-8 &&
      Math.abs(first[1] - last![1]) < 1e-8;
    if (repeated) vertices.pop();
    const direction = entity.extrusionDirection ?? {
      x: entity.extrusionDirectionX ?? 0,
      y: entity.extrusionDirectionY ?? 0,
      z: entity.extrusionDirectionZ ?? 1,
    };
    let unsupported: string | undefined;
    if (
      entity.is3dPolygonMesh ||
      entity.isPolyfaceMesh ||
      entity.includesCurveFitVertices ||
      entity.includesSplineFitVertices
    )
      unsupported = "网格或拟合多段线，请先在 CAD 中转为普通直线段多段线。";
    if (direction.x !== 0 || direction.y !== 0 || direction.z !== 1)
      unsupported = "非世界坐标平面的对象，请先在 CAD 中转换至世界坐标。";
    polylines.push({
      id: `${index}-${entity.handle ?? ""}`,
      layer: (entity.layer ?? "0").trim(),
      closed: !!entity.shape || repeated,
      vertices,
      hasBulge: (entity.vertices ?? []).some((v) => !!v.bulge),
      unsupported,
    });
  }
  if (!polylines.length)
    throw new Error(
      "DXF 中没有直接的 POLYLINE / LWPOLYLINE。请检查是否仍在块或外部参照中。",
    );
  return { polylines, warnings };
}
