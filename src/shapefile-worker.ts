/// <reference lib="webworker" />
import { convertDxfToShp } from "./core/shapefile";
self.onmessage = async ({
  data,
}: MessageEvent<{
  file: File;
  encoding: string;
  zone?: number;
  prj?: string;
  closedAsLines: boolean;
}>) => {
  try {
    if (data.file.size > 100 * 1024 * 1024)
      throw new Error("文件超过 100 MB，请拆分后重试。");
    const buffer = await data.file.arrayBuffer();
    let text: string;
    if (data.encoding === "auto") {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        text = new TextDecoder("gb18030", { fatal: true }).decode(buffer);
      }
    } else
      text = new TextDecoder(data.encoding, { fatal: true }).decode(buffer);
    const result = await convertDxfToShp(text, data);
    self.postMessage({ result }, [result.archive.buffer]);
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
};
