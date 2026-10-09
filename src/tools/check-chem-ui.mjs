/* 实验助手 · 离子电荷输入的真浏览器自检（shadow DOM + React + KaTeX + 页面数据链路）
 *
 *   node tools/check-chem-ui.mjs [原型.html]
 *
 * 为什么还要单独一个：check-ion.mjs 验的是「纯函数 + 渲染结构」，用的是 Node 里跑的内联库；
 * 而「点一下 ＋ 到底有没有把 ^3+ 插进文本框、有没有通过 chem-change 写回实验数据」
 * 只有真的在浏览器里、真的点那个按钮才能验 —— 它跨了 shadow DOM（组件内部）、
 * React 合成事件、自定义元素属性、页面 state 四层。
 *
 * 视口用同源 iframe 造 360×740：headless 窗口有 ~504px 最小宽度，
 * 直接 --window-size=360 拿不到真手机视口；同时顺便验「手机上这个输入条放得下」。
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findAppHtmlOrNull } from "./app-html.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.join(here, "..");
const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const pageFile = arg ? path.resolve(arg) : findAppHtmlOrNull(projectDir);
if (!pageFile || !fs.existsSync(pageFile)) {
  console.error("找不到要校验的 HTML（原型.html / 实验助手*.html / index.html）");
  process.exit(2);
}
const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];
const browser = BROWSERS.find((p) => fs.existsSync(p));
if (!browser) { console.error("找不到 Edge/Chrome，无法做真浏览器自检"); process.exit(2); }

const VIEW = [360, 740];

/* ---------------- 注入 iframe 内部的探针（异步：要等 React / KaTeX 渲染完） ---------------- */
const childProbe = function () {
  const R = { steps: [] };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (name, ok, extra) => R.steps.push({ name: name, ok: !!ok, extra: extra == null ? "" : String(extra) });

  /** 受控组件要改值只能走原生 setter + input 事件（直接 el.value= 不会触发 React onChange） */
  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  /** 取某个 <span> 内部的纯文本（按 span 配对计数；KaTeX 上标外套了好几层 vlist） */
  function spanInnerText(scope, afterOpenTag) {
    let depth = 1, i = afterOpenTag, text = "";
    const tagRe = /<(\/?)\s*([a-zA-Z][\w-]*)[^>]*>/g;
    tagRe.lastIndex = i;
    let mm;
    while ((mm = tagRe.exec(scope)) !== null) {
      text += scope.slice(i, mm.index);
      if (mm[2].toLowerCase() === "span") {
        if (mm[1] === "/") { depth -= 1; if (depth === 0) return text; }
        else depth += 1;
      }
      i = tagRe.lastIndex;
    }
    return text;
  }
  /** 渲染结果里所有上标的文本（用来确认「右上角带正负号」） */
  function supTexts(htmlOut) {
    const marker = htmlOut.indexOf('class="katex-html"');
    const gt = marker < 0 ? -1 : htmlOut.indexOf(">", marker);
    const scope = gt >= 0 ? htmlOut.slice(gt + 1) : "";
    const out = [];
    let idx = 0;
    const MSUP = 'class="msupsub">';
    while (true) {
      const i = scope.indexOf(MSUP, idx);
      if (i < 0) break;
      out.push(spanInnerText(scope, i + MSUP.length).replace(/[\u200b\u2061\u2062]/g, "").trim());
      idx = i + MSUP.length;
    }
    return out;
  }

  R.run = async function () {
    try {
      const e = newExp("离子输入自检", "chemistry");
      /* ⭐ 先塞一条「难」方程：带 ↑ 气体记号 + 多个 + 分隔符 + 电荷。
         它曾经被电荷归一化正则吃成 `5Cl2 ^{+} 8H2O` → parseFormula 抛异常 →
         React 渲染失败 → 整个 shadow root 变成空 <div>（输入框整块消失）。 */
      e.steps[0].equation = "2KMnO4 + 16HCl -> 2KCl + 2MnCl2 + 5Cl2 ^ + 8H2O";
      Store.saveExp(e);
      state.exp = e;
      goTo("edit", e.id);
      /* React 首帧 + KaTeX 渲染是异步的：轮询等离子条出现，最多 4 秒 */
      let host = null, sr = null, bar = null;
      for (let i = 0; i < 80; i++) {
        host = document.querySelector('chem-input[data-field="equation"]');
        sr = host && host.shadowRoot;
        bar = sr && sr.querySelector(".chem-ion-bar");
        if (bar) break;
        await sleep(50);
      }
      log("编辑页里出现了 chem-input 且带 shadow root", !!host && !!sr);
      if (!bar) {
        log("离子电荷输入条渲染出来了", false, "等 4 秒也没出现（组件崩了？shadow 长度=" +
          (sr ? sr.innerHTML.length : -1) + "）");
        return;
      }
      log("离子电荷输入条渲染出来了", true);
      /* 组件**整体**渲染出来了（不是空壳）：有工具条 / 编辑器 / 预览，且配平判到了 */
      log("组件整体渲染（不是空 shadow root）",
        sr.innerHTML.length > 2000 && !!sr.querySelector(".chem-root") &&
        !!sr.querySelector(".chem-condition-bar") && !!sr.querySelector(".chem-textarea"),
        "shadow 长度=" + sr.innerHTML.length);
      const badge = sr.querySelector(".chem-status-badge");
      log("带 ↑ 记号的方程式能解析并判为已配平（电荷正则没吃分隔符）",
        !!badge && badge.textContent.indexOf("已配平") >= 0,
        badge ? JSON.stringify(badge.textContent) : "(无徽标)");
      log("预览框里真的渲染出了 KaTeX 公式", !!sr.querySelector(".chem-preview .katex"));

      const num = sr.querySelector(".chem-ion-num");
      const plus = sr.querySelector(".chem-ion-btn-plus");
      const minus = sr.querySelector(".chem-ion-btn-minus");
      log("有数字框 + ＋ / － 两个按钮", !!num && !!plus && !!minus);
      log("默认电荷数是 1（±1 时省略数字）", num && String(num.value) === "1", num && num.value);
      log("输入框限了 1~9 的范围", num && Number(num.min) === 1 && Number(num.max) === 9,
        num && num.min + "~" + num.max);

      /* 预览：两个按钮里各有一份真 KaTeX 渲染 */
      const previews = sr.querySelectorAll(".chem-ion-preview .katex");
      log("两个按钮内的预览都真的渲染了 KaTeX（各一份）", previews.length >= 2, "份数=" + previews.length);
      const pvSups = previews.length ? supTexts(previews[0].outerHTML) : [];
      log("预览里的电荷在右上角上标里且带 + 号", pvSups.some((t) => t.indexOf("+") >= 0),
        JSON.stringify(pvSups));

      /* 手机上放得下：输入条的宽度不超过组件宽度 */
      const hostW = host.getBoundingClientRect().width;
      const barW = bar.getBoundingClientRect().width;
      log("手机宽度下离子条没有撑破组件", barW <= hostW + 1, "bar=" + Math.round(barW) + " host=" + Math.round(hostW));

      /* ⭐ 真点：先写 Fe，把电荷设成 3，点 ＋ → 文本框应当是 Fe^3+，并且写回实验数据 */
      const ta = sr.querySelector(".chem-textarea");
      setNativeValue(ta, "Fe");
      await sleep(40);
      ta.focus();
      ta.selectionStart = 2; ta.selectionEnd = 2;
      setNativeValue(num, "3");
      await sleep(40);
      plus.click();
      await sleep(160);
      R.afterPlus = { value: host.value, equation: state.exp.steps[0].equation, raw: ta.value };
      log("点 ＋ 后文本框变成 Fe^3+", host.value === "Fe^3+", JSON.stringify(host.value));
      log("chem-change 真的写回了实验数据（step.equation）", state.exp.steps[0].equation === "Fe^3+",
        JSON.stringify(state.exp.steps[0].equation));
      const pv = sr.querySelector(".chem-preview");
      const pvSups2 = pv ? supTexts(pv.innerHTML) : [];
      log("主预览里 Fe^3+ 渲染成右上角带正负号的电荷", pvSups2.some((t) => t.startsWith("3+")),
        JSON.stringify(pvSups2));

      /* 再来一个负电荷：SO4 + 2 价 → SO4^2- */
      setNativeValue(ta, "SO4");
      await sleep(40);
      ta.focus();
      ta.selectionStart = 3; ta.selectionEnd = 3;
      setNativeValue(num, "2");
      await sleep(40);
      minus.click();
      await sleep(160);
      R.afterMinus = { value: host.value, equation: state.exp.steps[0].equation };
      log("点 － 后文本框变成 SO4^2-", host.value === "SO4^2-", JSON.stringify(host.value));
      log("SO4^2- 也写回了实验数据", state.exp.steps[0].equation === "SO4^2-",
        JSON.stringify(state.exp.steps[0].equation));
      const pvSups3 = sr.querySelector(".chem-preview") ? supTexts(sr.querySelector(".chem-preview").innerHTML) : [];
      log("主预览里 SO4^2- 的上标带 − 号", pvSups3.some((t) => t.indexOf("2") === 0 && /[\u2212-]/.test(t)),
        JSON.stringify(pvSups3));

      /* 电荷数超范围会被夹到 9 */
      setNativeValue(num, "99");
      await sleep(40);
      R.clamped = num.value;
      log("电荷数超范围夹到 9", String(num.value) === "9", String(num.value));
    } catch (err) {
      R.error = String((err && err.stack) || err);
    }
    const box = document.createElement("div");
    box.id = "PROBE-OUT";
    box.textContent = JSON.stringify(R);
    document.body.appendChild(box);
  };
  R.run();
};

