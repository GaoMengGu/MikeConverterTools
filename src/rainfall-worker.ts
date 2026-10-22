/// <reference lib="webworker" />
import { convertRainfall, type RainOptions } from "./core/rainfall";
import { generateChicago, type ChicagoParameters } from "./core/chicago";

export interface RainJob {
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
        data: generateChicago(job.chicago, job.options),
      });
      return;
    }
    if (!job.file) throw new Error("请选择降雨文件。");
    if (job.file.size > 100 * 1024 * 1024)
      throw new Error("文件超过 100 MB，请拆分后重试。");
    const buffer = await job.file.arrayBuffer();
    let text: string;
    if (job.encoding === "auto") {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        text = new TextDecoder("gb18030", { fatal: true }).decode(buffer);
      }
    } else text = new TextDecoder(job.encoding, { fatal: true }).decode(buffer);
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
