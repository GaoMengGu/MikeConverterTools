import { generateChicago, type ChicagoParameters } from "./chicago";
import type { RainOptions } from "./rainfall";

type Coefficients = Pick<
  ChicagoParameters,
  "formula" | "a" | "b" | "c" | "n" | "unit"
>;
export interface CityFormula {
  id: string;
  city: string;
  label: string;
  scope: string;
  source: {
    title: string;
    url: string;
    attachment?: string;
    version: string;
    published: string;
    checked: string;
    location: string;
  };
  duration: [number, number] | null;
  periods: [number, number] | number[];
  discrete?: boolean;
  coefficients?: Coefficients;
  table?: Record<number, [number, number, number]>;
  peakRatio?: number;
  note: string;
}
const source = (
  title: string,
  url: string,
  version: string,
  published: string,
  location: string,
  attachment?: string,
) => ({
  title,
  url,
  version,
  published,
  location,
  attachment,
  checked: "2026-10-23",
});
const nj = source(
  "关于发布南京市暴雨强度公式的通知",
  "https://shuiwu.nanjing.gov.cn/njsswj/202506/t20250623_5591525.html",
  "宁水运管〔2024〕32号 / 查算表2023-12",
  "2024（网站公开2025-06-23）",
  "附件正文第1页，式1-2、1-3；查算表1–1440min、2–100年",
  "https://shuiwu.nanjing.gov.cn/njsswj/202506/P020250623567812277737.pdf",
);
const tj = source(
  "天津市城镇雨水径流量计算标准",
  "https://zfcxjs.tj.gov.cn/sylm/gabsycs/xxbzgfgh/202010/W020201029539178321716.pdf",
  "DB/T 29-236-2016",
  "2016",
  "正文第5页3.2.3–3.2.6，附录A暴雨分区",
);
const sz = source(
  "深圳市分流域暴雨强度公式及查算图表",
  "https://weather.sz.gov.cn/qixiangfuwu/qihoufuwu/qihouguanceyupinggu/baoyuqiangdugongshi/index.html",
  "2024版（2015版废止）",
  "2024-12-23",
  "附件正文第6–9页表1、3、5、7；附表查算1–180min",
  "https://weather.sz.gov.cn/attachment/1/1547/1547780/11971465.pdf",
);
const standard = (
  a: number,
  c: number,
  b: number,
  n: number,
  unit: Coefficients["unit"] = "lsha",
): Coefficients => ({ formula: "return-period", a, c, b, n, unit });

