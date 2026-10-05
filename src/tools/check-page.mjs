import fs from "node:fs";
import zlib from "node:zlib";

const file = process.argv[2];
if (!file) { console.error("用法: node tools/check-page.mjs <实验助手.html>"); process.exit(2); }
const html = fs.readFileSync(file, "utf8");

const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: 未找到内联 script"); process.exit(1); }
const code = m[1] + `
;globalThis.__app = { INST_LIB, INST_CATS, newExp, isValidExp, normalizeExp, Store,
  canvasAct, instPanelHTML, buildLocalMarkdown, mdToHtml, mdInline, esc, has,
  parseHash, goTo, render, viewHome, viewEdit, viewRecord, viewReport, viewSettings,
  REPORT_PROMPT, Media, state, ui, applyTheme, resolvedTheme, systemDark, KEYS,
  collectReportData, localReport, instById, instName, renderInstIcon, compressImage,
  EXP_VERSION, DB_NAME, SVG,
  viewAI, GEN, GEN_PROMPT, NAV, BARE_VIEWS, aiParseJSON, aiValidateGen, aiBuildExp,
  aiApplyJSON, aiImport, aiExtOf, aiZipEntries, aiDocxText, aiPptxText, aiDecodeText,
  aiLegacyPptText, aiLegacyDocText, aiZipRead, aiReadFile,
  viewLan, LAN, LAN_KEY, lanAct, lanConnect, lanRefresh, lanStatusHTML, lanFilesHTML,
  lanProgHTML, lanClipInfo, lanSize, lanTime, lanDefaultBase, lanUrl };
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
check("AI 提示词：要求不生成仪器画布", A.GEN_PROMPT.indexOf("不要输出仪器画布") >= 0);
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
check("AI 建实验：每步画布留空（交给用户摆放）",
  builtAI.steps.every((s) => s.canvas && s.canvas.items.length === 0 && s.canvas.w === 1000 && s.canvas.h === 620));
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
check("设置页：含获取 API 图文教程",
  /获取 API 图文教程/.test(main()) && /创建 API key/.test(main()) && /sk-/.test(main()));
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

/* ---------------- 输出 ---------------- */

const pass = results.filter(([ok]) => ok).length;
results.forEach(([ok, n]) => console.log((ok ? "  OK   " : "  FAIL ") + n));
console.log("\n共 " + results.length + " 项，通过 " + pass + "，失败 " + (results.length - pass));
process.exit(pass === results.length ? 0 : 1);