/* 探针页与 iframe 都用「相对服务根(projectDir)的路径」——只给 basename 会 404，
   表现是浏览器里只有一个 not found，探针一跑就 newExp is not defined。 */
const pageRel = path.relative(projectDir, pageFile).split(path.sep).join("/");
const parentHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>chem-ui-check</title>
<style>html,body{margin:0;padding:0}iframe{border:0;display:block}</style></head><body>
<script>
(function () {
  const R = { size: ${JSON.stringify(VIEW.join("x"))} };
  const f = document.createElement("iframe");
  f.width = ${VIEW[0]}; f.height = ${VIEW[1]};
  f.src = ${JSON.stringify("/" + pageRel)};
  f.onload = function () {
    const doc = f.contentDocument;
    const s = doc.createElement("script");
    s.textContent = "(" + ${JSON.stringify(childProbe.toString())} + ")();";
    doc.body.appendChild(s);
    let n = 0;
    const tick = setInterval(function () {
      const box = doc.getElementById("PROBE-OUT");
      if (box) {
        clearInterval(tick);
        R.result = JSON.parse(box.textContent);
        const out = document.createElement("div");
        out.id = "UI-RESULT";
        out.textContent = "CHEMUI::" + JSON.stringify(R) + "::END";
        document.body.appendChild(out);
        f.remove();
      } else if (++n > 900) {
        clearInterval(tick);
        R.timeout = true;
        const out = document.createElement("div");
        out.id = "UI-RESULT";
        out.textContent = "CHEMUI::" + JSON.stringify(R) + "::END";
        document.body.appendChild(out);
      }
    }, 50);
  };
  document.body.appendChild(f);
})();
</script></body></html>`;

/* 临时探针页与浏览器 profile 都写进 build/（版本管理里被忽略），别脏了仓库根目录 */
const tmpDir = path.join(projectDir, "build");
fs.mkdirSync(tmpDir, { recursive: true });
const stamp = Date.now() + "-" + Math.floor(Math.random() * 1000);
const parentPath = path.join(tmpDir, "check-chem-ui-" + stamp + ".html");
fs.writeFileSync(parentPath, parentHtml, "utf8");

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const target = path.join(projectDir, urlPath);
  if (!target.startsWith(projectDir) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.writeHead(404); res.end("not found"); return;
  }
  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, { "Content-Type": ext === ".html" ? "text/html; charset=utf-8" : "application/octet-stream" });
  res.end(fs.readFileSync(target));
});
async function listenSafe(srv) {
  for (let i = 0; i < 60; i++) {
    const port = 8200 + Math.floor(Math.random() * 700);
    try {
      await new Promise((resolve, reject) => {
        const onErr = (e) => { srv.removeListener("listening", onOk); reject(e); };
        const onOk = () => { srv.removeListener("error", onErr); resolve(); };
        srv.once("error", onErr); srv.once("listening", onOk);
        srv.listen(port, "127.0.0.1");
      });
      return port;
    } catch (e) { /* 换端口 */ }
  }
  throw new Error("找不到可用端口");
}
const port = await listenSafe(server);
/* 同 check-mobile：URL 要相对服务根，只给 basename 会 404（探针页在 build/ 下） */
const url = `http://127.0.0.1:${port}/${path.relative(projectDir, parentPath).split(path.sep).join("/")}`;
const profile = path.join(projectDir, "build", "check-chem-ui-profile");
let out = "", err = "";
try {
  await new Promise((resolve, reject) => {
    const cp = spawn(browser, ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--disable-extensions", "--mute-audio", "--window-size=1000,1000", "--virtual-time-budget=30000",
      "--user-data-dir=" + profile, "--dump-dom", url], { stdio: ["ignore", "pipe", "pipe"] });
    cp.stdout.on("data", (d) => { out += d; });
    cp.stderr.on("data", (d) => { err += d; });
    cp.on("error", reject);
    cp.on("close", resolve);
  });
} finally {
  server.close();
  fs.rmSync(parentPath, { force: true });
}

const m = /CHEMUI::(\{[\s\S]*?\})::END/.exec(out);
if (!m) {
  console.error("FAIL：浏览器里没拿到结果（DOM 长度 " + out.length + "）");
  console.error(err.split("\n").slice(-10).join("\n"));
  process.exit(1);
}
const R = JSON.parse(m[1]);
console.log("页面：" + pageFile);
console.log("视口：" + R.size + "（同源 iframe 模拟手机视口）\n");
if (R.timeout) { console.error("FAIL：探针超时，没写回结果"); process.exit(1); }
const res = R.result || {};
if (res.error) console.log("探针报错：" + res.error.split("\n")[0] + "\n");

let failed = 0;
for (const s of res.steps || []) {
  if (!s.ok) failed += 1;
  console.log((s.ok ? "  OK   " : "  FAIL ") + s.name + (s.ok || !s.extra ? "" : "  → " + s.extra));
}
const total = (res.steps || []).length;
console.log("\n共 " + total + " 项，通过 " + (total - failed) + "，失败 " + failed);
process.exit(failed === 0 && total > 0 ? 0 : 1);
