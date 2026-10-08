import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = process.argv[2];
if (!file) { console.error("用法: node tools/check-page.mjs <实验助手.html>"); process.exit(2); }
const html = fs.readFileSync(file, "utf8");

/* 窗口形态的断言要同时看 Rust 侧与 tauri 配置（单文件页面只是其中一半） */
const here = path.dirname(fileURLToPath(import.meta.url));
const readIf = (p) => { try { return fs.readFileSync(p, "utf8"); } catch (e) { return ""; } };
const rust = readIf(path.join(here, "..", "src-tauri", "src", "commands.rs"));
const rustClient = readIf(path.join(here, "..", "src-tauri", "src", "client.rs"));
const tauriConf = readIf(path.join(here, "..", "src-tauri", "tauri.conf.json"));
const capabilities = readIf(path.join(here, "..", "src-tauri", "capabilities", "default.json"));

/* 作品仓库（zcst-huawei-agent-2026/src）里只有单文件页面 + Python 服务端、没有 src-tauri：
 * Rust / Tauri 配置相关的断言在那里按「跳过」处理，免得把「工程不在这」误报成「功能坏了」。
 * 在正式项目里 src-tauri 存在，这些断言照常全跑。 */
const hasRustSide = !!(rust || rustClient || tauriConf || capabilities);
const skips = [];
const checkRust = (name, cond) => {
  if (!hasRustSide) { skips.push(name); return; }
  check(name, cond);
};

