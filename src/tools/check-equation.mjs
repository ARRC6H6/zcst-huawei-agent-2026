/* 实验助手 · 方程式「可逆符号 / 条件符号（加热·催化…）」校验
 *
 *   node tools/check-equation.mjs [原型.html]
 *
 * 三类用户报过的问题，各自从「纯函数」和「真渲染」两侧锁死：
 *   1) 可逆符号：`<=>` 必须原样活到 mhchem，渲染成 ⇌（\rightleftharpoons），
 *      绝不能变成「小于号 + 普通箭头」（A<→B）——`=>` → `->` 的归一化顺序写过反，
 *      真正的根因是那一行把 `<=>` 拆成了 `<->`，随后 `\s*->\s*` 再劈成 `< ->`。
 *   2) 条件符号（加热 Δ / 点燃 / 催化 / 通电 / 高温 / 高压）：
 *      · 必须**紧贴**箭头的方括号（`->[\Delta]`）。中间被插一个空格，
 *        mhchem 就不把它当条件，而是把字面量 `[Δ]` 排在箭头旁边（「用不了」的真身）。
 *      · 式子还没有箭头时点条件按钮，必须补一个带条件的箭头，而不是原样返回什么都不干。
 *   3) 配平：条件方括号不是反应物。脱不掉的话 `\Delta` 会被当成元素 De 参与配平，
 *      凡是标了条件的式子一律显示「未配平」。
 *
 * 判据全部落在 KaTeX 的**视觉树**（`class="katex-html"` 之后）上：
 *   · ⇌ 的可逆箭头是 `halfarrow-left/right` 组成的 stretchy 半箭头；
 *   · 普通箭头 `->` 是带尾巴的 `hide-tail` SVG；
 *   · 条件写在箭头上方时，视觉树里**不会**出现方括号字符（写成 `-> [` 才会）。
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
  "globalThis.__cond = replaceArrowWithCondition;\n" +
  "globalThis.__balance = checkBalance;\n" +
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
const replaceArrowWithCondition = sandbox.__cond;
const checkBalance = sandbox.__balance;
check("内联 chem-input 库可执行（KaTeX + mhchem + 方程式模块）",
  typeof smartConvert === "function" && typeof katex.renderToString === "function" &&
  typeof replaceArrowWithCondition === "function" && typeof checkBalance === "function");

/* ---------------- 渲染工具：只看视觉树 ---------------- */
function render(raw) {
  try { return katex.renderToString(toLatex(raw), { throwOnError: false, displayMode: true, strict: "ignore" }); }
  catch { return ""; }
}
function visual(out) {
  const marker = out.indexOf('class="katex-html"');
  const gt = marker < 0 ? -1 : out.indexOf(">", marker);
  return gt >= 0 ? out.slice(gt + 1) : "";
}
/** 视觉树的纯文本（先扔掉 mhchem 的透明占位盒，再剥标签） */
function plain(scope) {
  return scope
    .replace(/<span[^>]*color:transparent[^>]*>[\s\S]*?<\/span>/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u200b\u2061\u2062\u2064]/g, "");
}
/** 有没有方括号**字符**（写成 `-> [` 才会出现；写在箭头上方时不会有） */
const hasLiteralBracket = (scope) => /[\[\]]/.test(plain(scope));

/* ================= 1. 可逆符号 ================= */
const reversible = [
  ["2H2 + O2 <=> 2H2O", "2H2 + O2 <=> 2H2O", "工具条 ⇌ 插入的写法"],
  ["2H2 + O2 <-> 2H2O", "2H2 + O2 <=> 2H2O", "另一种可逆写法"],
  ["A<=>B", "A <=> B", "紧挨着写"],
  ["N2+3H2<=>2NH3", "N2 + 3H2 <=> 2NH3", "无空格 + 数字系数"],
];
for (const [raw, want, why] of reversible) {
  const got = smartConvert(raw);
  check("可逆：" + why + " " + JSON.stringify(raw) + " → " + JSON.stringify(want), got === want, "实际 " + JSON.stringify(got));
}
check("可逆：smartConvert 不会把 <=> 劈成 \"< ->\"",
  reversible.every(([raw]) => !/<\s+->/.test(smartConvert(raw))),
  reversible.map(([raw]) => smartConvert(raw)).join(" | "));
check("可逆：={'>'} 写法仍然归一成 ->（回归，没被这次改动带跑）",
  smartConvert("N2 + 3H2 = 2NH3") === "N2 + 3H2 -> 2NH3", smartConvert("N2 + 3H2 = 2NH3"));

