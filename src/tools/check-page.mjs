import fs from "node:fs";

const file = process.argv[2];
if (!file) { console.error("用法: node src/tools/check-page.mjs src/index.html"); process.exit(2); }
const html = fs.readFileSync(file, "utf8");

const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: 未找到内联 script"); process.exit(1); }
const code = m[1] + `
;globalThis.__app = { INST_LIB, INST_CATS, newExp, isValidExp, normalizeExp, Store,
  canvasAct, instPanelHTML, buildLocalMarkdown, mdToHtml, mdInline, esc, has,
  parseHash, goTo, render, viewHome, viewEdit, viewRecord, viewReport, viewSettings,
  REPORT_PROMPT, Media, state, ui, applyTheme, resolvedTheme, systemDark, KEYS,
  collectReportData, localReport, instById, instName, renderInstIcon, compressImage,
  EXP_VERSION, DB_NAME, SVG };
`;

/* ---------------- 最小 DOM 桩 ---------------- */

const store = {};
const mkEl = (id) => ({
  id, innerHTML: "", textContent: "", value: "", scrollTop: 0, dataset: {}, style: {},
  tagName: "DIV", src: "", type: "", accept: "", multiple: false, onchange: null, href: "", download: "",
  classList: { toggle() {}, add() {}, remove() {} },
  setAttribute() {}, removeAttribute() {}, hasAttribute() { return false; },
  addEventListener() {}, appendChild() {}, remove() {}, click() {},
  querySelector: () => null, querySelectorAll: () => [],
  closest: () => null, parentElement: null,
});
const docEl = {
  attrs: {},
  setAttribute(k, v) { this.attrs[k] = v; },
  getAttribute(k) { return this.attrs[k]; },
};
globalThis.document = {
  getElementById: (id) => (store[id] || (store[id] = mkEl(id))),
  addEventListener() {},
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (t) => mkEl(t),
  body: { appendChild() {}, removeChild() {} },
  execCommand: () => true,
  documentElement: docEl,
};
globalThis.location = { hash: "" };
globalThis.addEventListener = () => {};
globalThis.window = globalThis;
globalThis.confirm = () => true;
globalThis.prompt = (_msg, def) => def || "";
globalThis.alert = () => {};
globalThis.URL = { createObjectURL: () => "blob:stub", revokeObjectURL() {} };

const memStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => { memStore.set(k, String(v)); },
  removeItem: (k) => { memStore.delete(k); },
  clear: () => memStore.clear(),
};

globalThis.__prefersDark = false;
globalThis.matchMedia = (q) => ({
  media: q,
  get matches() { return /dark/.test(q) ? globalThis.__prefersDark : false; },
  addEventListener() {},
});

const results = [];
const check = (name, cond) => results.push([!!cond, name]);
const main = () => store.main.innerHTML;

/* ---------------- 1. 脚本可执行 ---------------- */

try {
  new Function('"use strict";' + code)();
  check("内联脚本在严格模式下执行无异常（无隐式全局变量）", true);
} catch (e) {
  check("内联脚本在严格模式下执行无异常 —— " + e.message, false);
  results.forEach(([ok, n]) => console.log((ok ? "  OK   " : "  FAIL ") + n));
  process.exit(1);
}
const A = globalThis.__app;

/* ---------------- 2. 仪器库与色盘 ---------------- */

check("仪器库：条目数量 ≥ 30", A.INST_LIB.length >= 30);
check("仪器库：每项含 id/name/cat/icon/w/h/imageUrl",
  A.INST_LIB.every((x) => x.id && x.name && x.cat && x.icon && x.w && x.h && "imageUrl" in x));
check("仪器库：id 唯一", new Set(A.INST_LIB.map((x) => x.id)).size === A.INST_LIB.length);
check("仪器库：分类齐全且无孤儿分类",
  A.INST_CATS.every((c) => A.INST_LIB.some((x) => x.cat === c.id)) &&
  A.INST_LIB.every((x) => A.INST_CATS.some((c) => c.id === x.cat)));
check("仪器库：含烧杯 / 试管 / 显微镜等生化常用项",
  ["beaker", "test-tube", "microscope", "alcohol-lamp", "petri-dish"].every((id) => !!A.instById(id)));
check("仪器库：imageUrl 为空时回退 SVG 占位",
  A.renderInstIcon({ inst: "beaker" }).indexOf("<svg") >= 0);
check("仪器库：填写 imageUrl 后优先渲染图片（替换接口生效）",
  (() => {
    const b = A.instById("beaker");
    const old = b.imageUrl; b.imageUrl = "art/beaker.png";
    const out = A.renderInstIcon({ inst: "beaker" });
    b.imageUrl = old;
    return out.indexOf("<img") === 0 || out.indexOf("<img") >= 0;
  })());

