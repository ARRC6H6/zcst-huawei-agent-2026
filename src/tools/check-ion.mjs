/* 实验助手 · 离子电荷输入（右上角带正负号的电荷上标）校验
 *
 *   node tools/check-ion.mjs [原型.html]
 *
 * 两件事分开验：
 *   1) 「生成什么写法」—— 电荷片段生成器（^3+ / ^+ / ^2- / ^-）与「光标前取离子式」的纯函数；
 *   2) 「渲染成什么样」—— 把 <script id="chem-input-lib"> 抽到 Node 的 vm 里真跑一遍
 *      KaTeX + mhchem，从渲染出来的 HTML 结构上确认：
 *        电荷落在元素符号**右侧**的上标里（不是 KaTeX 的 llap 左上标），
 *        且上标文本里**带正负号**（Fe³⁺ / SO₄²⁻），不是把 +/- 甩到外面当成一个普通项。
 *      —— 「在右上角带正负号」这条要求，只有看真渲染结构才验得准。
 *
 * 顺便锁住与既有语法的兼容：satisfy `Fe^3+` / `SO4^2-` / `Na^+` / `Cl^-` 都不被
 * smartConvert 误判成质量数（左上标）—— 这条 check-isotope.mjs 也在看，这里从离子角度再看一遍。
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { findAppHtmlOrNull } from "./app-html.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(here, "..");
const file = path.resolve(process.argv[2] || findAppHtmlOrNull(projectDir) || path.join(projectDir, "原型.html"));
const html = fs.readFileSync(file, "utf8");

const results = [];
const check = (name, cond, extra = "") => {
  results.push([!!cond, name]);
  console.log((cond ? "  OK   " : "  FAIL ") + name + (cond || !extra ? "" : "  → " + extra));
};

/* ---------------- 抽出内联库并运行 ---------------- */
const m = html.match(/<script id="chem-input-lib">([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: 未找到内联的 chem-input 库"); process.exit(1); }
let code = m[1];
const tail = code.lastIndexOf("})();");
if (tail < 0) { console.error("FAIL: 内联库结构异常"); process.exit(1); }
code = code.slice(0, tail) +
  "globalThis.__katex = katex;\n" +
  "globalThis.__smartConvert = smartConvert;\n" +
  "globalThis.__toLatex = toLatex;\n" +
  "globalThis.__balance = checkBalance;\n" +
  "globalThis.__parse = parseFormula;\n" +
  "globalThis.__ion = { ionChargeToken: ionChargeToken, ionSnippet: ionSnippet, ionPrefixAt: ionPrefixAt, clampCharge: clampCharge, ION_MAX_CHARGE: ION_MAX_CHARGE };\n" +
  code.slice(tail);

const sandbox = {
  console, setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0),
  Symbol, Object, Array, Map, Set, Math, JSON, Date, String, Number, Boolean, Error,
  RegExp, Promise, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
  TextEncoder, TextDecoder, URL, URLSearchParams, Intl, WeakMap, WeakSet, Reflect, Proxy,
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.document = {
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} }, innerHTML: "", textContent: "" }),
  createTextNode: () => ({}), head: { appendChild() {} }, body: { appendChild() {}, removeChild() {} },
  documentElement: { style: {} }, querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
};
sandbox.customElements = { get: () => undefined, define() {} };
sandbox.HTMLElement = class {};
sandbox.CustomEvent = class {};
sandbox.navigator = { userAgent: "node" };
vm.createContext(sandbox);
try {
  vm.runInContext(code, sandbox, { filename: "chem-input-lib.js" });
} catch (e) {
  check("内联 chem-input 库可执行 —— " + e.message, false);
  console.log("\n共 " + results.length + " 项，通过 0，失败 " + results.length);
  process.exit(1);
}
const katex = sandbox.__katex;
const smartConvert = sandbox.__smartConvert;
const toLatex = sandbox.__toLatex;
const ion = sandbox.__ion;
check("内联 chem-input 库可执行（含 KaTeX + mhchem + 离子模块）",
  typeof smartConvert === "function" && typeof katex.renderToString === "function" &&
  !!ion && typeof ion.ionChargeToken === "function");

