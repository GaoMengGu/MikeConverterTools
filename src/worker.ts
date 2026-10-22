/// <reference lib="webworker" />
import {
  assignValues,
  convertBoundary,
  convertPoints,
  inspectBoundary,
} from "./core/converters";
import type { Mode, Options } from "./core/types";

export interface Job {
  id: number;
  type: "convert" | "inspect";
  mode: Mode;
  files: { points?: File; boundary?: File; areas?: File; values?: File };
  options: Options;
  encoding: "auto" | "utf-8" | "gb18030";
}

async function read(file: File | undefined, encoding: Job["encoding"]) {
  if (!file) throw new Error("请先选择本功能所需的文件。");
  if (file.size > 100 * 1024 * 1024)
    throw new Error(`${file.name} 超过 100 MB，请拆分后重试。`);
  const buffer = await file.arrayBuffer();
  if (encoding !== "auto")
    return new TextDecoder(encoding, { fatal: true }).decode(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("gb18030", { fatal: true }).decode(buffer);
  }
}

self.onmessage = async ({ data: job }: MessageEvent<Job>) => {
  const send = (type: string, data: unknown) =>
    self.postMessage({ id: job.id, type, data });
  try {
    send("progress", { percent: 5, message: "读取本地文件" });
    if (job.type === "inspect") {
      send(
        "inspection",
        inspectBoundary(await read(job.files.boundary, job.encoding)),
      );
      return;
    }
    const options = {
      ...job.options,
      progress: (percent: number, message: string) =>
        send("progress", { percent, message }),
    };
    let result;
    if (job.mode === "boundary")
      result = convertBoundary(
        await read(job.files.boundary, job.encoding),
        options,
      );
    else if (job.mode === "points")
      result = convertPoints(
        await read(job.files.points, job.encoding),
        options,
      );
    else {
      const [points, areas, values] = await Promise.all([
        read(job.files.points, job.encoding),
        read(job.files.areas, job.encoding),
        read(job.files.values, job.encoding),
      ]);
      send("progress", { percent: 15, message: "检查闭合分区" });
      result = assignValues(points, areas, values, options);
    }
    send("result", result);
  } catch (error) {
    send("error", error instanceof Error ? error.message : String(error));
  }
};
