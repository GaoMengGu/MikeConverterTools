import { describe, expect, it } from "vitest";
import { prefixX, zoneInfo } from "../src/core/coordinates";
import { parsePoints } from "../src/core/points";
import {
  inspectBoundary,
  convertBoundary,
  convertPoints,
  assignValues,
} from "../src/core/converters";
import { boundaryDxf, dxf, road, square } from "./fixtures";

describe("coordinate contract", () => {
  it("supports every three-degree zone and preserves prefixed eastings", () => {
    for (let zone = 25; zone <= 45; zone++) {
      expect(prefixX(359000, zone)).toBe(zone * 1e6 + 359000);
      expect(prefixX(zone * 1e6 + 359000, zone)).toBe(zone * 1e6 + 359000);
      expect(zoneInfo(zone)).toEqual({
        zone,
        epsg: 4488 + zone,
        centralMeridian: zone * 3,
      });
    }
  });
  it("rejects mismatched zones and invalid numbers", () => {
    expect(() => prefixX(37359000, 39)).toThrow(/37.*39/);
    for (const zone of [24, 46, 37.5, NaN])
      expect(() => prefixX(359000, zone)).toThrow();
    for (const value of [NaN, Infinity, -Infinity])
      expect(() => prefixX(value, 37)).toThrow();
  });
});

describe("point text", () => {
  it("handles XYZ, point IDs, decimal scientific notation, commas and comments", () => {
    const parsed = parsePoints(
      "# comment\n359000 2091000 .5\nP2,359001,2091001,6.825e2\n3 359002 2091002 683.5\nbad row",
    );
    expect(parsed.points).toEqual([
      [359000, 2091000, 0.5],
      [359001, 2091001, 682.5],
      [359002, 2091002, 683.5],
    ]);
    expect(parsed.skipped).toBe(1);
    expect(parsed.issues[0].line).toBe(5);
  });
  it("allows explicit column order instead of guessing Northing/Easting", () => {
    expect(
      parsePoints("1,2091000,359000,700", { columns: [3, 2, 4] }).points,
    ).toEqual([[359000, 2091000, 700]]);
    expect(() => parsePoints("a", { columns: [0, 2, 3] })).toThrow();
  });
  it("skips nonfinite rows and reports line numbers", () => {
    const result = parsePoints(
      "359000 2091000 1e999\n359001 2091001 NaN\n359002 2091002 7",
    );
    expect(result.skipped).toBe(2);
    expect(result.points).toHaveLength(1);
  });
  it("keeps threshold equality and writes exactly six decimals", () => {
    const result = convertPoints("359000 2091000 10\n39359001 2091001 20", {
      zone: 39,
      minZ: 20,
      name: "points.txt",
    });
    expect(result.content).toBe("39359001.000000 2091001.000000 20.000000\n");
    expect(result.filename).toBe("points_zone39.xyz");
    expect(result.stats.filtered).toBe(1);
    expect(result.stats.points).toBe(1);
  });
  it("rejects empty results and validates mismatched zones even in filtered rows", () => {
    expect(() => convertPoints("359000 2091000 10", { minZ: 20 })).toThrow(
      /过滤/,
    );
    expect(() =>
      convertPoints("37359000 2091000 1\n359000 2091000 20", {
        zone: 39,
        minZ: 10,
      }),
    ).toThrow(/37.*39/);
  });
});