{
  const scope = visual(render("2H2 + O2 <=> 2H2O"));
  check("可逆渲染：真的画出了 ⇌（stretchy 半箭头）", scope.indexOf("halfarrow-left") >= 0,
    "视觉树里没有 halfarrow-left");
  check("可逆渲染：视觉树里没有字面量 \"<\"（不是「小于号 + 箭头」）", scope.indexOf("&lt;") < 0,
    "出现了 &lt; —— 可逆符号被拆开了");
  check("可逆渲染：两个半箭头（左 + 右）都在", scope.indexOf("halfarrow-left") >= 0 && scope.indexOf("halfarrow-right") >= 0);
}
{
  const scope = visual(render("2H2 + O2 -> 2H2O"));
  check("回归渲染：普通箭头 -> 还是带尾巴的箭头（hide-tail）", scope.indexOf("hide-tail") >= 0);
  check("回归渲染：普通箭头不画成可逆箭头", scope.indexOf("halfarrow-left") < 0);
}
check("配平：可逆式仍判为已配平（以前被拆坏后一律判未配平）",
  (() => { const r = checkBalance(smartConvert("2H2 + O2 <=> 2H2O")); return r.balanced === true; })(),
  JSON.stringify(checkBalance(smartConvert("2H2 + O2 <=> 2H2O")).message));

