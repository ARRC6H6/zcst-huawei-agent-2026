/* 内联脚本语法自检：把单文件 HTML 里的 <script> 逐个取出来做语法解析（不执行）。
 *
 *   node tools/check-syntax.mjs [实验助手.html]
 *
 * 用途：改完那个 1 MB 单文件页面后，先用最快的方式确认没有语法错误，
 * 再跑完整的三套静态/端到端校验。
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(here, "..");

function findAppHtml(dir) {
  const hit = fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".html") && f.startsWith("实验助手"))
    .sort()[0];
  return hit ? path.join(dir, hit) : null;
}

const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const file = arg ? path.resolve(arg) : findAppHtml(projectDir);
if (!file || !fs.existsSync(file)) {
  console.error("找不到要校验的 HTML");
  process.exit(2);
}

const html = fs.readFileSync(file, "utf8");
const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let m;
let index = 0;
let failed = 0;
let totalBytes = 0;

while ((m = re.exec(html)) !== null) {
  const attrs = m[1] || "";
  const code = m[2];
  index += 1;
  if (/\bsrc\s*=/.test(attrs)) {
    console.log("  SKIP 第 " + index + " 个 script（外链，零外链约定下不应该出现）");
    continue;
  }
  const typeMatch = attrs.match(/type\s*=\s*["']([^"']+)["']/);
  const type = typeMatch ? typeMatch[1] : "text/javascript";
  const lang = attrs.match(/lang\s*=\s*["']([^"']+)["']/);
  if (lang || !/javascript|module/i.test(type)) {
    console.log("  SKIP 第 " + index + " 个 script（type=" + type + "）");
    continue;
  }
  totalBytes += Buffer.byteLength(code);
  try {
    new vm.Script(code, { filename: path.basename(file) + "#script" + index });
    console.log("  OK   第 " + index + " 个 script 语法正确（" + Buffer.byteLength(code) + " B）");
  } catch (err) {
    failed += 1;
    console.log("  FAIL 第 " + index + " 个 script 语法错误：" + err.message);
  }
}

console.log("\n共 " + index + " 个 script，内联解析 " + totalBytes + " B，失败 " + failed);
process.exit(failed === 0 ? 0 : 1);