const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: 未找到内联 script"); process.exit(1); }
const code = m[1] + `
;globalThis.__app = { newExp, isValidExp, normalizeExp, normalizeStep, Store,
  buildLocalMarkdown, mdToHtml, mdInline, esc, has,
  parseHash, goTo, render, refreshTimer, viewHome, viewEdit, viewRecord, viewReport, viewSettings,
  REPORT_PROMPT, Media, state, ui, applyTheme, resolvedTheme, systemDark, KEYS,
  collectReportData, localReport, compressImage,
  EXP_VERSION, DB_NAME, SVG,
  viewAI, GEN, GEN_PROMPT, NAV, BARE_VIEWS, aiParseJSON, aiValidateGen, aiBuildExp,
  aiApplyJSON, aiImport, aiExtOf, aiZipEntries, aiDocxText, aiPptxText, aiDecodeText,
  aiLegacyPptText, aiLegacyDocText, aiZipRead, aiReadFile,
  viewLan, LAN, LAN_KEY, lanAct, lanConnect, lanRefresh, lanStatusHTML, lanFilesHTML,
  lanProgHTML, lanClipInfo, lanSize, lanTime, lanDefaultBase, lanUrl, lanMaybeAutoConnect,
  lanIsTauri, lanInvoke, lanServerHint, lanBecomeServer, lanStopServer, lanSyncServerStatus,
  handleAct, Timer, TIMER_PRESETS, normalizeTimer, timerEditHTML, timerRecordHTML, timerWriteNote,
  lanAutoDetect, lanAutoBuildExp, lanImportText, lanImportOnDownload, lanDownloadBlob,
  lanAutoHTML, lanAutoBanner, lanAutoClear,
  lanAutoItems, lanAutoErrs, lanIsExpJson, lanPaintAuto,
  winInitFrame };
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
  new Function(code)();
  check("内联脚本执行无异常", true);
} catch (e) {
  check("内联脚本执行无异常 —— " + e.message, false);
  results.forEach(([ok, n]) => console.log((ok ? "  OK   " : "  FAIL ") + n));
  process.exit(1);
}
const A = globalThis.__app;

/* ---------------- 2. 仪器摆放已整体移除（需求变更：这一块不要了） ----------------
   「删除」这件事本身要能被验出来：源码里不能再有仪器库 / 画布运行时的任何标识符，
   两个页面也不能再渲染画布宿主或仪器面板。 */
const appScript = m[1];
check("仪器摆放：源码已无仪器库（INST_CATS / INST_LIB / instById / instName）",
  !/\bINST_CATS\b|\bINST_LIB\b|\binstById\b|\binstName\b|\brenderInstIcon\b/.test(appScript));
check("仪器摆放：源码已无画布运行时（canvasAct / refreshCanvas / syncCanvasScale / instPanelHTML）",
  !/\bcanvasAct\b|\brefreshCanvas\b|\bsyncCanvasScale\b|\bcanvasFit\b|\bcurCanvas\b|\binstPanelHTML\b|\bcanvasHTML\b/.test(appScript));
check("仪器摆放：源码已无画布样式与节点（.cv-* / .canvas-* / .inst-* / data-canvas-host）",
  !/\.cv-[\w-]+|\.canvas-(head|tools|scroll|stage|card)|\.inst-(panel|chip|cat)|data-canvas-host/.test(appScript));
check("仪器摆放：源码已无 cv-* 动作分发", !/cv-add|cv-del|cv-tool|cv-clear|cv-rot/.test(appScript));
check("仪器摆放：运行时界面里已无这些函数",
  typeof A.canvasAct === "undefined" && typeof A.instPanelHTML === "undefined" &&
  typeof A.INST_LIB === "undefined" && typeof A.instName === "undefined");

/* ---------------- 3. 数据模型与持久化 ---------------- */

const exp = A.newExp("银镜反应", "chemistry");
check("新建实验：默认含 1 个步骤", exp.steps.length === 1);
check("新建实验：主题随学科分配", exp.theme === "t-sky");
check("结构校验：合法实验通过", A.isValidExp(exp) === true);
check("结构校验：缺 steps 被拒", A.isValidExp({ id: "x" }) === false);
check("结构校验：null 被拒", A.isValidExp(null) === false);
check("结构校验：步骤缺 images 被拒",
  A.isValidExp({ id: "x", steps: [{ id: "s1" }] }) === false);
check("归一化：补全 record，且不再产出 canvas 字段",
  (() => { const n = A.normalizeExp({ id: "x", steps: [{ id: "s1" }] });
    return typeof n.steps[0].record.note === "string" && !("canvas" in n.steps[0]); })());
check("归一化：旧数据里残留的 canvas 会被丢掉（字段不再进新结构）",
  (() => { const n = A.normalizeExp({ id: "x", steps: [{ id: "s1", canvas: { w: 1000, h: 620, items: [{ id: "i_1", inst: "beaker" }], links: [] } }] });
    return !("canvas" in n.steps[0]); })());

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

/* ---------------- 4. 页面不该再出现仪器摆放 ----------------
   （原来这一节逐条验「加仪器 / 拖动 / 旋转 / 连线」；功能删掉后改验「确已消失」。） */

A.goTo("edit", exp.id);
A.ui.step = 0;
check("仪器摆放：编辑页不再有画布 / 仪器面板 / 相关按钮",
  !/data-canvas-host/.test(main()) && !/inst-panel/.test(main()) &&
  !/仪器摆放/.test(main()) && !/data-act="cv-/.test(main()));
check("仪器摆放：编辑页副标题也不再提「摆放仪器」",
  main().indexOf("摆放仪器") < 0);
check("仪器摆放：数据模型里每个步骤都不带 canvas",
  A.state.exp.steps.every((s) => !("canvas" in s)));

A.goTo("record", exp.id);
check("仪器摆放：记录页不再渲染只读画布",
  !/data-canvas-host/.test(main()) && !/仪器摆放/.test(main()) && !/data-ro="1"/.test(main()));
check("仪器摆放：记录页仍保留播放器与步骤正文", /player-dot/.test(main()) && /player-stage/.test(main()));

/* ---------------- 5. 编辑页 / 记录页 / 报告页渲染 ---------------- */

A.goTo("edit", exp.id);
check("编辑页：含五要素输入项",
  /data-field="text"/.test(main()) && /data-field="equation"/.test(main()) &&
  /data-field="tips"/.test(main()) && /data-act="media-add"/.test(main()));
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
check("记录页：分步记录与总记录并存",
  /data-scope="record"/.test(main()) && /data-scope="total"/.test(main()));
check("记录页：渲染方程式", main().indexOf("Ag+ + e- = Ag") >= 0);

A.ui.playIndex = 0;
A.goTo("record", exp.id);
A.ui.playIndex = Math.min(1, A.state.exp.steps.length - 1);
A.render();
check("记录页：可切换播放步骤", /player-dot on/.test(main()));

/* ---------------- 5.5 站内重绘不再跳顶（全治理） ----------------
   规则：只有 goTo()（换页 / 换实验）才回顶；其它站内动作调 render() 一律保持滚动位置。
   历史 bug「计时器设置会跳到最顶」只是这条规则缺失时最显眼的一例。 */

check("滚动治理：源码里只有 goTo 一处 render(true)",
  (appScript.match(/render\(true\)/g) || []).length === 1);
/* 注意：只能用「独立语句」的形式匹配 —— 说明注释里也写着这句历史代码，宽松匹配会误报 */
check("滚动治理：源码里不再有无条件 `main.scrollTop = 0` 语句",
  !/^\s*main\.scrollTop = 0\s*;/m.test(appScript) &&
  /^\s*main\.scrollTop = keep\s*;/m.test(appScript));

const govSeed = A.newExp("滚动治理", "chemistry");
govSeed.steps.push(A.normalizeStep({ id: "s_gov_2", title: "第二步" }));
govSeed.steps.push(A.normalizeStep({ id: "s_gov_3", title: "第三步" }));
A.Store.saveExp(govSeed);

A.goTo("edit", govSeed.id);
const govExp = A.state.exp;
check("滚动治理：goTo 换页回到顶部", store.main.scrollTop === 0);

store.main.scrollTop = 420;
A.render();
check("滚动治理：同页 render() 保持滚动位置（临时关掉的 smooth 也还回去）",
  store.main.scrollTop === 420 && store.main.style.scrollBehavior !== "auto");

store.main.scrollTop = 500;
A.render(true);
check("滚动治理：render(true) 明确回顶部", store.main.scrollTop === 0);

store.main.scrollTop = 380;
await A.handleAct("exp-subject", { dataset: { v: "biology" } });
check("滚动治理：换学科分类不跳顶", store.main.scrollTop === 380 && govExp.subject === "biology");

store.main.scrollTop = 344;
await A.handleAct("step-open", { dataset: { step: "2" } });
check("滚动治理：切步骤不跳顶（且确实换到第 3 步）",
  store.main.scrollTop === 344 && A.ui.step === 2);

A.ui.step = 1;
store.main.scrollTop = 310;
await A.handleAct("step-move", { dataset: { dir: "1" } });
check("滚动治理：步骤上移 / 下移不跳顶", store.main.scrollTop === 310 && A.ui.step === 2);

store.main.scrollTop = 280;
await A.handleAct("step-add", { dataset: {} });
check("滚动治理：新增步骤不跳顶", store.main.scrollTop === 280);

govExp.steps[0].images.push({ id: "m_gov_1", name: "a.png", kind: "image", store: "idb" });
store.main.scrollTop = 250;
await A.handleAct("media-del", { dataset: { id: "m_gov_1" } });
check("滚动治理：删除图片不跳顶", store.main.scrollTop === 250 && govExp.steps[0].images.length === 0);

store.main.scrollTop = 220;
await A.handleAct("set-theme", { dataset: { v: "dark" } });
check("滚动治理：切换主题不跳顶", store.main.scrollTop === 220);
A.applyTheme("system");   // 还回默认，别影响后面的主题断言

A.goTo("record", govSeed.id);
A.ui.playIndex = 0;
store.main.scrollTop = 190;
await A.handleAct("play-next", { dataset: {} });
check("滚动治理：记录模式翻页不跳顶（且确实翻到第 2 步）",
  store.main.scrollTop === 190 && A.ui.playIndex === 1);

store.main.scrollTop = 160;
await A.handleAct("play-go", { dataset: { step: "2" } });
check("滚动治理：记录模式跳步不跳顶", store.main.scrollTop === 160 && A.ui.playIndex === 2);

/* 但换实验（换 param）仍然要回顶 —— 这是真导航 */
store.main.scrollTop = 300;
A.goTo("edit", exp.id);
check("滚动治理：换到另一个实验仍回到顶部", store.main.scrollTop === 0 && A.state.exp.id === exp.id);

/* ---------------- 6. 报告生成（本地 markdown） ---------------- */

const md = A.buildLocalMarkdown(A.state.exp);
check("报告：含实验名称标题", md.indexOf("# 银镜反应") === 0);
check("报告：含现象与数据表格", /\|\s*步骤\s*\|\s*操作\s*\|\s*现象\/数据\s*\|\s*备注\s*\|/.test(md));
check("报告：含反应方程式", md.indexOf("Ag+ + e- = Ag") >= 0);
check("报告：含注意事项（来自 TIPS）", md.indexOf("## 注意事项") >= 0);
check("报告：含总记录", md.indexOf("## 总记录") >= 0);
check("报告：本地 markdown 不再有「仪器与试剂」汇总章节（仪器摆放已移除）",
  md.indexOf("## 仪器与试剂") < 0);
check("报告：分发给 LLM 的数据不再带 instruments 字段",
  A.collectReportData(A.state.exp).steps.every((s) => !("instruments" in s)));
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

/* ---------------- 13. AI 生成实验步骤 ---------------- */

check("AI 页：导航中含独立入口", A.NAV.some((n) => n.key === "aigen" && n.label === "AI生成实验步骤"));
check("AI 页：移动端用短标签", !!((A.NAV.find((n) => n.key === "aigen") || {}).short));
check("AI 页：属于无参数独立页", A.BARE_VIEWS.indexOf("aigen") >= 0);
A.goTo("aigen");
check("AI 页：路由可达且不依赖实验", A.state.view === "aigen");
check("AI 页：含选文件 / 生成 / 提示词入口",
  /data-act="ai-pick"/.test(main()) && /data-act="ai-run"/.test(main()) && /data-act="ai-prompt"/.test(main()));
check("AI 页：含离线通路（复制提示词 / 粘贴 JSON）",
  /data-act="ai-copy-prompt"/.test(main()) && /data-act="ai-paste-json"/.test(main()));
check("AI 页：文档文本框绑定", /data-ai="doc"/.test(main()));

check("AI 提示词：含文档占位符", A.GEN_PROMPT.indexOf("{{DOC}}") >= 0);
check("AI 提示词：要求只输出 JSON 且禁代码围栏", A.GEN_PROMPT.indexOf("只输出一个 JSON") >= 0 && A.GEN_PROMPT.indexOf("代码围栏") >= 0);
check("AI 提示词：不再要求生成/留空仪器画布（功能已移除）",
  A.GEN_PROMPT.indexOf("仪器画布") < 0 && A.GEN_PROMPT.indexOf("图片、视频、报告正文") >= 0);
check("AI 提示词：约束学科/主题配对", A.GEN_PROMPT.indexOf("t-lavender") >= 0 && A.GEN_PROMPT.indexOf("biochem") >= 0);
check("AI 提示词：要求简体中文", A.GEN_PROMPT.indexOf("简体中文") >= 0);

const gOk = A.aiParseJSON('```json\n{"name":"测试实验","subject":"biochem","theme":"t-lavender","desc":"d","steps":[{"title":"提取","text":"1. 称取4g样品。"},{"title":"鉴定","text":"观察现象。","equation":"A + B -> C","tips":"注意安全"}]}\n```');
check("AI 解析：能从 Markdown 围栏中取出 JSON", !!gOk && gOk.name === "测试实验" && gOk.steps.length === 2);
check("AI 解析：兼容返回整个文件包 {exp:{}}",
  (A.aiParseJSON('{"kind":"zhbit-lab-experiment","exp":{"name":"整包","steps":[{"id":"s","images":[]}]}}') || {}).name === "整包");
let parseThrew = false;
try { A.aiParseJSON("模型今天不想干活"); } catch (e) { parseThrew = true; }
check("AI 解析：无 JSON 时明确报错", parseThrew);

check("AI 校验：正常输出无错误", A.aiValidateGen(gOk).errors.length === 0);
const vBad = A.aiValidateGen({ name: "", subject: "zzz", theme: "t-sky", steps: [] });
check("AI 校验：缺名称/非法学科/空步骤被拦截", vBad.errors.length >= 3);
const vStep = A.aiValidateGen({ name: "x", subject: "chemistry", theme: "t-sky", steps: [{ title: "a" }] });
check("AI 校验：缺文字描述的步骤被拦截", vStep.errors.some((e) => e.indexOf("缺少文字描述") >= 0));
check("AI 校验：步骤数越界给出提示",
  A.aiValidateGen({ name: "x", subject: "chemistry", theme: "t-sky", steps: [{ text: "a" }, { text: "b" }] }).warnings.length >= 1);

const builtAI = A.aiBuildExp(gOk);
check("AI 建实验：结构通过实验助手校验", A.isValidExp(builtAI) === true);
check("AI 建实验：主题随学科自动配对", builtAI.theme === "t-lavender" && builtAI.subject === "biochem");
check("AI 建实验：每步不再带 canvas 字段（仪器摆放已移除）",
  builtAI.steps.every((s) => !("canvas" in s)));
check("AI 建实验：步骤五要素齐备且 id 互不相同",
  builtAI.steps.every((s) => typeof s.images === "object" && Array.isArray(s.images) && typeof s.equation === "string" && typeof s.tips === "string") &&
  new Set(builtAI.steps.map((s) => s.id)).size === builtAI.steps.length);

A.aiApplyJSON('{"name":"粘贴导入的实验","subject":"chemistry","theme":"t-sky","steps":[{"title":"混合","text":"搅拌。"}]}');
check("AI 粘贴导入：解析进 GEN 状态", !!A.GEN.exp && A.GEN.exp.name === "粘贴导入的实验" && A.GEN.errors.length === 0);
A.aiApplyJSON("这不是 JSON");
check("AI 粘贴导入：非法内容给出错误而不崩", !!A.GEN.err && A.GEN.exp === null);

A.GEN.exp = { name: "AI落地测试", subject: "chemistry", theme: "t-sky", desc: "", steps: [{ title: "a", text: "b" }, { title: "c", text: "d" }] };
const nBefore = A.Store.listExps().length;
A.aiImport("new");
check("AI 落地：新建实验并跳转编辑页",
  A.Store.listExps().length === nBefore + 1 && A.state.view === "edit" && A.state.exp.steps.length === 2);
const nSteps = A.state.exp.steps.length;
A.GEN.exp = { name: "追加", subject: "chemistry", theme: "t-sky", steps: [{ title: "追加步", text: "e" }] };
A.aiImport("append");
check("AI 落地：可追加到当前实验末尾", A.state.exp.steps.length === nSteps + 1);
check("AI 落地：追加的步骤 id 不与既有重复",
  new Set(A.state.exp.steps.map((s) => s.id)).size === A.state.exp.steps.length);

check("AI 格式识别：扩展名解析", A.aiExtOf("课件.PPT") === "ppt" && A.aiExtOf("a.b.docx") === "docx" && A.aiExtOf("无扩展名") === "");
let zipThrew = false;
try { A.aiZipEntries(new Uint8Array([1, 2, 3]).buffer); } catch (e) { zipThrew = true; }
check("AI 解析：非 Office 文件明确报错", zipThrew);

const docxXml = '<w:p><w:r><w:t>实验步骤：</w:t></w:r><w:r><w:t>称取 4g 干酵母粉</w:t></w:r></w:p><w:p><w:r><w:t>&lt;注意事项&gt; &amp; 安全</w:t></w:r></w:p>';
const docxLines = A.aiDocxText(docxXml);
check("docx 解析：段落合并 + 实体反转义",
  docxLines.length === 2 && docxLines[0] === "实验步骤：称取 4g 干酵母粉" && docxLines[1] === "<注意事项> & 安全");
const pptxXml = '<a:p><a:r><a:t>酵母RNA的制备及组分测定</a:t></a:r></a:p><a:p><a:t>实验目的</a:t></a:p>';
check("pptx 解析：逐段取文本", A.aiPptxText(pptxXml).length === 2 && A.aiPptxText(pptxXml)[0] === "酵母RNA的制备及组分测定");
check("文本解码：UTF-8 与 GBK 均可用",
  A.aiDecodeText(new TextEncoder().encode("酵母RNA").buffer) === "酵母RNA");

/* docx / pptx 真实解压链路：内存里造一个 deflate 压缩的 Office(zip) 包 */
function buildZip(files) {
  const locals = [], centrals = [];
  let off = 0;
  files.forEach((f) => {
    const name = Buffer.from(f.name, "utf8");
    const data = Buffer.from(f.data, "utf8");
    const comp = zlib.deflateRawSync(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(8, 10); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(off, 42);
    centrals.push(cd, name);
    off += 30 + name.length + comp.length;
  });
  const cdBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const zipBuf = ab(buildZip([
  { name: "word/document.xml", data: docxXml },
  { name: "ppt/slides/slide2.xml", data: pptxXml },
  { name: "ppt/slides/slide10.xml", data: '<a:p><a:t>第十页</a:t></a:p>' },
]));
const zEntries = A.aiZipEntries(zipBuf);
check("ZIP：能列出 zip 内条目", zEntries.length === 3 && zEntries.some((e) => e.name === "word/document.xml"));
const zDoc = zEntries.find((e) => e.name === "word/document.xml");
check("ZIP：deflate 解压后 XML 正确",
  new TextDecoder("utf-8").decode(await A.aiZipRead(zipBuf, zDoc)).indexOf("称取 4g 干酵母粉") >= 0);

const fakeDocx = { name: "实验指导.docx", arrayBuffer: async () => zipBuf };
const rDocx = await A.aiReadFile(fakeDocx);
check("端到端 .docx：读出段落文本", rDocx.kind === "docx" && rDocx.text.indexOf("实验步骤：称取 4g 干酵母粉") >= 0 && rDocx.blocks === 2);
const fakePptx = { name: "课件.pptx", arrayBuffer: async () => zipBuf };
const rPptx = await A.aiReadFile(fakePptx);
check("端到端 .pptx：按幻灯片编号排序（slide2 排在 slide10 之前）",
  rPptx.text.indexOf("【第 1 页】") >= 0 && rPptx.text.indexOf("【第 1 页】") < rPptx.text.indexOf("【第 2 页】") &&
  rPptx.text.indexOf("酵母RNA的制备及组分测定") < rPptx.text.indexOf("第十页"));
check("端到端 .pptx：文本与页数正确", rPptx.text.indexOf("酵母RNA的制备及组分测定") >= 0 && rPptx.blocks === 2);
const fakeTxt = { name: "说明.txt", arrayBuffer: async () => new TextEncoder().encode("实验步骤：加热。").buffer };
check("端到端 .txt：直接解码", (await A.aiReadFile(fakeTxt)).text === "实验步骤：加热。");
let badExt = "";
try { await A.aiReadFile({ name: "a.png", arrayBuffer: async () => new ArrayBuffer(4) }); } catch (e) { badExt = e.message; }
check("端到端：不支持的格式给出可操作提示", badExt.indexOf("暂不支持") >= 0 && badExt.indexOf("粘贴") >= 0);

const REF = "../../参考素材/2024级 生物化学实验-实验执行表及课件-ppt-2026年/";
const pptFile = ["酵母RNA的制备及鉴定.ppt", "大豆蛋白的提取与含量测定.ppt"].map((f) => REF + f).find((p) => fs.existsSync(p));
if (pptFile) {
  const pptText = A.aiLegacyPptText(new Uint8Array(fs.readFileSync(pptFile))).join("\n");
  check("旧版 .ppt：内嵌 OLE2 直接解析出正文（" + pptFile.split("课件-")[1] + "）",
    pptText.indexOf("实验步骤") >= 0 && pptText.indexOf("稀碱法") >= 0);
  check("旧版 .ppt：用量/时间等细节被保留", pptText.indexOf("沸水浴30min") >= 0 || pptText.indexOf("沸水浴") >= 0);
  check("旧版 .ppt：母版占位符噪音已过滤", pptText.indexOf("单击此处编辑母版") < 0);
} else {
  check("旧版 .ppt：参考素材不存在，跳过（不影响）", true);
}
const docFile = [REF + "2025-2026-2- 24级生物化学实验课表0224.doc"].find((p) => fs.existsSync(p));
if (docFile) {
  const docText = A.aiLegacyDocText(new Uint8Array(fs.readFileSync(docFile)));
  check("旧版 .doc：内嵌 OLE2 直接解析出正文（课表）",
    docText.indexOf("实验项目") >= 0 && docText.indexOf("酵母RNA") >= 0);
} else {
  check("旧版 .doc：参考素材不存在，跳过（不影响）", true);
}

A.goTo("settings");
check("设置页：含获取 API Key 与充值入口",
  /platform\.deepseek\.com\/api_keys/.test(main()) && /platform\.deepseek\.com\/top_up/.test(main()));
check("设置页：含 DeepSeek 一键配置按钮", /data-act="llm-deepseek"/.test(main()));
check("设置页：API 教学卡改为「获取 API 教学」",
  /获取 API 教学/.test(main()) && /创建 API key/.test(main()) && /sk-/.test(main()) &&
  !/获取 API 图文教程/.test(main()));
check("设置页：API 教学卡可折叠（details.card-fold + 默认收起）",
  (() => {
    const m = main();
    const i = m.indexOf("获取 API 教学");
    const open = m.lastIndexOf("<details", i);
    const seg = m.slice(open, i);
    return /<details class="card card-fold" data-fold="api-guide"/.test(seg) && !/\bopen\b/.test(seg);
  })());
check("设置页：教学卡含「手机热点」连接说明（含 AP 隔离提示）",
  /热点/.test(main()) && /AP 隔离|客户端隔离/.test(main()) &&
  /同一个热点|连上这个热点/.test(main()) && /换网络要重新看地址/.test(main()));
check("设置页：数据管理文案说的是局域网互传（不再是蓝牙）",
  /局域网互传/.test(main().slice(main().indexOf("数据管理"))) && !/蓝牙/.test(main()));
check("设置页：折叠状态按 data-fold 键记住（toggle 捕获 + render 后还原）",
  /zhbit-lab-fold/.test(html) && /addEventListener\("toggle"/.test(html) && /restoreFolds\(\)/.test(html));
check("设置页：Base URL 默认提示为 DeepSeek", /placeholder="https:\/\/api\.deepseek\.com"/.test(main()));

/* ---------------- 14. 局域网互传（#/lan） ---------------- */

check("互传页：导航中含独立入口", A.NAV.some((n) => n.key === "lan" && n.label === "局域网互传"));
check("互传页：移动端用短标签", !!((A.NAV.find((n) => n.key === "lan") || {}).short));
check("互传页：属于无参数独立页", A.BARE_VIEWS.indexOf("lan") >= 0);

A.goTo("lan");
check("互传页：路由可达且不需要实验参数", A.state.view === "lan" && A.state.param === null);
A.state.exp = null;
A.goTo("lan");
check("互传页：没有实验时也能打开", A.state.view === "lan" && /局域网互传/.test(main()));
check("互传页：含拖拽上传区与地址输入",
  /data-lan-drop/.test(main()) && /data-lan="base"/.test(main()));
check("互传页：含连接 / 刷新入口",
  /data-act="lan-connect"/.test(main()) && /data-act="lan-refresh"/.test(main()));
check("互传页：含共享文件区与文本互传",
  /data-lan-files/.test(main()) && /data-lan="clip"/.test(main()) &&
  /data-act="lan-clip-send"/.test(main()) && /data-act="lan-clip-copy"/.test(main()));
check("互传页：含服务端启动指引", /lan-server\.py/.test(main()) && /start-lan\.bat/.test(main()));
check("互传页：说明数据不经云端、无鉴权边界",
  /不经过任何云服务/.test(main()) && /公网/.test(main()));
check("互传页：「怎么用」默认折叠（只留一行标题，不占屏）",
  /<details class="card card-fold">/.test(main()) && !/<details[^>]*\sopen/.test(main()) &&
  /<summary class="card-title">/.test(main()) && /点开查看/.test(main()));

/* ---- 14.1 Tauri 内置服务端（成为服务端 / 停止服务端） ---- */
check("互传页：动作区含「成为服务端」按钮",
  /data-act="lan-become-server"/.test(main()) && /成为服务端/.test(main()));
check("互传页：成为服务端按钮用主按钮样式",
  /class="btn btn-primary" data-act="lan-become-server"/.test(main()));
check("互传页：未启动内置服务端时不显示停止按钮",
  !/data-act="lan-stop-server"/.test(main()));
check("互传页：非 App 环境检测为 false（浏览器降级）", A.lanIsTauri() === false);
check("互传页：浏览器模式提示语区分 App 与 Python 两种方式",
  /成为服务端/.test(A.lanServerHint()) && /lan-server\.py/.test(A.lanServerHint()));

const savedLanMsg = A.LAN.msg;
A.LAN.msg = ""; A.LAN.msgKind = "";
await A.lanBecomeServer();
check("互传页：浏览器模式点「成为服务端」给出明确提示且不崩",
  /浏览器模式/.test(A.LAN.msg) && A.LAN.msgKind === "err" && A.LAN.serverMode === false);
check("互传页：降级提示同时指出 App 与 start-lan 两条路",
  /App/.test(A.LAN.msg) && /start-lan\.bat/.test(A.LAN.msg));

/* 模拟 Tauri 环境：invoke 返回服务端信息，验证「成为服务端」前后端桥接 */
const invoked = [];
globalThis.window.__TAURI__ = {
  core: {
    invoke: async (cmd, args) => {
      invoked.push(cmd);
      if (cmd === "lan_server_start") {
        return { running: true, host: "PC", ip: "192.168.1.23", ips: ["192.168.1.23"],
          port: 8000, urls: ["http://192.168.1.23:8000"], chunkSize: 4194304,
          dataDir: "C:/data/lan-transfer", files: 0 };
      }
      if (cmd === "lan_server_status") return null;
      return null;
    },
  },
};
check("互传页：App 环境下检测到 Tauri", A.lanIsTauri() === true);
A.LAN.msg = ""; A.LAN.msgKind = "";
// 不真的去连局域网地址（测试环境无网络），只验证命令被正确调用与状态落位
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("stub: 测试环境不联网"); };
await A.lanBecomeServer();
globalThis.fetch = realFetch;
check("互传页：成为服务端调用 lan_server_start", invoked.indexOf("lan_server_start") >= 0, invoked.join(","));
check("互传页：启动成功后用回环地址自连（避免走 App 的 tauri:// origin）",
  A.LAN.serverMode === true && A.LAN.serverInfo && A.LAN.serverInfo.port === 8000 &&
  /^http:\/\/127\.0\.0\.1:8000$/.test(A.LAN.base) && A.LAN.serverBusy === false,
  A.LAN.base);
check("互传页：局域网地址保存在 serverInfo.urls 里（展示给其他设备）",
  Array.isArray(A.LAN.serverInfo.urls) && A.LAN.serverInfo.urls[0] === "http://192.168.1.23:8000",
  JSON.stringify(A.LAN.serverInfo.urls));
A.goTo("lan");
check("互传页：服务端已启动时按钮变为「停止服务端」",
  /data-act="lan-stop-server"/.test(main()) && /停止服务端/.test(main()) &&
  !/data-act="lan-become-server"/.test(main()));
const wasOnline = A.LAN.online;
const wasInfo = A.LAN.info;
A.LAN.online = true;
A.LAN.info = A.LAN.serverInfo;
const selfStatus = A.lanStatusHTML();
A.LAN.online = wasOnline;
A.LAN.info = wasInfo;
check("互传页：状态区显示本机正在当服务端（并给出局域网地址）",
  /本机正在当服务端/.test(selfStatus) && /192\.168\.1\.23:8000/.test(selfStatus) &&
  !/data-act="lan-become-server"/.test(main()), selfStatus.replace(/\s+/g, " ").slice(0, 120));
await A.lanStopServer();
check("互传页：停止服务端调用 lan_server_stop 并复位状态",
  invoked.indexOf("lan_server_stop") >= 0 && A.LAN.serverMode === false && A.LAN.serverInfo === null);
A.goTo("lan");
check("互传页：停止后按钮回到「成为服务端」",
  /data-act="lan-become-server"/.test(main()) && !/data-act="lan-stop-server"/.test(main()));
await A.lanSyncServerStatus();
check("互传页：进入页面时查询 lan_server_status 不报错",
  invoked.indexOf("lan_server_status") >= 0 && A.LAN.serverMode === false);
delete globalThis.window.__TAURI__;
check("互传页：移除 Tauri 对象后回到浏览器降级", A.lanIsTauri() === false);
A.LAN.msg = savedLanMsg;

check("互传页：未连接时不启动轮询定时器", A.LAN.timer === null && A.LAN.online === false);
check("互传页：未连接时文件区给出提示", /连接服务端后/.test(A.lanFilesHTML()));
check("互传页：无上传任务时给出空态", /还没有上传任务/.test(A.lanProgHTML()));
check("互传页：文件大小格式化",
  A.lanSize(0) === "0 B" && A.lanSize(2048) === "2.0 KB" && A.lanSize(5 * 1048576) === "5.0 MB");
check("互传页：接口地址拼接（去掉尾部斜杠）",
  (() => { const old = A.LAN.base; A.LAN.base = "http://192.168.1.23:8000/";
    const u = A.lanUrl("/api/files"); A.LAN.base = old; return u === "http://192.168.1.23:8000/api/files"; })());

check("互传页：非法地址被拦截且提示 http://", (await A.lanConnect("192.168.1.23:8000")) === false && !A.LAN.online);
check("互传页：连不上时给出可读提示而不崩",
  (await A.lanConnect("http://10.255.255.1:8000")) === false && /连不上/.test(A.LAN.msg) && A.LAN.online === false);

A.LAN.online = true;
A.LAN.files = [{ id: "0123456789abcdef", name: "现象记录.png", size: 2048, time: 1730000000 }];
const lanList = A.lanFilesHTML();
check("互传页：文件列表含名称 / 大小 / 下载 / 删除",
  /现象记录\.png/.test(lanList) && /2\.0 KB/.test(lanList) &&
  /data-act="lan-dl"/.test(lanList) && /data-act="lan-del"/.test(lanList));
A.LAN.files = [{ id: "0123456789abcdef", name: '<img src=x onerror="alert(1)">', size: 1, time: 0 }];
check("互传页：文件名进入列表时转义（注入防护）", A.lanFilesHTML().indexOf("<img src=x") < 0);
A.LAN.files = [];
A.LAN.online = false;
check("互传页：断网后不再轮询", A.LAN.timer === null);

const lan2 = html.match(/<script id="chem-input-lib">/);
check("形态：内联库带 id 属性（不影响首个无属性 script 校验）", !!lan2);

/* ---------------- 15. App 桌面形态（无边框 + 透明玻璃，对齐美术参考项目） ---------------- */
check("形态：App 形态样式存在（wb-on 透明窗口 + 玻璃卡片）",
  /body\.wb-on \{ background: transparent; padding: 0; \}/.test(html) &&
  /body\.wb-on \.frame \{[\s\S]{0,600}background: linear-gradient\(158deg, var\(--glass-a\), var\(--glass-b\)\)/.test(html));
check("形态：玻璃底足够不透明（系统磨砂不生效时不会透成一层灰雾）",
  /--glass-a: rgba\(255, 255, 255, 0\.9\d\)/.test(html) &&
  /:root\[data-theme="dark"\][\s\S]{0,1600}--glass-a: rgba\(30, 37, 56, 0\.9\d\)/.test(html));
check("可读性：提示/删除按钮的文字用更深一档的 ink 色（浅马卡龙压白底只有 2.4~2.9:1）",
  /--ok-ink: #157a52/.test(html) && /--danger-ink: #c8324c/.test(html) &&
  /\.msg\.ok \{ color: var\(--ok-ink\)/.test(html) &&
  /\.msg\.err \{ color: var\(--danger-ink\)/.test(html) &&
  /\.btn-danger \{ color: var\(--danger-ink\)/.test(html));
checkRust("形态：玻璃卡自带系统亚克力（window-vibrancy 上磨砂，失败退回 CSS 玻璃）",
  /apply_acrylic\(&win, Some\(acrylic\)\)/.test(rust) &&
  /apply_blur\(&win, Some\(blur\)\)/.test(rust) &&
  /fn apply_window_glass/.test(rust));
checkRust("形态：无边框窗口 + 透明（tauri.conf.json）",
  /"decorations": false/.test(tauriConf) && /"transparent": true/.test(tauriConf));
check("形态：自绘标题栏（品牌 + 最小化/最大化/关闭，交给 data-tauri-drag-region 拖动）",
  /<header class="titlebar" id="titlebar" data-tauri-drag-region>/.test(html) &&
  /class="tb-brand" data-tauri-drag-region="deep"/.test(html) &&
  /data-act="win-min"/.test(html) && /data-act="win-max"/.test(html) && /data-act="win-close"/.test(html));
check("形态：标题栏空白处也能拖（本体带拖动区，不能只标品牌区）",
  /<header class="titlebar"[^>]*data-tauri-drag-region[^>]*>/.test(html));
check("形态：无边框窗口补回缩放能力（8 个把手 → startResizeDragging）",
  /data-resize="nw"/.test(html) && /data-resize="se"/.test(html) &&
  /startResizeDragging/.test(html));
checkRust("形态：缩放权限已在 capabilities 里放行",
  /allow-start-resize-dragging/.test(capabilities));
check("形态：App 形态下玻璃铺满窗体（不再是一张浮起的小卡片）",
  /body\.wb-on \.frame \{[\s\S]{0,220}height: 100vh/.test(html));
check("形态：标题栏只占一行，内容区仍在第二行（grid-template-rows）",
  /body\.wb-on \.frame \{[\s\S]{0,260}grid-template-rows: 44px 1fr/.test(html));
check("形态：手机端铺不透明底色（窗口是透明的，不铺会透出系统桌面）",
  /@media \(max-width: 860px\)[\s\S]{0,600}\.frame \{[\s\S]{0,300}background: linear-gradient\(158deg, var\(--page-a\)/.test(html) &&
  /\.titlebar, \.rz \{ display: none; \}/.test(html));
check("形态：手机端不启用 App 形态（winInitFrame 判定移动 UA）",
  /function isMobileApp\(\)/.test(html) && /if \(!lanIsTauri\(\) \|\| isMobileApp\(\)\) return;/.test(html));
check("形态：减少透明度偏好下退回不透明底色（可读性兜底）",
  /prefers-reduced-transparency: reduce[\s\S]{0,400}body\.wb-on \.frame \{ background: var\(--fallback-app\)/.test(html));
check("形态：浏览器模式不启用 App 形态（winInitFrame 依赖 Tauri 检测）",
  A.lanIsTauri() === false && (A.winInitFrame(), !/wb-on/.test(document.body.className || "")));

/* ---------------- 16. 互传下载（回归：「能连上、能看见文件、下不下来」） ---------------- */
check("互传：App 形态的下载走 Rust 落盘命令（Android WebView 自身没有下载器）",
  /lanInvoke\("lan_file_download", \{ url: url, name: shown \}\)/.test(html));
checkRust("互传：Rust 侧有 lan_file_download + download_url_to_dir",
  /pub async fn lan_file_download/.test(rust) &&
  /pub fn download_url_to_dir/.test(rust));
check("互传：下载按钮带文件名，且点击走统一动作分发",
  /data-act="lan-dl" data-id="\$\{esc\(f\.id\)\}" data-name="\$\{esc\(f\.name\)\}"/.test(html) &&
  /action === "lan-dl"\) \{ await lanDownload\(el\.dataset\.id, el\.dataset\.name\)/.test(html));
check("互传：浏览器形态有 fetch+blob 兜底（失败再直接导航）",
  /async function lanDownloadBlob/.test(html) &&
  /URL\.createObjectURL\(blob\)/.test(html) &&
  /a\.download = shown/.test(html));
checkRust("互传：Rust 侧下载是流式落盘 + 长度校验（截断不放行）",
  /pub fn download_to\(&self, path_and_query: &str, tmp: &Path\)/.test(rustClient) &&
  /下载不完整/.test(rustClient));
check("互传：下载完能一键定位文件（lan-open-dir 按钮）",
  /data-act="lan-open-dir"/.test(html));
checkRust("互传：Rust 侧 lan_reveal_file 只开自己下载目录里的文件",
  /pub async fn lan_reveal_file/.test(rust) &&
  /只能打开本应用下载目录里的文件/.test(rust));
checkRust("互传：落盘目录逐个探针试写（系统下载目录 → 应用数据目录）",
  /fn pick_save_dir/.test(rust) && /LAB_LAN_SAVE_DIR/.test(rust) && /\.write-probe-/.test(rust));

/* ---------------- 17. 计时器（每步一个 + 自由计时器：编辑预设 + 记录启停） ---------------- */

const tSeed = A.newExp("计时器测试", "chemistry");
tSeed.steps[0].title = "加热";
tSeed.steps.push({ id: "s2", title: "冷却", text: "", equation: "", tips: "", images: [], videos: [], record: null });
A.Store.saveExp(tSeed);

check("计时器：旧实验没有 timer 字段也能读（向后兼容）",
  !!A.normalizeExp({ id: "x", steps: [{ id: "s1", images: [] }] }).timer &&
  A.normalizeExp({ id: "x", steps: [] }).timer.mode === "stopwatch");
check("计时器：每个步骤都有自己的 timer 字段（默认正计时）",
  (() => {
    const e = A.normalizeExp({ id: "x", steps: [{ id: "s1", images: [] }, { id: "s2", images: [] }] });
    return e.steps.length === 2 && e.steps.every((s) => s.timer && s.timer.mode === "stopwatch") &&
      e.steps[0].timer !== e.steps[1].timer;   // 必须是两个独立对象
  })());
check("计时器：脏数据被规范化（mode / target / accumulated / logs）",
  (() => {
    const t = A.normalizeTimer({ mode: "zzz", target: "-5", accumulated: "abc", running: 1, logs: [{ ms: -3 }, { ms: 1500 }] });
    return t.mode === "stopwatch" && t.target === 0 && t.accumulated === 0 && t.running === true && t.logs.length === 1;
  })());
check("计时器：预设 6 档（30s ~ 30min）",
  A.TIMER_PRESETS.length === 6 && A.TIMER_PRESETS[0] === 30 && A.TIMER_PRESETS[5] === 1800);
check("计时器：时长格式化 MM:SS / H:MM:SS",
  A.Timer.fmt(0) === "00:00" && A.Timer.fmt(65000) === "01:05" && A.Timer.fmt(3661000) === "1:01:01");
check("计时器：预设标签 30s / 5min / 30min",
  A.Timer.label(30) === "30s" && A.Timer.label(300) === "5min" && A.Timer.label(1800) === "30min");

/* 旧模型（整个实验一个 exp.timer）迁移到新模型：有使用痕迹就下放到第一步 */
check("计时器：旧实验的全局计时器迁移到第一步（不丢数据）",
  (() => {
    const e = A.normalizeExp({
      id: "old", steps: [{ id: "s1", images: [] }],
      timer: { mode: "countdown", target: 120, accumulated: 65000, logs: [{ at: 1, ms: 65000 }] },
    });
    // 第一步拿到副本（含预置与记录），exp.timer 保留成自由计时器
    return e.steps[0].timer.mode === "countdown" && e.steps[0].timer.target === 120 &&
      e.steps[0].timer.accumulated === 65000 && e.steps[0].timer.logs.length === 1 &&
      e.timer.accumulated === 65000 && e.steps[0].timer.running === false;
  })());
check("计时器：迁移是幂等的（不会每次归一化都覆盖第一步）",
  (() => {
    let e = A.normalizeExp({ id: "old2", steps: [{ id: "s1", images: [] }], timer: { accumulated: 9000, logs: [{ at: 1, ms: 9000 }] } });
    e.steps[0].timer.accumulated = 111;      // 用户后来改了第一步
    e = A.normalizeExp(e);
    return e.steps[0].timer.accumulated === 111;
  })());

/* goTo 会从本地存储重新载入一份实验，所以页面相关的断言一律操作 state.exp */
A.goTo("edit", tSeed.id);
const tExp = A.state.exp;
check("计时器：默认正计时、不限时",
  A.Timer.attach(tExp.steps[0]).mode === "stopwatch" && A.Timer.targetText(tExp.steps[0]) === "正计时（不限时）");
A.Timer.setTarget(tExp.steps[0], 120);
check("计时器：设置目标时长即切到倒计时（只作用于这一步）",
  A.Timer.attach(tExp.steps[0]).mode === "countdown" && A.Timer.targetText(tExp.steps[0]) === "倒计时 02:00" &&
  A.Timer.attach(tExp.steps[1]).mode === "stopwatch" && A.Timer.attach(tExp.steps[1]).target === 0);
A.render();
check("计时器：编辑页给全部预设 chip + 自定义分 / 秒输入",
  /data-act="timer-mode" data-v="countdown"/.test(A.timerEditHTML(tExp.steps[0], 0)) &&
  A.TIMER_PRESETS.every((sec) => A.timerEditHTML(tExp.steps[0], 0).indexOf('data-v="' + sec + '"') >= 0) &&
  /data-timer="min"/.test(A.timerEditHTML(tExp.steps[0], 0)) && /data-timer="sec"/.test(A.timerEditHTML(tExp.steps[0], 0)) &&
  /data-act="timer-custom"/.test(A.timerEditHTML(tExp.steps[0], 0)));
check("计时器：编辑模式页面就位（本步计时卡 + 时钟）",
  /timer-presets/.test(main()) && /data-timer-clock/.test(main()) && /本步计时器预设/.test(main()));
check("计时器：编辑页的计时卡标注了它属于哪一步（data-timer-src）",
  /data-timer-src="0"/.test(main()) && /data-timer-owner="0"/.test(main()));

/* ⭐ 回归：计时器设置不能把页面顶回最顶。
   旧实现里 timer-* 动作走的是整页 render()，而 render() 结尾有 main.scrollTop = 0，
   计时卡又在编辑页靠下的位置 → 每点一下预设 / 模式，页面就跳回最上面。
   现在改走 refreshTimer()（局部重画），滚动位置必须原地不动。
   注意：这一段里不能调 goTo()（它会从本地存储重新载入一份实验，tExp 就变成旧对象了）。 */
check("计时器：编辑页给计时卡宿主 data-timer-host", /data-timer-host/.test(main()));
/* 新模型下动作要知道作用于哪个计时器：用 data-timer-src 指到第 0 步 */
const actEl = (extra) => Object.assign({ dataset: Object.assign({ timerSrc: "0" }, extra || {}), closest: () => null }, {});
store.main.scrollTop = 480;
await A.handleAct("timer-target", actEl({ v: "30" }));
check("计时器：点预设不会把页面顶回最顶（scrollTop 保持）",
  store.main.scrollTop === 480 && A.Timer.attach(tExp.steps[0]).target === 30);
store.main.scrollTop = 372;
await A.handleAct("timer-mode", actEl({ v: "stopwatch" }));
check("计时器：切正计时 / 倒计时也不跳顶", store.main.scrollTop === 372);
store.main.scrollTop = 205;
await A.handleAct("timer-clear-target", actEl());
check("计时器：关闭倒计时也不跳顶", store.main.scrollTop === 205);

/* 同时确认「不整页重绘」是真的：只换计时卡宿主的 innerHTML */
const realQSA = document.querySelectorAll;
const fakeHosts = [{ innerHTML: "", getAttribute: () => "0" }];
globalThis.document.querySelectorAll = (sel) => (sel === "[data-timer-host]" ? fakeHosts : realQSA.call(document, sel));
await A.handleAct("timer-target", actEl({ v: "60" }));
globalThis.document.querySelectorAll = realQSA;
check("计时器：改设置只重画计时卡（宿主被重写，卡片内容仍在）",
  /本步计时器预设/.test(fakeHosts[0].innerHTML) && /data-timer-clock/.test(fakeHosts[0].innerHTML) &&
  A.Timer.attach(tExp.steps[0]).target === 60);

/* 记录页：本步计时卡 + 自由计时卡两张（用 viewRecord() 的 HTML 直接验，不切页、不动 state.exp） */
A.render();   // 回到编辑页的正常渲染（顺带确认没有异常）
check("计时器：记录页两张卡（本步 + 自由）都带 data-timer-host",
  (A.viewRecord().match(/data-timer-host/g) || []).length === 2 &&
  /data-timer-owner="free"/.test(A.viewRecord()) && /timer-card/.test(A.viewRecord()));
check("计时器：记录页计时卡夹在导航条与正文之间",
  A.viewRecord().indexOf('class="player-bar"') < A.viewRecord().indexOf("timer-card") &&
  A.viewRecord().indexOf("timer-card") < A.viewRecord().indexOf('class="player-stage"'));
check("计时器：自由计时器卡自带改模式 / 时长的控件",
  (() => {
    const html = A.timerRecordHTML(tExp, "free", { free: true });
    return /自由计时器/.test(html) && /data-act="timer-mode"/.test(html) &&
      /data-timer="min"/.test(html) && /data-timer-src="free"/.test(html);
  })());
check("计时器：本步计时卡不带改时长的控件（预设留在编辑模式）",
  !/data-timer="min"/.test(A.timerRecordHTML(tExp.steps[0], 0)));

/* 自定义分 / 秒 → 应用（走真实动作分发；输入框按 data-timer-src 区分） */
const realQS = document.querySelector;
globalThis.document.querySelector = (sel) => {
  if (sel === '[data-timer="min"][data-timer-src="0"]') return { value: "3" };
  if (sel === '[data-timer="sec"][data-timer-src="0"]') return { value: "30" };
  return null;
};
await A.handleAct("timer-custom", actEl());
globalThis.document.querySelector = realQS;
check("计时器：自定义 3 分 30 秒被应用（210s）",
  A.Timer.attach(tExp.steps[0]).target === 210 && A.Timer.attach(tExp.steps[0]).mode === "countdown");

/* 记录模式：手动启停 / 归零 / 记一次 */
A.Timer.setTarget(tExp.steps[0], 300);   // 切回 5 分钟倒计时，离开编辑页时会存进本地存储
A.goTo("record", tExp.id);
const tRec = A.state.exp;
check("计时器：记录页有手动开始 / 归零 / 记一次",
  /data-act="timer-toggle"/.test(main()) && /data-act="timer-reset"/.test(main()) && /data-act="timer-log"/.test(main()));
check("计时器：记录页显示目标时长与时钟",
  /data-timer-clock/.test(main()) && /倒计时 05:00/.test(main()));

/* 本步计时器：开始 / 暂停 / 归零（显式指向第 0 步） */
const stepAct = () => Object.assign({ dataset: { timerSrc: "0" }, closest: () => null });
await A.handleAct("timer-toggle", stepAct());
check("计时器：开始后 running=true 且 tick 已挂上",
  A.Timer.attach(tRec.steps[0]).running === true && A.Timer._iv !== null && A.Timer.elapsed(tRec.steps[0]) >= 0);
check("计时器：未到点时不算结束",
  A.Timer.isOver(tRec.steps[0]) === false && A.Timer.remaining(tRec.steps[0]) > 0);
await A.handleAct("timer-toggle", stepAct());
check("计时器：暂停后累计保留且 tick 已停",
  A.Timer.attach(tRec.steps[0]).running === false && A.Timer._iv === null && A.Timer.attach(tRec.steps[0]).accumulated >= 0);
A.Timer.reset(A.Timer.attach(tRec.steps[0]));
check("计时器：归零清空累计与响铃标记",
  A.Timer.elapsed(tRec.steps[0]) === 0 && A.Timer.attach(tRec.steps[0]).rang === false);

/* ⭐ 每步独立：两个步骤的计时器互不影响，可同时跑 */
await A.handleAct("timer-toggle", stepAct());                       // 第 1 步开跑
await A.handleAct("timer-toggle", Object.assign({ dataset: { timerSrc: "1" }, closest: () => null }));  // 第 2 步也开跑
check("计时器：两个步骤的计时器可以同时运行且互不干扰",
  A.Timer.attach(tRec.steps[0]).running === true && A.Timer.attach(tRec.steps[1]).running === true &&
  A.Timer._active.length === 2 && A.Timer._iv !== null);
A.Timer.pause(A.Timer.attach(tRec.steps[1]));
check("计时器：暂停第 2 步不影响第 1 步",
  A.Timer.attach(tRec.steps[1]).running === false && A.Timer.attach(tRec.steps[0]).running === true);
A.Timer.pause(A.Timer.attach(tRec.steps[0]));

/* 记一次 / 到点自动写入「现象 / 数据」 */
A.ui.playIndex = 0;
const noteBeforeLog = tRec.steps[0].record.note;
A.Timer.attach(tRec.steps[0]).accumulated = 65000;
const rlog = A.Timer.log(tRec, A.Timer.attach(tRec.steps[0]), tRec.steps[0]);
check("计时器：记一次写入该步记录并留 log",
  rlog.ok === true && tRec.steps[0].record.note.indexOf("[计时]") >= 0 &&
  tRec.steps[0].record.note.indexOf("01:05") >= 0 && A.Timer.attach(tRec.steps[0]).logs.length === 1);
check("计时器：原本没记录时不留空行",
  noteBeforeLog === "" && tRec.steps[0].record.note.split("\n")[0].indexOf("[计时]") === 0);

/* 倒计时到点 → 自动写进「这一步」 */
A.Timer.attach(tRec.steps[0]).accumulated = 0;
A.Timer.attach(tRec.steps[0]).mode = "countdown";
A.Timer.attach(tRec.steps[0]).target = 60;
A.Timer.attach(tRec.steps[0]).running = true;
A.Timer.attach(tRec.steps[0]).startAt = Date.now() - 61000;   // 假装已经跑了 61 秒
A.Timer.attach(tRec.steps[0]).rang = false;
A.Timer.track(tRec, tRec.steps[0], A.Timer.attach(tRec.steps[0]));
const noteBeforeOver = tRec.steps[0].record.note;
const noteStep2Before = tRec.steps[1].record.note;
A.Timer.tick();
check("计时器：倒计时到点自动写入当前步记录",
  A.Timer.attach(tRec.steps[0]).rang === true && A.Timer.isOver(tRec.steps[0]) === true &&
  tRec.steps[0].record.note.indexOf("倒计时结束") >= 0 &&
  tRec.steps[0].record.note.length > noteBeforeOver.length);
check("计时器：第 1 步到点不会写进第 2 步", tRec.steps[1].record.note === noteStep2Before);
const noteAfterOver = tRec.steps[0].record.note;
A.Timer.tick();
check("计时器：到点只写一次（rang 抑制重复响铃）", tRec.steps[0].record.note === noteAfterOver);
A.Timer.stopTick();

/* 自由计时器：到点只响不写（它不属于任何步骤） */
const freeT = A.Timer.attach(tRec);
freeT.mode = "countdown"; freeT.target = 60; freeT.accumulated = 0;
freeT.running = true; freeT.startAt = Date.now() - 61000; freeT.rang = false;
A.Timer.track(tRec, null, freeT);
const step0BeforeFree = tRec.steps[0].record.note;
A.Timer.tick();
check("计时器：自由计时器到点只响铃、不写任何步骤记录",
  freeT.rang === true && tRec.steps[0].record.note === step0BeforeFree);
A.Timer.stopTick();

/* 报告：用过计时器才有「## 计时」，且逐条列出用过的计时器 */
const mdTimer = A.buildLocalMarkdown(tRec);
check("计时器：报告里出现过计时器才有「## 计时」章节",
  mdTimer.indexOf("## 计时") >= 0 && mdTimer.indexOf("本次总用时") >= 0);
check("计时器：报告逐条列出用过的计时器（含自由计时器一节）",
  mdTimer.indexOf("### 第 1 步") >= 0 && mdTimer.indexOf("### 自由计时器") >= 0);
const plainTimerExp = A.normalizeExp({ id: "p1", name: "没计时", steps: [{ id: "sp", title: "a", images: [] }] });
check("计时器：没计时的实验报告不带空章节", A.buildLocalMarkdown(plainTimerExp).indexOf("## 计时") < 0);
check("计时器：分发给 LLM 的数据带计时汇总",
  !!A.collectReportData(tRec).timer && A.collectReportData(tRec).timer.elapsedText !== "" &&
  A.collectReportData(plainTimerExp).timer === null);

/* 结构：新卡片必须标签闭合、记录页计时条位置正确（否则真机布局会塌） */
const balanced = (s) => (s.match(/<div\b/g) || []).length === (s.match(/<\/div>/g) || []).length &&
  (s.match(/<span\b/g) || []).length === (s.match(/<\/span>/g) || []).length;
check("新卡片：计时器 / 自动导入的标签闭合（div + span 配平）",
  balanced(A.timerEditHTML(tRec.steps[0], 0)) && balanced(A.timerRecordHTML(tRec.steps[0], 0)) &&
  balanced(A.timerRecordHTML(tRec, "free", { free: true })) &&
  balanced(A.lanAutoHTML()) && balanced(A.lanAutoBanner() || "<div></div>"));
check("计时器：记录页计时条夹在导航条与正文之间",
  (A.goTo("record", tRec.id),
    main().indexOf('class="player-bar"') < main().indexOf("timer-card") &&
    main().indexOf("timer-card") < main().indexOf('class="player-stage"')));

/* ---------------- 18. 互传「下载即导入」（点下载 = 导入开关，接收端同样生效） ---------------- */

check("下载即导入：只认 .json（图片 / 文档 / PDF 静默跳过）",
  A.lanIsExpJson("实验.json") === true && A.lanIsExpJson("报告.PDF") === false &&
  A.lanIsExpJson("照片.png") === false && A.lanIsExpJson("") === false);
check("下载即导入：识别本应用实验包（kind=zhbit-lab-experiment / exp）",
  (A.lanAutoDetect({ kind: "zhbit-lab-experiment", exp: { id: "e", steps: [] } }) || {}).kind === "实验包");
check("下载即导入：识别「导出全部实验」备份（exps[]）",
  (A.lanAutoDetect({ kind: "zhbit-lab-backup", exps: [{ id: "a" }, { id: "b" }] }) || {}).exps.length === 2);
check("下载即导入：识别 AI 生成的裸实验 JSON（steps）",
  (A.lanAutoDetect({ name: "n", subject: "chemistry", steps: [{ title: "a" }] }) || {}).kind === "实验 JSON");
check("下载即导入：认不出的 JSON 返回 null（留给报错）",
  A.lanAutoDetect({ foo: 1 }) === null && A.lanAutoDetect([1, 2]) === null && A.lanAutoDetect("x") === null);
check("下载即导入：不再有后台监听 / 轮询（下载才是触发键）",
  !/lanAutoSync|lanAutoMaybeStart|lanAutoStop|LAN_AUTO_POLL_MS|lanAutoMarkSelf/.test(html) &&
  /async function lanImportOnDownload/.test(html));
check("下载即导入：App 形态与浏览器形态的下载都接了导入（接收端也生效）",
  /\/\* 下载即导入[\s\S]{0,200}await lanImportOnDownload\(id, shown\);/.test(html) &&
  /if \(blob\) \{ await lanImportOnDownload\(id, shown, blob\); return; \}/.test(html) &&
  /const blob = await lanDownloadBlob\(url, shown\)/.test(html));
check("下载即导入：手机端 viewport 显式允许缩放（maximum-scale / user-scalable）",
  /name="viewport"[^>]*maximum-scale=5\.0[^>]*user-scalable=yes/.test(html) &&
  /touch-action: pan-x pan-y pinch-zoom/.test(html));
checkRust("下载即导入：Android App 打开 WebView 内置缩放（否则手机端捏不动）",
  /builtInZoomControls = true/.test(readIf(path.join(here, "..", "src-tauri", "gen", "android", "app",
    "src", "main", "java", "com", "zhbit", "labassistant", "MainActivity.kt"))) &&
  /onWebViewCreate/.test(readIf(path.join(here, "..", "src-tauri", "gen", "android", "app",
    "src", "main", "java", "com", "zhbit", "labassistant", "MainActivity.kt"))));

/* App 形态不该把 tauri.localhost 当服务端地址去连（真机截图里会误报「不是有效的 JSON」） */
globalThis.window.__TAURI__ = { core: { invoke: async () => null } };
const savedLocation = globalThis.location;
globalThis.location = { hash: "", origin: "http://tauri.localhost", protocol: "http:" };
check("互传页：App 形态不把 tauri.localhost 当服务端地址",
  !/tauri\.localhost/.test(A.lanDefaultBase()));
let autoFetched = 0;
const fetchBeforeApp = globalThis.fetch;
globalThis.fetch = async () => { autoFetched += 1; throw new Error("stub: 不该发请求"); };
A.LAN.base = ""; A.LAN.online = false; A.LAN.checking = false; A.LAN.autoTried = false;
A.lanMaybeAutoConnect();
check("互传页：App 形态没有可用地址时不自动连接（不再误报「不是有效 JSON」）", autoFetched === 0);
globalThis.fetch = fetchBeforeApp;
globalThis.location = savedLocation;
delete globalThis.window.__TAURI__;
check("互传页：浏览器形态仍按同源地址自动连接（行为不回退）",
  (() => {
    globalThis.location = { hash: "", origin: "http://192.168.1.9:8000", protocol: "http:" };
    const b = A.lanDefaultBase();
    globalThis.location = savedLocation;
    return b === "http://192.168.1.9:8000";
  })());

const bareBuilt = A.lanAutoBuildExp({ name: "裸实验", subject: "biology", steps: [{ title: "接种", text: "划线" }, { text: "培养" }] });
check("下载即导入：裸 JSON 补齐成合法实验（补 id / 空标题 / 主题）",
  A.isValidExp(bareBuilt) === true && bareBuilt.steps.length === 2 &&
  bareBuilt.steps[1].title === "步骤 2" && bareBuilt.theme === "t-mint" &&
  bareBuilt.steps[1].record.note === "");
check("下载即导入：完整实验包原样保留（计时器 / 步骤 id 不丢）",
  (() => {
    const full = A.normalizeExp({ id: "e9", name: "完整", steps: [{ id: "s9", title: "a", images: [] }], timer: { mode: "countdown", target: 90 } });
    const back = A.lanAutoBuildExp(full);
    return back.id === "e9" && back.timer.target === 90 && back.steps[0].id === "s9" && !("canvas" in back.steps[0]);
  })());

/* 端到端：桩掉 fetch，模拟「点了下载」之后的读取链路 */
const autoBodies = {
  "id-exp": JSON.stringify({
    kind: "zhbit-lab-experiment", v: 1,
    exp: { id: "e1", name: "互传实验", subject: "chemistry", theme: "t-sky",
      steps: [{ id: "s1", title: "混合", text: "搅拌", images: [] }] },
  }),
  "id-bad": "{这不是合法 JSON",
  "id-other": JSON.stringify({ foo: 1, bar: [1, 2, 3] }),
  "id-backup": JSON.stringify({ kind: "zhbit-lab-backup", v: 1, exps: [
    { id: "b1", name: "备份甲", subject: "biology", steps: [{ id: "s", title: "a", text: "b", images: [] }] },
    { id: "b2", name: "备份乙", subject: "biochem", steps: [{ id: "s", title: "c", text: "d", images: [] }] },
  ] }),
};
const realFetch2 = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.indexOf("/api/download") >= 0) {
    const mm = /id=([^&]+)/.exec(u);
    const id = mm ? decodeURIComponent(mm[1]) : "";
    if (!(id in autoBodies)) return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => autoBodies[id] };
  }
  return { ok: true, status: 200, json: async () => ({ ok: true, text: "" }) };
};

A.LAN.base = "http://127.0.0.1:8000";
A.LAN.online = true;
A.LAN.files = [
  { id: "id-exp", name: "银镜反应-20260101.json", size: 900, time: 1730000000 },
  { id: "id-big", name: "太大.json", size: 30 * 1024 * 1024, time: 1730000003 },
];
const expCountBefore = A.Store.listExps().length;
const r1 = await A.lanImportOnDownload("id-exp", "银镜反应-20260101.json");
check("下载即导入：实验 .json 下载后进「我的实验」（并换新 id，不覆盖同名）",
  r1.ok === true && A.Store.listExps().length === expCountBefore + 1 &&
  A.Store.getExp("e1") === null &&
  A.Store.listExps().some((x) => /互传导入/.test(x.name)));
check("下载即导入：记录里能看到「已导入」并能一键打开",
  A.lanAutoItems().length === 1 && A.lanAutoItems()[0].ok === true &&
  /data-act="lan-auto-open"/.test(A.lanAutoHTML()) && /下载即导入/.test(A.lanAutoHTML()) &&
  /data-lan-auto/.test(html));

const rRepeat = await A.lanImportOnDownload("id-exp", "银镜反应-20260101.json");
check("下载即导入：同一个文件再下一次不会重复导入（按文件指纹去重）",
  rRepeat.repeated === true && A.Store.listExps().length === expCountBefore + 1 &&
  A.lanAutoItems().length === 1);

const rBackup = await A.lanImportOnDownload("id-backup", "全部实验.json");
check("下载即导入：备份包（exps[]）一次导入多个实验",
  rBackup.ok === true && rBackup.exps.length === 2 && A.Store.listExps().length === expCountBefore + 3);

const rPng = await A.lanImportOnDownload("id-png", "现象照片.png");
check("下载即导入：非 .json 静默跳过（不导入、不记记录、不报错）",
  rPng.skipped === true && A.Store.listExps().length === expCountBefore + 3 &&
  A.lanAutoItems().length === 2 && A.lanAutoErrs().length === 0);

const rBad = await A.lanImportOnDownload("id-bad", "损坏.json");
check("下载即导入：损坏的 .json 报错（记录 + 文案可读）",
  rBad.ok === false && /不是合法 JSON/.test(rBad.error) &&
  A.lanAutoErrs().length === 1 && /损坏\.json/.test(A.lanAutoErrs()[0].name));
const rOther = await A.lanImportOnDownload("id-other", "不是实验.json");
check("下载即导入：结构不对的 .json 报错（说清缺什么字段）",
  rOther.ok === false && /没有 exp \/ exps \/ steps/.test(rOther.error) && A.lanAutoErrs().length === 2);
const rBig = await A.lanImportOnDownload("id-big", "太大.json");
check("下载即导入：超过 20MB 的 .json 只下载不解析（明确报错）",
  rBig.ok === false && /20MB/.test(rBig.error));

check("下载即导入：首页横幅提示无法识别的文件（成功的去列表里看）",
  (A.goTo("home"), /无法识别/.test(main()) && /data-go="lan"/.test(main()) && /去互传页查看/.test(main())));
check("下载即导入：清空记录后首页横幅消失",
  (A.lanAutoClear(), A.goTo("home"), A.lanAutoItems().length === 0 && A.lanAutoBanner() === ""));

/* 收尾：还原 fetch 与 LAN 状态，避免影响其它检查 */
A.LAN.online = false;
A.LAN.files = [];
A.LAN.base = "";
globalThis.fetch = realFetch2;

/* ---------------- 输出 ---------------- */

const pass = results.filter(([ok]) => ok).length;
results.forEach(([ok, n]) => console.log((ok ? "  OK   " : "  FAIL ") + n));
if (skips.length) {
  console.log("\n跳过 " + skips.length + " 项（本目录不含 src-tauri / Tauri 配置，纯 Web 形态）：");
  skips.forEach((n) => console.log("  SKIP  " + n));
}
console.log("\n共 " + results.length + " 项，通过 " + pass + "，失败 " + (results.length - pass) +
  (skips.length ? "，跳过 " + skips.length : ""));
process.exit(pass === results.length ? 0 : 1);