import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  parseFormulaTable,
  formulaTableColumns,
} from "../src/core/formula-table";
import {
  cityFormulas,
  generateCityChicago,
  resolveCityFormula,
} from "../src/core/city-formulas";

const sample = () =>
  readFileSync("src/data/rainfall-formulas-template.csv", "utf8");
const csv = (rows: readonly (readonly string[])[]) =>
  "\uFEFF" +
  rows
    .map((row) => row.map((v) => `"${v.replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
function row(patch: Record<string, string> = {}) {
  const values: Record<string, string> = {
    公式ID: "example",
    城市: "测试城市",
    分区名称: "一区",
    适用地域: "测试区域",
    公式类型: "含P公式",
    雨强单位: "mm/h",
    A: "1000",
    C: "0.5",
    b: "30",
    n: "1.25",
    P最小值_年: "2",
    P最大值_年: "100",
    历时最小值_min: "1",
    历时最大值_min: "120",
    来源标题: "测试资料",
    来源链接: "https://example.com/source",
    版本: "测试版",
    发布日期: "2026-01",
    核实日期: "2026-10-27",
    原文位置: "第1页",
    ...patch,
  };
  return formulaTableColumns.map((k) => values[k] ?? "");
}

describe("editable rainfall formula CSV", () => {
  it("preserves every shipped coefficient, scope and source through migration to CSV", () => {
    const originalIds = [
      "nanjing-south-2024",
      "nanjing-north-2024",
      "tianjin-1-2016",
      "tianjin-2-2016",
      "tianjin-3-2016",
      "tianjin-4-2016",
      "shenzhen-west-2024",
      "shenzhen-central-2024",
      "shenzhen-east-2024",
      "shenzhen-shenshan-2024",
      "guangzhou-central-2022",
      "guangzhou-huadu-2022",
      "guangzhou-conghua-2022",
      "guangzhou-panyu-2022",
      "guangzhou-zengcheng-2022",
      "changzhou-short-2025",
    ];
    const normalized = originalIds
      .map((id) => cityFormulas.find((f) => f.id === id)!)
      .map((f) => ({
        id: f.id,
        city: f.city,
        label: f.label,
        scope: f.scope,
        source: f.source,
        duration: f.duration,
        periods: f.periods,
        peakRatio: f.peakRatio ?? null,
        note: f.note,
        values: (f.discrete ? f.periods : [f.periods[0], f.periods[1]]).map(
          (p) => resolveCityFormula(f.id, p, 120),
        ),
      }));
    const sort = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(sort)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b, "en"))
                .map(([k, v]) => [k, sort(v)]),
            )
          : value;
    // Captured from the pre-migration TypeScript catalogue with recursively sorted keys.
    expect(
      createHash("sha256")
        .update(JSON.stringify(sort(normalized)))
        .digest("hex"),
    ).toBe("a83fa0dd0e55b954ba07619e4dd09a36f5a7e48698f31791331319f5a652cf4b");
    expect(cityFormulas.length).toBeGreaterThanOrEqual(16);
  });
  it("loads the maintenance template with range and discrete formulas", () => {
    const entries = parseFormulaTable(sample());
    expect(entries).toHaveLength(2);
    expect(resolveCityFormula(entries[0].id, 10, 120, entries)).toMatchObject({
      a: 16.696,
      unit: "mmmin",
    });
    expect(resolveCityFormula(entries[1].id, 10, 60, entries)).toMatchObject({
      a: 5226.599,
      b: 21.591,
      n: 0.703,
    });
    expect(() => resolveCityFormula(entries[1].id, 7, 60, entries)).toThrow(
      /重现期/,
    );
  });
  it("handles BOM, reordered columns, quoted commas, quotes and newlines", () => {
    const rows = [
      formulaTableColumns,
      row({ 备注: '含逗号,以及"引号"\n第二行', 城市: "<img src=x>" }),
    ];
    const entries = parseFormulaTable(csv(rows.map((r) => [...r].reverse())));
    expect(entries[0].city).toBe("<img src=x>");
    expect(entries[0].note).toBe('含逗号,以及"引号"\n第二行');
    expect(entries[0].coefficients?.n).toBe(1.25);
  });
  it("supports fixed-P rows in mm/min and reports imported provenance without a verified claim", () => {
    const entries = parseFormulaTable(
      csv([
        formulaTableColumns,
        row({
          公式类型: "固定P公式",
          雨强单位: "mm/min",
          C: "",
          P最小值_年: "",
          P最大值_年: "",
          P固定值_年: "50",
        }),
      ]),
    );
    const r = generateCityChicago(
      "example",
      {
        returnPeriod: 50,
        durationMinutes: 120,
        peakRatio: 0.4,
        stepSeconds: 60,
      },
      {},
      entries,
      "我的公式.csv",
    );
    expect(r.generation?.parameters.unit).toBe("mmmin");
    expect(r.generation?.catalogue?.origin).toEqual({
      kind: "imported",
      filename: "我的公式.csv",
    });
    expect(r.warnings.join(" ")).toContain("未由工具核实");
    expect(r.warnings.join(" ")).not.toContain("已核对收录版本原文");
    expect(r.stats.totalMM).toBeCloseTo((1000 * 120) / 150 ** 1.25, 8);
  });
  it.each([
    [{ A: "" }, /A/],
    [{ A: "=1+2" }, /A/],
    [{ n: "Infinity" }, /n/],
    [{ n: "0" }, /n/],
    [{ 雨强单位: "m/s" }, /单位/],
    [{ 公式类型: "任意表达式" }, /公式类型/],
    [{ 来源链接: "javascript:alert(1)" }, /来源链接/],
    [{ 附件链接: "data:text/html,x" }, /附件链接/],
    [{ P最小值_年: "101" }, /重现期/],
    [{ P固定值_年: "10" }, /P固定值/],
    [{ 历时最大值_min: "0.5" }, /历时/],
    [{ 雨峰系数r: "1" }, /雨峰/],
    [{ 核实日期: "2026-02-30" }, /日期/],
    [{ 公式ID: "__proto__" }, /ID/],
    [{ 公式ID: "manual" }, /ID/],
    [{ 雨强单位: "constructor" }, /单位/],
    [{ C: "-1" }, /C/],
  ])(
    "rejects invalid values with a row-specific explanation: %j",
    (patch, pattern) => {
      expect(() =>
        parseFormulaTable(csv([formulaTableColumns, row(patch)])),
      ).toThrow(pattern);
      expect(() =>
        parseFormulaTable(csv([formulaTableColumns, row(patch)])),
      ).toThrow(/第 2 行/);
    },
  );
  it("rejects duplicate headers, unknown columns, malformed CSV and missing columns", () => {
    for (const header of [
      [...formulaTableColumns, "A"],
      [...formulaTableColumns, "错误列"],
      formulaTableColumns.slice(1),
    ])
      expect(() => parseFormulaTable(csv([header, row()]))).toThrow(/表头|列/);
    expect(() =>
      parseFormulaTable(csv([formulaTableColumns, row()]) + '\n"unclosed'),
    ).toThrow(/引号/);
    expect(() =>
      parseFormulaTable(csv([formulaTableColumns, row().slice(1)])),
    ).toThrow(/第 2 行/);
  });
  it("rejects repeated range IDs and duplicate or inconsistent fixed-P rows atomically", () => {
    expect(() =>
      parseFormulaTable(csv([formulaTableColumns, row(), row()])),
    ).toThrow(/重复/);
    const fixed = {
      公式类型: "固定P公式",
      C: "",
      P最小值_年: "",
      P最大值_年: "",
      P固定值_年: "10",
    };
    expect(() =>
      parseFormulaTable(csv([formulaTableColumns, row(fixed), row(fixed)])),
    ).toThrow(/重复/);
    expect(() =>
      parseFormulaTable(
        csv([
          formulaTableColumns,
          row(fixed),
          row({ ...fixed, P固定值_年: "20", 版本: "另一版" }),
        ]),
      ),
    ).toThrow(/不一致/);
  });
});
