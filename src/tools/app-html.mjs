/* 单文件页面的定位（构建脚本与校验脚本共用）
 *
 * 文件名改过几轮：`原型.html` → 更早的 `实验助手v0.1beta.html` / `实验助手.html`。
 * 解析顺序：显式候选名 → 工程根目录里**最新的**「实验助手*.html / 原型*.html」。
 * 这样以后再改名，只需要改这一个文件（或什么都不改，靠 mtime 兜底）。
 */
import fs from "node:fs";
import path from "node:path";

/** 单文件页面的候选名（按优先级） */
export const APP_HTML_NAMES = [
  "原型.html",
  "实验助手.html",
  "实验助手v0.2beta.html",
  "实验助手v0.1beta.html",
  "index.html",
];

/** 在 dir 里找单文件页面；找不到时抛错（调用方自己决定怎么提示） */
export function findAppHtml(dir) {
  for (const name of APP_HTML_NAMES) {
    const p = path.join(dir, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  const hits = fs.readdirSync(dir)
    .filter((f) => /\.html$/i.test(f) && (f.startsWith("实验助手") || f.startsWith("原型")))
    .map((f) => ({ f: f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (hits.length) return path.join(dir, hits[0].f);
  throw new Error("没有在 " + dir + " 找到单文件页面（原型.html / 实验助手*.html）");
}

/** 同上，但找不到时返回 null（给「可选项」场景用） */
export function findAppHtmlOrNull(dir) {
  try { return findAppHtml(dir); } catch (e) { return null; }
}
