import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { convertDxfToShp } from "../src/core/shapefile";
import { read } from "shapefile";
import { dxf, square } from "./fixtures";
const view = (b: Uint8Array) =>
  new DataView(b.buffer, b.byteOffset, b.byteLength);
describe("DXF to Shapefile", () => {
  it("writes clockwise polygon, original coordinates and Chinese attributes", async () => {
    const r = await convertDxfToShp(dxf([{ layer: "道路分区", xy: square }]), {
      closedAsLines: false,
    });
    const zip = unzipSync(r.archive),
      shp = view(zip["polygons.shp"]);
    expect(shp.getInt32(0)).toBe(9994);
    expect(shp.getInt32(32, true)).toBe(5);
    expect(shp.getFloat64(36, true)).toBe(359000);
    expect(shp.getInt32(148, true)).toBe(5);
    expect(shp.getFloat64(156, true)).toBe(359000);
    expect(shp.getFloat64(164, true)).toBe(2091010);
    expect(strFromU8(zip["polygons.dbf"])).toContain("道路分区");
    expect(strFromU8(zip["polygons.cpg"])).toBe("UTF-8");
    expect(zip["polygons.prj"]).toBeUndefined();
    expect(r.report.counts).toEqual({ points: 0, lines: 0, polygons: 1 });
    const decoded = await read(
      zip["polygons.shp"].buffer,
      zip["polygons.dbf"].buffer,
      { encoding: "utf-8" },
    );
    expect(decoded.features[0].properties?.LAYER).toBe("道路分区");
    expect(decoded.features[0].geometry).toMatchObject({
      type: "Polygon",
      coordinates: [
        [
          [359000, 2091010],
          [359010, 2091010],
          [359010, 2091000],
          [359000, 2091000],
          [359000, 2091010],
        ],
      ],
    });
  });
  it("supports open polylines as lines", async () => {
    const r = await convertDxfToShp(
      dxf([{ layer: "open", xy: square, closed: false }]),
    );
    expect(r.report.counts.lines).toBe(1);
    expect(view(unzipSync(r.archive)["lines.shp"]).getInt32(32, true)).toBe(3);
  });
  it("rejects curves and invalid polygons", async () => {
    await expect(
      convertDxfToShp(dxf([{ layer: "curve", xy: square, bulge: 1 }])),
    ).rejects.toThrow(/圆弧/);
    await expect(
      convertDxfToShp(
        dxf([
          {
            layer: "cross",
            xy: [
              [0, 0],
              [2, 2],
              [0, 2],
              [2, 0],
            ],
          },
        ]),
        { closedAsLines: false },
      ),
    ).rejects.toThrow(/自交/);
  });
  it("prefixes zone only explicitly and rejects conflicting prefixes", async () => {
    const r = await convertDxfToShp(dxf([{ layer: "test", xy: square }]), {
      zone: 37,
      closedAsLines: false,
    });
    const zip = unzipSync(r.archive);
    expect(view(zip["polygons.shp"]).getFloat64(36, true)).toBe(37359000);
    expect(strFromU8(zip["polygons.prj"])).toContain("111");
    await expect(
      convertDxfToShp(
        dxf([{ layer: "test", xy: square.map(([x, y]) => [x + 39e6, y]) }]),
        { zone: 37 },
      ),
    ).rejects.toThrow(/39.*37/);
  });
});

it("exports direct POINT and LINE, counts unknown and layout entities, reads attributes independently", async () => {
  const text = [
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    "0",
    "POINT",
    "8",
    "测点",
    "10",
    "2",
    "20",
    "3",
    "30",
    "8",
    "0",
    "LINE",
    "8",
    "道路",
    "10",
    "1",
    "20",
    "2",
    "11",
    "3",
    "21",
    "4",
    "0",
    "CIRCLE",
    "10",
    "0",
    "20",
    "0",
    "40",
    "2",
    "0",
    "ENDSEC",
    "0",
    "EOF",
    "",
  ].join("\n");
  const r = await convertDxfToShp(text),
    zip = unzipSync(r.archive);
  expect(r.report.counts).toEqual({ points: 1, lines: 1, polygons: 0 });
  expect(r.report.skipped).toEqual({ CIRCLE: 1 });
  const points = await read(
    zip["points.shp"].buffer,
    zip["points.dbf"].buffer,
    { encoding: "utf-8" },
  );
  expect(points.features[0]).toMatchObject({
    geometry: { type: "Point", coordinates: [2, 3] },
    properties: { LAYER: "测点", Z_MIN: "8", Z_MAX: "8" },
  });
  const lines = await read(zip["lines.shp"].buffer, zip["lines.dbf"].buffer, {
    encoding: "utf-8",
  });
  expect(lines.features[0].geometry).toMatchObject({
    type: "LineString",
    coordinates: [
      [1, 2],
      [3, 4],
    ],
  });
});
it("defaults to closed lines, allows polygon mode and explicit source PRJ", async () => {
  const t = dxf([{ layer: "closed", xy: square }]);
  const r = await convertDxfToShp(t, {
    closedAsLines: true,
    prj: 'LOCAL_CS["CAD",UNIT["metre",1]]',
  });
  const zip = unzipSync(r.archive);
  expect(r.report.counts.lines).toBe(1);
  expect(strFromU8(zip["lines.prj"])).toBe('LOCAL_CS["CAD",UNIT["metre",1]]');
});
it("exports text anchor and UTF-8 raw text, accounts for unsupported parser entities", async () => {
  const t = [
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    "0",
    "TEXT",
    "8",
    "注记",
    "10",
    "2",
    "20",
    "3",
    "1",
    "中文标高",
    "0",
    "HATCH",
    "8",
    "填充",
    "0",
    "ENDSEC",
    "0",
    "EOF",
    "",
  ].join("\n");
  const r = await convertDxfToShp(t),
    zip = unzipSync(r.archive);
  const fc = await read(zip["points.shp"].buffer, zip["points.dbf"].buffer, {
    encoding: "utf-8",
  });
  expect(fc.features[0].properties?.TEXT).toBe("中文标高");
  expect(r.report.skipped).toMatchObject({ HATCH: 1 });
  expect(r.report.entities).toBe(2);
});
it("rejects overlong UTF-8 fields without truncation and lists layout skips", async () => {
  await expect(
    convertDxfToShp(dxf([{ layer: "长".repeat(90), xy: square }])),
  ).rejects.toThrow(/254/);
  const t = [
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    "0",
    "POINT",
    "67",
    "1",
    "10",
    "0",
    "20",
    "0",
    "0",
    "POINT",
    "10",
    "1",
    "20",
    "2",
    "0",
    "ENDSEC",
    "0",
    "EOF",
    "",
  ].join("\n");
  const r = await convertDxfToShp(t);
  expect(r.report.counts.points).toBe(1);
  expect(r.report.skipped).toEqual({ POINT: 1 });
});
it("refuses non-world text extrusion even when the parser ignores its group codes", async () => {
  const t = [
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    "0",
    "TEXT",
    "10",
    "2",
    "20",
    "3",
    "1",
    "label",
    "210",
    "0",
    "220",
    "1",
    "230",
    "0",
    "0",
    "ENDSEC",
    "0",
    "EOF",
    "",
  ].join("\n");
  await expect(convertDxfToShp(t)).rejects.toThrow(/世界坐标/);
});
it("uses conservative closed lines by default in the shared core", async () => {
  const r = await convertDxfToShp(dxf([{ layer: "outline", xy: square }]));
  expect(r.report.counts.lines).toBe(1);
  expect(r.report.counts.polygons).toBe(0);
});
