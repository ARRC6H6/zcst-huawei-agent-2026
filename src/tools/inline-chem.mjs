/* 把 chem-input 的构建产物重新内联进单文件页面
 *
 *   node tools/inline-chem.mjs [--page 原型.html] [--lib <dist/chem-input.js>] [--check]
 *
 * 为什么需要它：方程式输入是一个独立工程（React + KaTeX + mhchem 打成一个大 bundle），
 * 页面上是**内联**在 <script id="chem-input-lib"> 里的。改了 chem-input/src/* 之后，
 * 必须「先 npm run build，再把产物内联回页面」，否则页面里还是旧组件。
 * （chem-input 里那个 inline-to-lab.mjs 指向的是早期的 `实验助手demo/实验助手.html`，早就不是真源了。）
 *
 * 内联规则（与页面上现有那一份逐字节一致，不能改）：
 *   1) 去掉产物尾部的 `export{...};`
 *   2) 包成 (function(){ ... })();
 *   3) 整块替换 <script id="chem-input-lib">…</script>，脚本前后各一个换行
 *   4) 用 vm.Script 做语法自检，并确认没有残留 export
 *
 * 库目录的解析顺序：--lib / --dir → tools/chem-lib.json → 工程同级扫 chem-input/dist → 工作区扫。
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { findAppHtmlOrNull } from "./app-html.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(here, "..");
const CONFIG = path.join(here, "chem-lib.json");
const MARK = '<script id="chem-input-lib">';

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 ? argv[i + 1] : null;
};
const DRY = argv.includes("--dry");
const CHECK_ONLY = argv.includes("--check");

/* ---------- 1. 定位页面 ---------- */
const pageArg = opt("page") || argv.find((a) => a.endsWith(".html"));
const pageFile = pageArg ? path.resolve(pageArg) : findAppHtmlOrNull(projectDir);
if (!pageFile || !fs.existsSync(pageFile)) {
  console.error("找不到单文件页面（原型.html / 实验助手*.html）");
  process.exit(2);
}

/* ---------- 2. 定位 chem-input 的构建产物 ---------- */
/* 配置里的 dir / lib 允许写**相对路径**（相对 tools/chem-lib.json 所在目录），
   这样镜像仓库那种「没有组件工程、但想留个提示」的场景也能写一份不带绝对路径的配置。 */
function fromConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
    const abs = (p) => (path.isAbsolute(p) ? p : path.resolve(path.dirname(CONFIG), p));
    if (cfg.lib) return abs(cfg.lib);
    if (cfg.dir) return path.join(abs(cfg.dir), "dist", "chem-input.js");
  } catch (e) { /* 没配置就继续找 */ }
  return null;
}
function scanForLib() {
  const roots = [];
  const parent = path.dirname(projectDir);
  roots.push(parent, path.dirname(parent));
  for (const root of roots) {
    let entries = [];
    try { entries = fs.readdirSync(root); } catch (e) { continue; }
    for (const name of entries) {
      const p = path.join(root, name, "chem-input", "dist", "chem-input.js");
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}
const libCandidates = [
  opt("lib") ? path.resolve(opt("lib")) : null,
  opt("dir") ? path.join(path.resolve(opt("dir")), "dist", "chem-input.js") : null,
  fromConfig(),
  scanForLib(),
].filter(Boolean);
const libFile = libCandidates.find((p) => fs.existsSync(p));
if (!libFile) {
  console.error("找不到 chem-input 的构建产物 dist/chem-input.js。");
  console.error("  先构建：cd <chem-input 工程>; npm run build");
  console.error("  或在 " + CONFIG + " 里写死 {\"dir\": \"…\\\\chem-input\"}；");
  console.error("  或显式传 --lib <dist/chem-input.js>。");
  process.exit(2);
}

/* ---------- 3. 生成要内联的那一块 ---------- */
let lib = fs.readFileSync(libFile, "utf8");
const before = lib.length;
lib = lib.replace(/export\{[^}]*\};?\s*$/, "");
if (/\bexport\b/.test(lib.replace(/\/\/[^\n]*/g, ""))) {
  console.error("FAIL：产物仍含 export 语句（构建配置变了？）");
  process.exit(1);
}
const wrapped = "(function(){\n" + lib + "\n})();";
try {
  new vm.Script(wrapped, { filename: path.basename(libFile) });
} catch (e) {
  console.error("FAIL：内联脚本语法错误：" + e.message);
  process.exit(1);
}
const block = "\n" + MARK + "\n" + wrapped + "\n</script>\n";

/* ---------- 4. 替换（--check 只比对） ---------- */
let html = fs.readFileSync(pageFile, "utf8");
const re = /\n?<script id="chem-input-lib">[\s\S]*?<\/script>\n?/;
const m = re.exec(html);
if (!m) {
  console.error("FAIL：页面里没有 <script id=\"chem-input-lib\">，无法内联");
  process.exit(1);
}
const same = m[0] === block;
console.log("页面      ：" + pageFile);
console.log("库产物    ：" + libFile + "（" + before + " B）");
console.log("内联块    ：" + Buffer.byteLength(block) + " B");
console.log("是否一致  ：" + (same ? "是（无需改动）" : "否"));

if (CHECK_ONLY) process.exit(same ? 0 : 1);
if (same) process.exit(0);
if (DRY) { console.log("（--dry：不写盘）"); process.exit(0); }

/* ⭐ 必须用「函数」当替换值，不能直接传字符串：
   String.replace 会把替换串里的 $1 / $& / $' 当成捕获组展开，
   而 chem-input 的压缩产物里就有 `'^{$1}'` 这种代码 —— 直接传字符串会把整块旧库
   反复插进新块里（真踩过：页面瞬间膨胀到 5.5 MB、script 变成 6 个、语法直接坏掉）。 */
html = html.replace(re, () => block);
fs.writeFileSync(pageFile, html, "utf8");
console.log("已内联：" + pageFile + " → " + Buffer.byteLength(html) + " B");
