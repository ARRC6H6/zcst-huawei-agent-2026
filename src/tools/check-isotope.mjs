/* 实验助手 · 同位素角标（左上标质量数）校验
 *
 *   node tools/check-isotope.mjs [原型.html]
 *
 * 编辑模式的「反应方程式」由内联的 chem-input 库（React + KaTeX + mhchem）渲染，
 * 它不在主脚本里，所以单独把 <script id="chem-input-lib"> 抽到 Node 的 vm 里跑：
 *   1) smartConvert：把各种写法（^18O / O^18 / H2O^18 / C^14O2）规范成左上标语法；
 *   2) KaTeX + mhchem：真的渲染一遍，检查质量数被排到元素符号左侧（llap 左靠），
 *      而不是右侧电荷上标的右上角。
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { findAppHtmlOrNull } from "./app-html.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(
  path.resolve(process.argv[2] || findAppHtmlOrNull(path.join(here, "..")) || path.join(here, "..", "原型.html")),
  "utf8");

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
  "globalThis.__katex = katex;\nglobalThis.__smartConvert = smartConvert;\nglobalThis.__toLatex = toLatex;\n" +
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
const { __katex: katex, __smartConvert: smartConvert, __toLatex: toLatex } = sandbox;
check("内联 chem-input 库可执行（含 KaTeX + mhchem）", typeof smartConvert === "function" && typeof katex.renderToString === "function");

/* ---------------- 1. smartConvert 规范化 ---------------- */
const cases = [
  ["^18O", "^{18}O", "质量数写在元素前"],
  ["O^18", "^{18}O", "质量数写在元素后（本次修复）"],
  ["H2O^18", "H2^{18}O", "分子末尾元素"],
  ["O^{18}", "^{18}O", "花括号写法"],
  ["^{ 18 }O", "^{18}O", "花括号内带空格"],
  ["C^14O2", "^{14}CO2", "碳-14"],
  ["Na^23Cl", "^{23}NaCl", "钠-23"],
  ["H2^18O", "H2^{18}O", "水中氧-18"],
  ["6^18O2", "6^{18}O2", "系数 + 氧-18"],
  ["^14CO2", "^{14}CO2", "二氧化碳-14"],
  ["^2H2O", "^{2}H2O", "重水"],
  ["2H2 + O2 -> 2H2O", "2H2 + O2 -> 2H2O", "普通方程式不变"],
];
for (const [input, want, why] of cases) {
  const got = smartConvert(input);
  check("smartConvert：" + why + "  " + input + " → " + got, got === want, "期望 " + want);
}
for (const c of ["Fe^3+", "SO4^2-", "Fe^{3+}", "Al^3+"]) {
  const got = smartConvert(c);
  check("电荷不被误判为质量数：" + c, !got.includes("^{3}") && !got.includes("^{2}"), got);
}
check("LaTeX 输出形如 \\ce{^{18}O}", toLatex("O^18") === "\\ce{^{18}O}", toLatex("O^18"));

/* ---------------- 2. 渲染几何：质量数必须在元素符号左侧 ---------------- */
/* mhchem 用 \\mathllap（KaTeX 的 .llap：width:0 + inner right:0）把左上标向左排，
   因此「渲染结果里质量数落在 llap 内、且在元素符号 span 之前」即等价于左上角。 */
function llapBefore(htmlOut, digits, element) {
  const start = htmlOut.indexOf('class="katex-html"');
  const scope = start >= 0 ? htmlOut.slice(start) : htmlOut;
  const llapIdx = scope.indexOf("llap");
  const elIdx = scope.search(new RegExp(">" + element + "(?![a-z])"));
  if (llapIdx < 0 || elIdx < 0) return { ok: false, why: "未找到 llap(" + llapIdx + ") 或元素 span(" + elIdx + ")" };
  const seg = scope.slice(llapIdx, elIdx);
  const text = seg.replace(/<[^>]*>/g, "").replace(/\u200b/g, "").trim();
  return { ok: llapIdx < elIdx && text.indexOf(digits) >= 0, why: "llap@" + llapIdx + " 元素@" + elIdx + " llap文本=" + JSON.stringify(text) };
}
const geo = [
  ["^18O", "18", "O"],
  ["O^18", "18", "O"],
  ["H2O^18", "18", "O"],
  ["H2^18O", "18", "O"],
  ["6^18O2", "18", "O"],
  ["C^14O2", "14", "C"],
];
for (const [input, digits, el] of geo) {
  const latex = toLatex(input);
  let out = "";
  try { out = katex.renderToString(latex, { throwOnError: false, displayMode: true }); } catch (e) { out = ""; }
  const r = llapBefore(out, digits, el);
  check("渲染：" + input + " → 质量数 " + digits + " 在 " + el + " 左侧（左上角）", r.ok, r.why);
}
check("渲染：质量数不得出现在元素符号之后（右上角）",
  (() => {
    const out = katex.renderToString(toLatex("O^18"), { throwOnError: false, displayMode: true });
    const scope = out.slice(out.indexOf('class="katex-html"'));
    const elIdx = scope.search(/>O(?![a-z])/);
    return elIdx >= 0 && scope.indexOf("llap") < elIdx;
  })());

const pass = results.filter(([ok]) => ok).length;
console.log("\n共 " + results.length + " 项，通过 " + pass + "，失败 " + (results.length - pass));
process.exit(pass === results.length ? 0 : 1);
