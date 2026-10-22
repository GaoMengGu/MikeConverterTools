import { describe, expect, it } from "vitest";
import * as chicago from "../src/core/chicago";

const settings = {
  formula: "return-period" as const,
  a: 1000,
  c: 0.5,
  b: 10,
  n: 0.7,
  unit: "mmh" as const,
  returnPeriod: 3,
  durationMinutes: 120,
  peakRatio: 0.4,
  stepSeconds: 60,
};
describe("Chicago hyetograph", () => {
  it("accepts integral-second durations affected by floating point multiplication", () => {
    expect(
      chicago.generateChicago({
        ...settings,
        durationMinutes: 2.05,
        stepSeconds: 1,
      }).stats.records,
    ).toBe(124);
  });
  it("matches independently calculated symmetric interval means", () => {
    const r = chicago.generateChicago({
      ...settings,
      formula: "direct",
      a: 600,
      b: 10,
      n: 1,
      durationMinutes: 20,
      peakRatio: 0.5,
      stepSeconds: 300,
    });
    const values = r.content
      .trim()
      .split("\n")
      .map((s) => Number(s.split(",")[1]));
    expect(values).toEqual([0, 10, 30, 30, 10]);
    expect(r.stats.totalMM).toBeCloseTo(20 / 3, 12);
  });
  it("preserves the IDF total with 121 backward-mean endpoints", () => {
    const r = chicago.generateChicago(settings);
    const total = (1000 * (1 + 0.5 * Math.log10(3)) * 120) / 130 ** 0.7 / 60;
    expect(r.stats.totalMM).toBeCloseTo(total, 10);
    expect(r.stats.records).toBe(121);
    expect(r.stats.durationSeconds).toBe(7200);
    expect(r.importSettings.valueType).toBe("MeanStepBackward");
    expect(r.generation).toMatchObject({
      peakSeconds: 2880,
      theoreticalTotalMM: total,
    });
    const values = r.content
      .trim()
      .split("\n")
      .map((s) => Number(s.split(",")[1]));
    expect(values[0]).toBe(0);
    expect(values.reduce((a, b) => a + b, 0) / 60).toBeCloseTo(total, 9);
    expect(values.indexOf(Math.max(...values))).toBeGreaterThanOrEqual(48);
    expect(values.indexOf(Math.max(...values))).toBeLessThanOrEqual(49);
  });
  it("converts L/s/ha to mm/h exactly and applies output SI units", () => {
    const q = chicago.generateChicago(
      { ...settings, unit: "lsha" },
      { outputUnit: "ms", delimiter: "tab" },
    );
    const i = chicago.generateChicago({ ...settings, a: 360 });
    expect(q.stats.totalMM).toBeCloseTo(i.stats.totalMM, 10);
    expect(q.importSettings.unit).toBe("m/s");
    expect(q.content).toContain("\t");
  });
  it("supports an already calibrated coefficient without a return period term", () => {
    const full = chicago.generateChicago(settings);
    const direct = chicago.generateChicago({
      ...settings,
      formula: "direct",
      a: settings.a * (1 + settings.c * Math.log10(3)),
    });
    expect(direct.content).toBe(full.content);
  });
  it("conserves totals for different peak ratios, including extreme interior peaks", () => {
    for (const peakRatio of [0.001, 0.2, 0.5, 0.9, 0.999]) {
      const r = chicago.generateChicago({ ...settings, peakRatio });
      expect(r.stats.totalMM).toBeCloseTo(r.generation!.theoreticalTotalMM, 9);
      expect(r.preview.every((p) => p.mmh >= 0)).toBe(true);
    }
  });
  it("does not change total depth when changing the sampling interval", () => {
    expect(
      chicago.generateChicago({ ...settings, stepSeconds: 10 }).stats.totalMM,
    ).toBeCloseTo(chicago.generateChicago(settings).stats.totalMM, 9);
  });
  it("requires real parameters and rejects invalid domains and fractional interval counts", () => {
    for (const patch of [
      { a: NaN },
      { a: 0 },
      { c: NaN },
      { b: 0 },
      { n: 1.1 },
      { n: 0 },
      { returnPeriod: 0 },
      { peakRatio: 0 },
      { peakRatio: 1 },
      { stepSeconds: 0 },
      { stepSeconds: 61 },
      { durationMinutes: -1 },
      { formula: "unknown" },
      { unit: "unknown" },
    ])
      expect(() =>
        chicago.generateChicago({ ...settings, ...patch } as typeof settings),
      ).toThrow();
  });
  it("forces the generated series physical meaning regardless of file conversion settings", () => {
    const r = chicago.generateChicago(settings, {
      inputUnit: "ms",
      valueType: "instant",
      timeMode: "absolute",
      start: "2026-07-01T00:00:00",
    });
    expect(r.stats.start).toBe("2026-07-01 00:00:00");
    expect(r.stats.totalMM).toBeCloseTo(r.generation!.theoreticalTotalMM, 9);
    expect(r.importSettings.valueType).toBe("MeanStepBackward");
  });
});
