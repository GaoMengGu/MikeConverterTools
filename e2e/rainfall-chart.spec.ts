import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("rain chart exports a real high resolution PNG with both series and clears stale exports", async ({
  page,
}, info) => {
  await page.goto("./");
  await page.getByRole("tab", { name: /降雨序列/ }).click();
  const exportButton = page.getByRole("button", { name: "导出图表 PNG" });
  await expect(exportButton).toBeDisabled();
  await page.locator("#rain-source").selectOption("formula");
  await page.locator("#city-formula").selectOption("nanjing-south-2024");
  for (const [key, value] of Object.entries({
    p: "5",
    duration: "120",
    r: "0.4",
    step: "60",
  }))
    await page.locator("#chicago-" + key).fill(value);
  await page.locator("#rain-convert").click();
  await expect(page.locator("#rain-result-state")).toHaveText("转换完成");
  await expect(exportButton).toBeEnabled();
  await expect(page.locator("#rain-chart-description")).toContainText(
    "累计雨量",
  );
  await page.locator("#rain-output-name").fill("设计暴雨.csv");
  const pending = page.waitForEvent("download");
  await exportButton.click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("设计暴雨.png");
  const buffer = await readFile((await download.path())!);
  expect([...buffer.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(buffer.readUInt32BE(16)).toBe(2400);
  expect(buffer.readUInt32BE(20)).toBe(1600);
  const colours = await page.evaluate(async (base64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + base64;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    let orange = 0,
      blue = 0,
      transparent = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = data.slice(i, i + 4);
      if (r > 170 && g > 55 && g < 155 && b < 90) orange++;
      if (b > 140 && b > r * 1.1 && g > r) blue++;
      if (a !== 255) transparent++;
    }
    return { orange, blue, transparent };
  }, buffer.toString("base64"));
  expect(colours.orange).toBeGreaterThan(1000);
  expect(colours.blue).toBeGreaterThan(1000);
  expect(colours.transparent).toBe(0);
  await download.saveAs(info.outputPath("rainfall-chart.png"));
  await page
    .locator(".rain-chart")
    .screenshot({ path: info.outputPath("rainfall-chart-screen.png") });
  await page.locator("#chicago-duration").fill("60");
  await expect(exportButton).toBeDisabled();
  await expect(page.locator("#rain-chart-state")).toHaveText("未生成");
});

test("zero rainfall and irregular measurements draw without overflow at narrow widths", async ({
  page,
}, info) => {
  await page.goto("./");
  await page.getByRole("tab", { name: /降雨序列/ }).click();
  for (const input of ["0 0\n1 0\n2 0", "0 60\n1 120\n4 0"]) {
    await page
      .locator("#rain-file")
      .setInputFiles({
        name: "measured.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(input),
      });
    await page.locator("#rain-convert").click();
    await expect(page.locator("#rain-result-state")).toHaveText("转换完成");
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const box = await page.locator("#rain-chart-export").boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
  }
  await page
    .locator(".rain-chart")
    .screenshot({ path: info.outputPath("rainfall-irregular.png") });
  await page.locator("#rain-reset").click();
  await expect(page.locator("#rain-chart-export")).toBeDisabled();
});