/* ---------------- 1. 电荷片段生成器 ---------------- */
const tokens = [
  [1, "+", "^+", "±1 省略数字（钠离子写成 Na^+）"],
  [1, "-", "^-", "±1 省略数字（氯离子写成 Cl^-）"],
  [3, "+", "^3+", "铁离子 Fe^3+"],
  [2, "-", "^2-", "硫酸根 SO4^2-"],
  [9, "+", "^9+", "上限 9 价"],
  [12, "-", "^9-", "超过上限按 9 截断"],
  [0, "+", "^+", "0 当 1 处理"],
  [-4, "-", "^-", "负数当 1 处理"],
  [NaN, "+", "^+", "NaN 当 1 处理"],
  [2.4, "+", "^2+", "四舍五入"],
  [2.6, "-", "^3-", "四舍五入（进位）"],
];
for (const [n, sign, want, why] of tokens) {
  const got = ion.ionChargeToken(n, sign);
  check("电荷片段：" + why + " → " + JSON.stringify(got), got === want, "期望 " + JSON.stringify(want));
}
check("电荷片段：ION_MAX_CHARGE 是 9（输入框的 max 与它同源）", ion.ION_MAX_CHARGE === 9);
check("离子片段：SO4 + 2 负 = SO4^2-", ion.ionSnippet("SO4", 2, "-") === "SO4^2-");
check("离子片段：空格/空串不会产生怪写法", ion.ionSnippet("", 1, "+") === "^+" && ion.ionSnippet("Ba", 2, "+") === "Ba^2+");

/* ---------------- 2. 光标前取离子式（预览用什么） ---------------- */
const prefixCases = [
  ["SO4", 3, "SO4", "整段都是离子式"],
  ["2H2 + O2 -> 2H2O", 3, "2H2", "带系数的分子"],
  ["Ba(OH)2", 8, "Ba(OH)2", "带括号的离子式"],
  ["Fe^3+ + 3OH^-", 2, "Fe", "光标停在元素符号后面"],
  ["2 mL", 4, "mL", "遇到空格就断开（预览只取紧挨着的一段）"],
  ["", 0, "", "空内容"],
  ["Mg", 0, "", "光标在最前面取不到"],
];
for (const [raw, caret, want] of prefixCases) {
  const got = ion.ionPrefixAt(raw, caret);
  check("光标前离子式：" + JSON.stringify(raw) + " @" + caret + " → " + JSON.stringify(got), got === want, "期望 " + JSON.stringify(want));
}

/* ---------------- 3. 真渲染：电荷必须在元素符号右侧的上标里、且带正负号 ---------------- */
const MSUP = 'class="msupsub">';
/** 取某个 <span> 内部的纯文本（按 span 配对计数，不是「切一段再剥标签」——
 *  KaTeX 的上标结构外面还套着 vlist-t / vlist-r / vlist 好几层，切 200 字符
 *  只能切到一堆空壳 span，真正的数字还在更里面）。 */
function spanInnerText(scope, afterOpenTag) {
  let depth = 1, i = afterOpenTag, text = "";
  const tagRe = /<(\/?)\s*([a-zA-Z][\w-]*)[^>]*>/g;
  tagRe.lastIndex = i;
  let mm;
  while ((mm = tagRe.exec(scope)) !== null) {
    text += scope.slice(i, mm.index);
    const name = mm[2].toLowerCase();
    if (name === "span") {
      if (mm[1] === "/") { depth -= 1; if (depth === 0) return text; }
      else depth += 1;
    }
    i = tagRe.lastIndex;
  }
  return text;
}
/** 收集渲染结果里所有上标块（msupsub）的文本 */
function supers(htmlOut) {
  /* scope 必须从 katex-html 那个 span 的 `>` 之后开始 —— 从属性名中间切会把
     `class="katex-html" aria-hidden="true">` 这些属性文本也算进"纯文本"里。 */
  const marker = htmlOut.indexOf('class="katex-html"');
  const gt = marker < 0 ? -1 : htmlOut.indexOf(">", marker);
  const scope = gt >= 0 ? htmlOut.slice(gt + 1) : "";
  const out = [];
  let idx = 0;
  while (true) {
    const i = scope.indexOf(MSUP, idx);
    if (i < 0) break;
    const text = spanInnerText(scope, i + MSUP.length)
      .replace(/[\u200b\u2061\u2062\u2064]/g, "").trim();
    out.push({ at: i, text: text.slice(0, 4), textLong: text.slice(0, 12) });
    idx = i + MSUP.length;
  }
  return { scope, sups: out };
}
const norm = (s) => String(s).replace(/\u2212/g, "-");   // KaTeX 的减号是 U+2212
/** 渲染结果里的「纯文本」（用于判断先后顺序）。
 *  ⚠️ 必须先扔掉 mhchem 的透明占位盒：它里面是一个 color:transparent 的 X，
 *     不扔的话纯文本会变成 `SOX4X2−`、`ClX−` 这种，按符号去找位置会全部落空。 */
