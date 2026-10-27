/// <reference lib="webworker" />
import { convertRainfall, type RainOptions } from "./core/rainfall";
import { generateChicago, type ChicagoParameters } from "./core/chicago";

import { generateCityChicago } from "./core/city-formulas";
import { parseFormulaTable } from "./core/formula-table";

export interface RainJob {
  kind?: "convert" | "import-formulas";
  cityFormulaId?: string;
  cityReturnPeriod?: number;
  file?: File;
  chicago?: ChicagoParameters;
  options: RainOptions;
  encoding: "auto" | "utf-8" | "gb18030";
  formulaTable?: string;
  formulaTableFilename?: string;
}
self.onmessage = async ({ data: job }: MessageEvent<RainJob>) => {
  try {
    if (job.kind === "import-formulas") {
      if (!job.file || !job.file.name.toLowerCase().endsWith(".csv"))
        throw new Error(
          "请选择 CSV 文件；Excel / WPS 请另存为 CSV UTF-8（逗号分隔）。",
        );
      if (job.file.size > 2 * 1024 * 1024)
        throw new Error("公式表格超过 2 MB，请缩小文件。");
      const text = await readText(job.file, "auto");
      const entries = parseFormulaTable(text, {
        kind: "imported",
        filename: job.file.name,
      });
      self.postMessage({
        type: "formula-table",
        entries,
        text,
        filename: job.file.name,
      });
      return;
    }
    if (job.chicago) {
      const entries = job.formulaTable
        ? parseFormulaTable(job.formulaTable, {
            kind: "imported",
            filename: job.formulaTableFilename,
          })
        : undefined;
      self.postMessage({
        type: "result",
        data: job.cityFormulaId
          ? generateCityChicago(
              job.cityFormulaId,
              { ...job.chicago, returnPeriod: job.cityReturnPeriod },
              job.options,
              entries,
              job.formulaTableFilename,
            )
          : generateChicago(job.chicago, job.options),
      });
      return;
    }
    if (!job.file) throw new Error("请选择降雨文件。");
    if (job.file.size > 100 * 1024 * 1024)
      throw new Error("文件超过 100 MB，请拆分后重试。");
    const text = await readText(job.file, job.encoding);
    self.postMessage({
      type: "result",
      data: convertRainfall(text, job.options),
    });
  } catch (e) {
    self.postMessage({
      type: "error",
      data: e instanceof Error ? e.message : String(e),
    });
  }
};

async function readText(file: File, encoding: RainJob["encoding"]) {
  const buffer = await file.arrayBuffer();
  if (encoding !== "auto")
    return new TextDecoder(encoding, { fatal: true }).decode(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("gb18030", { fatal: true }).decode(buffer);
  }
}
