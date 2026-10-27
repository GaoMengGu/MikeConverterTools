export interface RainOptions {
  name?: string;
  timeMode?: "elapsed" | "absolute" | "index";
  elapsedUnit?: "minutes" | "seconds";
  start?: string;
  intervalSeconds?: number;
  startRow?: number;
  inputUnit?: "mmh" | "ms";
  outputUnit?: "mmh" | "ms";
  valueType?: "instant" | "backward" | "forward";
  delimiter?: "comma" | "tab";
}
export interface RainResult {
  generation?: {
    catalogue?: {
      id: string;
      city: string;
      region: string;
      source: {
        title: string;
        url: string;
        version: string;
        published: string;
        checked: string;
        location: string;
        attachment?: string;
      };
      scope: string;
      duration: [number | null, number | null] | null;
      periods: number[];
      note: string;
      calculationRule?: string;
      periodMinExclusive?: boolean;
      durationMinExclusive?: boolean;
      durationMaxExclusive?: boolean;
      origin?: { kind: "bundled" | "imported"; filename?: string };
    };
    parameters: Record<string, string | number | undefined>;
    formula: string;
    peakSeconds: number;
    theoreticalTotalMM: number;
    differenceMM: number;
  };
  content: string;
  filename: string;
  guide: string;
  stats: {
    records: number;
    start: string;
    end: string;
    durationSeconds: number;
    stepSeconds: number | null;
    totalMM: number;
    peakMMH: number;
    peakTime: string;
    headerRows: number;
  };
  importSettings: {
    delimiter: string;
    dateFormat: string;
    timeColumn: number;
    valueColumn: number;
    startRow: number;
    itemType: string;
    unit: string;
    valueType: string;
  };
  warnings: string[];
  preview: { seconds: number; mmh: number; cumulativeMM: number }[];
}

const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
function number(text: string, line: number) {
  if (!numeric.test(text) || !Number.isFinite(Number(text)))
    throw new Error(`第 ${line} 行：需要有限数值，请检查数据和起始行。`);
  return Number(text);
}
function date(text: string) {
  const m =
    /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
      text,
    );
  if (!m) throw new Error("日期时间须为 YYYY-MM-DD HH:mm:ss，不含时区后缀。");
  const [year, month, day, hour, minute, second] = m
    .slice(1)
    .map((n) => Number(n ?? 0));
  const value = Date.UTC(year, month - 1, day, hour, minute, second);
  const d = new Date(value);
  if (
    year < 1900 ||
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day ||
    d.getUTCHours() !== hour ||
    d.getUTCMinutes() !== minute ||
    d.getUTCSeconds() !== second
  )
    throw new Error("日期时间不存在或超出范围。");
  return value;
}
function stamp(value: number) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime()) || d.getUTCFullYear() > 9999)
    throw new Error("日期时间超出输出范围。");
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function elapsed(text: string, unit: string, line: number) {
  const clock = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(text);
  let seconds: number;
  if (clock) {
    if (Number(clock[2]) > 59 || Number(clock[3] ?? 0) > 59)
      throw new Error(`第 ${line} 行：时间的分和秒须在 00～59。`);
    seconds =
      Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] ?? 0);
  } else seconds = number(text, line) * (unit === "seconds" ? 1 : 60);
  if (
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    Math.abs(seconds - Math.round(seconds)) > 1e-6
  )
    throw new Error(`第 ${line} 行：相对时间须为非负整秒。`);
  return Math.round(seconds);
}

// Use the user's calendar date; UTC serialization can select yesterday/tomorrow.
export function localMidnight(now = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day + "T00:00:00";
}