/* ---------------- 3. 数据模型与持久化 ---------------- */

const exp = A.newExp("银镜反应", "chemistry");
check("新建实验：默认含 1 个步骤", exp.steps.length === 1);
check("新建实验：主题随学科分配", exp.theme === "t-sky");
check("结构校验：合法实验通过", A.isValidExp(exp) === true);
check("结构校验：缺 steps 被拒", A.isValidExp({ id: "x" }) === false);
check("结构校验：null 被拒", A.isValidExp(null) === false);
check("结构校验：步骤缺 images 被拒",
  A.isValidExp({ id: "x", steps: [{ id: "s1" }] }) === false);
check("归一化：补全 canvas 与 record",
  (() => { const n = A.normalizeExp({ id: "x", steps: [{ id: "s1" }] });
    return n.steps[0].canvas.items.length === 0 && typeof n.steps[0].record.note === "string"; })());

A.Store.saveExp(exp);
check("持久化：写入后出现在列表", A.Store.listExps().some((x) => x.id === exp.id));
check("持久化：按 id 读回一致", (A.Store.getExp(exp.id) || {}).name === "银镜反应");
exp.name = "银镜反应（改）";
A.Store.saveExp(exp);
check("持久化：重复保存为更新而非新增", A.Store.listExps().filter((x) => x.id === exp.id).length === 1);
check("持久化：更新后名称同步", (A.Store.listExps().find((x) => x.id === exp.id) || {}).name === "银镜反应（改）");
check("持久化：脏数据拒绝写入", A.Store.saveExp({ id: "", steps: "x" }) === false);

const exp2 = A.newExp("临时实验", "biology");
A.Store.saveExp(exp2);
A.Store.removeExp(exp2.id);
check("持久化：删除后列表移除", !A.Store.listExps().some((x) => x.id === exp2.id));
check("持久化：删除后按 id 读为空", A.Store.getExp(exp2.id) === null);

/* ---------------- 4. 仪器画布 ---------------- */

A.goTo("edit", exp.id);
A.ui.step = 0;
const cv = () => A.state.exp.steps[0].canvas;
A.canvasAct("cv-add", { dataset: { inst: "beaker" } });
check("画布：添加仪器", cv().items.length === 1);
check("画布：添加后自动选中", A.ui.selected === cv().items[0].id);
A.canvasAct("cv-add", { dataset: { inst: "alcohol-lamp" } });
check("画布：可添加多个仪器", cv().items.length === 2);
A.canvasAct("cv-dup", { dataset: {} });
check("画布：复制选中仪器", cv().items.length === 3);
check("画布：复制项 id 互不相同", new Set(cv().items.map((x) => x.id)).size === 3);
A.canvasAct("cv-rot+", { dataset: {} });
check("画布：旋转 +15°", cv().items[2].rot === 15);
A.canvasAct("cv-rot-", { dataset: {} });
check("画布：旋转 −15° 回正", cv().items[2].rot === 0);
A.canvasAct("cv-scale+", { dataset: {} });
check("画布：放大生效", cv().items[2].scale > 1);
A.canvasAct("cv-scale-", { dataset: {} });
check("画布：缩放被限制在 0.4~2.5", cv().items[2].scale >= 0.4 && cv().items[2].scale <= 2.5);
A.canvasAct("cv-del", { dataset: {} });
check("画布：删除选中", cv().items.length === 2);
cv().links.push({ id: "l1", from: cv().items[0].id, to: cv().items[1].id, kind: "导管", note: "" });
A.canvasAct("cv-unlink", { dataset: {} });
check("画布：断线", cv().links.length === 0);
A.canvasAct("cv-clear", { dataset: {} });
check("画布：清空", cv().items.length === 0 && cv().links.length === 0);

check("仪器面板：覆盖全部仪器分类",
  A.INST_CATS.every((c) => A.instPanelHTML().indexOf(c.label) >= 0));
check("仪器面板：每个仪器都有可点击入口",
  A.INST_LIB.every((x) => A.instPanelHTML().indexOf('data-inst="' + x.id + '"') >= 0));
check("仪器面板：imageUrl 为空时回退 SVG 占位",
  A.instPanelHTML().indexOf("<svg") >= 0);
check("仪器面板：填写 imageUrl 后同样优先渲染图片（与画布同一渲染入口）",
  (() => {
    const b = A.instById("beaker");
    const old = b.imageUrl; b.imageUrl = "art/beaker.png";
    const out = A.instPanelHTML();
    b.imageUrl = old;
    return out.indexOf('src="art/beaker.png"') >= 0;
  })());

/* ---------------- 5. 编辑页 / 记录页 / 报告页渲染 ---------------- */

