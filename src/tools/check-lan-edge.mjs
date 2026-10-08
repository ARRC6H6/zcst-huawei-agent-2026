import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findAppHtml } from "./app-html.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const rustBin = process.env.LAN_SERVER_BIN ||
  path.join(root, "src-tauri", "target", "release", process.platform === "win32" ? "lan-server.exe" : "lan-server");
const serverPy = path.join(root, "lan-server.py");
const PY = process.env.LAN_PY || (process.platform === "win32" ? "python" : "python3");
/* 与 check-lan.mjs 同一套降级：本仓库只放 Web 作品（没有 src-tauri）时，
   自动改用同目录的 lan-server.py —— 两者 1:1 对齐同一套契约，断言照样算数。 */
const serverKind = process.env.LAN_SERVER_KIND ||
  (!process.env.LAN_SERVER_BIN && !fs.existsSync(rustBin) && fs.existsSync(serverPy) ? "python" : "rust");
const bin = serverKind === "python" ? PY : rustBin;
if (serverKind === "python") {
  console.log("提示：没找到 Rust CLI（" + rustBin + "），改用同目录的 lan-server.py 跑同一套契约校验");
}
const html = path.resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) || findAppHtml(root));
const data = path.join(root, "src-tauri", ".lan-check", "edge-" + Date.now().toString(36));
fs.mkdirSync(data, { recursive: true });

function serverArgs() {
  return serverKind === "python"
    ? [serverPy, "--port", "0", "--data", data, "--file", html, "--chunk-mb", "1", "--quiet"]
    : ["--port", "0", "--data", data, "--file", html, "--chunk-mb", "1", "--quiet"];
}

function startServer() {
  const child = spawn(bin, serverArgs(),
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  started.push(child);
  return new Promise((resolve, reject) => {
    let out = "";
    const on = (b) => {
      out += b.toString();
      const m = out.match(/LAN_SERVER_READY port=(\d+)/);
      if (m) resolve({ child, port: Number(m[1]) });
    };
    child.stdout.on("data", on);
    child.stderr.on("data", on);
    child.on("error", reject);
    setTimeout(() => reject(new Error("启动超时: " + out)), 20000);
  });
}

/** 原始 socket 请求，可精确控制头部（用于缺 Content-Length 等边界）
 *
 *  ⚠️ 不能用「等 FIN(close) 事件」来收 body：`_err()` 在存在 Content-Length 时会主动
 *  `close_connection`，响应头与 body 可能落在两个 TCP 段里 —— FIN 先到就会读到空 body（假失败）。
 *  所以这里按 HTTP/1.1 语义收：**先收满响应头，再按 Content-Length 收满 body**（无长度则等 close）。
 *
 *  opts.dribble：把请求头与请求体分开、请求体按 8KB **分块慢慢写**。
 *  大体积请求体必须用它 —— 一次性 s.write(600KB) 会把数据塞进客户端发送缓冲，
 *  而服务端「不读请求体就 _err + close」在 Windows 上会发 **RST**，把还没被读走的响应体一起丢掉
 *  （症状：只拿到 400 头、body 是空的，且 error=ECONNRESET）。分块写就不会触发。 */
function raw(port, text, timeoutMs = 5000, opts = {}) {
  const hdrEnd = opts.dribble ? text.indexOf("\r\n\r\n") : -1;
  const head = hdrEnd >= 0 ? text.slice(0, hdrEnd + 4) : text;
  const payload = hdrEnd >= 0 ? text.slice(hdrEnd + 4) : "";
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1", () => {
      if (!opts.dribble) { s.write(text); return; }
      s.write(head);
      let sent = 0;
      const tick = setInterval(() => {
        if (sent >= payload.length || s.destroyed) { clearInterval(tick); return; }
        try { s.write(payload.slice(sent, sent + 8192)); } catch (e) { clearInterval(tick); return; }
        sent += 8192;
      }, 5);
    });
    let buf = Buffer.alloc(0);
    let settled = false;
    const finish = (extra) => {
      if (settled) return;
      settled = true;
      const i = buf.indexOf("\r\n\r\n");
      resolve(Object.assign({
        head: i >= 0 ? buf.slice(0, i).toString("latin1") : "",
        body: i >= 0 ? buf.slice(i + 4).toString("utf8") : buf.toString("utf8"),
        total: buf.length,
      }, extra || {}));
      s.destroy();
    };
    const enough = () => {
      const i = buf.indexOf("\r\n\r\n");
      if (i < 0) return false;
      const m = /\r\ncontent-length:\s*(\d+)/i.exec(buf.slice(0, i).toString("latin1"));
      if (!m) return false;                    // 没有 Content-Length：只能等 close
      return buf.length >= i + 4 + Number(m[1]);
    };
    s.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      if (enough()) finish();
    });
    s.on("close", () => finish());
    s.on("error", (e) => finish({ err: e.code }));
    s.setTimeout(timeoutMs, () => finish({ timeout: true }));
  });
}