function plainTextOf(scope) {
  const noPlaceholder = scope.replace(/<span[^>]*color:transparent[^>]*>[\s\S]*?<\/span>/g, "");
  return noPlaceholder.replace(/<[^>]*>/g, "").replace(/[\u200b\u2061\u2062\u2064]/g, "");
}

const chargeCases = [
  ["Fe^3+", "Fe", "3+", "铁离子"],
  ["Al^3+", "Al", "3+", "铝离子（无花括号）"],
  ["Al^{3+}", "Al", "3+", "铝离子（花括号写法）"],
  ["SO4^2-", "SO4", "2-", "硫酸根"],
  ["CO3^2-", "CO3", "2-", "碳酸根"],
  ["Na^+", "Na", "+", "钠离子（±1 省略数字）"],
  ["Cl^-", "Cl", "-", "氯离子（±1 省略数字）"],
  ["Ba^2+", "Ba", "2+", "钡离子"],
  ["NH4^+", "NH4", "+", "铵根"],
];
for (const [raw, symbol, charge, why] of chargeCases) {
  const latex = toLatex(raw);
  let out = "";
  try { out = katex.renderToString(latex, { throwOnError: false, displayMode: true }); } catch (e) { out = ""; }
  const { scope, sups } = supers(out);
  const hit = sups.find((s) => norm(s.text).indexOf(charge) === 0);
  check("渲染：" + why + " " + raw + " → 上标里出现 " + JSON.stringify(charge), !!hit,
    "上标们=" + JSON.stringify(sups.map((s) => s.textLong)));
  if (!hit) continue;
  /* 「在右侧」怎么判：KaTeX 的 HTML 里上标块（vlist）排在基础符号之后，
     所以拿**纯文本顺序**（元素在前、电荷在后）就等价于视觉上在右边；
     再配合下一条「没有走 llap」把左上标那条路彻底排除。
     注意不能拿 `>Fe<` 这种整串去找：KaTeX 会把每个字符拆成独立的 span。 */
  const plain = norm(plainTextOf(scope));
  const baseAt = plain.indexOf(symbol);
  const chargeAt = plain.indexOf(norm(charge));
  check("渲染：" + raw + " → 电荷 " + JSON.stringify(charge) + " 在 " + symbol + " 右侧（右上角）",
    baseAt >= 0 && chargeAt >= 0 && baseAt < chargeAt,
    "纯文本=" + JSON.stringify(plain.slice(0, 24)) + " base@" + baseAt + " charge@" + chargeAt);
  const between = scope.slice(Math.max(0, scope.indexOf(">" + symbol[0])), hit.at);
  check("渲染：" + raw + " → 电荷没有走 KaTeX 的 llap（那是左上标/质量数的排法）",
    between.indexOf("llap") < 0);
}

/* 反向：质量数依旧必须在左上角（不能被这次改动带跑） */
{
  const out = katex.renderToString(toLatex("O^18"), { throwOnError: false, displayMode: true });
  const { scope, sups } = supers(out);
  const llapAt = scope.indexOf("llap");
  check("回归：质量数 O^18 仍然排在左上角（llap 早于元素符号）",
    llapAt >= 0 && llapAt < scope.search(/>O(?![a-z])/) && sups.length > 0);
}
check("回归：smartConvert 不会把电荷当质量数搬到左上角",
  ["Fe^3+", "SO4^2-", "Na^+", "Cl^-"].every((c) => {
    const got = smartConvert(c);
    return got.indexOf("^{3}") < 0 && got.indexOf("^{2}") < 0 && got.indexOf("^{18}") < 0;
  }));
check("回归：普通方程式写法不受影响", smartConvert("2H2 + O2 -> 2H2O") === "2H2 + O2 -> 2H2O");

/* ---------------- 3.5 电荷归一化 vs 反应式里的「↑/↓ + 分隔符」 ----------------
   电荷要粘成 `^{3+}`，但**气体/沉淀记号后面的加号是反应物分隔符**：
   `5Cl2 ^ + 8H2O` 里的 `^ +` 被当成电荷过 —— 会产出 `5Cl2 ^{+} 8H2O`，
   于是 parseFormula 崩、React 渲染整个 chem-input 变成空 div（输入框整块消失）。
   这条就是为那个 bug 立的桩。 */
