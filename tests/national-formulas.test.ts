import { describe, expect, it } from "vitest";
import {
  cityFormulas,
  generateCityChicago,
  resolveCityFormula,
} from "../src/core/city-formulas";
import {
  formulaTableColumns,
  parseFormulaTable,
} from "../src/core/formula-table";
import { readFileSync } from "node:fs";

const source = readFileSync("src/data/rainfall-formulas-template.csv", "utf8");
describe("national catalogue integration", () => {
  it("includes all 70 IDs across 34 cities without changing supplied coefficients or source URLs", () => {
    expect(cityFormulas).toHaveLength(70);
    expect(new Set(cityFormulas.map((f) => f.city)).size).toBe(34);
    expect(resolveCityFormula("shanghai-all-2017", 10, 120)).toMatchObject({
      a: 1600,
      c: 0.846,
      b: 7,
      n: 0.656,
    });
    expect(
      cityFormulas.find((f) => f.id === "chengdu-short-z3-2026")!.source.url,
    ).toMatch(/^http:\/\//);
    expect(
      cityFormulas.find((f) => f.id === "xian-short-2026")!.periods,
    ).toEqual([]);
    expect(
      cityFormulas.find((f) => f.id === "taiyuan-chengbei-2024")!.duration,
    ).toEqual([null, 60]);
  });
  it("converts hm2 and hm² unit aliases and retains unknown or one-sided bounds", () => {
    const simple = source.split(/\r?\n/).slice(0, 2).join("\n");
    for (const alias of ["L/(s·hm²)", "L/(s·hm2)"]) {
      const f = parseFormulaTable(
        simple.replace("mm/min", alias).replace(",2,100,,1,1440,", ",,,,,180,"),
      )[0];
      expect(f.coefficients?.unit).toBe("lsha");
      expect(f.periods).toEqual([]);
      expect(f.duration).toEqual([null, 180]);
    }
  });
  it("enforces strict source boundaries and coupled Haikou ranges", () => {
    for (const [id, p, t] of [
      ["changsha-highP-2022", 10, 60],
      ["taiyuan-chengbei-2024", 10, 60],
      ["taiyuan-chengnan-2024", 10, 60],
      ["beijing-zone1-long-2016", 10, 5],
      ["ningbo-zhenhai-2023", 10, 5],
      ["haikou-short-2025", 20, 120],
      ["haikou-long-2025", 5, 120],
    ] as const)
      expect(() => resolveCityFormula(id, p, t)).toThrow(/范围|边界/);
    expect(resolveCityFormula("changsha-highP-2022", 10.1, 60).n).toBe(1.04);
    expect(resolveCityFormula("haikou-long-2025", 5, 181).formula).toBe(
      "direct",
    );
    expect(() => resolveCityFormula("xian-short-2026", 0, 60)).toThrow(
      /重现期/,
    );
    expect(() => resolveCityFormula("taiyuan-chengbei-2024", 10, 61)).toThrow(
      /历时/,
    );
  });
  it("calculates Haikou corrected periods and Guiyang variable b without changing the design P", () => {
    const p = resolveCityFormula("haikou-short-2025", 5, 120);
    const pe = 1 / -Math.log1p(-1 / 5);
    expect(p).toMatchObject({
      formula: "direct",
      returnPeriod: 5,
      unit: "mmmin",
    });
    expect(p.a).toBeCloseTo(16.742 * (1 + 0.49 * Math.log10(pe)), 10);
    const gui = resolveCityFormula("guiyang-city-2014", 50, 120);
    expect(gui.b).toBeCloseTo(9.35 * 50 ** 0.031, 10);
    expect(gui.a).toBeCloseTo(1887 * (1 + 0.707 * Math.log10(50)), 10);
    const r = generateCityChicago("guiyang-city-2014", {
      returnPeriod: 50,
      durationMinutes: 120,
      peakRatio: 0.4,
      stepSeconds: 60,
    });
    expect(r.stats.totalMM).toBeCloseTo(
      (gui.a * 0.36 * 120) / (120 + gui.b) ** 0.695 / 60,
      8,
    );
  });
  it("keeps draft and scholarly provenance without claiming an independent official verification", () => {
    const r = generateCityChicago("xiamen-main-2021", {
      returnPeriod: 10,
      durationMinutes: 120,
      peakRatio: 0.4,
      stepSeconds: 60,
    });
    expect(r.generation!.catalogue!.note).toContain("征求意见稿");
    expect(r.warnings.join(" ")).not.toContain("已核对收录版本原文");
  });
  it("rejects unsupported calculation rules rather than ignoring them", () => {
    expect(() =>
      parseFormulaTable(
        source
          .replace("备注", "备注,计算规则")
          .split(/\r?\n/)
          .slice(0, 2)
          .map((s, i) => (i ? s + ",eval(P)" : s))
          .join("\n"),
      ),
    ).toThrow(/规则/);
  });
  it("rejects special rules on fixed-P rows and inconsistent boundary metadata", () => {
    const rows = source.trim().split(/\r?\n/);
    const header = rows[0] + ",计算规则,历时下限开区间";
    expect(() =>
      parseFormulaTable([header, rows[2] + ",海口总公式I,"].join("\n")),
    ).toThrow(/规则/);
    expect(() =>
      parseFormulaTable(
        [
          header,
          rows[2] + ",,是",
          rows[2].replace(",10,1,180,", ",20,1,180,") + ",,",
        ].join("\n"),
      ),
    ).toThrow(/元数据/);
  });
});
