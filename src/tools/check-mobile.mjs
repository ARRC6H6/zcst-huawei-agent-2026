/* 实验助手 · 手机端「页面是否被裁」真浏览器自检（含溢出兜底缩放）
 *
 *   node tools/check-mobile.mjs [原型.html]
 *
 * 为什么必须在真浏览器里做：
 *   「手机上页面不兼容」的形态是**被静默裁掉**（.frame / #main 都是 overflow:hidden），
 *   不出现滚动条、DOM 里也看不出异常 —— 只有真的排版一次、量每个元素的右边界才能发现。
 *
 * 为什么用同源 iframe 造视口：
 *   headless 窗口有 ~504px 的最小宽度，--window-size=360 拿不到真手机视口；
 *   同源 iframe 里媒体查询 / 100dvh / 100vw / innerWidth 全按 iframe 尺寸算，
 *   等价于一个 360px 宽的手机视口。
 *
 * 为什么探针要注入 iframe 内部：
 *   主脚本的 Store / state / goTo 是 const，不挂 window，父页读 contentWindow.Store 是 undefined，
 *   必须把脚本 <script> 追加进 iframe 文档，才能和页面共享同一个全局作用域。
 *
 * 检查项（每个视口 × 每个页面）：
 *   1) 没有任何元素画到视口右边界之外（.bg 光斑是故意出血的装饰，排除）；
 *   2) 主滚动区 #main 没有被横向裁掉（scrollWidth <= clientWidth）；
 *   3) 响应式布局自己就够了 —— 不该出现「其实不用缩放却缩了」的误判；
 *   4) 塞进一个 520px 不可断的方块后，兜底缩放必须接管：
 *      缩到 <100%、缩完真的不溢出、且 100dvh 定高的 .frame 仍是整屏高（缩放补偿没漏）；
 *   5) 撤掉方块 → 自动回到 100%；点提示条上的「按原尺寸看」→ 也回到 100%。
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
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const browser = BROWSERS.find((p) => fs.existsSync(p));
if (!browser) {
  console.error("找不到 Edge/Chrome，无法做真浏览器自检");
  process.exit(2);
}

/* 手机视口档位：小屏安卓机 / 主流机 / 大屏机 */
const SIZES = [[320, 568], [360, 740], [412, 915]];
/* 页面（BARE 页不吃实验参数，但传了也无害） */
const VIEWS = ["home", "edit", "record", "report", "settings", "aigen", "lan"];
/* 兜底缩放用的「不可断」方块宽度：360 视口下放不下，但缩到 ~0.67 就能放下 */
const WIDE_PX = 520;

/* ---------------- 注入 iframe 内部的探针 ---------------- */
/* 注意：这段代码的字符串会被拼进 <script>，所以只能写 ES5 风格的函数 + 字符串拼接，
   （不是真的 ES5 限制，而是避免模板字符串/反引号在拼接时出错。） */
