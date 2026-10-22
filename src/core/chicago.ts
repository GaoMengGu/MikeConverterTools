import { convertRainfall, type RainOptions, type RainResult } from "./rainfall";

export interface ChicagoParameters {
  formula: "return-period" | "direct";
  a: number;
  c?: number;
  b: number;
  n: number;
  unit: "mmh" | "mmmin" | "lsha";
  returnPeriod?: number;
  durationMinutes: number;
  peakRatio: number;
  stepSeconds: number;
  source?: string;
}

// These are equation structures, not local rainfall coefficients or city presets.
export const formulaTemplates = [
  {
    id: "return-period",
    label: "含重现期项",
    equation: "i(t,P) = A × (1 + C × log10(P)) / (t + b)^n",
  },
  {
    id: "direct",
    label: "已按重现期确定系数",
    equation: "i(t) = Aₚ / (t + b)^n",
  },
] as const;

export function generateChicago(
  p: ChicagoParameters,
  output: RainOptions = {},
): RainResult {
  if (!formulaTemplates.some((f) => f.id === p.formula))
    throw new Error("不支持的公式形式，请选择已有模板并核对原公式。");
  if (!["mmh", "mmmin", "lsha"].includes(p.unit))
    throw new Error("公式输出单位须为 mm/h、mm/min 或 L/(s·ha)。");
  for (const [name, v] of Object.entries({
    A: p.a,
    b: p.b,
    n: p.n,
    历时: p.durationMinutes,
    雨峰系数: p.peakRatio,
    步长: p.stepSeconds,
  }))
    if (!Number.isFinite(v)) throw new Error(`请填写有效的${name}参数。`);
  if (p.a <= 0 || p.b <= 0 || p.n <= 0 || p.n > 1)
    throw new Error("公式须满足 A > 0、b > 0、0 < n ≤ 1；t 和 b 单位为分钟。");
  if (p.peakRatio <= 0 || p.peakRatio >= 1)
    throw new Error("雨峰系数 r 须在 0 和 1 之间。");
  const rawSeconds = p.durationMinutes * 60;
  const durationSeconds = Math.round(rawSeconds);
  if (
    durationSeconds <= 0 ||
    Math.abs(rawSeconds - durationSeconds) > 1e-6 ||
    !Number.isSafeInteger(durationSeconds) ||
    !Number.isSafeInteger(p.stepSeconds) ||
    p.stepSeconds <= 0
  )
    throw new Error("历时须为正的整秒数，步长须为正整数秒。");
  const intervals = durationSeconds / p.stepSeconds;
  if (!Number.isInteger(intervals) || intervals < 1)
    throw new Error("历时须能被采样步长整除，至少包含一个区间。");
  if (intervals + 1 > 2_000_000)
    throw new Error("生成记录超过 200 万条，请增大步长。");
  let coefficient = p.a;
  if (p.formula === "return-period") {
    if (
      !Number.isFinite(p.c) ||
      p.c! < 0 ||
      !Number.isFinite(p.returnPeriod) ||
      p.returnPeriod! <= 0
    )
      throw new Error("请填写 C ≥ 0 和重现期 P > 0（年）。");
    coefficient *= 1 + p.c! * Math.log10(p.returnPeriod!);
  }
  coefficient *= p.unit === "lsha" ? 0.36 : p.unit === "mmmin" ? 60 : 1;
  if (!Number.isFinite(coefficient) || coefficient <= 0)
    throw new Error("所选重现期下的公式系数须为有限正数。");
  const depth = (t: number) => (coefficient * t) / (t + p.b) ** p.n / 60;
  const total = depth(p.durationMinutes),
    tp = p.peakRatio * p.durationMinutes;
  if (!Number.isFinite(total) || total <= 0)
    throw new Error("公式雨量超出有效数值范围，请核对参数。");
  // Integrating the Chicago limbs gives cumulative depth. Differencing this
  // function produces interval means and conserves the IDF storm depth.
  const cumulative = (t: number) =>
    t <= tp
      ? p.peakRatio * (total - depth((tp - t) / p.peakRatio))
      : p.peakRatio * total +
        (1 - p.peakRatio) * depth((t - tp) / (1 - p.peakRatio));
  const rows = ["0"];
  let previous = 0;
  for (let i = 1; i <= intervals; i++) {
    const current =
      i === intervals ? total : cumulative((i * p.stepSeconds) / 60);
    const rate = ((current - previous) * 3600) / p.stepSeconds;
    if (!Number.isFinite(rate) || rate < -1e-8)
      throw new Error("生成雨强无效，请核对公式参数与时间步长。");
    rows.push(String(Math.max(0, rate)));
    previous = current;
  }
  const result = convertRainfall(rows.join("\n"), {
    ...output,
    name: output.name ?? "chicago_rainfall",
    inputUnit: "mmh",
    timeMode: "index",
    intervalSeconds: p.stepSeconds,
    startRow: 1,
    valueType: "backward",
  });
  const template = formulaTemplates.find((f) => f.id === p.formula)!;
  result.generation = {
    parameters: { ...p },
    formula: template.equation,
    peakSeconds: tp * 60,
    theoreticalTotalMM: total,
    differenceMM: result.stats.totalMM - total,
  };
  result.warnings.push(
    "公式参数由用户提供，未自动验证地方适用性或有效历时范围。生成值为时段平均雨强，图表峰值不等于连续瞬时峰值。",
  );
  result.guide +=
    `\n\n芝加哥雨型生成\n${template.equation}\n${JSON.stringify(p, null, 2)}\n` +
    `理论总雨量: ${total} mm\n生成与理论雨量差: ${result.generation.differenceMM} mm\n雨峰位置: ${tp} min\n` +
    "每个时段对连续芝加哥雨型积分，输出平均雨强；不按瞬时采样近似。\n" +
    "起点记录取 0，因其前方没有时段；MeanStepBackward 不用此值计算第一个区间。\n" +
    "不根据地区自动填入未经核验的公式参数。";
  return result;
}
