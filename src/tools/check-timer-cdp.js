/* 真机（WebView2）验收脚本：计时器 + 互传自动导入
 * 用法：LAB_LAN_REMOTE_DEBUG=9222 启动 lab-assistant.exe 后
 *       node tools/gui-cdp.mjs --eval-file build/verify-timer-e2e.js
 */
(async () => {
  const out = {};
  const main = () => document.getElementById("main").innerHTML;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fire = (sel) => { const el = document.querySelector(sel); if (!el) throw new Error("找不到元素 " + sel); el.click(); };

  /* ---------- 1. 编辑模式：预设计时器 ---------- */
  const e = newExp("验收-计时器", "chemistry");
  e.steps[0].title = "加热";
  e.steps.push(normalizeStep({ id: uid("s_"), title: "观察现象" }));
  Store.saveExp(e);
  goTo("edit", e.id);
  out.edit_card = /计时器预设/.test(main());
  out.edit_presets6 = /data-v="30"/.test(main()) && /data-v="1800"/.test(main());
  out.edit_customInputs = /data-timer="min"/.test(main()) && /data-timer="sec"/.test(main());
  out.edit_defaultText = Timer.targetText(state.exp);

  /* 编辑模式：自定义分 / 秒 → 应用 */
  document.querySelector('[data-timer="min"]').value = "0";
  document.querySelector('[data-timer="sec"]').value = "45";
  fire('[data-act="timer-custom"]');
  await wait(200);
  out.edit_custom45 = Timer.targetText(state.exp);

  /* 点预设 5s，方便观察响铃 */
  const chip5 = Array.from(document.querySelectorAll('[data-act="timer-target"]')).find((b) => b.dataset.v === "30");
  if (!chip5) throw new Error("找不到 30s 预设 chip");
  out.edit_hasPreset30 = true;

  /* 改用「自定义 5 秒」以便快速看到到点行为 */
  document.querySelector('[data-timer="min"]').value = "0";
  document.querySelector('[data-timer="sec"]').value = "5";
  fire('[data-act="timer-custom"]');
  await wait(200);
  out.edit_custom5 = Timer.targetText(state.exp);

  /* ---------- 2. 记录模式：手动启停 ---------- */
  goTo("record", e.id);
  out.record_bar = /data-act="timer-toggle"/.test(main()) && /data-act="timer-reset"/.test(main()) && /data-act="timer-log"/.test(main());
  out.record_targetText = /倒计时 00:05/.test(main());

  fire('[data-act="timer-toggle"]');
  await wait(900);
  out.record_running = Timer.attach(state.exp).running === true;
  out.record_clock_ticking = document.querySelector("[data-timer-clock]").textContent;
  out.record_btn_pause = /暂停/.test(main());

  /* 暂停 / 继续 */
  fire('[data-act="timer-toggle"]');
  await wait(150);
  out.paused_running = Timer.attach(state.exp).running === false;
  out.paused_accumulated = Timer.attach(state.exp).accumulated > 0;
  fire('[data-act="timer-toggle"]');
  await wait(150);

  /* 等它到点（5 秒倒计时） */
  await wait(5200);
  out.over_rang = Timer.attach(state.exp).rang === true;
  out.over_clock = document.querySelector("[data-timer-clock]").textContent;
  out.over_toast = document.getElementById("toast").textContent;
  out.over_note = state.exp.steps[0].record.note;
  out.over_noteHasLine = /\[计时\] 倒计时结束/.test(state.exp.steps[0].record.note);

  /* 记一次 → 写当前步（此时在第 1 步） */
  fire('[data-act="timer-log"]');
  await wait(250);
  out.log_note = state.exp.steps[0].record.note;
  out.log_count = Timer.attach(state.exp).logs.length;

  /* 翻到第 2 步再记一次：应该写到第 2 步 */
  fire('[data-act="play-next"]');
  await wait(200);
  fire('[data-act="timer-log"]');
  await wait(250);
  out.log2_step2 = state.exp.steps[1].record.note;
  out.log2_step1_untouched = state.exp.steps[0].record.note === out.log_note;

  /* 归零 */
  fire('[data-act="timer-reset"]');
  await wait(200);
  out.reset_elapsed0 = Timer.elapsed(state.exp) === 0;
  out.reset_clock = document.querySelector("[data-timer-clock]").textContent;

  /* ---------- 3. 报告：计时章节 ---------- */
  goTo("report", e.id);
  fire('[data-act="rep-local"]');
  await wait(500);
  const md = (Store.report(e.id) || {}).markdown || "";
  out.report_hasTimerSection = /## 计时/.test(md) && /本次总用时/.test(md);

  /* ---------- 4. 互传页：下载即导入卡片 ---------- */
  goTo("lan");
  await wait(300);
  out.lan_autoCard = /下载即导入/.test(main());
  out.lan_autoPill = /点下载触发/.test(main());
  out.lan_autoHelp = /自动加进「我的实验」/.test(main()) && /接收端/.test(main());
  out.lan_noListener = !/监听中|未监听/.test(main());

  /* ---------- 5. 下载即导入逻辑（页面内用内存桩模拟服务端响应） ---------- */
  const realFetch = window.fetch;
  const pack = { kind: "zhbit-lab-experiment", v: 1, exp: { id: "x1", name: "手机传来的实验", subject: "biology", theme: "t-mint", steps: [{ id: "s1", title: "划线", text: "接种", images: [] }] } };
  window.fetch = async (url) => {
    const u = String(url);
    if (u.indexOf("/api/download") >= 0) {
      if (u.indexOf("dl-bad") >= 0) return { ok: true, status: 200, text: async () => "{坏" };
      return { ok: true, status: 200, text: async () => JSON.stringify(pack) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  LAN.base = "http://127.0.0.1:8000";
  LAN.online = true;
  /* 让本脚本可重复运行：清掉上一轮留下的「已导入」指纹与导入记录（否则会走去重分支） */
  try { localStorage.removeItem("zhbit-lab-lan-auto"); } catch (e) { /* 忽略 */ }
  LAN.auto.store = null;
  LAN.files = [
    { id: "dl-exp", name: "手机传来的实验.json", size: 600, time: 1730000000 },
    { id: "dl-bad", name: "坏文件.json", size: 10, time: 1730000001 },
    { id: "dl-img", name: "现象.png", size: 2048, time: 1730000002 },
    { id: "dl-big", name: "太大.json", size: 30 * 1024 * 1024, time: 1730000003 },
  ];
  const before = Store.listExps().length;
  const r1 = await lanImportOnDownload("dl-exp", "手机传来的实验.json");
  out.auto_ok = r1.ok === true;
  out.auto_expCount = Store.listExps().length - before;
  out.auto_newExpName = (Store.listExps().find((x) => /互传导入/.test(x.name)) || {}).name || "";
  out.auto_oldIdKept = Store.getExp("x1") === null;
  const rRepeat = await lanImportOnDownload("dl-exp", "手机传来的实验.json");
  out.auto_repeatSkipped = rRepeat.repeated === true && Store.listExps().length === before + 1;
  const rImg = await lanImportOnDownload("dl-img", "现象.png");
  out.auto_pngSkipped = rImg.skipped === true && !lanAutoItems().some((x) => /现象\.png/.test(x.name));
  const rBad = await lanImportOnDownload("dl-bad", "坏文件.json");
  const rBig = await lanImportOnDownload("dl-big", "太大.json");
  out.auto_errs = lanAutoErrs().length;
  out.auto_errText = (lanAutoErrs()[0] || {}).msg || "";
  out.auto_bigErr = /20MB/.test(rBig.error || "");
  out.auto_records = lanAutoItems().length;
  out.auto_badReported = rBad.ok === false && /不是合法 JSON/.test(rBad.error || "");
  goTo("home");
  await wait(200);
  out.home_banner = /无法识别/.test(main()) && /去互传页查看/.test(main());
  window.fetch = realFetch;
  LAN.online = false; LAN.base = ""; LAN.files = [];
  lanAutoClear();

  /* ---------- 收尾：清掉验收数据 ---------- */
  Timer.reset(state.exp);
  Timer.stopTick();
  Store.removeExp(e.id);
  Store.listExps().filter((m) => /互传导入/.test(m.name || "")).forEach((m) => Store.removeExp(m.id));
  goTo("home");
  out.done = true;
  return out;
})()
