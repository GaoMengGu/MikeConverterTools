import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as rainfall from "../src/core/rainfall";

describe("rainfall sequence conversion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 26, 12));
  });
  afterEach(() => vi.useRealTimers());
  it("defaults elapsed and indexed sequences to local midnight on the current date", () => {
    vi.setSystemTime(new Date(2027, 0, 2, 23, 59));
    for (const timeMode of ["elapsed", "index"] as const) {
      const text = timeMode === "index" ? "0\n60" : "0 0\n1 60";
      const result = rainfall.convertRainfall(text, { timeMode });
      expect(result.stats.start).toBe("2027-01-02 00:00:00");
      expect(result.content).toContain("2027-01-02 00:01:00,60");
      expect(
        rainfall.convertRainfall(text, {
          timeMode,
          start: "2025-12-31T10:15:00",
        }).stats.start,
      ).toBe("2025-12-31 10:15:00");
    }
  });
  it("rejects missing indexed measurements and empty delimited fields", () => {
    expect(() =>
      rainfall.convertRainfall("60\n\n120", { timeMode: "index" }),
    ).toThrow(/空行|缺/);
    expect(() => rainfall.convertRainfall("0,0\n1,,60\n2,0")).toThrow(
      /两列|缺/,
    );
    expect(() => rainfall.convertRainfall("0\t0\n1\t\t60\n2\t0")).toThrow(
      /两列|缺/,
    );
    expect(
      rainfall.convertRainfall("60\n60\n", { timeMode: "index" }).stats.records,
    ).toBe(2);
  });
  it("converts elapsed Chicago time to dated CSV without changing samples", () => {
    const r = rainfall.convertRainfall(
      "时间(hh:mm) 雨强(mm/h)\n00:00 0\n00:01 60\n00:02 0",
      {},
    );
    expect(r.content).toBe(
      "2026-06-26 00:00:00,0\n2026-06-26 00:01:00,60\n2026-06-26 00:02:00,0\n",
    );
    expect(r.stats).toMatchObject({
      records: 3,
      durationSeconds: 120,
      stepSeconds: 60,
      totalMM: 1,
      peakMMH: 60,
      peakTime: "2026-06-26 00:01:00",
    });
    expect(r.importSettings).toMatchObject({
      itemType: "Precipitation Rate",
      unit: "mm/hour",
      valueType: "Instantaneous",
      startRow: 1,
      valueColumn: 2,
    });
  });
  it("writes real tabs and retains small SI rates", () => {
    const r = rainfall.convertRainfall("0 3.6\n60 3.6", {
      elapsedUnit: "seconds",
      outputUnit: "ms",
      delimiter: "tab",
    });
    expect(r.content).toBe(
      "2026-06-26 00:00:00\t0.000001\n2026-06-26 00:01:00\t0.000001\n",
    );
    expect(r.stats.totalMM).toBeCloseTo(0.06);
    expect(r.filename).toMatch(/\.txt$/);
    expect(r.importSettings.delimiter).toBe("Tab");
    expect(r.importSettings.unit).toBe("m/s");
  });
  it("converts SI input to mm/h and handles numeric minutes", () => {
    const r = rainfall.convertRainfall("0 0.000001\n1 0.000002", {
      inputUnit: "ms",
    });
    expect(r.stats.peakMMH).toBeCloseTo(7.2);
    expect(r.stats.totalMM).toBeCloseTo(0.09);
  });
  it("keeps absolute wall-clock times without timezone shifting", () => {
    const r = rainfall.convertRainfall(
      "2026/06/26 23:59:00,60\n2026-06-27 00:01:00,60",
      { timeMode: "absolute" },
    );
    expect(r.stats.start).toBe("2026-06-26 23:59:00");
    expect(r.stats.end).toBe("2026-06-27 00:01:00");
    expect(r.stats.totalMM).toBe(2);
  });
  it("creates timestamps for one-column rates and includes both endpoints", () => {
    const r = rainfall.convertRainfall("60\n60\n60", {
      timeMode: "index",
      intervalSeconds: 10,
      start: "2026-06-26T23:59:50",
    });
    expect(r.stats.end).toBe("2026-06-27 00:00:10");
    expect(r.stats.durationSeconds).toBe(20);
    expect(r.stats.totalMM).toBeCloseTo(1 / 3);
  });
  it("distinguishes instantaneous and interval-mean integration", () => {
    const input = "0 0\n1 60\n2 120";
    expect(rainfall.convertRainfall(input).stats.totalMM).toBe(2);
    const backward = rainfall.convertRainfall(input, { valueType: "backward" });
    expect(backward.stats.totalMM).toBe(3);
    expect(backward.importSettings.valueType).toBe("MeanStepBackward");
    expect(
      rainfall.convertRainfall(input, { valueType: "forward" }).stats.totalMM,
    ).toBe(1);
  });
  it("warns on irregular time steps and does not resample", () => {
    const r = rainfall.convertRainfall("0 60\n1 60\n3 60");
    expect(r.stats.stepSeconds).toBeNull();
    expect(r.stats.records).toBe(3);
    expect(r.warnings.join(" ")).toMatch(/非等间隔/);
    expect(r.stats.totalMM).toBe(3);
  });
  it.each([
    ["0 60\n0 60", /重复|递增/],
    ["1 60\n0 60", /递增|倒序/],
    ["0 -1\n1 2", /负/],
    ["0 NaN\n1 2", /第 1 行/],
    ["0 1\nbroken\n1 2", /第 2 行/],
    ["00:61 1\n01:02 2", /时间/],
    ["0 1", /至少.*2/],
  ])(
    "rejects invalid data rather than silently losing rain: %s",
    (input, error) => {
      expect(() => rainfall.convertRainfall(input)).toThrow(error);
    },
  );
  it("validates calendar and sampling parameters", () => {
    for (const start of ["2026-02-30 00:00:00", "2026-06-26T25:00:00", "bad"])
      expect(() => rainfall.convertRainfall("0 1\n1 2", { start })).toThrow(
        /日期|时间/,
      );
    expect(() =>
      rainfall.convertRainfall("1\n2", {
        timeMode: "index",
        intervalSeconds: 0,
      }),
    ).toThrow(/间隔/);
    expect(() => rainfall.convertRainfall("0.001 1\n1 2")).toThrow(/整秒/);
  });
  it("respects explicit starting row but rejects bad rows within the data", () => {
    const r = rainfall.convertRainfall("description\nnotes\n0 60\n1 60", {
      startRow: 3,
    });
    expect(r.stats.records).toBe(2);
    expect(r.stats.headerRows).toBe(2);
  });
  it("reports rainfall totals and has no forced dry endpoints", () => {
    const r = rainfall.convertRainfall(
      Array.from({ length: 121 }, (_, i) => `${i} 60`).join("\n"),
    );
    expect(r.stats).toMatchObject({
      records: 121,
      durationSeconds: 7200,
      totalMM: 120,
    });
    expect(r.warnings.join(" ")).toMatch(/端点/);
    expect(r.guide).toContain("Precipitation Rate");
    expect(r.guide).toContain("121");
  });
});
