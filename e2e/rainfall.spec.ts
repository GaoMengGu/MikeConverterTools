import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const input = (text: string) => ({
  name: "rain.dat",
  mimeType: "text/plain",
  buffer: Buffer.from(text),
});
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto("./");
  await page.getByRole("tab", { name: /降雨序列/ }).click();
});

test("editable fraction keeps formula terms, units and validation consistent", async ({
  page,
}, info) => {
  await page.locator("#rain-source").selectOption("formula");
  const equation = page.getByRole("group", {
    name: "暴雨强度公式",
    exact: true,
  });
  await expect(
    equation.getByRole("spinbutton", { name: "系数 A", exact: true }),
  ).toHaveValue("");
  await expect(
    equation.getByRole("spinbutton", { name: "指数 n", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect(page.locator("#rain-error")).toContainText("系数 A");
  for (const [id, value] of Object.entries({
    a: "9.5981",
    c: "0.846",
    b: "7",
    n: "0.656",
    p: "2",
    duration: "120",
    r: "0.4",
    step: "60",
  }))
    await page.locator(`#chicago-${id}`).fill(value);
  await page.locator("#chicago-unit").selectOption("mmmin");
  await expect(page.locator("#chicago-symbol")).toHaveText("i");
  await expect(page.locator("#chicago-equation-unit")).toHaveText("mm/min");
  await page.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect(page.locator("#rain-result-state")).toHaveText("转换完成");
  const total = (9.5981 * (1 + 0.846 * Math.log10(2)) * 120) / 127 ** 0.656;
  await expect(page.locator("#rain-total")).toHaveText(
    `${total.toLocaleString("en-US", { maximumFractionDigits: 6 })} mm`,
  );
  const numerator = await equation.locator(".formula-numerator").boundingBox();
  const denominator = await equation
    .locator(".formula-denominator")
    .boundingBox();
  expect(numerator!.y + numerator!.height).toBeLessThanOrEqual(denominator!.y);
  const exponent = await page.locator("#chicago-n").boundingBox();
  const base = await page.locator("#chicago-b").boundingBox();
  expect(exponent!.y).toBeLessThan(base!.y);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await equation.screenshot({ path: info.outputPath("formula-fraction.png") });
  await page.locator("#chicago-unit").selectOption("lsha");
  await expect(page.locator("#chicago-symbol")).toHaveText("q");
  await expect(page.locator("#chicago-equation-unit")).toHaveText("L/(s·ha)");
  await page.locator("#chicago-formula").selectOption("direct");
  await expect(page.locator("#chicago-c")).toBeHidden();
  await expect(page.locator("#chicago-p")).toBeHidden();
  await expect(page.locator("#chicago-a")).toHaveValue("9.5981");
  await page.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect(page.locator("#rain-result-state")).toHaveText("转换完成");
  await page.locator("#chicago-formula").selectOption("return-period");
  await expect(page.locator("#chicago-c")).toHaveValue("0.846");
});
test("Chicago templates require parameters and generate conserved mean rates", async ({
  page,
}, info) => {
  await page.locator("#rain-source").selectOption("formula");
  await page.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect(page.locator("#rain-error")).toContainText("请填写");
  for (const [id, value] of Object.entries({
    a: "1000",
    c: "0.5",
    b: "10",
    n: "0.7",
    p: "3",
    duration: "120",
    r: "0.4",
    step: "60",
  }))
    await page.locator(`#chicago-${id}`).fill(value);
  await page.locator("#chicago-reference").fill("Synthetic test coefficients");
  await page.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect(page.locator("#rain-result-state")).toHaveText("转换完成");
  await expect(page.locator("#rain-records")).toHaveText("121");
  await expect(page.locator("#rain-import-settings")).toContainText(
    "MeanStepBackward",
  );
  await expect(page.locator("#rain-peak-time")).toContainText(
    "公式雨峰 48 min",
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载报告" }).click();
  const report = JSON.parse(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(report.generation.parameters.a).toBe(1000);
  expect(Math.abs(report.generation.differenceMM)).toBeLessThan(1e-9);
  expect(report.options.valueType).toBe("backward");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("chicago.png"),
    fullPage: true,
  });
  await page.locator("#chicago-r").fill("0.5");
  await expect(
    page.getByRole("button", { name: "下载降雨文件" }),
  ).toBeDisabled();
});
test("example resets incompatible input units", async ({ page }) => {
  await page.locator("#rain-input-unit").selectOption("ms");
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect(page.locator("#rain-peak")).toHaveText("60 mm/h");
  await expect(page.locator("#rain-total")).toHaveText("1 mm");
});
test("rainfall exports dated SI tabs, chart, report and MIKE instructions", async ({
  page,
}, info) => {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.method() !== "GET") requests.push(req.url());
  });
  await page
    .locator("#rain-file")
    .setInputFiles(
      input("时间(hh:mm) 雨强(mm/h)\n00:00 0\n00:01 3.6\n00:02 0"),
    );
  await page.locator("#rain-output-unit").selectOption("ms");
  await page.locator("#rain-delimiter").selectOption("tab");
  await page.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect(page.locator("#rain-result-state")).toHaveText("转换完成");
  await expect(page.locator("#rain-records")).toHaveText("3");
  await expect(page.locator("#rain-total")).toContainText("0.06");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载降雨文件" }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe("rain_ms.txt");
  expect(await readFile((await exported.path())!, "utf8")).toContain(
    "2026-06-26 00:01:00\t0.000001",
  );
  const guideDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载导入说明" }).click();
  expect(
    await readFile((await (await guideDownload).path())!, "utf8"),
  ).toContain("Unit: m/s");
  const reportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载报告" }).click();
  const report = JSON.parse(
    await readFile((await (await reportDownload).path())!, "utf8"),
  );
  expect(report.options.outputUnit).toBe("ms");
  expect(report.importSettings.itemType).toBe("Precipitation Rate");
  expect(requests).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const colors = await page
    .locator("#rain-canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let green = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i + 1] > pixels[i] + 20) green++;
      return green;
    });
  expect(colors).toBeGreaterThan(50);
  await page.screenshot({
    path: info.outputPath("rainfall.png"),
    fullPage: true,
  });
});
test("rainfall rejects bad chronology, clears stale files and leaves spatial tools usable", async ({
  page,
}) => {
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect(page.locator("#rain-result-state")).toHaveText("转换完成");
  await page.locator("#rain-start").fill("2026-07-01T00:00");
  await expect(
    page.getByRole("button", { name: "下载降雨文件" }),
  ).toBeDisabled();
  await page.locator("#rain-file").setInputFiles(input("00:01 60\n00:00 60"));
  await page.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect(page.locator("#rain-error")).toContainText("严格递增");
  await expect(
    page.getByRole("button", { name: "下载降雨文件" }),
  ).toBeDisabled();
  await page.getByRole("tab", { name: /地形点转换/ }).click();
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect(page.locator("#result-state")).toHaveText("转换完成");
});
test("rainfall preserves absolute dates and mean-step totals", async ({
  page,
}) => {
  await page.locator("#rain-time-mode").selectOption("absolute");
  await page.locator("#rain-value-type").selectOption("backward");
  await page
    .locator("#rain-file")
    .setInputFiles(
      input(
        "2026-06-26 23:59:00 0\n2026-06-27 00:00:00 60\n2026-06-27 00:01:00 120",
      ),
    );
  await page.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect(page.locator("#rain-result-state")).toHaveText("转换完成");
  await expect(page.locator("#rain-total")).toHaveText("3 mm");
  await expect(page.locator("#rain-import-settings")).toContainText(
    "MeanStepBackward",
  );
  await expect(page.locator("#rain-time-range")).toContainText(
    "2026-06-27 00:01:00",
  );
});
test("rainfall cancellation terminates its worker and recovers", async ({
  page,
}) => {
  await page.locator("#rain-time-mode").selectOption("index");
  await page.locator("#rain-file").setInputFiles(input("60\n".repeat(500000)));
  await page.getByRole("button", { name: "开始转换", exact: true }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator("#rain-run-state")).toHaveText("已取消");
  await expect(
    page.getByRole("button", { name: "下载降雨文件" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByRole("button", { name: "开始转换", exact: true }).click();
  await expect(page.locator("#rain-result-state")).toHaveText("转换完成");
});