const childProbe = function (CFG) {
  const R = { views: [], fit: {} };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function desc(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    if (el.className && typeof el.className === "string") s += "." + el.className.trim().split(/\s+/).slice(0, 3).join(".");
    const t = (el.getAttribute && el.getAttribute("data-act")) || "";
    if (t) s += "[act=" + t + "]";
    return s;
  }
  function inBg(el, bg) { return !!(bg && bg.contains(el)); }

  R.snap = function (view) {
    const bg = document.querySelector(".bg");
    const main = document.getElementById("main");
    const vw = window.innerWidth;
    const out = { view: view, vw: vw, offenders: [], mainScrollW: main ? main.scrollWidth : -1,
      mainClientW: main ? main.clientWidth : -1 };
    document.querySelectorAll("body *").forEach(function (el) {
      if (inBg(el, bg)) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      if (r.right > vw + 1) {
        out.offenders.push({ d: desc(el), right: Math.round(r.right), w: Math.round(r.width) });
      }
    });
    out.offenders.sort(function (a, b) { return b.right - a.right; });
    out.offenders = out.offenders.slice(0, 5);
    try {
      out.fitScale = Number(Fit.scale.toFixed(3));
      out.dataFit = document.documentElement.hasAttribute("data-fit");
      out.fitMode = document.documentElement.hasAttribute("data-fit-tf") ? "tf" : "zoom";
      out.hintOn = !!(Fit._hint && Fit._hint.classList.contains("on"));
    } catch (e) { out.fitErr = String((e && e.message) || e); }
    return out;
  };

  R.seed = function () {
    const eqs = [
      "2KMnO4 + 16HCl -> 2KCl + 2MnCl2 + 5Cl2 ^ + 8H2O",
      "Fe^3+ + 3OH^- -> Fe(OH)3 v",
      "SO4^2- + Ba^2+ -> BaSO4 v",
    ];
    const e = newExp("移动端检查实验（长名字用来把标题行顶满看看会不会溢出去）", "chemistry");
    e.desc = "这是一段比较长的实验简介，用来观察窄屏下简介会不会把卡片撑出去，顺便看看标题的处理方式。";
    e.steps = [];
    for (let i = 0; i < 3; i++) {
      const s = normalizeStep({ id: "s_mob" + i });
      s.title = "第 " + (i + 1) + " 步：往试管里加入足量的试剂并充分振荡，观察颜色变化与沉淀生成情况";
      s.text = "取一只洁净的试管，加入约 2 mL 待测溶液，再逐滴加入试剂，边加边振荡，观察颜色变化与是否有沉淀生成。";
      s.tips = "浓盐酸具有强腐蚀性，务必在通风橱内操作并佩戴护目镜与手套。";
      s.equation = eqs[i];
      s.record.note = "溶液由无色变为浅棕色，管壁出现少量银白色沉淀，温度略有升高。";
      s.timer.mode = "countdown";
      s.timer.target = 120;
      s.timer.accumulated = 96000;
      s.timer.logs = [{ at: Date.now(), ms: 96000, step: i + 1 }];
      e.steps.push(s);
    }
    e.log.total = "整场实验进行顺利，第三步滴加速度略快导致局部过热，下次注意。";
    Store.saveExp(e);
    Store.saveReport(e.id, { markdown: buildLocalMarkdown(e), mode: "local", model: "", generatedAt: Date.now() });
    /* 首页再放两个，确保卡片网格真的有多行多列 */
    for (let i = 0; i < 2; i++) {
      const x = newExp("第 " + (i + 2) + " 个实验：碳酸钠与盐酸反应（含较长名字）", i ? "biology" : "biochem");
      x.steps[0].text = "取少量固体于试管中，滴加稀盐酸，观察气泡产生情况。";
      Store.saveExp(x);
    }
    return e.id;
  };

  R.run = async function () {
    try {
      const id = R.seed();
      for (const view of CFG.views) {
        state.exp = Store.getExp(id);
        goTo(view, id);
        await sleep(CFG.viewDelay);
        R.views.push(R.snap(view));
      }
      /* ---- 兜底缩放：塞一个不可断的方块 ---- */
      state.exp = Store.getExp(id);
      goTo("edit", id);
      await sleep(CFG.viewDelay);
      const host = document.querySelector("#main .view") || document.getElementById("main");
      const wide = document.createElement("div");
      wide.id = "force-wide";
      wide.style.cssText = "width:" + CFG.widePx + "px;height:12px;background:#f00";
      host.appendChild(wide);
      Fit.dismissed = false;
      Fit.run();
      R.fit.forced = R.snap("forced-wide");
      R.fit.forcedScale = Number(Fit.scale.toFixed(3));
      R.fit.forcedRight = Math.round(wide.getBoundingClientRect().right);
      R.fit.frameH = Math.round(document.querySelector(".frame").getBoundingClientRect().height);
      R.fit.innerH = window.innerHeight;
      R.fit.hintOn = R.fit.forced.hintOn;

      /* ---- 点「按原尺寸看」：应当回到 100% ---- */
      const btn = document.querySelector('[data-act="fit-reset"]');
      R.fit.resetBtn = !!btn;
      if (btn) btn.click();
      await sleep(60);
      R.fit.scaleAfterDismiss = Number(Fit.scale.toFixed(3));
      R.fit.dataFitAfterDismiss = document.documentElement.hasAttribute("data-fit");

      /* ---- 撤掉方块：应当自动回到 100% ---- */
      wide.remove();
      Fit.dismissed = false;
      Fit.run();
      await sleep(60);
      R.fit.afterRemove = R.snap("after-remove");

      /* ---- 再强制走 transform 那条路 ----
         Android WebView 113 上 `zoom` 算得出值却根本不缩，运行时探测会走第 ② 条；
         桌面 Blink 的 zoom 是好的，所以要验第 ② 条只能手动把探测结果按下去。 */
      const view2 = Fit.contentEl() || host;
      const wide2 = document.createElement("div");
      wide2.id = "force-wide-tf";
      wide2.style.cssText = "width:" + CFG.widePx + "px;height:12px;background:#00f";
      view2.appendChild(wide2);
      Fit.zoomWorks = false;
      Fit.dismissed = false;
      Fit.run();
      const tfSnap = R.snap("forced-tf");
      R.fit.tf = {
        mode: document.documentElement.hasAttribute("data-fit-tf") ? "tf" : "zoom",
        scale: Number(Fit.scale.toFixed(3)),
        offenders: tfSnap.offenders.length,
        who: tfSnap.offenders.map((o) => o.d + "@" + o.right),
        transform: view2.style.transform,
        computedTransform: getComputedStyle(view2).transform,
        viewRectW: Math.round(view2.getBoundingClientRect().width),
        viewOffsetW: view2.offsetWidth,
        marginBottom: view2.style.marginBottom,
        frameH: Math.round(document.querySelector(".frame").getBoundingClientRect().height),
        innerH: window.innerHeight,
      };
      wide2.remove();
      Fit.zoomWorks = null;      /* 还原探测缓存，免得影响后续用例 */
      Fit.dismissed = false;
      Fit.run();
      await sleep(60);
      R.fit.afterTf = {
        scale: Number(Fit.scale.toFixed(3)),
        dataFit: document.documentElement.hasAttribute("data-fit"),
        tfCleared: !document.documentElement.hasAttribute("data-fit-tf"),
        styleCleared: view2.style.transform === "" && view2.style.marginBottom === "",
      };
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

/* ---------------- 父页脚手架 ---------------- */
/* 探针页在 <root>/build/ 下，所以「父页 URL」和「iframe 里的页面 URL」都必须是
   **相对服务根(projectDir)的路径**，不能只给 basename（否则 404 → 浏览器里只有一个
   「not found」文本，探针一跑就 newExp is not defined）。 */
const pageRel = path.relative(projectDir, pageFile).split(path.sep).join("/");
const parentHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>mobile-check</title>
<style>html,body{margin:0;padding:0}iframe{border:0;display:block}</style></head><body>
<script>
(function () {
  const R = { sizes: {} };
  const SIZES = ${JSON.stringify(SIZES)};
  const CFG = ${JSON.stringify({ views: VIEWS, widePx: WIDE_PX, viewDelay: 420 })};
  const CHILD = ${childProbe.toString()};
  function next(i) {
    if (i >= SIZES.length) { report(); return; }
    const w = SIZES[i][0], h = SIZES[i][1], tag = w + "x" + h;
    const f = document.createElement("iframe");
    f.width = w; f.height = h;
    f.src = ${JSON.stringify("/" + pageRel)};
    f.onload = function () {
      const doc = f.contentDocument;
      const s = doc.createElement("script");
      s.textContent = "(" + CHILD + ")(" + JSON.stringify(CFG) + ");";
      doc.body.appendChild(s);
      let n = 0;
      const tick = setInterval(function () {
        const box = doc.getElementById("PROBE-OUT");
        if (box) {
          clearInterval(tick);
          try { R.sizes[tag] = JSON.parse(box.textContent); } catch (e) { R["parse-" + tag] = String(e); }
          f.remove(); next(i + 1);
        } else if (++n > 600) { clearInterval(tick); R["timeout-" + tag] = true; f.remove(); next(i + 1); }
      }, 50);
    };
    document.body.appendChild(f);
  }
  function report() {
    const out = document.createElement("div");
    out.id = "FIT-RESULT";
    out.textContent = "MOB::" + JSON.stringify(R) + "::END";
    document.body.appendChild(out);
  }
  window.addEventListener("load", function () { next(0); });
})();
</script></body></html>`;

/* ---------------- 起服务 + 跑浏览器 ---------------- */
/* 临时探针页与浏览器 profile 都写进 build/：它在版本管理里是被忽略的，
   否则在镜像仓库（src/tools/ 那套布局）里跑一次就会多出两个未跟踪文件。 */
const tmpDir = path.join(projectDir, "build");
fs.mkdirSync(tmpDir, { recursive: true });
const stamp = Date.now() + "-" + Math.floor(Math.random() * 1000);
const parentPath = path.join(tmpDir, "check-mobile-" + stamp + ".html");
fs.writeFileSync(parentPath, parentHtml, "utf8");

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const target = path.join(projectDir, urlPath);
  if (!target.startsWith(projectDir) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.writeHead(404); res.end("not found"); return;
  }
  const ext = path.extname(target).toLowerCase();
  const type = ext === ".html" ? "text/html; charset=utf-8" : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  res.end(fs.readFileSync(target));
});

/* Chrome 有一批屏蔽端口（ERR_UNSAFE_PORT，现象是 DOM 直接空），监听 0 随机到就白跑一次，
   所以在安全区间里挑一个空闲端口。 */
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
    } catch (e) { /* 换一个端口 */ }
  }
  throw new Error("找不到可用端口");
}
const port = await listenSafe(server);
/* ⚠️ URL 必须用「相对服务根(projectDir)的路径」，不能只取 basename：
   探针页现在放在 <root>/build/ 下，只给文件名会 404，浏览器里 DOM 长度就只有一百多字节。 */
const url = `http://127.0.0.1:${port}/${path.relative(projectDir, parentPath).split(path.sep).join("/")}`;

const profile = path.join(projectDir, "build", "check-mobile-profile");
const args = [
  "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--disable-sync", "--mute-audio",
  "--window-size=1000,1000", "--virtual-time-budget=40000",
  "--user-data-dir=" + profile,
  "--dump-dom", url,
];
let out = "", err = "";
try {
  await new Promise((resolve, reject) => {
    const cp = spawn(browser, args, { stdio: ["ignore", "pipe", "pipe"] });
    cp.stdout.on("data", (d) => { out += d; });
    cp.stderr.on("data", (d) => { err += d; });
    cp.on("error", reject);
    cp.on("close", resolve);
  });
} finally {
  server.close();
  fs.rmSync(parentPath, { force: true });
}

const m = /MOB::(\{[\s\S]*?\})::END/.exec(out);
if (!m) {
  console.error("FAIL：浏览器里没拿到自检结果（DOM 长度 " + out.length + "）");
  console.error(err.split("\n").slice(-12).join("\n"));
  process.exit(1);
}

/* ---------------- 判定 + 输出 ---------------- */
let R;
try { R = JSON.parse(m[1]); } catch (e) { console.error("FAIL：结果不是合法 JSON"); process.exit(1); }

const results = [];
const check = (name, cond, extra) => {
  results.push([!!cond, name]);
  console.log((cond ? "  OK   " : "  FAIL ") + name + (cond || !extra ? "" : "  → " + extra));
};

console.log("页面：" + pageFile);
console.log("视口：" + SIZES.map((s) => s[0] + "x" + s[1]).join(" / ") + "（同源 iframe 模拟手机视口）\n");

for (const [w, h] of SIZES) {
  const tag = w + "x" + h;
  const data = R.sizes[tag];
  if (!data) { check(tag + " 视口能跑完探针", false, R["timeout-" + tag] ? "探针超时" : "无结果"); continue; }
  if (data.error) { check(tag + " 视口能跑完探针", false, data.error.split("\n")[0]); continue; }

  console.log("—— 视口 " + tag + " ——");
  for (const v of data.views) {
    const where = tag + " · " + v.view;
    check(where + "：没有元素画到屏幕右边之外", v.offenders.length === 0,
      v.offenders.map((o) => o.d + " right=" + o.right).join(" | "));
    check(where + "：主滚动区没有被横向裁掉", v.mainScrollW <= v.mainClientW + 1,
      "#main scrollW=" + v.mainScrollW + " clientW=" + v.mainClientW);
    check(where + "：响应式布局自己就够（不该无谓缩放）", v.fitScale === 1 && !v.dataFit,
      "scale=" + v.fitScale + " data-fit=" + v.dataFit);
  }
  console.log("");
}

/* 兜底缩放：至少要有两个视口真的触发过，并验证「缩完真不溢出 + 高度补偿正确 + 能还原」 */
const fits = SIZES.map(([w, h]) => R.sizes[w + "x" + h]).filter((d) => d && d.fit).map((d) => d.fit);
const triggered = fits.filter((f) => f.forcedScale < 0.999);
check("兜底缩放：塞入 " + WIDE_PX + "px 不可断内容后确实缩小了", triggered.length === fits.length && fits.length > 0,
  "触发 " + triggered.length + "/" + fits.length);
check("兜底缩放：缩小后不再有元素溢出屏幕", fits.every((f) => f.forced && f.forced.offenders.length === 0),
  fits.map((f) => (f.forced ? f.forced.offenders.length : "?")).join(","));
check("兜底缩放：提示条出现（不静默改尺寸）", fits.every((f) => f.hintOn === true));
/* 容差取 2%：要挡的是「整页缩成一条」（那样只有视口高度的一半左右），
   而不是 zoom 与 dvh 复合时的 1px 级舍入（0.672 这种小数比例实测会差几个像素）。 */
check("兜底缩放：100dvh 定高的 .frame 大致仍是整屏高（缩放补偿没漏）",
  fits.every((f) => Math.abs(f.frameH - f.innerH) <= Math.max(4, f.innerH * 0.02)),
  fits.map((f) => f.frameH + "/" + f.innerH).join(" "));
check("兜底缩放：撤掉宽内容后自动回到 100%",
  fits.every((f) => f.afterRemove && f.afterRemove.fitScale === 1 && !f.afterRemove.dataFit),
  fits.map((f) => (f.afterRemove ? f.afterRemove.fitScale : "?")).join(","));
check("兜底缩放：提示条上的「按原尺寸看」能回到 100%",
  fits.every((f) => f.resetBtn && f.scaleAfterDismiss === 1 && !f.dataFitAfterDismiss),
  fits.map((f) => f.resetBtn + "/" + f.scaleAfterDismiss).join(" "));
/* 桌面 Blink 的 zoom 是真的会缩的，所以这里应当走 zoom 那条路；
   如果哪天这条路断了，说明 detectZoom() 误判了（Android WebView 才会走 transform 兜底）。 */
check("兜底缩放：桌面引擎走 zoom 那条路（探测没误判）",
  fits.every((f) => f.forced && f.forced.fitMode === "zoom"),
  fits.map((f) => (f.forced ? f.forced.fitMode : "?")).join(","));

/* transform 兜底那条路（Android WebView 实际走的就是它）：桌面强制走一遍，确保逻辑本身是通的 */
const tfSizes = SIZES.map(([w, h]) => ({ tag: w + "x" + h, d: R.sizes[w + "x" + h] }))
  .filter((x) => x.d && x.d.fit && x.d.fit.tf);
check("transform 兜底：强制走第 ② 条时确实切到 tf 模式并缩小了",
  tfSizes.length === SIZES.length && tfSizes.every((x) => x.d.fit.tf.mode === "tf" && x.d.fit.tf.scale < 0.999),
  tfSizes.map((x) => x.d.fit.tf.mode + "@" + x.d.fit.tf.scale).join(" "));
check("transform 兜底：缩完不再有元素溢出屏幕",
  tfSizes.length === SIZES.length && tfSizes.every((x) => x.d.fit.tf.offenders === 0),
  tfSizes.map((x) => "[" + x.tag + "] " + (x.d.fit.tf.who || []).join(" | ") +
    "  // computed=" + x.d.fit.tf.computedTransform + " rectW=" + x.d.fit.tf.viewRectW + " offsetW=" + x.d.fit.tf.viewOffsetW).join("  ;;  "));
check("transform 兜底：内容是「先放大再缩」并留了负 margin 收掉多余高度",
  tfSizes.every((x) => /scale\(/.test(x.d.fit.tf.transform) && /^-\d/.test(x.d.fit.tf.marginBottom)),
  tfSizes.map((x) => x.d.fit.tf.transform + " / " + x.d.fit.tf.marginBottom).join(" | "));
check("transform 兜底：这条不写 dvh 补偿（没缩放，100dvh 本来就是对的）",
  tfSizes.every((x) => Math.abs(x.d.fit.tf.frameH - x.d.fit.tf.innerH) <= Math.max(4, x.d.fit.tf.innerH * 0.02)),
  tfSizes.map((x) => x.d.fit.tf.frameH + "/" + x.d.fit.tf.innerH).join(" "));
check("transform 兜底：撤掉宽内容后回到 100%，且内联样式清干净",
  tfSizes.length === SIZES.length && tfSizes.every((x) => x.d.fit.afterTf && x.d.fit.afterTf.scale === 1 &&
    !x.d.fit.afterTf.dataFit && x.d.fit.afterTf.tfCleared && x.d.fit.afterTf.styleCleared),
  tfSizes.map((x) => (x.d.fit.afterTf ? x.d.fit.afterTf.scale + "/tf=" + x.d.fit.afterTf.tfCleared + "/style=" + x.d.fit.afterTf.styleCleared : "?")).join(" "));

for (const k of Object.keys(R)) {
  if (k.startsWith("parse-") || k.startsWith("timeout-")) check("父页：" + k, false, JSON.stringify(R[k]));
}

const pass = results.filter(([ok]) => ok).length;
console.log("\n共 " + results.length + " 项，通过 " + pass + "，失败 " + (results.length - pass));
process.exit(pass === results.length ? 0 : 1);
