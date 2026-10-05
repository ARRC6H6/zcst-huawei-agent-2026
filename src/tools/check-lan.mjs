/* 实验助手 · 局域网互传（lan-server.py）端到端校验
 *
 *   node tools/check-lan.mjs [实验助手.html]
 *
 * 真实启动 Python 服务端（零依赖），用 HTTP 请求把「初始化 → 分片 → 状态 →
 * 合并 → 列表 → 下载 → 秒传 → 断点续传 → 文本互传 → 删除 → 空文件 → 安全边界」
 * 全链路走一遍，逐项断言。
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appHtml = path.resolve(process.argv[2] || findAppHtml(path.join(here, "..")));
const serverPy = path.join(here, "..", "lan-server.py");
const PY = process.env.LAN_PY || (process.platform === "win32" ? "python" : "python3");

/** 自动识别「实验助手」单文件页面（容忍 实验助手v0.1beta.html 这类带版本号的文件名） */
function findAppHtml(dir) {
  for (const name of ["实验助手.html", "index.html"]) {
    if (fs.existsSync(path.join(dir, name))) return path.join(dir, name);
  }
  const hit = fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".html") && f.startsWith("实验助手"))
    .sort()[0];
  if (hit) return path.join(dir, hit);
  return path.join(dir, "实验助手.html");
}

