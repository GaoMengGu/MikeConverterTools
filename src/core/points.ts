import type { Issue, Point } from "./types";

const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
export function parsePoints(
  text: string,
  options: { columns?: [number, number, number] } = {},
) {
  const columns = options.columns;
  if (
    columns &&
    (columns.some((c) => !Number.isInteger(c) || c < 1) ||
      new Set(columns).size !== 3)
  )
    throw new Error("X / Y / Z 列号须为不同的正整数，从 1 开始。");
  const points: Point[] = [];
  const issues: Issue[] = [];
  let skipped = 0;
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || /^(#|\/\/)/.test(line)) continue;
    const tokens = line.split(/[,;\t ]+/);
    let chosen: string[];
    if (columns) chosen = columns.map((c) => tokens[c - 1]);
    else if (tokens.length === 3) chosen = tokens;
    else if (tokens.length === 4 || tokens.length === 5)
      chosen = tokens.slice(1, 4);
    else chosen = [];
    const values = chosen.map(Number);
    if (
      chosen.length !== 3 ||
      chosen.some((s) => !s || !numeric.test(s)) ||
      values.some((n) => !Number.isFinite(n))
    ) {
      skipped++;
      if (issues.length < 100)
        issues.push({ line: i + 1, reason: "无法按所选列读取三个有限数值。" });
      continue;
    }
    points.push(values as Point);
    if (points.length > 2_000_000)
      throw new Error("点数超过本版 200 万点限制，请拆分文件。");
  }
  return { points, skipped, issues };
}

export function parseLayerValues(text: string) {
  const rows: { layer: string; value: number }[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .entries()) {
    const line = raw.trim();
    if (!line || /^(#|\/\/)/.test(line)) continue;
    const fields = line.split(/[,;\t ]+/);
    if (/^(layer|图层|图层名)$/i.test(fields[0]) && rows.length === 0) continue;
    if (
      fields.length !== 2 ||
      !numeric.test(fields[1]) ||
      !Number.isFinite(Number(fields[1]))
    )
      throw new Error(
        `图层值 TXT 第 ${index + 1} 行须为「图层名 数值」，图层名不能包含空格。`,
      );
    const layer = fields[0].toUpperCase();
    if (seen.has(layer))
      throw new Error(`图层值 TXT 第 ${index + 1} 行图层 ${layer} 重复。`);
    seen.add(layer);
    rows.push({ layer, value: Number(fields[1]) });
  }
  if (!rows.length) throw new Error("图层值 TXT 中没有有效记录。");
  return rows;
}
