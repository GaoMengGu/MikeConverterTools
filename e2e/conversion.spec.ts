import { test, expect } from "@playwright/test";
import { boundaryDxf, dxf, road } from "../tests/fixtures";
import { readFile } from "node:fs/promises";

const file = (name: string, text: string) => ({
  name,
  mimeType: "text/plain",
  buffer: Buffer.from(text),
});

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
});

test("boundary selection, preview and exact download stay on device", async ({
  page,
}) => {
  const sent: string[] = [];
  page.on("request", (req) => {
    if (req.method() !== "GET") sent.push(req.url());
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "边界转换", exact: true }),
  ).toBeVisible();
  await page
    .locator("#boundary-file")
    .setInputFiles(file("boundary.dxf", boundaryDxf));
  await expect(page.locator("#boundary-select")).toContainText("ROAD", {
    timeout: 15000,
  });
  await page.locator("#zone").selectOption("39");
  await page.getByRole("button", { name: "开始转换" }).click();
  await expect(page.locator("#result-state")).toHaveText("转换完成");
  await expect(page.locator("#output-name")).toHaveValue(
    "boundary_mike_boundary_5col_zone39.xyz",
  );
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 XYZ" }).click();
  const download = await downloaded;
  const text = await readFile((await download.path())!, "utf8");
  expect(text.split("\n")[0]).toBe("39359000.000000 2091000.000000 1 0 0");
  expect(sent).toEqual([]);
  await expect(page.locator("#result-preview")).toBeVisible();
});

test("point filter and zone errors recover cleanly", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("tab", { name: /地形点转换/ }).click();
  await page
    .locator("#points-file")
    .setInputFiles(
      file("terrain.txt", "359000 2091000 10\n359001 2091001 20\nbad row"),
    );
  await page.locator("#filter-enabled").check();
  await page.locator("#min-z").fill("20");
  await page.getByRole("button", { name: "开始转换" }).click();
  await expect(page.locator("#result-state")).toContainText("转换完成");
  await expect(page.locator("#stat-count")).toHaveText("1");
  await expect(page.locator("#result-details")).toContainText("跳过 1 行");
  await page
    .locator("#points-file")
    .setInputFiles(file("mismatch.txt", "39359000 2091000 700"));
  await page.getByRole("button", { name: "开始转换" }).click();
  await expect(page.getByRole("alert")).toContainText("39 带号");
  await expect(page.getByRole("button", { name: "下载 XYZ" })).toBeDisabled();
});

test("area assignment honors priority, default and open-line failure", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("tab", { name: /分区赋值/ }).click();
  await page
    .locator("#points-file")
    .setInputFiles(
      file("centers.xyz", "359005 2091005 700\n359020 2091020 700"),
    );
  await page
    .locator("#areas-file")
    .setInputFiles(file("zones.dxf", boundaryDxf));
  await page
    .locator("#values-file")
    .setInputFiles(file("values.txt", "ROAD 75\nDX 12.5"));
  await page.getByRole("button", { name: "开始转换" }).click();
  await expect(page.locator("#result-state")).toHaveText("转换完成");
  await expect(page.locator("#result-details")).toContainText("默认赋值");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 XYZ" }).click();
  const text = await readFile((await (await downloaded).path())!, "utf8");
  expect(
    text
      .trim()
      .split("\n")
      .map((row) => Number(row.split(" ")[2])),
  ).toEqual([75, 12.5]);
  await page
    .locator("#areas-file")
    .setInputFiles(file("open.dxf", dxf([{ ...road, closed: false }])));
  await page.getByRole("button", { name: "开始转换" }).click();
  await expect(page.getByRole("alert")).toContainText("未闭合");
});

test("example draws actual geometry without horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.goto("./");
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByRole("button", { name: "开始转换" }).click();
  await expect(page.locator("#result-state")).toHaveText("转换完成");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const pixels = await page
    .locator("#preview-canvas")
    .evaluate((element: HTMLCanvasElement) => {
      const data = element
        .getContext("2d")!
        .getImageData(0, 0, element.width, element.height).data;
      let color = 0;
      for (let i = 0; i < data.length; i += 4)
        if (data[i + 1] > data[i] + 15 && data[i + 1] > data[i + 2] + 5)
          color++;
      return color;
    });
  expect(pixels).toBeGreaterThan(50);
  await page.screenshot({
    path: testInfo.outputPath("converter.png"),
    fullPage: true,
  });
});

