import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("official preset locks coefficients, validates scope, downloads provenance, and returns to manual", async ({
  page,
}, info) => {
  await page.goto("./");
  await page.getByRole("tab", { name: /降雨序列/ }).click();
  await page.locator("#rain-source").selectOption("formula");
  await page.locator("#city-formula").selectOption("nanjing-south-2024");
  await expect(page.locator("#chicago-a")).toHaveValue("16.696");
  await expect(page.locator("#chicago-a")).toBeDisabled();
  await expect(page.locator("#city-evidence")).toContainText("宁水运管");
  for (const [id, value] of Object.entries({
    p: "10",
    duration: "120",
    r: "0.4",
    step: "60",
  }))
    await page.locator("#chicago-" + id).fill(value);
  await page.locator("#rain-convert").click();
  await expect(page.locator("#rain-result-state")).toHaveText("转换完成");
  const pending = page.waitForEvent("download");
  await page.locator("#rain-report").click();
  const report = JSON.parse(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(report.generation.parameters.a).toBe(16.696);
  expect(report.generation.catalogue.id).toBe("nanjing-south-2024");
  expect(report.generation.catalogue.source.checked).toBe("2026-10-23");
  expect(report.generation.parameters.source).toContain("nanjing.gov.cn");
  await page.locator("#chicago-p").fill("1");
  await expect(page.locator("#rain-download")).toBeDisabled();
  await page.locator("#rain-convert").click();
  await expect(page.locator("#rain-error")).toContainText("重现期");
  await page.locator("#city-formula").selectOption("shenzhen-central-2024");
  await page.locator("#chicago-p").fill("10");
  await expect(page.locator("#chicago-a")).toHaveValue("5226.599");
  await expect(page.locator("#chicago-p")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("city-preset.png"),
    fullPage: true,
  });
  await page.locator("#city-formula").selectOption("manual");
  await expect(page.locator("#chicago-a")).toBeEnabled();
});
test("city evidence and SHP controls fit 320px and tablet widths with real PRJ downloads", async ({
  page,
}) => {
  await page.goto("./");
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole("tab", { name: /降雨序列/ }).click();
    await page.locator("#rain-source").selectOption("formula");
    await page.locator("#city-formula").selectOption("guangzhou-central-2022");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("tab", { name: /DXF 转 SHP/ }).click();
    await expect(page.locator("#shp-prj")).toBeVisible();
    const box = await page.locator("#shp-prj").boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "载入 SHP 示例" }).click();
  await page.locator("#shp-prj").fill('LOCAL_CS["survey",UNIT["metre",1]]');
  await page.locator("#shp-convert").click();
  await expect(page.locator("#shp-state")).toHaveText("转换完成");
  const pending = page.waitForEvent("download");
  await page.locator("#shp-download").click();
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(await readFile((await (await pending).path())!));
  expect(strFromU8(zip["lines.prj"])).toBe(
    'LOCAL_CS["survey",UNIT["metre",1]]',
  );
  await page.locator("#shp-prj").fill("changed");
  await expect(page.locator("#shp-download")).toBeDisabled();
});