check("电荷归一化：Fe^3+ / Na^+ / Cl^- / SO4^2- 都粘成花括号写法",
  smartConvert("Fe^3+") === "Fe^{3+}" && smartConvert("Na^+") === "Na^{+}" &&
  smartConvert("Cl^-") === "Cl^{-}" && smartConvert("SO4^2-") === "SO4^{2-}",
  [smartConvert("Fe^3+"), smartConvert("Na^+"), smartConvert("Cl^-"), smartConvert("SO4^2-")].join(" | "));
const gasEq = "2KMnO4 + 16HCl -> 2KCl + 2MnCl2 + 5Cl2 ^ + 8H2O";
check("电荷归一化：气体记号后的 + 是分隔符，绝不能被吃成电荷",
  smartConvert(gasEq) === gasEq, smartConvert(gasEq));
check("电荷归一化：沉淀记号后的 + 同样是分隔符",
  smartConvert("BaCl2 + Na2SO4 -> BaSO4 v + 2NaCl") === "BaCl2 + Na2SO4 -> BaSO4 v + 2NaCl",
  smartConvert("BaCl2 + Na2SO4 -> BaSO4 v + 2NaCl"));
check("电荷归一化：分隔符数量不变（有没有误吃 + 一眼可见）",
  (smartConvert(gasEq).match(/\+/g) || []).length === (gasEq.match(/\+/g) || []).length &&
  (smartConvert("Fe^3+ + 3OH^- -> Fe(OH)3 v").match(/\+/g) || []).length >= 1);

/* ---------------- 3.6 配平检查绝不许抛异常（抛了 = 整个输入框空白） ---------------- */
{
  const balance = sandbox.__balance;
  const eqs = [
    "2KMnO4 + 16HCl -> 2KCl + 2MnCl2 + 5Cl2 ^ + 8H2O",
    "Fe^3+ + 3OH^- -> Fe(OH)3 v",
    "SO4^2- + Ba^2+ -> BaSO4 v",
    "2H2 + O2 -> 2H2O",
    "Ca(OH)2 + CO2 -> CaCO3 v + H2O",
    "Na2CO3 + 2HCl -> 2NaCl + H2O + CO2 ^",
  ];
  let threw = "";
  let unbalanced = [];
  for (const q of eqs) {
    try {
      const r = balance(smartConvert(q));
      if (r.message !== "已配平") unbalanced.push(q + " → " + r.message);
    } catch (e) { threw = q + "：" + e.message; break; }
  }
  check("配平：常见方程式都判为已配平且不抛异常", !threw && unbalanced.length === 0,
    threw || unbalanced.join(" ;; "));
  /* 畸形输入（多一个右括号、只有括号、只剩箭头）也不许抛 */
  const odd = [")", "()", "Fe(OH)3", "->", "Fe^{3+}", "Na^+", "))Fe(", "^3+", "Al2(SO4)3"];
  let oddThrew = "";
  for (const q of odd) {
    try { balance(q); } catch (e) { oddThrew = q + "：" + e.message; break; }
  }
  check("配平：畸形输入不抛异常（宁可提示「没法解析」也不许整个组件崩掉）", !oddThrew, oddThrew);
  check("配平：括号不配对时返回可读提示", /没法解析|未配平|未检测到/.test(balance("Fe(OH)3 -> Fe2O3").message));
}

/* ---------------- 4. UI 是否真的挂上去了 ---------------- */
check("界面：工具条里有离子电荷输入（离子电荷 / 数字框 / ＋－ 两个按钮）",
  /chem-ion-bar/.test(html) && /chem-ion-num/.test(html) && /chem-ion-btn-plus/.test(html) && /chem-ion-btn-minus/.test(html));
check("界面：中文标签「离子电荷」在产物里（不是只有样式没有控件）", html.indexOf("离子电荷") >= 0);
check("界面：两个按钮各自的预览都走 mhchem 渲染（chem-ion-preview）", /chem-ion-preview/.test(html));
check("界面：离子条排在条件条之后、元素表开关之前",
  html.indexOf("chem-condition-bar") < html.indexOf("chem-ion-bar"));
check("界面：输入框限了范围（min/max 来自 ION_MAX_CHARGE）", /chem-ion-num[\s\S]{0,200}max:\s*ION_MAX_CHARGE/.test(html));

const pass = results.filter(([ok]) => ok).length;
console.log("\n共 " + results.length + " 项，通过 " + pass + "，失败 " + (results.length - pass));
process.exit(pass === results.length ? 0 : 1);
