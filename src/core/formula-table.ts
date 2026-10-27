import type { ChicagoParameters } from "./chicago";

export type FormulaUnit = "mmh" | "mmmin" | "lsha";
export type FormulaCoefficients = Pick<
  ChicagoParameters,
  "formula" | "a" | "b" | "c" | "n" | "unit"
>;

export interface FormulaTableEntry {
  id: string;
  city: string;
  label: string;
  scope: string;
  source: {
    title: string;
    url: string;
    attachment?: string;
    version: string;
    published: string;
    checked: string;
    location: string;
  };
  duration: [number | null, number | null] | null;
  periods: [number, number] | number[];
  discrete?: boolean;
  unit?: FormulaUnit;
  coefficients?: FormulaCoefficients;
  table?: Record<number, [number, number, number]>;
  peakRatio?: number;
  note: string;
  calculationRule?: "海口总公式I" | "海口总公式II" | "b乘P的0.031次方";
  periodMinExclusive?: boolean;
  durationMinExclusive?: boolean;
  durationMaxExclusive?: boolean;
  origin?: { kind: "bundled" | "imported"; filename?: string };
}

export const formulaTableColumns = [
  "公式ID",
  "城市",
  "分区名称",
  "适用地域",
  "公式类型",
  "雨强单位",
  "A",
  "C",
  "b",
  "n",
  "P最小值_年",
  "P最大值_年",
  "P固定值_年",
  "历时最小值_min",
  "历时最大值_min",
  "雨峰系数r",
  "来源标题",
  "来源链接",
  "附件链接",
  "版本",
  "发布日期",
  "核实日期",
  "原文位置",
  "备注",
] as const;

type FormulaColumn = (typeof formulaTableColumns)[number];
const ruleColumns = [
  "计算规则",
  "P下限开区间",
  "历时下限开区间",
  "历时上限开区间",
] as const;
const formulaColumnSet = new Set<string>([
  ...formulaTableColumns,
  ...ruleColumns,
]);
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function fail(row: number, field: string, message: string): never {
  throw new Error(`第 ${row} 行「${field}」：${message}`);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let closedQuote = false;
  const input = text.replace(/^\uFEFF/, "");
  const pushField = () => {
    row.push(value);
    value = "";
    closedQuote = false;
  };
  const pushRow = () => {
    pushField();
    if (row.some((v) => v.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else value += ch;
      continue;
    }
    if (closedQuote) {
      if (ch === ",") pushField();
      else if (ch === "\n") pushRow();
      else if (ch === "\r" && input[i + 1] === "\n") {
        i++;
        pushRow();
      } else if (ch.trim() !== "")
        throw new Error("CSV 引号未正确闭合或引号后存在非法字符。");
      continue;
    }
    if (ch === '"' && value === "") quoted = true;
    else if (ch === ",") pushField();
    else if (ch === "\n") pushRow();
    else if (ch === "\r" && input[i + 1] === "\n") {
      i++;
      pushRow();
    } else if (ch === '"')
      throw new Error("CSV 引号必须从字段开头开始，并成对闭合。");
    else value += ch;
  }
  if (quoted) throw new Error("CSV 引号未正确闭合。");
  if (value !== "" || row.length) pushRow();
  return rows;
}

function text(
  row: Record<string, string>,
  key: FormulaColumn,
  rowNumber: number,
  required = true,
) {
  const value = (row[key] ?? "").trim();
  if (required && !value) fail(rowNumber, key, "不能为空。");
  return value;
}

function number(
  row: Record<string, string>,
  key: FormulaColumn,
  rowNumber: number,
  required = true,
) {
  const raw = text(row, key, rowNumber, required);
  if (!raw) return undefined;
  if (!numeric.test(raw) || !Number.isFinite(Number(raw)))
    fail(rowNumber, key, "必须是有限数值，不能填写公式或文本。");
  return Number(raw);
}

function positive(
  row: Record<string, string>,
  key: FormulaColumn,
  rowNumber: number,
  required = true,
) {
  const value = number(row, key, rowNumber, required);
  if (value !== undefined && value <= 0) fail(rowNumber, key, "必须大于 0。");
  return value;
}

function url(
  row: Record<string, string>,
  key: "来源链接" | "附件链接",
  rowNumber: number,
  required: boolean,
) {
  const value = text(row, key, rowNumber, required);
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error();
  } catch {
    fail(rowNumber, key, "必须使用 http:// 或 https:// 来源链接。");
  }
  return value;
}

function checkedDate(value: string, rowNumber: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) fail(rowNumber, "核实日期", "格式须为 YYYY-MM-DD。");
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    fail(rowNumber, "核实日期", "日期不存在。");
}

function unit(raw: string, rowNumber: number): FormulaUnit {
  const values: Record<string, FormulaUnit> = {
    "mm/h": "mmh",
    "mm/min": "mmmin",
    "L/(s·ha)": "lsha",
    "L/(s·hm²)": "lsha",
    "L/(s·hm2)": "lsha",
    mmh: "mmh",
    mmmin: "mmmin",
    lsha: "lsha",
  };
  const value = Object.hasOwn(values, raw) ? values[raw] : undefined;
  if (!value)
    fail(rowNumber, "雨强单位", "只能填写 mm/h、mm/min 或 L/(s·ha)。");
  return value;
}

