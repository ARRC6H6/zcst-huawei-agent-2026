/* 真机（Android WebView / WebView2）验收：方程式输入的三个修复
 *
 * 用法（Android 走 adb forward 的 webview_devtools_remote）：
 *   adb -s emulator-5554 forward tcp:9333 localabstract:webview_devtools_remote_<pid>
 *   $env:LAB_LAN_CDP_PORT="9333"
 *   node tools/gui-cdp.mjs --eval-file tools/check-chem-cdp.js
 *
 * 验的就是 2026-10-14 修的三件事（真设备 WebView，不是桌面 Blink）：
 *   ① 可逆符号 <=> 渲染成 ⇌（halfarrow 半箭头），不是「小于号 + 箭头」
 *   ② 加热 / 催化：紧贴 `->[\Delta]`、条件排在箭头上方（视觉树里没有方括号字面量）、
 *      没有箭头时点按钮也能补出箭头
 *   ③ 电荷数字框：text+inputMode=numeric、点一下能全选、敲 3 得到 3（不是 9）、Fe 上插 3 价 = Fe^3+
 */
(async () => {
  const out = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const setVal = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
    if (d && d.set) d.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  /* 只看 KaTeX 视觉树（MathML 里那份 annotation 含原始 TeX，会把方括号算进来） */
  const visualPlain = (html) => {
    const m = html.indexOf('class="katex-html"');
    const gt = m < 0 ? -1 : html.indexOf(">", m);
    const scope = gt >= 0 ? html.slice(gt + 1) : "";
    return scope
      .replace(/<span[^>]*color:transparent[^>]*>[\s\S]*?<\/span>/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/[\u200b\u2061\u2062\u2064]/g, "");
  };

  const e = newExp("验收-方程式修复", "chemistry");
  Store.saveExp(e);
  state.exp = e;
  goTo("edit", e.id);

  let host = null, sr = null, bar = null;
  for (let i = 0; i < 100; i++) {
    host = document.querySelector('chem-input[data-field="equation"]');
    sr = host && host.shadowRoot;
    bar = sr && sr.querySelector(".chem-ion-bar");
    if (bar) break;
    await wait(50);
  }
  out.hasHost = !!host;
  out.shadowLen = sr ? sr.innerHTML.length : -1;
  if (!bar) { out.error = "离子条没出来（组件崩了？）"; return out; }

  const ta = sr.querySelector(".chem-textarea");
  const num = sr.querySelector(".chem-ion-num");
  const plus = sr.querySelector(".chem-ion-btn-plus");
  const badge = () => (sr.querySelector(".chem-status-badge") || {}).textContent || "";
  const preview = () => (sr.querySelector(".chem-preview") || {}).innerHTML || "";
  const condBtn = (tip) => Array.from(sr.querySelectorAll(".chem-cond-btn")).find((b) => b.title === tip);

  /* ---------- ① 可逆符号 ---------- */
  setVal(ta, "2H2 + O2 <=> 2H2O");
  await wait(300);
  out.rev_raw = host.value;
  out.rev_halfarrow = preview().indexOf("halfarrow-left") >= 0;
  /* ⚠️ 必须在**视觉树**里找 `<`：预览 HTML 前半段是 KaTeX 的 MathML/annotation，
     里面原样带着 `\ce{2H2 + O2 <=> 2H2O}`（`<` 会被转义成 `&lt;`）——整串找必然假阳性。 */
  out.rev_literalLt = visualPlain(preview()).indexOf("<") >= 0;
  out.rev_badge = badge();

  /* ---------- ② 加热 / 催化 ---------- */
  setVal(ta, "2KClO3 -> 2KCl + 3O2");
  await wait(150);
  const heat = condBtn("加热");
  out.hasHeatBtn = !!heat;
  if (heat) {
    heat.click();
    await wait(300);
    out.heat_raw = host.value;
    out.heat_glued = host.value.indexOf("->[\\Delta]") >= 0;
    out.heat_plain = visualPlain(preview()).slice(0, 30);
    out.heat_noBracket = !/[\[\]]/.test(visualPlain(preview()));
    out.heat_badge = badge();
  }
  setVal(ta, "H2O2");
  await wait(150);
  const cat = condBtn("催化剂");
  out.hasCatBtn = !!cat;
  if (cat) {
    cat.click();
    await wait(300);
    out.cat_raw = host.value;                    // 没有箭头 → 应当补出 ->[催化剂]
    out.cat_inserted = host.value.indexOf("->[催化剂]") >= 0;
  }

  /* ---------- ③ 电荷数字框 ---------- */
  setVal(ta, "");                     // 清空，免得影响
  await wait(120);
  out.numType = String(num.type) + "/" + String(num.inputMode);
  num.click();                        // 真点击：应当触发 onClick → select()
  await wait(120);
  out.numSel = [num.selectionStart, num.selectionEnd];
  out.numLen = String(num.value).length;
  const ss = num.selectionStart == null ? 0 : num.selectionStart;
  const se = num.selectionEnd == null ? String(num.value).length : num.selectionEnd;
  setVal(num, String(num.value).slice(0, ss) + "3" + String(num.value).slice(se));   // 模拟敲 3
  await wait(150);
  out.numAfterType3 = String(num.value);
  setVal(num, "");
  await wait(120);
  out.numAfterClear = String(num.value);
  setVal(num, "2");
  await wait(120);
  out.numAfterClearType2 = String(num.value);
  setVal(num, "3");
  await wait(120);
  setVal(ta, "Fe");
  await wait(120);
  ta.focus();
  ta.selectionStart = 2; ta.selectionEnd = 2;
  plus.click();
  await wait(300);
  out.ion_raw = host.value;
  out.ion_equation = state.exp.steps[0].equation;

  return out;
})()
