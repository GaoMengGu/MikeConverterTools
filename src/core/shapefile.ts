import DxfParser from "dxf-parser";
import { write } from "@mapbox/shp-write";
import { zipSync, strToU8 } from "fflate";
import { prefixX, zoneInfo } from "./coordinates";
import { validateRing } from "./geometry";
import type { Point } from "./types";

type Vertex = { x: number; y: number; z?: number; bulge?: number };
type Entity = {
  type: string;
  layer?: string;
  handle?: string;
  position?: Vertex;
  startPoint?: Vertex;
  endPoint?: Vertex;
  text?: string;
  halign?: number;
  valign?: number;
  vertices?: Vertex[];
  shape?: boolean;
  elevation?: number;
  inPaperSpace?: boolean;
  is3dPolygonMesh?: boolean;
  isPolyfaceMesh?: boolean;
  includesCurveFitVertices?: boolean;
  includesSplineFitVertices?: boolean;
  extrusionDirection?: Vertex;
  extrusionDirectionX?: number;
  extrusionDirectionY?: number;
  extrusionDirectionZ?: number;
};
type Row = Record<string, string>;
export interface ShpResult {
  archive: Uint8Array<ArrayBuffer>;
  report: {
    counts: { points: number; lines: number; polygons: number };
    skipped: Record<string, number>;
    warnings: string[];
    coordinateSystem: string;
    entities: number;
    layers: string[];
  };
}
// The upstream DBF writer is byte/ASCII based. Write UTF-8 fields explicitly so
// Chinese layer names survive, and declare their encoding with a .cpg sidecar.
function utf8Dbf(rows: Row[]): Uint8Array<ArrayBuffer> {
  const names = ["LAYER", "HANDLE", "ENTITY", "TEXT", "Z_MIN", "Z_MAX"];
  const encoder = new TextEncoder();
  const widths = names.map((n) =>
    rows.reduce((w, r) => Math.max(w, encoder.encode(r[n]).length), 1),
  );
  if (widths.some((w) => w > 254))
    throw new Error("属性超过 DBF 单字段 254 字节限制，请缩短图层名。");
  const header = 33 + 32 * names.length,
    record = 1 + widths.reduce((a, b) => a + b, 0);
  const bytes = new Uint8Array(header + record * rows.length + 1),
    v = new DataView(bytes.buffer);
  const today = new Date();
  bytes[0] = 3;
  bytes[1] = today.getUTCFullYear() - 1900;
  bytes[2] = today.getUTCMonth() + 1;
  bytes[3] = today.getUTCDate();
  v.setUint32(4, rows.length, true);
  v.setUint16(8, header, true);
  v.setUint16(10, record, true);
  names.forEach((n, i) => {
    bytes.set(encoder.encode(n), 32 + i * 32);
    bytes[43 + i * 32] = 67;
    bytes[48 + i * 32] = widths[i];
  });
  bytes[header - 1] = 13;
  rows.forEach((r, i) => {
    let offset = header + i * record;
    bytes.fill(32, offset, offset + record);
    offset++;
    names.forEach((n, j) => {
      bytes.set(encoder.encode(r[n]), offset);
      offset += widths[j];
    });
  });
  bytes[bytes.length - 1] = 26;
  return bytes;
}
function prj(zone: number) {
  const { centralMeridian, epsg } = zoneInfo(zone);
  return (
    'PROJCS["CGCS2000_3_Degree_GK_Zone_' +
    zone +
    '",GEOGCS["CGCS2000",DATUM["China_2000",SPHEROID["CGCS2000",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",' +
    centralMeridian +
    '],PARAMETER["scale_factor",1],PARAMETER["false_easting",' +
    (zone * 1e6 + 500000) +
    '],PARAMETER["false_northing",0],UNIT["Meter",1],AUTHORITY["EPSG","' +
    epsg +
    '"]]'
  );
}
export async function convertDxfToShp(
  text: string,
  options: { zone?: number; closedAsLines?: boolean; prj?: string } = {},
): Promise<ShpResult> {
  if (text.startsWith("AutoCAD Binary DXF"))
    throw new Error("仅支持 ASCII 文本 DXF。");
  if (options.zone !== undefined) zoneInfo(options.zone);
  if (
    options.prj &&
    (options.prj.length > 20000 ||
      !/^(PROJCS|GEOGCS|LOCAL_CS|PROJCRS|GEOGCRS|GEODCRS|ENGCRS)\s*\[/i.test(
        options.prj.trim(),
      ))
  )
    throw new Error("请提供有效的源坐标系 WKT 声明。");
  if (options.prj && options.zone !== undefined)
    throw new Error("自定义 PRJ 与补带号不可同时选择。");
  let entities: Entity[];
  try {
    entities = new DxfParser().parseSync(text.replace(/^﻿/, ""))!
      .entities as unknown as Entity[];
  } catch {
    throw new Error("无法解析 DXF，请使用 ASCII DXF。");
  }
  const groups = {
    points: {
      type: "POINT" as const,
      rows: [] as Row[],
      geometries: [] as object[],
    },
    lines: {
      type: "POLYLINE" as const,
      rows: [] as Row[],
      geometries: [] as object[],
    },
    polygons: {
      type: "POLYGON" as const,
      rows: [] as Row[],
      geometries: [] as object[],
    },
  };
  const skipped: Record<string, number> = Object.create(null),
    layers = new Set<string>();
  // Count raw entity declarations too: dxf-parser drops entity types it cannot parse.
  const tokens = text.replace(/^﻿/, "").split(/\r?\n/);
  let section = "",
    rawTotal = 0;
  type RawEntity = {
    type: string;
    paper: boolean;
    dx: number;
    dy: number;
    dz: number;
  };
  const rawEntities: RawEntity[] = [];
  let currentRaw: RawEntity | undefined;
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const code = tokens[i].trim(),
      val = tokens[i + 1].trim();
    if (code === "0" && val === "SECTION" && tokens[i + 2]?.trim() === "2")
      section = tokens[i + 3]?.trim();
    if (code === "0" && val === "ENDSEC") section = "";
    if (
      section === "ENTITIES" &&
      code === "0" &&
      !["SECTION", "VERTEX", "SEQEND"].includes(val)
    ) {
      rawTotal++;
      skipped[val] = (skipped[val] ?? 0) + 1;
      currentRaw = { type: val, paper: false, dx: 0, dy: 0, dz: 1 };
      rawEntities.push(currentRaw);
    } else if (section === "ENTITIES" && code === "0") currentRaw = undefined;
    else if (section === "ENTITIES" && currentRaw) {
      if (code === "67") currentRaw.paper = val !== "0";
      if (code === "210") currentRaw.dx = Number(val);
      if (code === "220") currentRaw.dy = Number(val);
      if (code === "230") currentRaw.dz = Number(val);
    }
  }
  let verticesCount = 0;
  const rawQueues = new Map<string, RawEntity[]>();
  for (const r of rawEntities) {
    const q = rawQueues.get(r.type) ?? [];
    q.push(r);
    rawQueues.set(r.type, q);
  }
  const rawIndices = new Map<string, number>();
  for (const e of entities) {
    const idx = rawIndices.get(e.type) ?? 0,
      rawMeta = rawQueues.get(e.type)?.[idx];
    rawIndices.set(e.type, idx + 1);
    if (
      rawMeta &&
      !rawMeta.paper &&
      ["POINT", "TEXT", "MTEXT", "LINE", "POLYLINE", "LWPOLYLINE"].includes(
        e.type,
      ) &&
      (rawMeta.dx !== 0 || rawMeta.dy !== 0 || rawMeta.dz !== 1)
    )
      throw new Error((e.layer ?? "0") + "：非世界坐标平面，请先在 CAD 转换。");
    if (
      e.inPaperSpace ||
      rawMeta?.paper ||
      !["POINT", "TEXT", "MTEXT", "LINE", "POLYLINE", "LWPOLYLINE"].includes(
        e.type,
      )
    )
      continue;
    const layer = e.layer ?? "0";
    const dir = e.extrusionDirection ?? {
      x: e.extrusionDirectionX ?? 0,
      y: e.extrusionDirectionY ?? 0,
      z: e.extrusionDirectionZ ?? 1,
    };
    if (dir.x !== 0 || dir.y !== 0 || dir.z !== 1)
      throw new Error(layer + "：非世界坐标平面，请先在 CAD 转换。");
    if (
      e.is3dPolygonMesh ||
      e.isPolyfaceMesh ||
      e.includesCurveFitVertices ||
      e.includesSplineFitVertices
    )
      throw new Error(layer + "：不支持网格或拟合多段线。");
    const isPoint = ["POINT", "TEXT", "MTEXT"].includes(e.type);
    const anchor =
      e.type === "TEXT"
        ? (e.halign || e.valign) && e.endPoint
          ? e.endPoint
          : e.startPoint
        : e.position;
    const raw = isPoint ? [anchor!] : (e.vertices ?? []);
    if (raw.some((v) => v?.bulge))
      throw new Error(layer + "：含圆弧凸度，请先离散为直线段。");
    const points: Point[] = raw.map((v) => [
      options.zone === undefined ? v?.x : prefixX(v?.x, options.zone),
      v?.y,
      v?.z ?? e.elevation ?? 0,
    ]);
    verticesCount += points.length;
    if (verticesCount > 2_000_000)
      throw new Error("超过 200 万顶点，请拆分 DXF。");
    if (points.some((p) => p.some((n) => !Number.isFinite(n))))
      throw new Error(layer + "：无效顶点坐标。");
    if (points.length < (isPoint ? 1 : 2))
      throw new Error(layer + "：顶点不足。");
    const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
    const closed =
      !!e.shape || (points.length > 2 && same(points[0], points.at(-1)!));
    let key: "points" | "lines" | "polygons" = isPoint ? "points" : "lines";
    if (closed && options.closedAsLines === false) {
      if (same(points[0], points.at(-1)!)) points.pop();
      validateRing(points, layer);
      let area = 0;
      const origin = points[0];
      points.forEach((a, i) => {
        const b = points[(i + 1) % points.length];
        area +=
          (a[0] - origin[0]) * (b[1] - origin[1]) -
          (b[0] - origin[0]) * (a[1] - origin[1]);
      });
      if (area > 0) points.reverse();
      points.push([...points[0]]);
      key = "polygons";
    } else if (closed && !same(points[0], points.at(-1)!))
      points.push([...points[0]]);
    const z = points.map((p) => p[2]);
    let zmin = Infinity,
      zmax = -Infinity;
    for (const n of z) {
      zmin = Math.min(zmin, n);
      zmax = Math.max(zmax, n);
    }
    groups[key].rows.push({
      LAYER: layer,
      HANDLE: String(e.handle ?? ""),
      ENTITY: e.type,
      TEXT: e.text ?? "",
      Z_MIN: String(zmin),
      Z_MAX: String(zmax),
    });
    const xy = points.map((p) => p.slice(0, 2));
    groups[key].geometries.push(key === "points" ? xy[0] : [xy]);
    layers.add(layer);
    skipped[e.type]--;
  }
  for (const k of Object.keys(skipped)) if (!skipped[k]) delete skipped[k];
  const counts = {
    points: groups.points.rows.length,
    lines: groups.lines.rows.length,
    polygons: groups.polygons.rows.length,
  };
  if (!Object.values(counts).some(Boolean))
    throw new Error("没有可导出的直接点、直线或普通多段线。");
  const warnings = [
    "导出二维几何；Z_MIN / Z_MAX 为文本属性，保留各实体高程范围，不保留逐顶点 Z。闭合轮廓独立成面，不推断孔洞、拓扑或 CAD 样式。文字仅保留定位点和原始 TEXT 属性（可能含 CAD 格式码）。",
  ];
  if (Object.keys(skipped).length)
    warnings.push(
      "有未导出实体（含布局空间及块引用），请查看 skipped 统计；需要的块须先在 CAD 炸开。",
    );
  if (options.zone === undefined && !options.prj)
    warnings.push(
      "坐标原样保留，源坐标系未指定；不生成 PRJ，请在 GIS 中依据测量资料定义坐标系。",
    );
  const report = {
    counts,
    skipped,
    warnings,
    coordinateSystem:
      options.prj ??
      (options.zone === undefined ? "原始坐标 / 未指定" : prj(options.zone)),
    entities: rawTotal,
    layers: [...layers],
  };
  const files: Record<string, Uint8Array> = {};
  for (const [name, g] of Object.entries(groups)) {
    if (!g.rows.length) continue;
    await new Promise<void>((resolve, reject) =>
      write(
        g.rows.map(() => ({})),
        g.type,
        g.geometries,
        (err, data) => {
          if (err) {
            reject(err);
            return;
          }
          for (const ext of ["shp", "shx"] as const) {
            const v = data[ext] as DataView;
            files[name + "." + ext] = new Uint8Array(
              v.buffer,
              v.byteOffset,
              v.byteLength,
            );
          }
          files[name + ".dbf"] = utf8Dbf(g.rows);
          files[name + ".cpg"] = strToU8("UTF-8");
          if (options.zone !== undefined || options.prj)
            files[name + ".prj"] = strToU8(options.prj ?? prj(options.zone!));
          resolve();
        },
      ),
    );
  }
  files["report.json"] = strToU8(JSON.stringify(report, null, 2));
  files["README.txt"] = strToU8(
    warnings.join("\n") +
      "\n属性：LAYER 图层；HANDLE 句柄；ENTITY 类型；TEXT 文字原文；Z_MIN/Z_MAX 高程范围（文本精度保留）。\n",
  );
  return { archive: zipSync(files), report };
}
