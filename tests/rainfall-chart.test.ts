import { describe, expect, it } from "vitest";
import { convertRainfall } from "../src/core/rainfall";
import { generateChicago } from "../src/core/chicago";

describe("full-series cumulative rainfall for charts", () => {
  it.each([
    ["instant", [0, 0.5, 2]],
    ["backward", [0, 1, 3]],
    ["forward", [0, 0, 1]],
  ] as const)(
    "keeps exact cumulative depths for %s samples",
    (valueType, expected) => {
      const r = convertRainfall("0 0\n1 60\n2 120", { valueType });
      expect(r.preview.map((p) => p.cumulativeMM)).toEqual(expected);
      expect(r.preview.at(-1)!.cumulativeMM).toBe(r.stats.totalMM);
    },
  );
  it("retains narrow unsampled rainfall events in cumulative depths and the peak", () => {
    const input = Array.from(
      { length: 16001 },
      (_, i) => `${i} ${i === 3 ? 600 : 0}`,
    ).join("\n");
    const r = convertRainfall(input);
    expect(r.preview.length).toBeLessThan(r.stats.records);
    expect(r.preview.find((p) => p.mmh === 600)).toMatchObject({
      seconds: 180,
      cumulativeMM: 5,
    });
    expect(r.preview.find((p) => p.seconds === 300)!.cumulativeMM).toBe(10);
    expect(r.preview.at(-1)!.cumulativeMM).toBe(10);
    expect(r.stats.totalMM).toBe(10);
  });
  it("handles irregular intervals and zero rain without invented depths", () => {
    const irregular = convertRainfall("0 60\n1 120\n4 0");
    expect(irregular.preview.map((p) => p.cumulativeMM)).toEqual([0, 1.5, 4.5]);
    const zero = convertRainfall("0 0\n1 0");
    expect(zero.preview.map((p) => p.cumulativeMM)).toEqual([0, 0]);
  });
  it("matches generated Chicago totals regardless of output units", () => {
    const r = generateChicago(
      {
        formula: "direct",
        a: 1000,
        b: 20,
        n: 0.8,
        unit: "mmh",
        durationMinutes: 120,
        peakRatio: 0.4,
        stepSeconds: 60,
      },
      { outputUnit: "ms" },
    );
    const cumulative = r.preview.map((p) => p.cumulativeMM);
    expect(cumulative[0]).toBe(0);
    expect(cumulative.at(-1)).toBeCloseTo(r.generation!.theoreticalTotalMM, 8);
    expect(cumulative.every((p, i) => !i || p >= cumulative[i - 1])).toBe(true);
  });
});