const gz = source(
  "关于公开广州市暴雨强度公式编制与设计暴雨雨型研究技术报告简本的公告",
  "https://swj.gz.gov.cn/zzfw/tzgg/content/post_8836978.html",
  "技术报告2022-12 / 2023公开",
  "2023-03-07",
  "简本正文第5–7页表4-1至4-5，第3页P/t范围",
  "https://swj.gz.gov.cn/attachment/7/7870/7870863/8836978.pdf",
);
export const cityFormulas: CityFormula[] = [
  {
    id: "nanjing-south-2024",
    city: "南京",
    label: "江南区域",
    scope: "以长江为界的江南区域，江南主城区适用，其他区域参照",
    source: nj,
    duration: [1, 1440],
    periods: [2, 100],
    coefficients: standard(16.696, 0.954, 18.825, 0.751, "mmmin"),
    note: "采用原文 mm/min 系数。原文另有独立四舍五入的 q 系数，不混用。芝加哥雨型为本工具生成方案，不替代原文设计雨型分配表。",
  },
  {
    id: "nanjing-north-2024",
    city: "南京",
    label: "江北区域",
    scope: "以长江为界的江北区域，具体项目按发布通知核对",
    source: nj,
    duration: [1, 1440],
    periods: [2, 100],
    coefficients: standard(18.896, 0.628, 16.802, 0.756, "mmmin"),
    note: "原文包含180min及1440min设计雨型分配比例，请按项目要求核对。",
  },
  ...[
    [
      "I区",
      2141,
      0.7562,
      9.6093,
      0.6893,
      "和平、河东、河西、南开、河北、红桥、北辰、东丽、津南、西青",
    ],
    ["II区", 2728, 0.7672, 13.4757, 0.7386, "滨海新区"],
    [
      "III区",
      3034,
      0.7589,
      13.2148,
      0.7849,
      "静海、宁河、武清、宝坻及蓟州平原区（标准旧称蓟县）",
    ],
    [
      "IV区",
      2583,
      0.778,
      13.7521,
      0.7677,
      "蓟州北部山区20m等高线以上（标准旧称蓟县）",
    ],
  ].map(([label, a, c, b, n, scope], i): CityFormula => ({
    id: "tianjin-" + (i + 1) + "-2016",
    city: "天津",
    label: String(label),
    scope: String(scope),
    source: tj,
    duration: null,
    periods: [2, 100],
    coefficients: standard(Number(a), Number(c), Number(b), Number(n)),
    note: "所读条款未明确公式有效历时边界；2–100年为本工具限制，非声称原标准的拟合边界。原标准提供本地雨型表；使用前需核对适用性及后续修订。",
  })),
  ...[
    [
      "west",
      "西部流域和水系",
      "宝安、光明、龙华；龙岗平湖/坂田；南山南山/南头街道",
      [
        [10533.525, 30.983, 0.926],
        [9728.251, 30.189, 0.879],
        [8777.687, 29.351, 0.821],
        [6110.53, 25.026, 0.72],
        [5013.674, 21.838, 0.657],
        [4574.13, 20.309, 0.625],
        [4088.828, 18.532, 0.587],
        [3487.962, 16.257, 0.537],
      ],
    ],
    [
      "central",
      "中部流域和水系",
      "南山除南山/南头街道、福田、罗湖；龙岗除平湖/坂田；坪山坑梓/龙田",
      [
        [4728.605, 18.446, 0.77],
        [5062.939, 19.65, 0.757],
        [5422.49, 21.14, 0.741],
        [5226.599, 21.591, 0.703],
        [4760.335, 20.613, 0.662],
        [4573.629, 20.2, 0.643],
        [4367.217, 19.736, 0.621],
        [4111.874, 19.158, 0.594],
      ],
    ],
    [
      "east",
      "东部流域和水系",
      "盐田；坪山除坑梓/龙田；大鹏新区",
      [
        [2531.052, 12.325, 0.622],
        [2277.546, 10.799, 0.581],
        [2004.835, 9.157, 0.534],
        [1995.149, 8.513, 0.5],
        [2096.685, 8.829, 0.485],
        [2155.803, 8.939, 0.478],
        [2230.285, 9.057, 0.472],
        [2331.153, 9.2, 0.463],
      ],
    ],
    [
      "shenshan",
      "深汕特别合作区",
      "深汕特别合作区，采用汕尾国家基本气象站资料",
      [
        [2630.083, 12.223, 0.653],
        [2537.064, 11.704, 0.62],
        [2423.337, 11.126, 0.58],
        [2599.188, 11.424, 0.561],
        [3120.729, 12.94, 0.572],
        [3407.635, 13.466, 0.576],
        [3759.003, 14.03, 0.58],
        [4225.768, 14.716, 0.586],
      ],
    ],
  ].map(([id, label, scope, values]): CityFormula => ({
    id: "shenzhen-" + id + "-2024",
    city: "深圳",
    label: String(label),
    scope: String(scope),
    source: sz,
    duration: [1, 180],
    periods: [2, 3, 5, 10, 20, 30, 50, 100],
    discrete: true,
    table: Object.fromEntries(
      (values as number[][]).map((v, i) => [
        [2, 3, 5, 10, 20, 30, 50, 100][i],
        v,
      ]),
    ) as Record<number, [number, number, number]>,
    note: "使用官方单一重现期 q 公式，不插值。仅开放2/3/5/10/20/30/50/100年；区间参数公式和1年公式暂未接入。",
  })),
  ...[
    [
      "central",
      "中心城区",
      "中心城区，黄埔/南沙等专用成果适用性另见简本第7章，不自动扩大适用地域",
      [
        [10848.487, 25.581, 0.931],
        [12682.648, 28.369, 0.93],
        [14788.685, 31.311, 0.928],
        [16971.542, 34.941, 0.916],
        [20694.473, 41.519, 0.915],
        [22480.204, 43.803, 0.914],
        [24556.014, 46.25, 0.913],
        [27212.984, 49.226, 0.912],
      ],
    ],
    [
      "huadu",
      "花都区",
      "花都区，须核对简本适用性说明",
      [
        [9934.83, 26.474, 0.923],
        [8809.751, 26.352, 0.866],
        [7599.335, 26.213, 0.8],
        [6435.345, 25.354, 0.727],
        [5835.815, 23.576, 0.68],
        [5595.669, 22.864, 0.658],
        [5330.473, 22.077, 0.632],
        [5001.984, 21.103, 0.6],
      ],
    ],
    [
      "conghua",
      "从化区",
      "从化区，须核对简本适用性说明",
      [
        [5864.205, 18.485, 0.822],
        [5632.576, 17.708, 0.792],
        [5370.553, 16.872, 0.757],
        [4649.447, 15.093, 0.702],
        [4158.3, 13.218, 0.66],
        [3961.574, 12.514, 0.639],
        [3744.307, 11.748, 0.614],
        [3475.27, 10.808, 0.583],
      ],
    ],
    [
      "panyu",
      "番禺区",
      "番禺区，须核对简本适用性说明",
      [
        [6449.707, 22.291, 0.853],
        [6411.464, 21.24, 0.829],
        [6364.871, 19.984, 0.801],
        [6601.844, 18.629, 0.779],
        [7124.554, 17.74, 0.773],
        [7429.162, 17.432, 0.77],
        [7812.427, 17.101, 0.767],
        [8331.797, 16.699, 0.763],
      ],
    ],
    [
      "zengcheng",
      "增城区",
      "增城区，须核对简本适用性说明",
      [
        [2246.15, 7.76, 0.616],
        [2443.377, 7.445, 0.608],
        [2687.364, 7.068, 0.599],
        [3094.844, 7.169, 0.602],
        [3614.047, 7.628, 0.613],
        [3893.104, 7.788, 0.617],
        [4231.78, 7.959, 0.621],
        [4678.338, 8.167, 0.627],
      ],
    ],
  ].map(([id, label, scope, values]): CityFormula => ({
    id: "guangzhou-" + id + "-2022",
    city: "广州",
    label: String(label),
    scope: String(scope),
    source: gz,
    duration: [1, 180],
    periods: [2, 3, 5, 10, 20, 30, 50, 100],
    discrete: true,
    table: Object.fromEntries(
      (values as number[][]).map((v, i) => [
        [2, 3, 5, 10, 20, 30, 50, 100][i],
        v,
      ]),
    ) as Record<number, [number, number, number]>,
    note: "使用官方近40年资料单一重现期q公式。其他P和180min以上长历时未接入，不外推、不插值。",
  })),
  {
    id: "changzhou-short-2025",
    city: "常州",
    label: "短历时 ≤180min",
    scope: "武进、新北、天宁、钟楼及常州经开区",
    source: source(
      "关于发布常州市暴雨强度公式的通知",
      "https://www.changzhou.gov.cn/gi_news/787176483063539",
      "常住建〔2025〕156号",
      "2025-12-04",
      "第一项短历时公式图片；第二项雨峰系数",
      "https://www.changzhou.gov.cn/upfiles/admininfo/20251204/20251204143955_28107.png",
    ),
    duration: [1, 180],
    periods: [2, 100],
    coefficients: standard(22.315, 0.558, 13.9, 0.848, "mmmin"),
    peakRatio: 0.462,
    note: "1min下限与2–100年为本工具保守限制，通知未列完整拟合下限/P边界。180–1440min另有公式，未混用。",
  },
];
export const formulaFollowups = [
  {
    city: "北京",
    url: "https://ghzrzyw.beijing.gov.cn/biaozhunguanli/bz/cxgh/202002/t20200220_1662906.html",
    note: "已定位DB11/T 969-2016官方全文。公式分I/II区、1–5与5–1440min；分段连续雨型需单独实现，尚不启用。",
  },
  {
    city: "上海",
    url: "https://swj.sh.gov.cn/swj-zhzwqtzcwj/20260116/321ff7d9c904431caba046492326f92d.html",
    note: "官方文件引用DB31/T1043-2017；尚未完成标准全文系数和适用范围复核。",
  },

  {
    city: "武汉",
    url: "https://std.samr.gov.cn/db/search/stdDBDetailed?id=D7B84B1B611D43CFE05397BE0A0AC19B",
    note: "已定位DB4201/T641-2020官方登记，全文参数尚未复核。",
  },
  {
    city: "昆山",
    url: "https://www.ks.gov.cn/kss/swbmwj/202605/95caeb331df6468eab1b82bda0fb734f.shtml",
    note: "2026官方通知已定位，P2–100年、t5–180min、r0.44。公式图片指数尚未可靠复核，不启用。",
  },
  {
    city: "郑州",
    url: "https://zrzyhghj.zhengzhou.gov.cn/tzgg/6928586.jhtml",
    note: "2023官方发布通知已定位，DOC附件读取失败，尚不启用系数。",
  },
  {
    city: "成都、西安、杭州、海口、三亚",
    url: "https://www.mohurd.gov.cn/gongkai/zc/wjk/art/2025/art_08015381a0b64e8d84f5a2f1a7509fee.html",
    note: "尚未完成各地当前官方原文与系数核实；本链接是修订工作要求，不是这些城市的公式来源。",
  },
];
export function resolveCityFormula(
  id: string,
  returnPeriod: number,
  durationMinutes: number,
): ChicagoParameters {
  const f = cityFormulas.find((f) => f.id === id);
  if (!f) throw new Error("未知城市公式。");
  if (
    !Number.isFinite(returnPeriod) ||
    (f.discrete
      ? !f.periods.includes(returnPeriod)
      : returnPeriod < f.periods[0] || returnPeriod > f.periods[1])
  )
    throw new Error(
      "重现期超出该条目的收录范围：" +
        f.periods.join(f.discrete ? "、" : "–") +
        " 年。",
    );
  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0 ||
    (f.duration &&
      (durationMinutes < f.duration[0] || durationMinutes > f.duration[1]))
  )
    throw new Error(
      "历时超出该公式范围：" + (f.duration?.join("–") ?? "正值") + " min。",
    );
  const v = f.table?.[returnPeriod];
  const coefficients = v
    ? {
        formula: "direct" as const,
        a: v[0],
        b: v[1],
        n: v[2],
        unit: "lsha" as const,
      }
    : f.coefficients!;
  return {
    ...coefficients,
    returnPeriod,
    durationMinutes,
    peakRatio: f.peakRatio ?? 0.4,
    stepSeconds: 60,
    source: [
      f.city,
      f.label,
      f.source.title,
      f.source.version,
      f.source.url,
      f.source.attachment ?? "",
      f.source.location,
      "核实日期 " + f.source.checked,
      "适用地域 " + f.scope,
      f.note,
    ].join(" | "),
  };
}
export function generateCityChicago(
  id: string,
  storm: Pick<
    ChicagoParameters,
    "returnPeriod" | "durationMinutes" | "peakRatio" | "stepSeconds"
  >,
  output: RainOptions = {},
) {
  const p = resolveCityFormula(id, storm.returnPeriod!, storm.durationMinutes);
  const result = generateChicago(
    { ...p, peakRatio: storm.peakRatio, stepSeconds: storm.stepSeconds },
    output,
  );
  const f = cityFormulas.find((f) => f.id === id)!;
  result.generation!.catalogue = {
    id: f.id,
    city: f.city,
    region: f.label,
    source: { ...f.source },
    scope: f.scope,
    duration: f.duration,
    periods: [...f.periods],
    note: f.note,
  };
  result.guide +=
    "\n\n官方公式目录条目\n" +
    JSON.stringify(result.generation!.catalogue, null, 2) +
    "\n生成的芝加哥雨型不替代地方规定设计雨型。";
  result.warnings = result.warnings.filter(
    (w) => !w.startsWith("公式参数由用户提供"),
  );
  result.warnings.push(
    "已核对收录版本原文，不保证实时最新；须核对项目所在地适用版本。" + f.note,
    "芝加哥雨型为工具选用雨型，不能等同于地方指定设计雨型；r由用户确定。",
  );
  return result;
}