export function parseFormulaTable(
  textValue: string,
  origin: FormulaTableEntry["origin"] = { kind: "imported" },
): FormulaTableEntry[] {
  if (textValue.length > 2 * 1024 * 1024)
    throw new Error("公式表格超过 2 MB，请缩小文件。");
  const rows = parseCsv(textValue);
  if (!rows.length) throw new Error("公式表格为空。");
  const header = rows[0].map((value) => value.trim());
  const seen = new Set<string>();
  for (const column of header) {
    if (!formulaColumnSet.has(column))
      throw new Error(`表头包含不支持的列「${column}」。`);
    if (seen.has(column)) throw new Error(`表头列「${column}」重复。`);
    seen.add(column);
  }
  for (const column of formulaTableColumns)
    if (!seen.has(column)) throw new Error(`表头缺少必需列「${column}」。`);

  const grouped = new Map<
    string,
    { row: number; values: Record<string, string> }[]
  >();
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    if (values.length !== header.length)
      throw new Error(
        `第 ${i + 1} 行：列数为 ${values.length}，应为 ${header.length}。`,
      );
    const record = Object.fromEntries(
      header.map((key, j) => [key, values[j]]),
    ) as Record<string, string>;
    const id = text(record, "公式ID", i + 1);
    if (
      !idPattern.test(id) ||
      ["manual", "__proto__", "constructor"].includes(id)
    )
      fail(
        i + 1,
        "公式ID",
        "只能使用字母、数字、点、下划线和短横线，不能使用保留 ID manual。",
      );
    const list = grouped.get(id) ?? [];
    list.push({ row: i + 1, values: record });
    grouped.set(id, list);
  }
  if (!grouped.size) throw new Error("公式表格没有有效数据行。");
  if (rows.length > 5001) throw new Error("公式表格最多支持 5000 条数据行。");

  const entries: FormulaTableEntry[] = [];
  for (const [id, group] of grouped) {
    const first = group[0];
    const r = first.values;
    const city = text(r, "城市", first.row);
    const label = text(r, "分区名称", first.row);
    const scope = text(r, "适用地域", first.row);
    const type = text(r, "公式类型", first.row);
    const isFixed = ["固定P公式", "fixed", "direct"].includes(type);
    const isRange = ["含P公式", "range", "return-period"].includes(type);
    if (!isFixed && !isRange)
      fail(first.row, "公式类型", "只能填写 含P公式 或 固定P公式。");
    const formulaUnit = unit(text(r, "雨强单位", first.row), first.row);
    const durationMin = positive(r, "历时最小值_min", first.row, false);
    const durationMax = positive(r, "历时最大值_min", first.row, false);
    if (
      durationMin !== undefined &&
      durationMax !== undefined &&
      durationMax < durationMin
    )
      fail(first.row, "历时", "最大值不小于最小值；未知边界可留空。");
    const peak = number(r, "雨峰系数r", first.row, false);
    if (peak !== undefined && (peak <= 0 || peak >= 1))
      fail(first.row, "雨峰系数r", "必须在 0 和 1 之间。");
    const sourceUrl = url(r, "来源链接", first.row, true)!;
    const attachment = url(r, "附件链接", first.row, false);
    const checked = text(r, "核实日期", first.row);
    checkedDate(checked, first.row);
    const source = {
      title: text(r, "来源标题", first.row),
      url: sourceUrl,
      attachment,
      version: text(r, "版本", first.row),
      published: text(r, "发布日期", first.row),
      checked,
      location: text(r, "原文位置", first.row),
    };
    const duration: FormulaTableEntry["duration"] =
      durationMin === undefined && durationMax === undefined
        ? null
        : [durationMin ?? null, durationMax ?? null];
    const calculationRule = (r["计算规则"] ?? "").trim();
    if (
      calculationRule &&
      !["海口总公式I", "海口总公式II", "b乘P的0.031次方"].includes(
        calculationRule,
      )
    )
      fail(first.row, "计算规则", "不支持的计算规则。");
    if (calculationRule && !isRange)
      fail(first.row, "计算规则", "特殊计算规则仅适用于含P公式。");
    const exclusive = (
      key: (typeof ruleColumns)[number],
      bound: number | undefined,
    ) => {
      const value = (r[key] ?? "").trim();
      if (value && value !== "是") fail(first.row, key, "仅允许填 是 或留空。");
      if (value && bound === undefined)
        fail(first.row, key, "开区间必须提供对应数值边界。");
      return value === "是";
    };
    const rules = {
      ...(calculationRule
        ? {
            calculationRule:
              calculationRule as FormulaTableEntry["calculationRule"],
          }
        : {}),
      ...(r["P下限开区间"]?.trim()
        ? {
            periodMinExclusive: exclusive(
              "P下限开区间",
              positive(r, "P最小值_年", first.row, false),
            ),
          }
        : {}),
      ...(r["历时下限开区间"]?.trim()
        ? { durationMinExclusive: exclusive("历时下限开区间", durationMin) }
        : {}),
      ...(r["历时上限开区间"]?.trim()
        ? { durationMaxExclusive: exclusive("历时上限开区间", durationMax) }
        : {}),
    };
    const note = text(r, "备注", first.row, false);
    const metadata = [
      city,
      label,
      scope,
      type,
      formulaUnit,
      durationMin,
      durationMax,
      peak,
      JSON.stringify(source),
      note,
      ...ruleColumns.map((key) => (r[key] ?? "").trim()),
    ];
    for (const item of group.slice(1)) {
      const other = item.values;
      const otherMeta = [
        text(other, "城市", item.row),
        text(other, "分区名称", item.row),
        text(other, "适用地域", item.row),
        text(other, "公式类型", item.row),
        unit(text(other, "雨强单位", item.row), item.row),
        positive(other, "历时最小值_min", item.row, false),
        positive(other, "历时最大值_min", item.row, false),
        number(other, "雨峰系数r", item.row, false),
        JSON.stringify({
          title: text(other, "来源标题", item.row),
          url: url(other, "来源链接", item.row, true),
          attachment: url(other, "附件链接", item.row, false),
          version: text(other, "版本", item.row),
          published: text(other, "发布日期", item.row),
          checked: text(other, "核实日期", item.row),
          location: text(other, "原文位置", item.row),
        }),
        text(other, "备注", item.row, false),
        ...ruleColumns.map((key) => (other[key] ?? "").trim()),
      ];
      if (JSON.stringify(otherMeta) !== JSON.stringify(metadata))
        fail(item.row, "公式ID", "同一 ID 的固定P行元数据不一致。");
    }
    if (isRange) {
      if (group.length !== 1)
        fail(
          group[1].row,
          "公式ID",
          "ID 重复：含P公式只能占一行；固定P公式才允许同一 ID 多行。",
        );
      const pMin = positive(r, "P最小值_年", first.row, false);
      const pMax = positive(r, "P最大值_年", first.row, false);
      if ((pMin === undefined) !== (pMax === undefined))
        fail(first.row, "重现期", "P最小值和最大值应同时填写或同时留空。");
      if (pMin !== undefined && pMax! < pMin)
        fail(first.row, "重现期", "P最大值必须不小于P最小值。");
      if (number(r, "P固定值_年", first.row, false) !== undefined)
        fail(first.row, "P固定值_年", "含P公式不能填写固定重现期。");
      const a = positive(r, "A", first.row)!;
      const b = positive(r, "b", first.row)!;
      const n = positive(r, "n", first.row)!;
      const c = number(r, "C", first.row);
      if (c === undefined) fail(first.row, "C", "含P公式必须填写 C。");
      if (c < 0) fail(first.row, "C", "必须大于或等于 0。");
      if (pMin !== undefined && 1 + c * Math.log10(pMin) <= 0)
        fail(first.row, "重现期", "最小重现期下的公式分子必须为正值。");
      entries.push({
        id,
        city,
        label,
        scope,
        source,
        duration,
        periods: pMin === undefined ? [] : [pMin, pMax!],
        coefficients: {
          formula: "return-period",
          a,
          c,
          b,
          n,
          unit: formulaUnit,
        },
        peakRatio: peak,
        note,
        ...rules,
        origin,
      });
      continue;
    }
    if (
      number(r, "P最小值_年", first.row, false) !== undefined ||
      number(r, "P最大值_年", first.row, false) !== undefined
    )
      fail(first.row, "P最小值_年/P最大值_年", "固定P公式不能填写范围重现期。");
    const seenPeriods = new Set<number>();
    const table: Record<number, [number, number, number]> = {};
    for (const item of group) {
      const values = item.values;
      if (
        number(values, "P最小值_年", item.row, false) !== undefined ||
        number(values, "P最大值_年", item.row, false) !== undefined
      )
        fail(item.row, "重现期", "固定P公式不能填写范围重现期。");
      const p = positive(values, "P固定值_年", item.row);
      if (seenPeriods.has(p!))
        fail(item.row, "P固定值_年", "同一公式的固定重现期重复。");
      seenPeriods.add(p!);
      if (number(values, "C", item.row, false) !== undefined)
        fail(item.row, "C", "固定P公式不填写 C。");
      table[p!] = [
        positive(values, "A", item.row)!,
        positive(values, "b", item.row)!,
        positive(values, "n", item.row)!,
      ];
    }
    entries.push({
      id,
      city,
      label,
      scope,
      source,
      duration,
      periods: [...seenPeriods].sort((a, b) => a - b),
      discrete: true,
      table,
      unit: formulaUnit,
      peakRatio: peak,
      note,
      ...rules,
      origin,
    });
  }
  return entries;
}
