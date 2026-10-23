import { describe, expect, it } from "vitest";
import {
  cityFormulas,
  resolveCityFormula,
  generateCityChicago,
} from "../src/core/city-formulas";
describe("official rainfall catalogue", () => {
  it("keeps stable provenance and rejects unknown, out-of-scope and altered local coefficients", () => {
    for (const f of cityFormulas) {
      expect(f.source.url).toMatch(/^https:\/\/.+\.(gov.cn|cma.cn)\//);
      expect(f.source.checked).toBe("2026-10-23");
      expect(f.scope.length).toBeGreaterThan(3);
    }
    expect(new Set(cityFormulas.map((f) => f.id)).size).toBe(
      cityFormulas.length,
    );
    expect(() => resolveCityFormula("unknown", 10, 60)).toThrow();
    expect(() => resolveCityFormula("nanjing-south-2024", 1, 60)).toThrow(
      /重现期/,
    );
    expect(() => resolveCityFormula("nanjing-south-2024", 10, 1441)).toThrow(
      /历时/,
    );
  });
  it("reproduces Nanjing official equation and integrates its total depth", () => {
    const p = resolveCityFormula("nanjing-south-2024", 10, 120);
    expect(p).toMatchObject({
      a: 16.696,
      c: 0.954,
      b: 18.825,
      n: 0.751,
      unit: "mmmin",
    });
    const r = generateCityChicago(
      "nanjing-south-2024",
      {
        returnPeriod: 10,
        durationMinutes: 120,
        peakRatio: 0.44,
        stepSeconds: 60,
      },
      { start: "2026-06-26T00:00:00" },
    );
    expect(r.stats.totalMM).toBeCloseTo(
      (16.696 * (1 + 0.954) * 120) / 138.825 ** 0.751,
      8,
    );
    expect(r.generation?.parameters.source).toContain("nanjing.gov.cn");
  });
  it("uses Shenzhen published period tables without interpolating unsupported periods", () => {
    expect(resolveCityFormula("shenzhen-central-2024", 10, 60)).toMatchObject({
      formula: "direct",
      a: 5226.599,
      b: 21.591,
      n: 0.703,
      unit: "lsha",
    });
    expect(() => resolveCityFormula("shenzhen-central-2024", 7, 60)).toThrow(
      /重现期/,
    );
  });
});
it("uses Guangzhou official per-period coefficients and keeps short storms within the source range", () => {
  expect(resolveCityFormula("guangzhou-central-2022", 10, 60)).toMatchObject({
    a: 16971.542,
    b: 34.941,
    n: 0.916,
    unit: "lsha",
    formula: "direct",
  });
  expect(() => resolveCityFormula("guangzhou-central-2022", 7, 60)).toThrow(
    /重现期/,
  );
  expect(() => resolveCityFormula("guangzhou-central-2022", 10, 181)).toThrow(
    /历时/,
  );
});
it("all enabled region/period combinations generate nonnegative conserved interval means", () => {
  for (const f of cityFormulas)
    for (const period of f.discrete
      ? f.periods
      : [f.periods[0], f.periods[1]]) {
      const r = generateCityChicago(
        f.id,
        {
          returnPeriod: period,
          durationMinutes: 120,
          stepSeconds: 60,
          peakRatio: 0.4,
        },
        { start: "2026-06-26T00:00:00" },
      );
      expect(r.stats.totalMM).toBeGreaterThan(0);
      expect(Math.abs(r.generation!.differenceMM)).toBeLessThan(1e-7);
      expect(r.preview.every((p) => p.mmh >= 0)).toBe(true);
    }
});
it("resolves coefficients in the core and does not accept forged overrides", () => {
  const r = generateCityChicago(
    "nanjing-south-2024",
    {
      returnPeriod: 10,
      durationMinutes: 120,
      stepSeconds: 60,
      peakRatio: 0.4,
      ...{ a: 999, unit: "mmh" },
    } as never,
    { start: "2026-06-26T00:00:00" },
  );
  expect(r.generation?.parameters.a).toBe(16.696);
});
