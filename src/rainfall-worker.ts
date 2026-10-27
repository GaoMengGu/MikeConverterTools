/// <reference lib="webworker" />
import { convertRainfall, type RainOptions } from "./core/rainfall";
import { generateChicago, type ChicagoParameters } from "./core/chicago";

import { generateCityChicago } from "./core/city-formulas";

export interface RainJob {
  cityFormulaId?: string;
  cityReturnPeriod?: number;
  file?: File;
  chicago?: ChicagoParameters;
  options: RainOptions;
  encoding: "auto" | "utf-8" | "gb18030";
}
self.onmessage = async ({ data: job }: MessageEvent<RainJob>) => {
  try {
    if (job.chicago) {
      self.postMessage({
        type: "result",
        data: job.cityFormulaId
          ? generateCityChicago(
              job.cityFormulaId,
              { ...job.chicago, returnPeriod: job.cityReturnPeriod },
              job.options,
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
