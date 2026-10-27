import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("search and city filters narrow the default catalogue, preserving selected details and actual downloads", async ({
  page,
}, info) => {
  await page.goto("./");
  await page.getByRole("tab", { name: /降雨序列/ }).click();
  await page.locator("#rain-source").selectOption("formula");
  await expect(
    page.getByRole("button", {
      name: /导入 CSV|下载表格样板|下载完整公式表|恢复内置表格/,
    }),
  ).toHaveCount(0);
  await expect(page.locator("#city-followups")).toHaveCount(0);
  await expect(page.getByText("官方来源核实进度与未启用城市")).toHaveCount(0);
  await page.locator("#city-search").fill("成都");
  await expect(page.locator("#city-formula option")).toHaveCount(6);
  await page.locator("#city-formula").selectOption("chengdu-short-z3-2026");
  await expect(page.locator("#city-evidence")).toContainText("成都");
  await expect(page.locator("#city-evidence")).not.toContainText("南京");
  await expect(page.locator("#chicago-a")).toHaveValue("7.339");
  await page.locator("#city-search").fill("");
  await expect(page.locator("#city-formula")).toHaveValue(
    "chengdu-short-z3-2026",
  );
  await page.locator("#city-filter").selectOption("郑州");
  await expect(page.locator("#city-formula option")).toHaveCount(5);
  await page.locator("#city-formula").selectOption("zhengzhou-main-2023");
  for (const [key, v] of Object.entries({
    p: "10",
    duration: "120",
    r: "0.433",
    step: "60",
  }))
    await page.locator("#chicago-" + key).fill(v);
  await page.locator("#rain-convert").click();
  await expect(page.locator("#rain-result-state")).toHaveText("转换完成");
  const pending = page.waitForEvent("download");
  await page.locator("#rain-report").click();
  const r = JSON.parse(await readFile((await (await pending).path())!, "utf8"));
  expect(r.generation.catalogue.city).toBe("郑州");
  expect(r.generation.parameters.a).toBe(2001.829);
  await page.locator("#city-search").fill("不存在的城市");
  await expect(page.locator("#city-match-count")).toContainText("0");
  await expect(page.locator("#city-evidence")).toBeHidden();
  await expect(page.locator("#rain-download")).toBeDisabled();
  await page.locator("#city-search").fill("");
  await page.locator("#city-filter").selectOption("北京");
  await expect(page.locator("#city-formula option")).toHaveCount(5);
  const labels = await page.locator("#city-formula option").allTextContents();
  expect(new Set(labels).size).toBe(labels.length);
  await page.locator("#city-formula").selectOption("beijing-zone1-long-2016");
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`city-selection-${width}.png`),
      fullPage: true,
    });
  }
  await page.screenshot({
    path: info.outputPath("city-selection.png"),
    fullPage: true,
  });
});

test("every catalogue entry can be selected and special rules reach the worker report", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page.getByRole("tab", { name: /降雨序列/ }).click();
  await page.locator("#rain-source").selectOption("formula");
  const options = await page
    .locator("#city-formula option")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        id: (node as HTMLOptionElement).value,
        label: node.textContent,
      })),
    );
  expect(options).toHaveLength(71);
  expect(new Set(options.map((o) => o.label)).size).toBe(71);
  for (const option of options.slice(1)) {
    await page.locator("#city-formula").selectOption(option.id);
    await expect(page.locator("#city-evidence")).toBeVisible();
  }
  await page.locator("#city-formula").selectOption("guiyang-city-2014");
  await page.locator("#chicago-p").fill("50");
  expect(Number(await page.locator("#chicago-b").inputValue())).toBeCloseTo(
    9.35 * 50 ** 0.031,
    10,
  );
  await expect(page.locator("#city-coefficients-note")).toContainText(
    "P = 50 年",
  );
  for (const [id, value] of Object.entries({
    duration: "120",
    r: "0.4",
    step: "60",
  }))
    await page.locator("#chicago-" + id).fill(value);
  for (const id of ["guiyang-city-2014", "haikou-short-2025"]) {
    await page.locator("#city-formula").selectOption(id);
    await page.locator("#chicago-p").fill(id.startsWith("haikou") ? "5" : "50");
    await page.locator("#rain-convert").click();
    await expect(page.locator("#rain-result-state")).toHaveText("转换完成");
    const pending = page.waitForEvent("download");
    await page.locator("#rain-report").click();
    const report = JSON.parse(
      await readFile((await (await pending).path())!, "utf8"),
    );
    expect(report.generation.catalogue.id).toBe(id);
    expect(report.generation.catalogue.calculationRule).toBe(
      id.startsWith("haikou") ? "海口总公式I" : "b乘P的0.031次方",
    );
    expect(report.generation.parameters.formula).toBe("direct");
    expect(report.generation.parameters.b).toBeCloseTo(
      id.startsWith("haikou") ? 19.757 : 9.35 * 50 ** 0.031,
      10,
    );
    if (id.startsWith("haikou"))
      expect(report.generation.parameters.a).toBeCloseTo(
        16.742 * (1 + 0.49 * Math.log10(1 / -Math.log1p(-1 / 5))),
        10,
      );
  }
  expect(errors).toEqual([]);
});
