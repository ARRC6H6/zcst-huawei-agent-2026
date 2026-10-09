/* 真机（Android WebView，走 CDP）验收 0.5.1 的三件事：手机适配 / 导出双格式 / 离子电荷
 *
 * 用法（模拟器或真机，DevTools socket 转发见 README §6.1）：
 *   adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
 *   $env:LAB_LAN_CDP_PORT = "9333"
 *   node tools/gui-cdp.mjs --eval-file tools/check-v051-cdp.js
 *
 * 为什么要在真机 WebView 里再验一遍：
 *   · 手机适配（feature 1）本来就是为真手机做的 —— Android WebView 的视口/缩放语义与桌面浏览器不同，
 *     这里量的是**真实设备像素下的 clientWidth**，比同源 iframe 更接近用户看到的；
 *   · 离子输入跑在 shadow DOM + React 里，真机 WebView 才验得了；
 *   · 导出弹窗新增了 #dialogHost 与遮罩点击，真机点击事件才验得了。
 */
(async () => {
  const out = { tag: "v051-cdp" };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const main = () => document.getElementById("main").innerHTML;
  const fire = (sel) => { const el = document.querySelector(sel); if (!el) throw new Error("找不到 " + sel); el.click(); };

  /* ---------- 0. 环境：真机视口 ---------- */
  out.title = document.title;
  out.clientWidth = document.documentElement.clientWidth;
  out.innerWidth = window.innerWidth;
  out.dpr = window.devicePixelRatio;
  out.hasFit = typeof Fit === "object" && typeof Fit.run === "function";
  out.fitScale = Fit ? Fit.scale : null;
  out.dataFit = document.documentElement.hasAttribute("data-fit");

  /* ---------- 1. 手机适配：真机视口下不许有元素画到屏幕右边之外 ---------- */
  function offenders() {
    const bg = document.querySelector(".bg");
    const vw = window.innerWidth;
    const bad = [];
    document.querySelectorAll("body *").forEach((el) => {
      if (bg && bg.contains(el)) return;
      if (el.closest && el.closest(".fit-hint")) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      if (r.right > vw + 1) {
        bad.push((el.tagName.toLowerCase()) + "." + String(el.className || "").trim().split(/\s+/)[0] + "@" + Math.round(r.right));
      }
    });
    return bad.slice(0, 6);
  }
  const e = newExp("真机验收-0.5.1", "chemistry");
  const eqs = ["2KMnO4 + 16HCl -> 2KCl + 2MnCl2 + 5Cl2 ^ + 8H2O", "Fe^3+ + 3OH^- -> Fe(OH)3 v"];
  e.desc = "真机验收用的一段比较长的实验简介，看看窄屏下会不会把卡片撑出屏幕。";
  e.steps = [0, 1].map((i) => {
    const s = normalizeStep({ id: "s_cdp" + i });
    s.title = "第 " + (i + 1) + " 步：加入试剂并充分振荡，观察颜色变化与沉淀生成情况";
    s.text = "取洁净试管，加入约 2 mL 待测溶液，逐滴加入试剂并振荡，记录颜色变化。";
    s.tips = "浓盐酸强腐蚀，务必通风橱内操作并佩戴护目镜。";
    s.equation = eqs[i];
    s.record.note = "溶液由无色变为浅棕色，管壁出现少量沉淀。";
    return s;
  });
  Store.saveExp(e);

  out.home_offenders = (goTo("home", null), offenders());
  out.home_noFitScale = Fit.scale === 1 && !document.documentElement.hasAttribute("data-fit");
  goTo("edit", e.id);
  await wait(900);
  out.edit_offenders = offenders();
  out.edit_mainScrollW = document.getElementById("main").scrollWidth;
  out.edit_mainClientW = document.getElementById("main").clientWidth;
  out.edit_notClipped = out.edit_mainScrollW <= out.edit_mainClientW + 1;
  goTo("record", e.id);
  await wait(400);
  out.record_offenders = offenders();
  goTo("report", e.id);
  await wait(300);
  out.report_offenders = offenders();
  goTo("settings", null);
  await wait(300);
  out.settings_offenders = offenders();
  goTo("lan", null);
  await wait(400);
  out.lan_offenders = offenders();

  /* ---------- 2. 离子电荷输入（shadow DOM + 真点击 + 写回数据） ---------- */
  goTo("edit", e.id);
  /* ⚠️ 轮询等离子条，别用固定 sleep：模拟器上 React 首帧 + KaTeX 渲染要一秒多，
     固定等待会得到「离子条不存在」的假阴性（真踩过）。 */
  let host = null, sr = null, bar = null;
  for (let i = 0; i < 60; i++) {
    host = document.querySelector('chem-input[data-field="equation"]');
    sr = host && host.shadowRoot;
    bar = sr && sr.querySelector(".chem-ion-bar");
    if (bar) break;
    await wait(100);
  }
  out.chem_hasBar = !!bar;
  if (bar) {
    const num = sr.querySelector(".chem-ion-num");
    const plus = sr.querySelector(".chem-ion-btn-plus");
    const minus = sr.querySelector(".chem-ion-btn-minus");
    out.chem_range = String(num.min) + "~" + num.max;
    out.chem_previews = sr.querySelectorAll(".chem-ion-preview .katex").length;
    /* 受控组件改值：走原生 setter + input 事件 */
    const setVal = (el, v) => {
      const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
      if (d && d.set) d.set.call(el, v); else el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const ta = sr.querySelector(".chem-textarea");
    setVal(ta, "Fe");
    await wait(60);
    ta.focus(); ta.selectionStart = 2; ta.selectionEnd = 2;
    setVal(num, "3");
    await wait(60);
    plus.click();
    await wait(200);
    out.chem_afterPlus = host.value;
    out.chem_equation = state.exp.steps[0].equation;
    /* 预览里电荷必须在右上角上标里且带 + 号 */
    const pv = sr.querySelector(".chem-preview");
    const html = pv ? pv.innerHTML : "";
    out.chem_preview_hasSup = html.indexOf("msupsub") >= 0;
    out.chem_preview_ok = /msupsub[\s\S]{0,400}3/.test(html) && /msupsub[\s\S]{0,400}\+/.test(html);
    setVal(ta, "SO4");
    await wait(60);
    ta.focus(); ta.selectionStart = 3; ta.selectionEnd = 3;
    setVal(num, "2");
    await wait(60);
    minus.click();
    await wait(200);
    out.chem_afterMinus = host.value;
    out.chem_equation2 = state.exp.steps[0].equation;
  }

  /* ---------- 3. 导出：真点「导出」→ 弹窗两种格式 → 真下载（不落盘，只验触发） ---------- */
  goTo("home", null);
  const card = document.querySelector('[data-act="exp-export"]');
  out.exp_card = !!card;
  if (card) card.click();
  out.exp_dialog = !!document.querySelector("#dialogHost .dlg-mask");
  out.exp_opts = !!document.querySelector('[data-act="exp-export-md"]') && !!document.querySelector('[data-act="exp-export-json"]');
  /* 点弹窗内部不该关 */
  const inner = document.querySelector("#dialogHost .dlg");
  if (inner) inner.click();
  out.exp_insideKeepsOpen = !!document.querySelector("#dialogHost .dlg-mask");
  const mask = document.querySelector("#dialogHost .dlg-mask");
  if (mask) mask.click();
  out.exp_maskCloses = !document.querySelector("#dialogHost .dlg-mask");
  /* 真导一次离线 MD（把 createObjectURL 换掉，避免真弹下载） */
  const realCreate = URL.createObjectURL;
  let got = null;
  /* 注意：上面离子那节改过 steps[0].equation，所以这里要按**当前**方程式断言，
     不能写死最初种下的那条（写死会得到一条假 FAIL —— 真踩过）。 */
  state.exp = Store.getExp(e.id);
  const eqNow = state.exp.steps[0].equation;
  URL.createObjectURL = (b) => { got = b; return "blob:cdp"; };
  try {
    document.querySelector('[data-act="exp-export"]').click();
    document.querySelector('[data-act="exp-export-md"]').click();
    for (let i = 0; i < 40 && !got; i++) await wait(100);
  } finally { URL.createObjectURL = realCreate; }
  out.exp_mdBlobSize = got ? got.size : 0;
  out.exp_mdEqExpected = eqNow;
  if (got && got.text) {
    const t = await got.text();
    out.exp_mdHasTitle = t.indexOf("# 真机验收-0.5.1") === 0;
    out.exp_mdHasEq = eqNow ? t.indexOf(eqNow) > 0 : false;
    out.exp_mdHasRecord = t.indexOf("现象 / 数据") > 0;
    out.exp_mdNoUndef = t.indexOf("undefined") < 0 && t.indexOf("[object Object]") < 0;
  }
  out.exp_dialogClosed = !document.querySelector("#dialogHost .dlg-mask");

  /* ---------- 4. 溢出兜底：塞一个不可断的宽块，真机上也要能自己缩下来并还原 ---------- */
  goTo("edit", e.id);
  await wait(600);
  out.fit_zoomWorks = Fit.detectZoom();     // true = 走 zoom；false = 走 transform 兜底（Android WebView 113 就是这条）
  const wideHost = document.querySelector("#main .view") || document.getElementById("main");
  const wide = document.createElement("div");
  wide.style.cssText = "width:520px;height:12px;background:#f00";
  wideHost.appendChild(wide);
  Fit.dismissed = false;
  Fit.run();
  out.fit_forcedScale = Number(Fit.scale.toFixed(3));
  out.fit_forcedRight = Math.round(wide.getBoundingClientRect().right);
  out.fit_forcedNoOverflow = offenders().length === 0;
  out.fit_mode = document.documentElement.hasAttribute("data-fit-tf") ? "transform" : "zoom";
  out.fit_frameH = Math.round(document.querySelector(".frame").getBoundingClientRect().height);
  out.fit_innerH = window.innerHeight;
  out.fit_hintOn = !!(Fit._hint && Fit._hint.classList.contains("on"));
  /* transform 兜底那条：负 margin 有没有把多出来的布局高度收掉（不该留一大段空白可滚区） */
  const viewEl = Fit.contentEl();
  out.fit_viewMarginBottom = viewEl ? viewEl.style.marginBottom : "(无)";
  out.fit_mainScrollH = document.getElementById("main").scrollHeight;
  out.fit_mainClientH = document.getElementById("main").clientHeight;
  wide.remove();
  Fit.dismissed = false;
  Fit.run();
  await wait(120);
  out.fit_afterRemove = Number(Fit.scale.toFixed(3));
  out.fit_dataFitAfter = document.documentElement.hasAttribute("data-fit");
  out.fit_tfCleared = !document.documentElement.hasAttribute("data-fit-tf");
  out.fit_viewStyleCleared = viewEl ? (viewEl.style.transform === "" && viewEl.style.marginBottom === "") : true;

  Store.removeExp(e.id);
  return out;
})();
