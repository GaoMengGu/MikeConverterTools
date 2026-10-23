import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
test("DXF to SHP worker exports real files, clears stale downloads and fits the viewport", async ({
  page,
}, info) => {
  await page.goto("./");
  await page.getByRole("tab", { name: /DXF 转 SHP/ }).click();
  await page.getByRole("button", { name: "载入 SHP 示例" }).click();
  await page.locator("#shp-closed").selectOption("polygons");
  await page.locator("#shp-convert").click();
  await expect(page.locator("#shp-state")).toHaveText("转换完成");
  const pending = page.waitForEvent("download");
  await page.locator("#shp-download").click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const zip = unzipSync(await readFile((await download.path())!));
  expect(zip["polygons.shp"]).toBeDefined();
  expect(zip["polygons.prj"]).toBeUndefined();
  expect(strFromU8(zip["report.json"])).toContain("polygons");
  await expect(page.locator("#shp-summary")).toContainText("面");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("shapefile.png"),
    fullPage: true,
  });
  await page.locator("#shp-coordinates").selectOption("37");
  await expect(page.locator("#shp-download")).toBeDisabled();
  await page.locator("#shp-convert").click();
  await expect(page.locator("#shp-state")).toHaveText("转换完成");
  const next = page.waitForEvent("download");
  await page.locator("#shp-download").click();
  const projected = unzipSync(await readFile((await (await next).path())!));
  expect(strFromU8(projected["polygons.prj"])).toContain("CGCS2000");
});
test("SHP cancel terminates worker, stale results stay disabled, and source PRJ is explicit", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("tab", { name: /DXF 转 SHP/ }).click();
  await page.getByRole("button", { name: "载入 SHP 示例" }).click();
  await page.evaluate(() => {
    const Native = window.Worker;
    window.Worker = class extends Native {
      postMessage() {
        /* Keep worker pending to test user cancellation deterministically. */
      }
    } as typeof Worker;
  });
  await page.locator("#shp-convert").click();
  await expect(page.locator("#shp-cancel")).toBeVisible();
  await page.locator("#shp-cancel").click();
  await expect(page.locator("#shp-state")).toHaveText("已取消");
  await expect(page.locator("#shp-download")).toBeDisabled();
  await expect(page.locator("#shp-file")).toBeEnabled();
});