describe("boundary conversion", () => {
  it("keeps the exact five-column closure format", () => {
    const result = convertBoundary(boundaryDxf, { zone: 39, name: "site.dxf" });
    expect(result.content.split("\n")[0]).toBe(
      "39359000.000000 2091000.000000 1 0 0",
    );
    expect(result.content.trim().split("\n").at(-1)).toBe(
      "39359000.000000 2091000.000000 0 0 0",
    );
    expect(result.stats.points).toBe(4);
    expect(result.filename).toBe("site_mike_boundary_5col_zone39.xyz");
  });
  it("defaults to most vertices and supports explicitly choosing another contour", () => {
    const input = dxf([road, { layer: "INNER", xy: square.slice(0, 3) }]);
    const items = inspectBoundary(input);
    expect(items).toHaveLength(2);
    expect(convertBoundary(input).stats.layer).toBe("ROAD");
    expect(
      convertBoundary(input, { boundaryId: items[1].id }).stats.layer,
    ).toBe("INNER");
  });
  it("does not consider an open polyline a closed boundary", () => {
    expect(() => convertBoundary(dxf([{ ...road, closed: false }]))).toThrow(
      /闭合/,
    );
  });
  it("rejects self intersection and unsupported arcs instead of silently flattening them", () => {
    expect(() =>
      convertBoundary(
        dxf([
          { layer: "BAD", xy: [square[0], square[2], square[1], square[3]] },
        ]),
      ),
    ).toThrow(/相交|自交/);
    expect(() => convertBoundary(dxf([{ ...road, bulge: 1 }]))).toThrow(/圆弧/);
  });
  it("densifies the selected boundary when maximum spacing is requested", () => {
    const result = convertBoundary(boundaryDxf, { spacing: 2 });
    expect(result.stats.points).toBe(20);
    expect(result.content.trim().split("\n")).toHaveLength(21);
  });
  it("accepts LWPOLYLINE and repeated endpoints", () => {
    const lw =
      "0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nLW\n90\n5\n70\n0\n" +
      [...square, square[0]].map(([x, y]) => `10\n${x}\n20\n${y}\n`).join("") +
      "0\nENDSEC\n0\nEOF\n";
    expect(convertBoundary(lw).stats.points).toBe(4);
  });
});

describe("area assignment", () => {
  const zones = dxf([road, { layer: "SITE", xy: square }]);
  const points = "359005 2091005 700\n37359000 2091005 701\n359020 2091020 702";
  it("uses TXT top priority, includes boundary points and fills unmatched with last value", () => {
    const result = assignValues(points, zones, "SITE 60\nROAD 75\nDX 12.5", {});
    expect(
      result.content
        .trim()
        .split("\n")
        .map((s) => Number(s.split(" ")[2])),
    ).toEqual([60, 60, 12.5]);
    expect(result.stats.matched).toBe(2);
    expect(result.stats.unmatched).toBe(1);
    expect(result.stats.hits).toEqual({ SITE: 2, ROAD: 0, DX: 0 });
  });
  it("normalizes both files under selected zone, preserves row order and count", () => {
    const result = assignValues(
      points.replace("37359000", "39359000"),
      zones,
      "ROAD 75\nDX 12.5",
      { zone: 39 },
    );
    expect(result.stats.points).toBe(3);
    expect(result.content.startsWith("39359005.000000")).toBe(true);
    expect(result.content.includes("75.000000")).toBe(true);
    expect(() => assignValues(points, zones, "ROAD 75", { zone: 39 })).toThrow(
      /37.*39/,
    );
  });
  it("aborts on any open target polyline, even if another closed one matches", () => {
    const input = dxf([road, { ...road, closed: false }]);
    expect(() => assignValues(points, input, "ROAD 75", {})).toThrow(
      /ROAD.*未闭合/,
    );
  });
  it("ignores open lines outside target layers", () => {
    expect(
      assignValues(
        points,
        dxf([road, { layer: "IGNORE", xy: square, closed: false }]),
        "ROAD 75",
        {},
      ).stats.points,
    ).toBe(3);
  });
  it("rejects duplicate layers and records missing polygon layers", () => {
    expect(() => assignValues(points, zones, "ROAD 75\nroad 60", {})).toThrow(
      /重复/,
    );
    const result = assignValues(points, zones, "ROAD 75\nDX 12.5", {});
    expect(result.warnings.join(" ")).toContain("DX");
  });
});