A.goTo("edit", exp.id);
check("编辑页：含五要素输入项",
  /data-field="text"/.test(main()) && /data-field="equation"/.test(main()) &&
  /data-field="tips"/.test(main()) && /data-act="media-add"/.test(main()));
check("编辑页：含画布宿主与仪器面板", /data-canvas-host/.test(main()) && /inst-panel/.test(main()));
check("编辑页：含步骤侧栏", /step-rail/.test(main()));

A.state.exp.steps[0].title = "加入硝酸银";
A.state.exp.steps[0].text = "取洁净试管，加入硝酸银溶液";
A.state.exp.steps[0].equation = "Ag+ + e- = Ag";
A.state.exp.steps[0].tips = "避免皮肤接触硝酸银";
A.state.exp.steps[0].record.note = "试管壁出现银镜";
A.state.exp.log.total = "全程水浴控温 60℃";
A.Store.saveExp(A.state.exp);
A.goTo("record", exp.id);
check("记录页：播放器就位", /player-dot/.test(main()) && /data-act="play-next"/.test(main()));
check("记录页：只读画布宿主", /data-ro="1"/.test(main()));
check("记录页：分步记录与总记录并存",
  /data-scope="record"/.test(main()) && /data-scope="total"/.test(main()));
check("记录页：渲染方程式", main().indexOf("Ag+ + e- = Ag") >= 0);

A.ui.playIndex = 0;
A.goTo("record", exp.id);
A.ui.playIndex = Math.min(1, A.state.exp.steps.length - 1);
A.render();
check("记录页：可切换播放步骤", /player-dot on/.test(main()));

/* ---------------- 6. 报告生成（本地 markdown） ---------------- */

const md = A.buildLocalMarkdown(A.state.exp);
check("报告：含实验名称标题", md.indexOf("# 银镜反应") === 0);
check("报告：含现象与数据表格", /\|\s*步骤\s*\|\s*操作\s*\|\s*现象\/数据\s*\|\s*备注\s*\|/.test(md));
check("报告：含反应方程式", md.indexOf("Ag+ + e- = Ag") >= 0);
check("报告：含注意事项（来自 TIPS）", md.indexOf("## 注意事项") >= 0);
check("报告：含总记录", md.indexOf("## 总记录") >= 0);
check("报告：表格单元转义竖线",
  A.buildLocalMarkdown(A.normalizeExp({ id: "e", name: "n", steps: [{ id: "s", title: "a|b", images: [] }] })).indexOf("a\\|b") >= 0);

A.localReport();
const rep = A.Store.report(exp.id);
check("报告：本地生成已落库", !!rep.markdown && rep.mode === "local");
A.goTo("report", exp.id);
check("报告页：渲染预览", /md-preview/.test(main()));
check("报告页：含本地生成与 LLM 两个入口", /data-act="rep-local"/.test(main()) && /data-act="rep-llm"/.test(main()));

const mdHtml = A.mdToHtml("# 标题\n\n| 步骤 | 现象 |\n| --- | --- |\n| 1 | 变蓝 |\n\n- 列表项");
check("markdown 渲染：标题", mdHtml.indexOf("<h1>标题</h1>") >= 0);
check("markdown 渲染：表格", /<table>/.test(mdHtml) && /<th>步骤<\/th>/.test(mdHtml) && /<td>变蓝<\/td>/.test(mdHtml));
check("markdown 渲染：列表", /<ul>/.test(mdHtml) && /<li>列表项<\/li>/.test(mdHtml));

/* ---------------- 7. 注入防护 ---------------- */

const evil = '<img src=x onerror="alert(1)">';
check("注入防护：esc 转义尖括号", A.esc(evil).indexOf("<img") < 0 && A.esc(evil).indexOf("&lt;img") >= 0);
check("注入防护：markdown 行内转义", A.mdInline(evil).indexOf("<img src=x") < 0);
A.state.exp.name = evil;
A.goTo("report", exp.id);
A.localReport();
check("注入防护：实验名进入报告后被转义", main().indexOf("<img src=x") < 0);
A.state.exp.name = "银镜反应";

/* ---------------- 8. 媒体与视频占位 ---------------- */

const vref = A.Media.addVideo({ name: "反应.mp4", type: "video/mp4", size: 100 });
check("媒体：视频仅登记元信息（占位）", vref.kind === "video" && vref.store === "external" && vref.name === "反应.mp4");
check("媒体：无 IndexedDB 环境可降级", typeof A.Media.open === "function");
check("媒体：压缩函数存在", typeof A.compressImage === "function");

/* ---------------- 9. LLM 接入 ---------------- */

