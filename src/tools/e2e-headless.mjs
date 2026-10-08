/* 真浏览器（headless Edge/Chrome）端到端探针：
 *   把 原型.html 拷成带「自检脚本」的临时页，用本地 HTTP 起服务（file:// 下 localStorage 不可靠），
 *   再让 headless 浏览器真实加载 + 真实点击，最后把结果写进 DOM 里读回来。
 *
 * 为什么值得做：check-page.mjs 是自建 DOM 桩，只能验逻辑；
 * 这里跑的是 Blink 真引擎，验证的是「真的渲染出来 + 真的点得动 + 滚动位置真的没跳」。
 *
 *   node build/e2e-headless.mjs
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

/* 页面定位器（候选名 + mtime 兜底）：在本仓库里它与本脚本同目录（src/tools/），
   在工程里它在 ../tools/。用动态 import 两级回退，两种布局都能跑。
   ⚠️ 不能用静态 import —— 静态路径写死任一种，换布局就 ERR_MODULE_NOT_FOUND。 */
async function loadFindAppHtml() {
  const candidates = ["./app-html.mjs", "../tools/app-html.mjs", "./tools/app-html.mjs"];
  for (const rel of candidates) {
    try {
      const mod = await import(rel);
      if (typeof mod.findAppHtml === "function") return mod.findAppHtml;
    } catch (e) { /* 试下一个 */ }
  }
  return null;
}
const findAppHtml = await loadFindAppHtml();

/* 可选第一个参数：指定要探的页面（用来验「同一个探针能不能抓出旧实现的 bug」）。
   不给参数时走工程统一的页面定位器；找不到定位器就退回 index.html / 原型.html。 */
const srcHtml = process.argv[2]
  ? path.resolve(process.argv[2])
  : (() => {
      if (findAppHtml) {
        try { return findAppHtml(root); } catch (e) { /* 落到下面兜底 */ }
      }
      for (const n of ["原型.html", "index.html", "实验助手.html"]) {
        const p = path.join(root, n);
        if (fs.existsSync(p)) return p;
      }
      return path.join(root, "index.html");
    })();
if (!fs.existsSync(srcHtml)) {
  console.error("找不到要探的单文件页面：" + srcHtml);
  console.error("用法：node src/tools/e2e-headless.mjs [页面.html]");
  process.exit(2);
}

const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const browser = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!browser) { console.error("找不到 Edge/Chrome，无法做真浏览器自检"); process.exit(2); }