export function convertRainfall(
  text: string,
  options: RainOptions = {},
): RainResult {
  const o = {
    timeMode: "elapsed",
    elapsedUnit: "minutes",
    start: localMidnight(),
    intervalSeconds: 60,
    startRow: 1,
    inputUnit: "mmh",
    outputUnit: "mmh",
    valueType: "instant",
    delimiter: "comma",
    ...options,
  };
  for (const [value, allowed] of [
    [o.timeMode, ["elapsed", "absolute", "index"]],
    [o.elapsedUnit, ["minutes", "seconds"]],
    [o.inputUnit, ["mmh", "ms"]],
    [o.outputUnit, ["mmh", "ms"]],
    [o.valueType, ["instant", "backward", "forward"]],
    [o.delimiter, ["comma", "tab"]],
  ] as [string, string[]][])
    if (!allowed.includes(value)) throw new Error("降雨转换选项无效。");
  if (!Number.isInteger(o.startRow) || o.startRow < 1)
    throw new Error("数据起始行须为正整数。");
  if (
    o.timeMode === "index" &&
    (!Number.isInteger(o.intervalSeconds) || o.intervalSeconds <= 0)
  )
    throw new Error("采样间隔须为正整数秒。");
  const origin = o.timeMode === "absolute" ? 0 : date(o.start);
  const points: { time: number; mmh: number }[] = [];
  let headerRows = o.startRow - 1;
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  while (lines.length && !lines.at(-1)!.trim()) lines.pop();
  for (let i = o.startRow - 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (o.timeMode === "index" && points.length)
        throw new Error(`第 ${i + 1} 行：单列序列中有空行，可能缺少采样值。`);
      continue;
    }
    if (/^(#|\/\/)/.test(line)) continue;
    if (!points.length && /^(时间|日期|time\b|date\b)/i.test(line)) {
      headerRows++;
      continue;
    }
    let rawTime = "",
      rawRate = line;
    if (o.timeMode !== "index") {
      if (/[,;\t]/.test(line)) {
        const fields = line.split(/[,;\t]/).map((s) => s.trim());
        if (fields.length !== 2 || fields.some((s) => !s))
          throw new Error(`第 ${i + 1} 行：需要「时间 雨强」两列，不能缺列。`);
        [rawTime, rawRate] = fields;
      } else {
        const m = /^(.+?) +([^ ]+)$/.exec(line);
        if (!m) throw new Error(`第 ${i + 1} 行：需要「时间 雨强」两列。`);
        rawTime = m[1].trim();
        rawRate = m[2];
      }
    }
    const rate = number(rawRate, i + 1);
    if (rate < 0) throw new Error(`第 ${i + 1} 行：雨强不能为负值。`);
    const mmh = rate * (o.inputUnit === "ms" ? 3_600_000 : 1);
    if (!Number.isFinite(mmh))
      throw new Error(`第 ${i + 1} 行：雨强换算后超出数值范围。`);
    let time: number;
    try {
      time =
        o.timeMode === "absolute"
          ? date(rawTime)
          : origin +
            1000 *
              (o.timeMode === "index"
                ? points.length * o.intervalSeconds
                : elapsed(rawTime, o.elapsedUnit, i + 1));
      stamp(time);
    } catch (e) {
      throw new Error(`第 ${i + 1} 行：${(e as Error).message}`);
    }
    if (points.length && time <= points.at(-1)!.time)
      throw new Error(
        `第 ${i + 1} 行：时间须严格递增，不能重复或倒序；不自动排序。`,
      );
    points.push({ time, mmh });
    if (points.length > 2_000_000)
      throw new Error("序列超过 200 万条，请拆分文件。");
  }
  if (points.length < 2) throw new Error("至少需要 2 条有效降雨记录。");
  const first = points[0],
    last = points.at(-1)!;
  const step = (points[1].time - first.time) / 1000;
  let regular = true,
    totalMM = 0,
    peak = first,
    peakCumulativeMM = 0;
  const stride = Math.max(1, Math.ceil(points.length / 4000));
  const preview: RainResult["preview"] = [
    { seconds: 0, mmh: first.mmh, cumulativeMM: 0 },
  ];
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].time - points[i - 1].time) / 1000;
    if (dt !== step) regular = false;
    const rate =
      o.valueType === "instant"
        ? points[i - 1].mmh / 2 + points[i].mmh / 2
        : o.valueType === "backward"
          ? points[i].mmh
          : points[i - 1].mmh;
    totalMM += (rate * dt) / 3600;
    if (points[i].mmh > peak.mmh) {
      peak = points[i];
      peakCumulativeMM = totalMM;
    }
    if (i % stride === 0 || i === points.length - 1)
      preview.push({
        seconds: (points[i].time - first.time) / 1000,
        mmh: points[i].mmh,
        cumulativeMM: totalMM,
      });
  }
  if (!Number.isFinite(totalMM)) throw new Error("累计雨量超出数值范围。");
  const warnings: string[] = [];
  if (!regular)
    warnings.push(
      "非等间隔序列：保留原始时刻，请在 MIKE 中按非等间隔时间轴导入，不强行指定固定步长。",
    );
  if (first.mmh > 0 || last.mmh > 0)
    warnings.push(
      "序列端点雨强非零，未自动补零；请核对模型起止时刻及雨后排水时段。",
    );
  if (o.timeMode !== "absolute" && first.time !== origin)
    warnings.push("首条记录晚于指定起始时间，未外推补值；请核对模拟时间覆盖。");
  if (o.valueType !== "instant")
    warnings.push(
      "总雨量仅统计首末记录之间的区间；请按数据定义核对时段端点，导入时选择对应的平均值类型。",
    );
  const settings = {
    delimiter: o.delimiter === "tab" ? "Tab" : "Comma",
    dateFormat: "YYYY-MM-DD HH:mm:ss",
    timeColumn: 1,
    valueColumn: 2,
    startRow: 1,
    itemType: "Precipitation Rate",
    unit: o.outputUnit === "ms" ? "m/s" : "mm/hour",
    valueType: {
      instant: "Instantaneous",
      backward: "MeanStepBackward",
      forward: "MeanStepForward",
    }[o.valueType]!,
  };
  const sep = o.delimiter === "tab" ? "\t" : ",";
  const content =
    points
      .map(
        (p) =>
          `${stamp(p.time)}${sep}${Number((p.mmh / (o.outputUnit === "ms" ? 3_600_000 : 1)).toPrecision(12))}`,
      )
      .join("\n") + "\n";
  const start = stamp(first.time),
    end = stamp(last.time);
  const durationSeconds = (last.time - first.time) / 1000;
  const filename = `${(o.name ?? "rainfall").replace(/\.[^.]+$/, "")}_${o.outputUnit}.${o.delimiter === "tab" ? "txt" : "csv"}`;
  const guide = [
    "MIKE Zero / Time Series：ASCII 导入后另存为 DFS0",
    "",
    `Delimiter: ${settings.delimiter}`,
    "Decimal separator: Dot",
    "Date/time values in one column",
    `Date/time format: ${settings.dateFormat}`,
    "Date/time column: 1",
    "Data value column: 2",
    "Data start row: 1",
    "Same item type for all variables = Precipitation Rate",
    `Unit: ${settings.unit}`,
    `Value type: ${settings.valueType}`,
    "无表头；不要选 Item type in row。",
    "",
    `记录数: ${points.length}；区间数: ${points.length - 1}`,
    `起止: ${start} 至 ${end}`,
    `时长: ${durationSeconds} s；${regular ? `步长: ${step} s` : "非等间隔时间轴"}`,
    `峰值: ${peak.mmh} mm/h；总雨量: ${totalMM} mm`,
    "瞬时雨强采用梯形积分；平均雨强采用对应方向的矩形积分。",
    "雨强不是时段雨量 mm 或累计雨量，不能直接混用。",
    "120 min、1 min 间隔对应 121 条端点记录；720 个 10 s 区间对应 721 个时刻。",
    "模型时间步可小于降雨采样间隔，降雨须覆盖完整模拟时间；本工具不重采样。",
    "日期时间按文件中的当地钟表时间输出，不作时区换算。",
    ...warnings,
  ].join("\n");
  // Retain the peak in the sampled chart; statistics always use the full series.
  const peakSeconds = (peak.time - first.time) / 1000;
  if (!preview.some((p) => p.seconds === peakSeconds)) {
    preview.push({
      seconds: peakSeconds,
      mmh: peak.mmh,
      cumulativeMM: peakCumulativeMM,
    });
    preview.sort((a, b) => a.seconds - b.seconds);
  }
  return {
    content,
    filename,
    guide,
    importSettings: settings,
    warnings,
    preview,
    stats: {
      records: points.length,
      start,
      end,
      durationSeconds,
      stepSeconds: regular ? step : null,
      totalMM,
      peakMMH: peak.mmh,
      peakTime: stamp(peak.time),
      headerRows,
    },
  };
}
