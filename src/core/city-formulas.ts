import { generateChicago, type ChicagoParameters } from "./chicago";
import type { RainOptions } from "./rainfall";
import bundledFormulaCsv from "../data/rainfall-formulas.csv?raw";
import { parseFormulaTable, type FormulaTableEntry } from "./formula-table";

export type CityFormula = FormulaTableEntry;
export const cityFormulas = parseFormulaTable(bundledFormulaCsv, {
  kind: "bundled",
  filename: "rainfall-formulas.csv",
});
export function resolveCityFormula(
  id: string,
  returnPeriod: number,
  durationMinutes: number,
  entries: FormulaTableEntry[] = cityFormulas,
): ChicagoParameters {
  const f = entries.find((f) => f.id === id);
  if (!f) throw new Error("未知城市公式。");
  if (
    !Number.isFinite(returnPeriod) ||
    returnPeriod <= 0 ||
    (f.discrete
      ? !f.periods.includes(returnPeriod)
      : f.periods.length > 0 &&
        (returnPeriod < f.periods[0] || returnPeriod > f.periods[1])) ||
    (f.periodMinExclusive && returnPeriod === f.periods[0])
  )
    throw new Error(
      "重现期超出该条目的收录范围：" +
        f.periods.join(f.discrete ? "、" : "–") +
        " 年。",
    );
  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0 ||
    (f.duration &&
      ((f.duration[0] !== null && durationMinutes < f.duration[0]) ||
        (f.duration[1] !== null && durationMinutes > f.duration[1]))) ||
    (f.durationMinExclusive && durationMinutes === f.duration?.[0]) ||
    (f.durationMaxExclusive && durationMinutes === f.duration?.[1])
  )
    throw new Error(
      "历时超出该公式范围：" + (f.duration?.join("–") ?? "正值") + " min。",
    );
  const v = f.table?.[returnPeriod];
  let coefficients: NonNullable<FormulaTableEntry["coefficients"]> = v
    ? {
        formula: "direct" as const,
        a: v[0],
        b: v[1],
        n: v[2],
        unit: f.unit ?? "lsha",
      }
    : f.coefficients!;
  if (f.calculationRule) {
    if (
      f.calculationRule === "海口总公式I" &&
      (returnPeriod <= 1 || returnPeriod > 10 || durationMinutes > 180)
    )
      throw new Error("海口总公式I超出范围：5≤t≤180min、2≤P≤10年。");
    if (
      f.calculationRule === "海口总公式II" &&
      (returnPeriod <= 1 || (durationMinutes <= 180 && returnPeriod <= 10))
    )
      throw new Error(
        "海口总公式II超出范围：t≤180min时须P>10年，t>180min时按收录P范围。",
      );
    const period = f.calculationRule.startsWith("海口")
      ? 1 / -Math.log1p(-1 / returnPeriod)
      : returnPeriod;
    coefficients = {
      formula: "direct",
      unit: coefficients.unit,
      n: coefficients.n,
      a: coefficients.a * (1 + coefficients.c! * Math.log10(period)),
      b:
        coefficients.b *
        (f.calculationRule === "b乘P的0.031次方" ? returnPeriod ** 0.031 : 1),
    };
  }
  return {
    ...coefficients,
    returnPeriod,
    durationMinutes,
    peakRatio: f.peakRatio ?? 0.4,
    stepSeconds: 60,
    source: [
      f.city,
      f.label,
      f.source.title,
      f.source.version,
      f.source.url,
      f.source.attachment ?? "",
      f.source.location,
      "核实日期 " + f.source.checked,
      "适用地域 " + f.scope,
      f.note,
    ].join(" | "),
  };
}
export function generateCityChicago(
  id: string,
  storm: Pick<
    ChicagoParameters,
    "returnPeriod" | "durationMinutes" | "peakRatio" | "stepSeconds"
  >,
  output: RainOptions = {},
  entries: FormulaTableEntry[] = cityFormulas,
  catalogueFilename = "rainfall-formulas.csv",
) {
  const p = resolveCityFormula(
    id,
    storm.returnPeriod!,
    storm.durationMinutes,
    entries,
  );
  const result = generateChicago(
    { ...p, peakRatio: storm.peakRatio, stepSeconds: storm.stepSeconds },
    output,
  );
  const f = entries.find((f) => f.id === id)!;
  result.generation!.catalogue = {
    id: f.id,
    city: f.city,
    region: f.label,
    source: { ...f.source },
    scope: f.scope,
    duration: f.duration,
    periods: [...f.periods],
    note: f.note,
    calculationRule: f.calculationRule,
    periodMinExclusive: f.periodMinExclusive,
    durationMinExclusive: f.durationMinExclusive,
    durationMaxExclusive: f.durationMaxExclusive,
    origin: {
      kind: f.origin?.kind ?? "bundled",
      filename: f.origin?.filename ?? catalogueFilename,
    },
  };
  result.guide +=
    "\n\n公式表格条目\n" +
    JSON.stringify(result.generation!.catalogue, null, 2) +
    "\n生成的芝加哥雨型不替代地方规定设计雨型。";
  result.warnings = result.warnings.filter(
    (w) => !w.startsWith("公式参数由用户提供"),
  );
  result.warnings.push(
    f.origin?.kind === "imported"
      ? "该公式来自用户导入表格，未由工具核实官方原文；请自行核对来源、版本和适用范围。"
      : "来源与版本按公式目录记录，含草案、论文或转载时以条目说明为准；使用前须核对当地现行要求。" +
          f.note,
    "芝加哥雨型为工具选用雨型，不能等同于地方指定设计雨型；r由用户确定。",
  );
  return result;
}