/* ---------- 1. 生成带自检脚本的临时页 ---------- */
const harness = `
<script id="e2e-probe">
(function () {
  const R = {};
  const mainEl = () => document.getElementById("main");
  const html = () => mainEl().innerHTML;
  try {
    /* 模拟「App 桌面形态」：winInitFrame() 在 Tauri 桌面下会给 body 加 wb-on。
       用户的「计时器设置跳最顶」就是在 App 形态下报的，所以这里必须复现这个形态。 */
    document.body.classList.add("wb-on");

    /* 造一份够长的实验（5 步 + 长文本），保证编辑页一定超出窗口高度、主区真的可滚动 */
    const e = newExp("E2E 探针", "chemistry");
    const long = "取洁净试管，加入 2 mL 硝酸银溶液，逐滴加入稀氨水至沉淀刚好溶解，"
      + "记录溶液颜色与气味变化，注意避光保存并及时观察试管壁的银镜。";
    e.steps = [0, 1, 2, 3, 4].map(function (i) {
      return normalizeStep({ id: "s_e2e_" + i, title: "步骤 " + (i + 1), text: long, tips: long });
    });
    Store.saveExp(e);
    goTo("edit", e.id);

    /* ---- A. 仪器摆放确实没了 ---- */
    R.edit_hasTimerHost = /data-timer-host/.test(html());
    R.edit_hasTimerCard = /计时器预设/.test(html());
    R.edit_noCanvasHost = !/data-canvas-host/.test(html());
    R.edit_noInstPanel = !/inst-panel/.test(html());
    R.edit_noYiqibaidfangText = html().indexOf("仪器摆放") < 0;
    R.edit_subtitleUpdated = html().indexOf("填写反应步骤与安全要点") >= 0;
    R.edit_noSvgGrid = !/cv-grid/.test(html());
    R.model_noCanvas = state.exp.steps.every(function (s) { return !("canvas" in s); });

    /* ---- B. 找出真正在滚的容器（浏览器 / App 两种形态都覆盖） ---- */
    /* 注意：.main 上有 scroll-behavior: smooth，直接赋 scrollTop 是**动画**、读回来还是旧值。
       这正是用户看到「页面滑到最顶」的原因（平滑滚动）。这里临时改成 auto 让赋值立刻生效，
       断言才有意义：若 render() 真的把 scrollTop 置 0，auto 下会同步读回 0 → 断言就会 FAIL。 */
    const main = mainEl();
    const scroller = (main.scrollHeight > main.clientHeight + 4)
      ? main
      : (document.scrollingElement || document.documentElement);
    scroller.style.scrollBehavior = "auto";
    R.scroller_isMain = scroller === main;
    R.scroll_before_positive = scroller.scrollHeight > scroller.clientHeight + 4;
    R.diag_mainScrollH = main.scrollHeight;
    R.diag_mainClientH = main.clientHeight;
    R.diag_scrollerScrollH = scroller.scrollHeight;
    R.diag_scrollerClientH = scroller.clientHeight;

    /* ---- C. ⭐ 计时器设置不再把页面顶回最顶（真实点击 + 真实滚动） ---- */
    scroller.scrollTop = 480;
    R.scroll_before = scroller.scrollTop;
    R.scroll_before_positive = R.scroll_before_positive && scroller.scrollTop > 0;
    const chip = main.querySelector('[data-act="timer-target"][data-v="60"]');
    R.chipFound = !!chip;
    if (chip) chip.click();
    R.scroll_after = scroller.scrollTop;
    R.scroll_kept = scroller.scrollTop === R.scroll_before && R.scroll_before > 0;
    /* 计时器现在是「每步一个」：预设落在当前步的 step.timer 上 */
    R.target_set_to_60 = Timer.attach(state.exp.steps[0]).target === 60;
    R.card_reRendered = /data-timer-host/.test(html()) && /本步计时器预设/.test(html());
    const chip2 = mainEl().querySelector('[data-act="timer-target"][data-v="60"]');
    R.chip_now_selected = !!chip2 && chip2.className.indexOf("on") >= 0;
    R.clock_text = (mainEl().querySelector("[data-timer-clock]") || {}).textContent || "";

    /* 再切一次「正计时」模式，同样不该跳顶 */
    scroller.scrollTop = 300;
    const modeBtn = mainEl().querySelector('[data-act="timer-mode"][data-v="stopwatch"]');
    if (modeBtn) modeBtn.click();
    R.scroll_kept_on_mode = scroller.scrollTop === 300;

    /* 自定义分/秒 → 应用，也不该跳顶 */
    scroller.scrollTop = 260;
    const minIn = mainEl().querySelector('[data-timer="min"]');
    const secIn = mainEl().querySelector('[data-timer="sec"]');
    if (minIn) minIn.value = "3";
    if (secIn) secIn.value = "30";
    const applyBtn = mainEl().querySelector('[data-act="timer-custom"]');
    if (applyBtn) applyBtn.click();
    R.custom_210 = Timer.attach(state.exp.steps[0]).target === 210;
    R.scroll_kept_on_custom = scroller.scrollTop === 260;
    /* 每步独立：改第 1 步不该影响第 2 步 */
    R.step_timer_independent = Timer.attach(state.exp.steps[1]).target === 0;

    /* ---- C2. 全治理：其它站内动作同样不跳顶 ---- */
    /* 换学科分类 chip */
    scroller.scrollTop = 400;
    const subjBtn = mainEl().querySelector('[data-act="exp-subject"]');
    R.gov_subjBtnFound = !!subjBtn;
    if (subjBtn) subjBtn.click();
    R.gov_subject_kept = scroller.scrollTop === 400;

    /* 切步骤（点左侧步骤栏里的第 2 步） */
    scroller.scrollTop = 360;
    const stepBtns = mainEl().querySelectorAll('[data-act="step-open"]');
    R.gov_stepBtnFound = stepBtns.length >= 2;
    if (stepBtns.length >= 2) stepBtns[1].click();
    R.gov_step_kept = scroller.scrollTop === 360;
    R.gov_step_moved = ui.step === 1;

    /* 删图片：图片卡在编辑页很靠下的位置，正是用户会踩的场景。
       注意要塞进「当前步」—— 编辑页只渲染 ui.step 这一张图片卡，删按钮才对得上。 */
    const curStepRef = state.exp.steps[ui.step];
    curStepRef.images.push({ id: "m_probe", kind: "image", name: "probe.png", store: "idb", url: "" });
    render();
    scroller.scrollTop = 340;
    const delBtn = mainEl().querySelector('[data-act="media-del"]');
    R.gov_mediaDelBtnFound = !!delBtn;
    if (delBtn) delBtn.click();
    R.gov_media_kept = scroller.scrollTop === 340 && curStepRef.images.length === 0;

    /* 点侧栏导航 = 真换页 → 必须回顶 */
    scroller.scrollTop = 300;
    const navEdit = document.querySelector('[data-go="edit"]');
    R.gov_navBtnFound = !!navEdit;
    if (navEdit) navEdit.click();
    R.gov_nav_toTop = scroller.scrollTop === 0;

    /* ---- D. 记录页 ---- */
    goTo("record", e.id);
    /* 记录页现在有两张计时卡：本步计时器 + 自由计时器 */
    R.rec_hasTimerHost = (html().match(/data-timer-host/g) || []).length === 2;
    R.rec_hasTimerCard = /timer-card/.test(html());
    R.rec_hasFreeTimer = /自由计时器/.test(html()) && /data-timer-owner="free"/.test(html());
    R.rec_noCanvas = !/data-canvas-host/.test(html()) && !/data-ro="1"/.test(html());
    R.rec_noYiqibaidfangText = html().indexOf("仪器摆放") < 0;
    R.rec_hasPlayer = /player-dot/.test(html());
    R.rec_hasStage = /player-stage/.test(html());
    R.rec_timerBeforeStage = html().indexOf("timer-card") < html().indexOf('class="player-stage"');

    /* 记录页点「开始」也不该跳顶（第一张卡的按钮 = 本步计时器） */
    const main2 = mainEl();
    const sc2 = (main2.scrollHeight > main2.clientHeight + 4)
      ? main2
      : (document.scrollingElement || document.documentElement);
    sc2.style.scrollBehavior = "auto";
    sc2.scrollTop = 300;
    R.rec_scroll_seed = sc2.scrollTop;
    const tbtn = main2.querySelector('[data-act="timer-toggle"]');
    if (tbtn) tbtn.click();
    R.rec_scroll_kept = sc2.scrollTop === R.rec_scroll_seed && R.rec_scroll_seed > 0;
    R.rec_running = Timer.attach(state.exp.steps[0]).running === true;
    R.rec_btnSaysPause = /暂停/.test(html());

    /* 记录模式翻页：也不该跳顶（记录时最常用的就是「下一步」+ 记一笔） */
    sc2.scrollTop = 240;
    const nextBtn = main2.querySelector('[data-act="play-next"]');
    R.gov_playBtnFound = !!nextBtn;
    if (nextBtn) nextBtn.click();
    R.gov_play_kept = sc2.scrollTop === 240;
    R.gov_play_moved = ui.playIndex === 1;
    Timer.stopTick();

    /* ---- E. 报告 / 数据模型 ---- */
    const md = buildLocalMarkdown(state.exp);
    R.md_noInstSection = md.indexOf("## 仪器与试剂") < 0;
    R.md_hasSteps = md.indexOf("## 实验步骤") >= 0;
    R.report_noInstruments = collectReportData(state.exp).steps.every(function (s) { return !("instruments" in s); });

    /* 收尾：清掉探针数据 */
    Store.removeExp(e.id);
  } catch (err) {
    R.error = String((err && err.stack) || err);
  }
  const out = document.createElement("div");
  out.id = "E2E-RESULT";
  out.textContent = "E2E::" + JSON.stringify(R) + "::END";
  document.body.appendChild(out);
})();
</script>
`;

