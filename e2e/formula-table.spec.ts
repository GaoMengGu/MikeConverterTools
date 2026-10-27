import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("download, edit and import the formula CSV; worker uses edited coefficients and provenance", async ({
  page,
}, info) => {
  const uploadedRequests: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" || req.method() === "PUT")
      uploadedRequests.push(req.url());
  });
  await page.goto("./");
  await page.getByRole("tab", { name: /降雨序列/ }).click();
  await page.locator("#rain-source").selectOption("formula");
  const originalCount = await page.locator("#city-formula option").count();
  const pending = page.waitForEvent("download");
  await page.locator("#formula-table-template").click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("暴雨公式表格样板.csv");
  const template = await readFile((await download.path())!, "utf8");
  expect(template).toContain("公式ID,城市,分区名称");
  expect(template).toContain("固定P公式");
  const custom = template
    .replaceAll("nanjing-south-2024", "custom-city")
    .replaceAll("南京", "新城市<img src=x>")
    .replace("16.696", "20");
  await page
    .locator("#formula-table-file")
    .setInputFiles({
      name: "我的公式.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(custom),
    });
  await expect(page.locator("#formula-table-state")).toContainText(
    "已导入 我的公式.csv · 2 个分区",
  );
  await page.locator("#city-formula").selectOption("custom-city");
  await expect(page.locator("#chicago-a")).toHaveValue("20");
  await expect(page.locator("#chicago-a")).toBeDisabled();
  await expect(page.locator("#city-evidence")).toContainText("未由工具核实");
  await expect(page.locator("#city-evidence img")).toHaveCount(0);
  for (const [key, value] of Object.entries({
    p: "10",
    duration: "120",
    r: "0.4",
    step: "60",
  }))
    await page.locator("#chicago-" + key).fill(value);
  await page.locator("#rain-convert").click();
  await expect(page.locator("#rain-result-state")).toHaveText("转换完成");
  const pendingReport = page.waitForEvent("download");
  await page.locator("#rain-report").click();
  const report = JSON.parse(
    await readFile((await (await pendingReport).path())!, "utf8"),
  );
  expect(report.generation.parameters.a).toBe(20);
  expect(report.generation.catalogue.origin).toEqual({
    kind: "imported",
    filename: "我的公式.csv",
  });
  expect(report.stats.totalMM).toBeCloseTo(
    (20 * (1 + 0.954) * 120) / 138.825 ** 0.751,
    7,
  );
  const pendingRain = page.waitForEvent("download");
  await page.locator("#rain-download").click();
  expect(
    (await readFile((await (await pendingRain).path())!, "utf8"))
      .split("\n")
      .filter(Boolean),
  ).toHaveLength(121);
  await page
    .locator("#formula-table-file")
    .setInputFiles({
      name: "坏表格.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(custom.replace("20,0.954", "=20,0.954")),
    });
  await expect(page.locator("#formula-table-error")).toContainText("第 2 行");
  await expect(page.locator("#formula-table-error")).toContainText(
    "原公式列表已保留",
  );
  await expect(page.locator("#rain-download")).toBeDisabled();
  await expect(page.locator("#city-formula")).toHaveValue("custom-city");
  await expect(page.locator("#chicago-a")).toBeDisabled();
  await page.locator("#formula-table-restore").click();
  await expect(page.locator("#formula-table-state")).toContainText("内置");
  await expect(page.locator("#city-formula option")).toHaveCount(originalCount);
  await page.locator("#city-formula").selectOption("nanjing-south-2024");
  await expect(page.locator("#chicago-a")).toHaveValue("16.696");
  await page.screenshot({
    path: info.outputPath("formula-table-controls.png"),
    fullPage: true,
  });
  expect(uploadedRequests).toEqual([]);
});

test("full catalogue CSV downloads and import controls fit 320px and tablet widths", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("tab", { name: /降雨序列/ }).click();
  await page.locator("#rain-source").selectOption("formula");
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const id of ["template", "full", "import", "restore"]) {
      const box = await page.locator("#formula-table-" + id).boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  }
  const pending = page.waitForEvent("download");
  await page.locator("#formula-table-full").click();
  const content = await readFile((await (await pending).path())!, "utf8");
  expect(content.replace(/^\uFEFF/, "")).toBe(
    (await readFile("src/data/rainfall-formulas.csv", "utf8")).replace(
      /^\uFEFF/,
      "",
    ),
  );
});