test("report records chosen parameters and changing inputs invalidates old downloads", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("tab", { name: /地形点转换/ }).click();
  await page
    .locator("#points-file")
    .setInputFiles(
      file("columns.csv", "1,2091000,359000,20\n2,2091001,359001,10"),
    );
  await page.locator("#column-mode").selectOption("custom");
  await page.locator("#column-x").fill("3");
  await page.locator("#column-y").fill("2");
  await page.locator("#column-z").fill("4");
  await page.locator("#filter-enabled").check();
  await page.locator("#min-z").fill("20");
  await page.getByRole("button", { name: "开始转换" }).click();
  await expect(page.locator("#result-state")).toHaveText("转换完成");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载报告" }).click();
  const report = JSON.parse(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(report.options).toMatchObject({
    zone: 37,
    columns: [3, 2, 4],
    minZ: 20,
  });
  expect(report.stats.points).toBe(1);
  await page.locator("#min-z").fill("10");
  await expect(page.getByRole("button", { name: "下载 XYZ" })).toBeDisabled();
});

test("cancel terminates a large conversion and allows another job", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("tab", { name: /地形点转换/ }).click();
  await page
    .locator("#points-file")
    .setInputFiles(file("large.xyz", "359000 2091000 700\n".repeat(500000)));
  await page.getByRole("button", { name: "开始转换" }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator("#run-state")).toHaveText("已取消");
  await expect(page.getByRole("button", { name: "下载 XYZ" })).toBeDisabled();
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByRole("button", { name: "开始转换" }).click();
  await expect(page.locator("#result-state")).toHaveText("转换完成");
});

test("oversized replacement clears old results and requires a new file", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("tab", { name: /地形点转换/ }).click();
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByRole("button", { name: "开始转换" }).click();
  await expect(page.locator("#result-state")).toHaveText("转换完成");
  await page.locator("#points-file").evaluate((input: HTMLInputElement) => {
    const replacement = new File(["x"], "oversized.xyz");
    Object.defineProperty(replacement, "size", {
      value: 100 * 1024 * 1024 + 1,
    });
    const transfer = new DataTransfer();
    transfer.items.add(replacement);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByRole("alert")).toContainText("100 MB");
  await expect(page.getByRole("button", { name: "下载 XYZ" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "下载报告" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "开始转换" })).toBeDisabled();
  await expect(page.locator("#points-file")).toHaveValue("");
  await page.getByRole("button", { name: "载入示例" }).click();
  await page.getByRole("button", { name: "开始转换" }).click();
  await expect(page.locator("#result-state")).toHaveText("转换完成");
});

test("GBK encoding preserves Chinese layer names", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("tab", { name: /分区赋值/ }).click();
  // DxfParser reads the decoded text; the byte sequence below is GBK for 道路.
  const gbkName = Buffer.from([0xb5, 0xc0, 0xc2, 0xb7]);
  const parts = boundaryDxf
    .replaceAll("ROAD", "PLACEHOLDER")
    .split("PLACEHOLDER")
    .map((s) => Buffer.from(s));
  const bytes = Buffer.concat(
    parts.flatMap((part, i) =>
      i < parts.length - 1 ? [part, gbkName] : [part],
    ),
  );
  await page
    .locator("#points-file")
    .setInputFiles(file("points.xyz", "359005 2091005 700"));
  await page.locator("#areas-file").setInputFiles({
    name: "areas.dxf",
    mimeType: "text/plain",
    buffer: bytes,
  });
  await page
    .locator("#values-file")
    .setInputFiles(file("values.txt", "道路 75\n背景 12.5"));
  await page.getByRole("button", { name: "开始转换" }).click();
  await expect(page.locator("#result-state")).toHaveText("转换完成");
  await expect(page.locator("#result-details")).toContainText("道路：1");
});