const probePath = path.join(here, "e2e-probe.html");
let html = fs.readFileSync(srcHtml, "utf8");
const idx = html.lastIndexOf("</body>");
html = idx >= 0 ? html.slice(0, idx) + harness + html.slice(idx) : html + harness;
fs.writeFileSync(probePath, html, "utf8");
console.log("探针页已生成：" + probePath);

/* ---------- 2. 起本地静态服务（file:// 下 localStorage 不可靠） ---------- */
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const target = path.join(root, urlPath);
  if (!target.startsWith(root) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.writeHead(404); res.end("not found"); return;
  }
  const ext = path.extname(target).toLowerCase();
  const type = ext === ".html" ? "text/html; charset=utf-8"
    : ext === ".js" || ext === ".mjs" ? "application/javascript; charset=utf-8"
    : "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  res.end(fs.readFileSync(target));
});

const port = await new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port)));
/* 探针页写在本脚本旁边，而静态服务以 root 为根 —— 所以 URL 必须由**相对 root 的路径**算出来。
   （早先这里写死成 /build/e2e-probe.html，只在「脚本放在 build/ 下」的工程里成立；
     本仓库脚本在 src/tools/ 下，写死就会 404 → 拿不到自检结果。） */
const urlPath = "/" + path.relative(root, probePath).split(path.sep).join("/");
const url = `http://127.0.0.1:${port}${urlPath}`;
console.log("探针地址：" + url);