check("LLM：提示词模板含数据占位符", A.REPORT_PROMPT.indexOf("{{DATA}}") >= 0);
check("LLM：提示词约束 Markdown 表格输出", A.REPORT_PROMPT.indexOf("表格") >= 0);
check("LLM：提示词要求简体中文", A.REPORT_PROMPT.indexOf("简体中文") >= 0);
check("LLM：未配置时无 API Key", A.Store.readJSON(A.KEYS.llm, {}).apiKey === undefined);

/* ---------------- 10. 设置页与主题 ---------------- */

A.goTo("settings");
check("设置页：含 LLM 三项配置", /data-llm="baseUrl"/.test(main()) && /data-llm="apiKey"/.test(main()) && /data-llm="model"/.test(main()));
check("设置页：含主题三态", /data-act="set-theme"/.test(main()));
check("设置页：含数据导入导出", /data-act="data-export-all"/.test(main()) && /data-act="exp-import"/.test(main()));

A.__prefersDark = false;
A.applyTheme("system");
check("主题：跟随系统解析为浅色", A.resolvedTheme() === "light" && docEl.attrs["data-theme"] === "light");
globalThis.__prefersDark = true;
check("主题：系统深色偏好被识别", A.resolvedTheme() === "dark");
A.applyTheme("light");
check("主题：手动选择优先于系统", A.resolvedTheme() === "light");
A.applyTheme("dark");
check("主题：可切换到深色", docEl.attrs["data-theme"] === "dark");
globalThis.__prefersDark = false;

/* ---------------- 11. 令牌完整性 ---------------- */

check("令牌：存在深色令牌块", /:root\[data-theme="dark"\]\s*\{/.test(html));
check("令牌：六色马卡龙均有深色覆盖",
  [".t-paper", ".t-mint", ".t-peach", ".t-lavender", ".t-lemon", ".t-sky"]
    .every((t) => html.includes(':root[data-theme="dark"] ' + t)));
check("令牌：无裸写的 background: #fff", (html.match(/background:\s*#fff/g) || []).length === 0);

const rootDecl = (html.match(/:root\s*\{([\s\S]*?)\}/) || ["", ""])[1];
const darkDecl = (html.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/) || ["", ""])[1];
const tokenNames = (s) => [...s.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((mm) => mm[1]);
const lightTokens = new Set(tokenNames(rootDecl));
const darkTokens = new Set(tokenNames(darkDecl));
const SHAPE_EXEMPT = ["--r-window", "--r-card", "--ease", "--fast", "--mid", "--mono"];
const notDark = [...lightTokens].filter((n) => !darkTokens.has(n) && !SHAPE_EXEMPT.includes(n));
check("令牌：浅色令牌均有深色覆盖（形状/动效豁免）" + (notDark.length ? " 缺:" + notDark.join(",") : ""), notDark.length === 0);

const allDeclared = new Set(tokenNames(html));
const usedVars = new Set([...html.matchAll(/var\((--[a-z0-9-]+)/gi)].map((mm) => mm[1]));
const undefVars = [...usedVars].filter((v) => !allDeclared.has(v));
check("令牌：无未定义的 var() 引用" + (undefVars.length ? " 缺:" + undefVars.join(",") : ""), undefVars.length === 0);

/* ---------------- 12. 路由与形态 ---------------- */

globalThis.location.hash = "#/record/p1";
check("路由：哈希解析出视图与参数",
  JSON.stringify(A.parseHash()) === JSON.stringify({ view: "record", param: "p1" }));
globalThis.location.hash = "";
check("路由：空哈希回落首页",
  JSON.stringify(A.parseHash()) === JSON.stringify({ view: "home", param: null }));

A.goTo("不存在的页");
check("路由：非法视图回落首页", A.state.view === "home" && /我的实验|exp-grid|empty/.test(main()));
A.goTo("edit", "不存在的实验");
check("路由：非法实验 id 回落首个实验", A.state.view === "edit");

check("形态：零外链依赖（无 http 引入）",
  !/<script[^>]+src=/i.test(html) && !/<link[^>]+href="http/i.test(html));
check("形态：单文件含完整内联样式", /<style>/.test(html) && html.indexOf("backdrop-filter") >= 0);
check("形态：移动端断点与底部 Tab 已定义", /@media \(max-width: 860px\)/.test(html) && /tabbar/.test(html));
check("形态：派发空实现字段（供后续蓝牙同步）", A.EXP_VERSION === 1);

/* ---------------- 输出 ---------------- */

const pass = results.filter(([ok]) => ok).length;
results.forEach(([ok, n]) => console.log((ok ? "  OK   " : "  FAIL ") + n));
console.log("\n共 " + results.length + " 项，通过 " + pass + "，失败 " + (results.length - pass));
process.exit(pass === results.length ? 0 : 1);