/* ================= 2. 条件符号 ================= */
const CONDITIONS = [
  ["\\Delta", "加热"],
  ["点燃", "点燃"],
  ["催化剂", "催化"],
  ["通电", "电解/通电"],
  ["高温", "高温"],
  ["高压", "高压"],
];
const withArrow = "2KClO3 -> 2KCl + 3O2";
for (const [cond, label] of CONDITIONS) {
  const got = replaceArrowWithCondition(withArrow, cond);
  check("条件：" + label + " 贴到箭头上 → " + JSON.stringify(withArrow.replace("->", "->[" + cond + "]")),
    got === withArrow.replace("->", "->[" + cond + "]"), "实际 " + JSON.stringify(got));
}
check("条件：条件方括号**紧贴**箭头（绝不能出现 \"-> [\" / \"<=> [\"）",
  CONDITIONS.every(([cond]) => !/->\s+\[|<=>\s+\[/.test(replaceArrowWithCondition(withArrow, cond))));
check("条件：smartConvert 不会把条件方括号从箭头上拆下来",
  smartConvert("2KClO3 ->[\\Delta] 2KCl + 3O2") === "2KClO3 ->[\\Delta] 2KCl + 3O2",
  smartConvert("2KClO3 ->[\\Delta] 2KCl + 3O2"));
check("条件：可逆箭头上的条件也不被拆开",
  smartConvert("N2 + 3H2 <=>[\\Delta] 2NH3") === "N2 + 3H2 <=>[\\Delta] 2NH3",
  smartConvert("N2 + 3H2 <=>[\\Delta] 2NH3"));

{
  const raw = replaceArrowWithCondition(withArrow, "\\Delta");
  const scope = visual(render(raw));
  check("条件渲染：加热 Δ 排在箭头上方（视觉树里没有方括号字面量）", !hasLiteralBracket(scope),
    "纯文本 " + JSON.stringify(plain(scope).slice(0, 40)));
  check("条件渲染：加热 Δ 真的出现在式子里", plain(scope).indexOf("\u0394") >= 0);
}
{
  const raw = replaceArrowWithCondition("2H2O2 -> 2H2O + O2", "催化剂");
  const scope = visual(render(raw));
  check("条件渲染：催化剂排在箭头上方（没有字面量 [催化剂]）", !hasLiteralBracket(scope),
    "纯文本 " + JSON.stringify(plain(scope).slice(0, 40)));
  check("条件渲染：催化剂文字真的出现在式子里", plain(scope).indexOf("催化剂") >= 0);
}
{
  const raw = replaceArrowWithCondition("N2 + 3H2 <=> 2NH3", "\\Delta");
  check("条件：可逆箭头也能加条件（<=>[\\Delta]）", raw === "N2 + 3H2 <=>[\\Delta] 2NH3", JSON.stringify(raw));
  const scope = visual(render(raw));
  check("条件渲染：可逆箭头 + 加热同时成立（⇌ 还在、条件在箭头上方）",
    scope.indexOf("halfarrow-left") >= 0 && !hasLiteralBracket(scope),
    "halfarrow=" + (scope.indexOf("halfarrow-left") >= 0) + " bracket=" + hasLiteralBracket(scope));
}

/* 式子还没有箭头就点条件按钮：必须补一个带条件的箭头（以前原样返回、什么都不发生） */
for (const [cond, label] of CONDITIONS.slice(0, 4)) {
  const raw = "KClO3";
  const got = replaceArrowWithCondition(raw, cond);
  check("条件：还没有箭头时点「" + label + "」会补出 ->[" + cond + "]",
    got !== raw && got.indexOf("->[" + cond + "]") >= 0, JSON.stringify(got));
}
check("条件：空式子点加热也能用", replaceArrowWithCondition("", "\\Delta").indexOf("->[\\Delta]") >= 0,
  JSON.stringify(replaceArrowWithCondition("", "\\Delta")));
check("条件：再点一次同一个条件不会叠成 ->[\\Delta][\\Delta]",
  replaceArrowWithCondition(replaceArrowWithCondition(withArrow, "\\Delta"), "\\Delta") ===
  "2KClO3 ->[\\Delta] 2KCl + 3O2",
  JSON.stringify(replaceArrowWithCondition(replaceArrowWithCondition(withArrow, "\\Delta"), "\\Delta")));
check("条件：换了条件就换掉旧的（Δ 不会残留）",
  replaceArrowWithCondition(replaceArrowWithCondition(withArrow, "\\Delta"), "催化剂") ===
  "2KClO3 ->[催化剂] 2KCl + 3O2",
  JSON.stringify(replaceArrowWithCondition(replaceArrowWithCondition(withArrow, "\\Delta"), "催化剂")));

/* 配平：条件方括号不是反应物 */
for (const [raw, label] of [
  ["2KClO3 ->[\\Delta] 2KCl + 3O2", "加热"],
  ["2H2O2 ->[催化剂] 2H2O + O2", "催化"],
  ["N2 + 3H2 <=>[\\Delta] 2NH3", "可逆 + 加热"],
]) {
  const r = checkBalance(smartConvert(raw));
  check("配平：标了条件（" + label + "）的式子仍判为已配平", r.balanced === true, JSON.stringify(r.message));
}
check("配平：箭头后带空格的配合物 [Cu(NH3)4]SO4 不受影响",
  checkBalance(smartConvert("CuSO4 + 4NH3 -> [Cu(NH3)4]SO4")).balanced === true,
  JSON.stringify(checkBalance(smartConvert("CuSO4 + 4NH3 -> [Cu(NH3)4]SO4")).message));

/* 回归：既有的「↑ / ↓ + 分隔符」不能被条件处理带跑 */
{
  const gasEq = "2KMnO4 + 16HCl -> 2KCl + 2MnCl2 + 5Cl2 ^ + 8H2O";
  check("回归：气体记号 + 分隔符的式子转换后原样不变", smartConvert(gasEq) === gasEq, smartConvert(gasEq));
  check("回归：沉淀记号 + 分隔符的式子转换后原样不变",
    smartConvert("BaCl2 + Na2SO4 -> BaSO4 v + 2NaCl") === "BaCl2 + Na2SO4 -> BaSO4 v + 2NaCl");
}
check("回归：常见方程式（无箭头条件）转换结果不变",
  smartConvert("2H2 + O2 -> 2H2O") === "2H2 + O2 -> 2H2O" &&
  smartConvert("Fe^3+ + 3OH^- -> Fe(OH)3 v") === "Fe^{3+} + 3OH^{-} -> Fe(OH)3 v",
  smartConvert("Fe^3+ + 3OH^- -> Fe(OH)3 v"));

/* ================= 3. 界面：工具条上真的有这些按钮 ================= */
check("界面：条件条里有 → 与 ⇌ 两个按钮", /'arrow'[\s\S]{0,120}'equil'/.test(html));
check("界面：加热/点燃/催化/通电/高温/高压六种条件都在", ["加热", "点燃", "催化", "通电", "高温", "高压"].every((k) => html.indexOf(k) >= 0));
check("界面：⇌ 按钮插入的是 <=>（不是 <-> 或 =）", /id:\s*'equil'[^}]*value:\s*'\s*<=>\s*'/.test(html));
check("界面：Δ 条件是 \\Delta（mhchem 的加热记号）", /id:\s*'heat'[^}]*value:\s*'\\\\Delta'/.test(html));

const pass = results.filter(([ok]) => ok).length;
console.log("\n共 " + results.length + " 项，通过 " + pass + "，失败 " + (results.length - pass));
process.exit(pass === results.length ? 0 : 1);