/* ---------- 3. headless 浏览器加载 + 真实点击 ---------- */
const args = [
  "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--disable-sync", "--mute-audio",
  "--window-size=1000,560", "--virtual-time-budget=6000",
  "--user-data-dir=" + path.join(here, "e2e-profile"),
  "--dump-dom", url,
];
const dom = await new Promise((resolve, reject) => {
  const cp = spawn(browser, args, { stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  cp.stdout.on("data", (d) => { out += d; });
  cp.stderr.on("data", (d) => { err += d; });
  cp.on("error", reject);
  cp.on("close", (code) => resolve({ out, err, code }));
});

server.close();

const m = /E2E::(\{[\s\S]*?\})::END/.exec(dom.out);
if (!m) {
  console.error("FAIL：浏览器里没拿到自检结果（DOM 长度 " + dom.out.length + "）");
  console.error(dom.err.split("\n").slice(-15).join("\n"));
  process.exit(1);
}

let R;
try { R = JSON.parse(m[1]); } catch (e) { console.error("FAIL：结果不是合法 JSON：" + m[1]); process.exit(1); }

const EXPECT = [
  "edit_hasTimerHost", "edit_hasTimerCard", "edit_noCanvasHost", "edit_noInstPanel",
  "edit_noYiqibaidfangText", "edit_subtitleUpdated", "edit_noSvgGrid", "model_noCanvas",
  "scroll_before_positive", "chipFound", "scroll_kept", "target_set_to_60",
  "card_reRendered", "chip_now_selected", "scroll_kept_on_mode",
  "custom_210", "scroll_kept_on_custom", "step_timer_independent",
  "gov_subjBtnFound", "gov_subject_kept", "gov_stepBtnFound", "gov_step_kept", "gov_step_moved",
  "gov_mediaDelBtnFound", "gov_media_kept", "gov_navBtnFound", "gov_nav_toTop",
  "rec_hasTimerHost", "rec_hasTimerCard", "rec_hasFreeTimer",
  "rec_noCanvas", "rec_noYiqibaidfangText",
  "rec_hasPlayer", "rec_hasStage", "rec_timerBeforeStage", "rec_scroll_kept",
  "rec_running", "rec_btnSaysPause",
  "gov_playBtnFound", "gov_play_kept", "gov_play_moved",
  "md_noInstSection", "md_hasSteps", "report_noInstruments",
];

console.log("\n--- 真浏览器自检结果 ---");
let bad = [];
if (R.error) bad.push("脚本抛错：" + R.error);
for (const k of EXPECT) {
  const ok = R[k] === true;
  if (!ok) bad.push(k + " = " + JSON.stringify(R[k]));
  console.log((ok ? "  OK   " : "  FAIL ") + k + (ok ? "" : "  → " + JSON.stringify(R[k])));
}
console.log("  滚动容器=#main? " + R.scroller_isMain +
  " | #main scrollH/clientH=" + R.diag_mainScrollH + "/" + R.diag_mainClientH +
  " | 实际容器=" + R.diag_scrollerScrollH + "/" + R.diag_scrollerClientH);
console.log("  scroll_before=" + R.scroll_before + " scroll_after=" + R.scroll_after +
  " clock=" + JSON.stringify(R.clock_text));

fs.rmSync(probePath, { force: true });
fs.rmSync(path.join(here, "e2e-profile"), { recursive: true, force: true, maxRetries: 3 });

if (bad.length) { console.error("\nFAIL：" + bad.length + " 项不达标"); process.exit(1); }
console.log("\nPASS：真浏览器端到端全部通过（" + EXPECT.length + " 项）");
process.exit(0);