/** 把「响应文本」拆成 {head, body}（用于解析 100 Continue 之后的最终响应） */
function rawSplit(text) {
  const i = text.indexOf("\r\n\r\n");
  if (i < 0) return { head: "", body: text };
  return { head: text.slice(0, i), body: text.slice(i + 4) };
}

const results = [];
const started = [];
const skips = [];
const check = (name, cond, extra = "") => {
  results.push(!!cond);
  console.log((cond ? "  OK   " : "  FAIL ") + name + (cond || !extra ? "" : "  → " + extra));
};
/** 少数断言锁的是 **Rust 端刻意比 Python 更严** 的行为（README §7 逐条记录了差异）。
 *  跑 Python 降级时这几条按实现应跳过，而不是误报失败；返回 true 表示已跳过。 */
function skipIfPython(name) {
  if (serverKind !== "python") return false;
  skips.push(name);
  console.log("  SKIP " + name + "（Python 服务端无此行为，见 README §7）");
  return true;
}

/** 杀掉所有本脚本启动的服务端进程，并清理数据目录 */
function cleanup() {
  for (const c of started) {
    try { c.kill(); } catch {}
  }
  try { fs.rmSync(data, { recursive: true, force: true }); } catch {}
}

(async () => {
  const { child, port } = await startServer();
  const base = "http://127.0.0.1:" + port;
  try {
    /* 1. 边界：chunk 缺 Content-Length → 411「缺少 Content-Length」并关连接
       （刻意比 Python 更严：Python 会当成 0 字节分片写下去，从而静默产出残缺文件）
       ⚠️ 这是 **Rust 专属**行为（README §7 已逐条记录差异），跑 Python 降级时应跳过而不是判失败。 */
    const init = await (await fetch(base + "/api/upload/init", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "edge.bin", size: 10, lastModified: 5 }),
    })).json();
    const noCl = await raw(port,
      `POST /api/upload/chunk?id=${init.id}&index=0 HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
    skipIfPython("chunk 缺 Content-Length → 411（Rust 比 Python 更严，避免写出 0 字节分片）") ||
      check("chunk 缺 Content-Length → 411（比 Python 更严，避免写出 0 字节分片）",
        /HTTP\/1\.1 411/.test(noCl.head) && /缺少 Content-Length/.test(noCl.body),
        (noCl.head.split("\r\n")[0] || noCl.err || "no response") + " | " + noCl.body.slice(0, 80));

    /* 2. chunk 超大 → 413 */
    const big = await fetch(`${base}/api/upload/chunk?id=${init.id}&index=0`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.alloc(1024 * 1024 + 2048, 1),
    });
    check("chunk 超过 chunkSize+1024 → 413", big.status === 413, String(big.status));

    /* 3. chunk 序号越界 → 400 */
    const oob = await fetch(`${base}/api/upload/chunk?id=${init.id}&index=99`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: Buffer.alloc(4),
    });
    check("chunk 序号越界 → 400", oob.status === 400, String(oob.status));

    /* 4. 非法 JSON → 400 */
    const badJson = await fetch(base + "/api/upload/init", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json",
    });
    check("init 非法 JSON → 400 且带中文错误", badJson.status === 400 && !!(await badJson.json()).error);

    /* 5. size 非数字 → 400 */
    const badSize = await fetch(base + "/api/upload/init", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x.bin", size: "abc", lastModified: 1 }),
    });
    check("init size 非数字 → 400", badSize.status === 400, String(badSize.status));

    /* 6. 空 JSON 体 → 与 Python 一致：按默认值处理（name 为空 → 未命名文件） */
    const emptyJson = await fetch(base + "/api/upload/init", {
      method: "POST", headers: { "Content-Type": "application/json" },
    });
    const ej = await emptyJson.json();
    check("init 空体 → 按默认值（name=未命名文件, id 合法）",
      emptyJson.status === 200 && ej.name === "未命名文件" && /^[0-9a-f]{16}$/.test(ej.id || ""),
      JSON.stringify(ej).slice(0, 120));

    /* 7. clip 空体 → ok，text 为空 */
    const emptyClip = await fetch(base + "/api/clip", { method: "POST" });
    const ec = await emptyClip.json();
    check("clip 空体 → ok 且 text 为空", emptyClip.status === 200 && ec.ok === true && ec.length === 0,
      JSON.stringify(ec));

    /* 8. clip 非法 JSON → 400 */
    const badClip = await fetch(base + "/api/clip", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "[[[",
    });
    check("clip 非法 JSON → 400", badClip.status === 400, String(badClip.status));

    /* 8.1 超过 512KB 的 JSON 体 → 与 Python 一致 400，且连接必须关掉（不能把残留体当下一请求） */
    const hugeBody = JSON.stringify({ text: "汉".repeat(200000) }); // ≈600KB > 512KB
    const hugeResp = await raw(port,
      `POST /api/clip HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n` +
      `Content-Length: ${Buffer.byteLength(hugeBody)}\r\nConnection: keep-alive\r\n\r\n${hugeBody}`,
      8000, { dribble: true });
    check("超 512KB 的 clip 体 → 400「请求体不是合法 JSON」（与 Python 一致）",
      /HTTP\/1\.1 400/.test(hugeResp.head) && /请求体不是合法 JSON/.test(hugeResp.body),
      hugeResp.head.split("\r\n")[0] + " | " + hugeResp.body.slice(0, 80));
    /* 显式声明 Connection: close 是 Rust 端为防止 keep-alive 串包额外加的；Python 靠 close_connection 兜底 */
    skipIfPython("超限请求体不会留下脏连接（响应带 Connection: close）") ||
      check("超限请求体不会留下脏连接（响应带 Connection: close）",
        /connection:\s*close/i.test(hugeResp.head), (hugeResp.head.match(/connection:\s*\S+/i) || ["(无)"])[0]);
    // 之后服务端仍能正常服务
    const stillOk = await fetch(base + "/api/files");
    check("超限请求之后服务端仍正常响应", stillOk.status === 200, String(stillOk.status));

    /* 8.2 size/lastModified 的 Python int() 语义 */
    const cases = [
      ["3.0", 400, "浮点字符串"], ["1e3", 400, "科学计数法"], [" ", 400, "纯空白"],
      ["7", 200, "整数字符串"], [3.0, 200, "JSON 浮点"], [true, 200, "布尔"],
      [[], 200, "空数组"], [[1], 400, "非空数组"],
    ];
    for (const [value, want, label] of cases) {
      const r = await fetch(base + "/api/upload/init", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "t.bin", size: value, lastModified: 1 }),
      });
      check(`init size=${JSON.stringify(value)}（${label}）→ ${want}`, r.status === want, String(r.status));
    }
    const numName = await (await fetch(base + "/api/upload/init", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: 123, size: 1, lastModified: 1 }),
    })).json();
    check("init name 非字符串时按 Python str() 处理（123 → \"123\"）", numName.name === "123", numName.name);

    /* 8.3 百分号编码路径不应被当成已知接口（与 Python 一致 404） */
    const enc = await fetch(base + "/api/%66iles");
    check("GET /api/%66iles → 404（Python 用原始路径匹配）", enc.status === 404, String(enc.status));
    const encPage = await fetch(base + "/" + encodeURIComponent("实验助手.html"));
    check("编码后的页面别名仍可访问", encPage.status === 200, String(encPage.status));

    /* 8.4 favicon 只应有一个 Content-Type */
    const fav = await raw(port, "GET /favicon.ico HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
    const ctCount = (fav.head.match(/content-type:/gi) || []).length;
    check("favicon.ico 只返回一个 Content-Type", /HTTP\/1\.1 204/.test(fav.head) && ctCount === 1, `count=${ctCount}`);

    /* 8.5 Expect: 100-continue → 必须先回 100 Continue，再处理请求 */
    const body100 = JSON.stringify({ name: "expect.bin", size: 5, lastModified: 2 });
    const exp = await raw(port,
      `POST /api/upload/init HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n` +
      `Content-Length: ${Buffer.byteLength(body100)}\r\nExpect: 100-continue\r\nConnection: close\r\n\r\n${body100}`);
    // raw() 只把第一段头解析到 head，100 Continue 之后的最终响应落在 body 里
    const expFinal = rawSplit(exp.body);
    /* 主动回 100 Continue 是 Rust 端显式实现的（Python 的 BaseHTTPRequestHandler 自动回）*/
    skipIfPython("Expect: 100-continue → 先回 100 再回最终响应（curl 传大文件不会空等）") ||
      check("Expect: 100-continue → 先回 100 再回最终响应（curl 传大文件不会空等）",
        /^HTTP\/1\.1 100 Continue/.test(exp.head) && /HTTP\/1\.1 200 OK/.test(expFinal.head) &&
        /"ok":true/.test(expFinal.body),
        `interim=${exp.head.split("\r\n")[0]} final=${expFinal.head.split("\r\n")[0] || expFinal.body.slice(0, 40)}`);

    // 场景 A：分片传一半 + 不调 complete → 服务重启 → 用磁盘分片兜底合并
    const payload = Buffer.alloc(1024 * 1024 * 2 + 3, 6);
    const ja = await (await fetch(base + "/api/upload/init", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "restart.bin", size: payload.length, lastModified: 9 }),
    })).json();
    for (let i = 0; i < ja.totalChunks; i++) {
      await fetch(`${base}/api/upload/chunk?id=${ja.id}&index=${i}`, {
        method: "POST", headers: { "Content-Type": "application/octet-stream" },
        body: payload.subarray(i * ja.chunkSize, Math.min(payload.length, (i + 1) * ja.chunkSize)),
      });
    }
    console.log("  [diag] 分片已落盘:", fs.readdirSync(path.join(data, ".chunks", ja.id)).join(","));

    child.kill();
    await new Promise((r) => setTimeout(r, 800));
    const second = await startServer();
    const complete = await fetch(`http://127.0.0.1:${second.port}/api/upload/complete`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ja.id }),
    });
    const cj = await complete.json();
    check("会话丢失（服务重启）后 complete 用磁盘分片兜底成功",
      complete.status === 200 && cj.ok === true && cj.size === payload.length, JSON.stringify(cj).slice(0, 160));

    const dl = Buffer.from(await (await fetch(`http://127.0.0.1:${second.port}/api/download?id=${ja.id}`)).arrayBuffer());
    check("重启兜底合并后的文件内容正确", dl.length === payload.length && dl.equals(payload), `${dl.length} vs ${payload.length}`);

    // 场景 B：同一台服务端上「已完成 + 分片目录已清理」再调 complete → 409（与 Python 一致）
    const again = await fetch(`http://127.0.0.1:${second.port}/api/upload/complete`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ja.id }),
    });
    check("已完成且分片已清理时再调 complete → 409（与 Python 一致）", again.status === 409, String(again.status));

    // 诊断：第一台服务端刚落盘时 files.json 里有什么
    const idxAfterComplete = JSON.parse(fs.readFileSync(path.join(data, "files.json"), "utf8"));
    const uploadsNow = fs.readdirSync(path.join(data, "uploads"));
    check("第一台服务端 complete 后索引已含该文件",
      Object.keys(idxAfterComplete).includes(ja.id) && uploadsNow.includes(ja.id),
      `idx=${Object.keys(idxAfterComplete).join(",")} uploads=${uploadsNow.join(",")}`);

    /* 10. 再起一台新服务端：验证重启后索引确实从 files.json 恢复
       （注意：second 是在合并之前启动的，它内存里的索引本来就不该有这条，
        所以必须在「合并落盘之后」启动的新实例上验证。） */
    const third = await startServer();
    const files3 = await (await fetch(`http://127.0.0.1:${third.port}/api/files`)).json();
    // 名称此时是 id：因为合并发生在 second 启动之后，second 内存里没有该 id 的名字，
    // 走的是「会话丢失兜底」分支，与 Python 蓝本行为一致。
    check("重启后索引从 files.json 恢复（该 id 与其 size 可读回）",
      files3.files.some((f) => f.id === ja.id && f.size === payload.length),
      JSON.stringify(files3.files.map((f) => f.name + ":" + f.id + ":" + f.size)));

    /* 10.1 会话丢失 + 索引里没有名字可查 → 合并后名字退化为 id（与 Python 蓝本一致） */
    const payloadB = Buffer.alloc(1024, 3);
    const jb = await (await fetch(`http://127.0.0.1:${third.port}/api/upload/init`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "无名.bin", size: payloadB.length, lastModified: 11 }),
    })).json();
    await fetch(`http://127.0.0.1:${third.port}/api/upload/chunk?id=${jb.id}&index=0`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: payloadB,
    });
    third.child.kill();
    await new Promise((r) => setTimeout(r, 700));
    const fifth = await startServer();
    const cb = await (await fetch(`http://127.0.0.1:${fifth.port}/api/upload/complete`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: jb.id }),
    })).json();
    check("会话丢失且索引无记录时兜底合并，名字退化为 id（与 Python 一致）",
      cb.ok === true && cb.name === jb.id, JSON.stringify(cb));
    fifth.child.kill();
    await new Promise((r) => setTimeout(r, 500));

    /* 11. 索引指向不存在的文件 → 启动时丢弃（与 Python 一致） */
    const phantom = "0123456789abcdef";
    const idxPath = path.join(data, "files.json");
    const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
    idx[phantom] = { name: "幽灵.bin", size: 1, time: 1 };
    fs.writeFileSync(idxPath, JSON.stringify(idx));
    third.child.kill();
    await new Promise((r) => setTimeout(r, 600));
    const fourth = await startServer();
    const files4 = await (await fetch(`http://127.0.0.1:${fourth.port}/api/files`)).json();
    check("索引里的幽灵文件（磁盘不存在）启动时被丢弃",
      !files4.files.some((f) => f.id === phantom) && files4.files.some((f) => f.id === ja.id),
      JSON.stringify(files4.files.map((f) => f.id)));
    const ghost = await fetch(`http://127.0.0.1:${fourth.port}/api/download?id=${phantom}`);
    check("幽灵文件下载返回 404", ghost.status === 404, String(ghost.status));
    fourth.child.kill();

    /* 12. 中文/emoji 文件名往返 */
    const name4 = "实验·图谱 🧪 (1).bin";
    const p4 = Buffer.from("hello-中文");
    const i4 = await (await fetch(`http://127.0.0.1:${second.port}/api/upload/init`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name4, size: p4.length, lastModified: 7 }),
    })).json();
    await fetch(`http://127.0.0.1:${second.port}/api/upload/chunk?id=${i4.id}&index=0`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: p4,
    });
    await fetch(`http://127.0.0.1:${second.port}/api/upload/complete`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: i4.id }),
    });
    const f4 = await (await fetch(`http://127.0.0.1:${second.port}/api/files`)).json();
    const hit4 = f4.files.find((f) => f.id === i4.id);
    check("中文 + emoji 文件名原样保留", !!hit4 && hit4.name === name4, hit4 && hit4.name);
    const dl4 = await fetch(`http://127.0.0.1:${second.port}/api/download?id=${i4.id}`);
    const cd4 = dl4.headers.get("content-disposition") || "";
    check("下载头带 UTF-8 编码原名与 ASCII 兜底", /UTF-8''/.test(cd4) && /filename="/.test(cd4) && /attachment/.test(cd4), cd4);
    second.child.kill();

    const pass = results.filter(Boolean).length;
    console.log(`\n边界用例：服务端 ${serverKind}　共 ${results.length} 项，通过 ${pass}，失败 ${results.length - pass}` +
      (skips.length ? `，跳过 ${skips.length}（Rust 专属行为）` : ""));
    cleanup();
    process.exit(pass === results.length ? 0 : 1);
  } finally {
    cleanup();
  }
})().catch((e) => {
  console.error("异常：", e.message);
  cleanup();
  process.exit(1);
});
