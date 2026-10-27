import { generateChicago, type ChicagoParameters } from "./chicago";
import type { RainOptions } from "./rainfall";
import bundledFormulaCsv from "../data/rainfall-formulas.csv?raw";
import formulaTemplateCsv from "../data/rainfall-formulas-template.csv?raw";
import { parseFormulaTable, type FormulaTableEntry } from "./formula-table";

export type CityFormula = FormulaTableEntry;
export const cityFormulas = parseFormulaTable(bundledFormulaCsv, {
  kind: "bundled",
  filename: "rainfall-formulas.csv",
});
export const bundledFormulaTable = bundledFormulaCsv;
export const formulaTemplateTable = formulaTemplateCsv;

export const formulaFollowups = [
  {
    city: "北京",
    url: "https://ghzrzyw.beijing.gov.cn/biaozhunguanli/bz/cxgh/202002/t20200220_1662906.html",
    note: "已定位DB11/T 969-2016官方全文。公式分I/II区、1–5与5–1440min；分段连续雨型需单独实现，尚不启用。",
  },
  {
    city: "上海",
    url: "https://swj.sh.gov.cn/swj-zhzwqtzcwj/20260116/321ff7d9c904431caba046492326f92d.html",
    note: "官方文件引用DB31/T1043-2017；尚未完成标准全文系数和适用范围复核。",
  },

  {
    city: "武汉",
    url: "https://std.samr.gov.cn/db/search/stdDBDetailed?id=D7B84B1B611D43CFE05397BE0A0AC19B",
    note: "已定位DB4201/T641-2020官方登记，全文参数尚未复核。",
  },
  {
    city: "昆山",
    url: "https://www.ks.gov.cn/kss/swbmwj/202605/95caeb331df6468eab1b82bda0fb734f.shtml",
    note: "2026官方通知已定位，P2–100年、t5–180min、r0.44。公式图片指数尚未可靠复核，不启用。",
  },
  {
    city: "郑州",
    url: "https://zrzyhghj.zhengzhou.gov.cn/tzgg/6928586.jhtml",
    note: "2023官方发布通知已定位，DOC附件读取失败，尚不启用系数。",
  },
  {
    city: "成都、西安、杭州、海口、三亚",
    url: "https://www.mohurd.gov.cn/gongkai/zc/wjk/art/2025/art_08015381a0b64e8d84f5a2f1a7509fee.html",
    note: "尚未完成各地当前官方原文与系数核实；本链接是修订工作要求，不是这些城市的公式来源。",
  },
];
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
    (f.discrete
      ? !f.periods.includes(returnPeriod)
      : returnPeriod < f.periods[0] || returnPeriod > f.periods[1])
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
      (durationMinutes < f.duration[0] || durationMinutes > f.duration[1]))
  )
    throw new Error(
      "历时超出该公式范围：" + (f.duration?.join("–") ?? "正值") + " min。",
    );
  const v = f.table?.[returnPeriod];
  const coefficients = v
    ? {
        formula: "direct" as const,
        a: v[0],
        b: v[1],
        n: v[2],
        unit: f.unit ?? "lsha",
      }
    : f.coefficients!;
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
      : "已核对收录版本原文，不保证实时最新；须核对项目所在地适用版本。" +
          f.note,
    "芝加哥雨型为工具选用雨型，不能等同于地方指定设计雨型；r由用户确定。",
  );
  return result;
}