const results = [];
const check = (name, cond, extra = "") => {
  results.push([!!cond, name + (extra ? "  → " + extra : "")]);
  console.log((cond ? "  OK   " : "  FAIL ") + name + (cond || !extra ? "" : "  → " + extra));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (buf) => createHash("sha256").update(Buffer.from(buf)).digest("hex");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lan-check-"));
let child = null;
let base = "";

function startServer() {
  return new Promise((resolve, reject) => {
    child = spawn(PY, [serverPy, "--port", "0", "--data", dataDir, "--file", appHtml,
      "--chunk-mb", "1", "--quiet"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => reject(new Error("服务端启动超时：" + out)), 20000);
    const onData = (buf) => {
      out += buf.toString("utf8");
      const m = out.match(/LAN_SERVER_READY port=(\d+)/);
      if (m) {
        clearTimeout(timer);
        base = "http://127.0.0.1:" + m[1];
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error("服务端退出，code=" + code + " " + out)); });
  });
}

const api = (p, opts) => fetch(base + p, opts);
const jget = async (p, opts) => (await api(p, opts)).json();

async function main() {
  await startServer();
  check("服务端启动并打印局域网地址", /^http:\/\/127\.0\.0\.1:\d+$/.test(base), base);

  /* ---- 1. 静态页与服务器信息 ---- */
  const page = await api("/");
  const pageText = await page.text();
  check("首页返回实验助手 HTML", page.status === 200 && pageText.indexOf("实验助手") >= 0);
  check("首页 CORS 允许跨域（file:// 双击打开也能连）",
    page.headers.get("access-control-allow-origin") === "*");
  const pre = await fetch(base + "/api/files", { method: "OPTIONS" });
  check("OPTIONS 预检返回 2xx", pre.status >= 200 && pre.status < 300);
  check("预检放行 DELETE / 自定义请求头",
    /DELETE/.test(pre.headers.get("access-control-allow-methods") || "") &&
    /Content-Type/i.test(pre.headers.get("access-control-allow-headers") || ""));

  const info = await jget("/api/server-info");
  check("server-info：返回端口 / IP / 分片大小",
    info.ok === true && info.port > 0 && Array.isArray(info.ips) && info.ips.length >= 1 && info.chunkSize > 0);
  check("server-info：分片大小按参数生效（1MB）", info.chunkSize === 1024 * 1024, String(info.chunkSize));

  /* ---- 2. 上传：初始化 / 分片 / 状态 / 合并 ---- */
  const payload = Buffer.alloc(1024 * 1024 * 2 + 12345);
  for (let i = 0; i < payload.length; i++) payload[i] = (i * 31 + 7) & 0xff;
  const want = sha(payload);
  const name = "实验现象·酵母RNA 图谱.bin";
  const init = await jget("/api/upload/init", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, size: payload.length, lastModified: 1730000000000 })
  });
  check("init：id 为 16 位十六进制指纹", /^[0-9a-f]{16}$/.test(init.id || ""), init.id);
  check("init：分片数按 1MB 切片", init.totalChunks === 3, String(init.totalChunks));
  check("init：首次上传无需续传", Array.isArray(init.uploaded) && init.uploaded.length === 0 && init.done === false);

  const cut = init.chunkSize;
  const parts = [payload.subarray(0, cut), payload.subarray(cut, cut * 2), payload.subarray(cut * 2)];
  const up1 = await api("/api/upload/chunk?id=" + init.id + "&index=0",
    { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: parts[0] });
  check("chunk：分片上传成功", up1.status === 200 && (await up1.json()).received === parts[0].length);

  const st = await jget("/api/upload/status?id=" + init.id);
  check("status：能查到已传分片（用于断点续传）",
    JSON.stringify(st.uploaded) === JSON.stringify([0]) && st.totalChunks === 3);

  await api("/api/upload/chunk?id=" + init.id + "&index=1",
    { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: parts[1] });
  const early0 = await api("/api/upload/complete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: init.id })
  });
  check("complete：缺片时拒绝合并（不会产出残缺文件）", early0.status === 409);
  await api("/api/upload/chunk?id=" + init.id + "&index=2",
    { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: parts[2] });
  const done = await jget("/api/upload/complete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: init.id })
  });
  check("complete：合并落盘并登记", done.ok === true && done.size === payload.length);
  const badComplete = await api("/api/upload/complete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "ffffffffffffffff" })
  });
  check("complete：未知会话给出可读错误", badComplete.status >= 400);

  /* ---- 3. 列表 / 下载 / 删除 ---- */
  const list = await jget("/api/files");
  const hit = (list.files || []).find((f) => f.id === init.id);
  check("files：列表包含新文件且保留中文原名", !!hit && hit.name === name && hit.size === payload.length);
  const dl = await api("/api/download?id=" + init.id);
  const dlBuf = Buffer.from(await dl.arrayBuffer());
  check("download：内容 sha256 与上传一致", sha(dlBuf) === want);
  check("download：带上原名与 attachment",
    /attachment/.test(dl.headers.get("content-disposition") || "") &&
    /UTF-8''/.test(dl.headers.get("content-disposition") || ""));

  /* ---- 4. 秒传与断点续传 ---- */
  const re = await jget("/api/upload/init", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, size: payload.length, lastModified: 1730000000000 })
  });
  check("秒传：同指纹文件直接标记已完成", re.id === init.id && re.done === true);

  const payload2 = Buffer.alloc(1024 * 1024 * 2 + 7, 9);
  const init2 = await jget("/api/upload/init", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "断点续传.bin", size: payload2.length, lastModified: 1730000000001 })
  });
  await api("/api/upload/chunk?id=" + init2.id + "&index=1",
    { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: payload2.subarray(cut, cut * 2) });
  const re2 = await jget("/api/upload/init", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "断点续传.bin", size: payload2.length, lastModified: 1730000000001 })
  });
  check("断点续传：init 回报已存在的分片", JSON.stringify(re2.uploaded) === JSON.stringify([1]));
  const early = await api("/api/upload/complete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: init2.id })
  });
  check("断点续传：缺片时拒绝合并", early.status === 409);
  for (const i of [0, 2]) {
    await api("/api/upload/chunk?id=" + init2.id + "&index=" + i,
      { method: "POST", headers: { "Content-Type": "application/octet-stream" },
        body: payload2.subarray(i * cut, Math.min(payload2.length, (i + 1) * cut)) });
  }
  await api("/api/upload/complete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: init2.id })
  });
  const dl2 = Buffer.from(await (await api("/api/download?id=" + init2.id)).arrayBuffer());
  check("断点续传：补齐后内容一致", sha(dl2) === sha(payload2));

  /* ---- 5. 空文件 ---- */
  const e0 = await jget("/api/upload/init", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "空文件.txt", size: 0, lastModified: 1 })
  });
  check("空文件：分片数为 0", e0.totalChunks === 0);
  const e0done = await jget("/api/upload/complete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: e0.id })
  });
  const e0dl = await (await api("/api/download?id=" + e0.id)).arrayBuffer();
  check("空文件：可正常合并与下载", e0done.ok === true && e0dl.byteLength === 0);

  /* ---- 6. 文本互传 ---- */
  const clipText = "现象：溶液由蓝变绿\n参考链接 https://example.com/实验";
  const cs = await jget("/api/clip", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: clipText })
  });
  const cg = await jget("/api/clip");
  check("文本互传：写入后读回一致（含中文与链接）", cs.ok === true && cg.text === clipText);

  /* ---- 7. 安全边界 ---- */
  const evil = await jget("/api/upload/init", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "../../../windows/evil.txt", size: 3, lastModified: 2 })
  });
  check("安全：文件名中的路径被剥离", evil.name === "evil.txt", evil.name);
  const badId = await api("/api/download?id=../../etc/passwd");
  check("安全：非法 id 被拒绝", badId.status === 400);
  const traversal = await api("/api/download?id=" + encodeURIComponent("../../../windows/win.ini"));
  check("安全：路径穿越下载被拒绝", traversal.status === 400);
  const noRoute = await api("/../../etc/passwd");
  check("安全：任意静态文件读取被拒绝", noRoute.status === 404 || noRoute.status === 400);

  const del = await jget("/api/files?id=" + init.id, { method: "DELETE" });
  const after = await jget("/api/files");
  check("删除：文件与索引同步移除",
    del.ok === true && !(after.files || []).some((f) => f.id === init.id));
  check("删除：磁盘文件也已清理", !fs.existsSync(path.join(dataDir, "uploads", init.id)));

  /* ---- 8. 落盘形态 ---- */
  const uploads = fs.readdirSync(path.join(dataDir, "uploads"));
  check("落盘：文件名只使用 id（中文原名不落盘）",
    uploads.every((f) => /^[0-9a-f]{16}$/.test(f)), uploads.join(","));
  const idx = JSON.parse(fs.readFileSync(path.join(dataDir, "files.json"), "utf8"));
  check("落盘：files.json 保留中文原名索引", Object.values(idx).some((v) => v.name === "断点续传.bin"));

  const pass = results.filter(([ok]) => ok).length;
  console.log("\n共 " + results.length + " 项，通过 " + pass + "，失败 " + (results.length - pass));
  return pass === results.length ? 0 : 1;
}

let code = 1;
try {
  code = await main();
} catch (err) {
  check("端到端执行无异常 —— " + (err && err.message), false);
  code = 1;
} finally {
  if (child) { try { child.kill(); } catch {} }
  await sleep(150);
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
}
process.exit(code);
