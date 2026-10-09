/* 真机（WebView2）验收脚本：计时器 + 互传自动导入
 * 用法：LAB_LAN_REMOTE_DEBUG=9222 启动 lab-assistant.exe 后
 *       node tools/gui-cdp.mjs --eval-file build/verify-timer-e2e.js
 */
(async () => {
  const out = {};
  const main = () => document.getElementById("main").innerHTML;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fire = (sel) => { const el = document.querySelector(sel); if (!el) throw new Error("找不到元素 " + sel); el.click(); };

  /* ---------- 1. 编辑模式：预置「本步」计时器 ---------- */
  const e = newExp("验收-计时器", "chemistry");
  e.steps[0].title = "加热";
  e.steps.push(normalizeStep({ id: uid("s_"), title: "观察现象" }));
  Store.saveExp(e);
  goTo("edit", e.id);
  /* 计时器现在是「每步一个」：编辑页预置的是当前步（第 1 步）的 step.timer */
  const stepT = () => Timer.attach(state.exp.steps[0]);
  out.edit_card = /本步计时器预设/.test(main());
  out.edit_presets6 = /data-v="30"/.test(main()) && /data-v="1800"/.test(main());
  out.edit_customInputs = /data-timer="min"/.test(main()) && /data-timer="sec"/.test(main());
  out.edit_defaultText = Timer.targetText(state.exp.steps[0]);

  /* 编辑模式：自定义分 / 秒 → 应用（输入框按 data-timer-src 区分，这里取第 0 步那张卡） */
  document.querySelector('[data-timer="min"][data-timer-src="0"]').value = "0";
  document.querySelector('[data-timer="sec"][data-timer-src="0"]').value = "45";
  fire('[data-act="timer-custom"]');
  await wait(200);
  out.edit_custom45 = Timer.targetText(state.exp.steps[0]);

  /* 点预设 30s，确认 chip 存在 */
  const chip5 = Array.from(document.querySelectorAll('[data-act="timer-target"]')).find((b) => b.dataset.v === "30");
  if (!chip5) throw new Error("找不到 30s 预设 chip");
  out.edit_hasPreset30 = true;

  /* 改用「自定义 5 秒」以便快速看到到点行为 */
  document.querySelector('[data-timer="min"][data-timer-src="0"]').value = "0";
  document.querySelector('[data-timer="sec"][data-timer-src="0"]').value = "5";
  fire('[data-act="timer-custom"]');
  await wait(200);
  out.edit_custom5 = Timer.targetText(state.exp.steps[0]);
  /* ⭐ 每步独立：第 2 步的计时器不受影响 */
  out.edit_step2_untouched = stepT().target === 5 &&
    Timer.attach(state.exp.steps[1]).target === 0 && Timer.attach(state.exp.steps[1]).mode === "stopwatch";

  /* ---------- 2. 记录模式：手动启停（本步计时器 + 自由计时器两张卡） ---------- */
  goTo("record", e.id);
  out.record_bar = /data-act="timer-toggle"/.test(main()) && /data-act="timer-reset"/.test(main()) && /data-act="timer-log"/.test(main());
  out.record_targetText = /倒计时 00:05/.test(main());
  out.record_twoCards = (main().match(/data-timer-host/g) || []).length === 2;
  out.record_hasFreeTimer = /自由计时器/.test(main()) && /data-act="timer-mode"/.test(main()) &&
    /data-timer="min"/.test(main());
  out.record_step2_notShown = Timer.attach(state.exp.steps[1]).running === false;   // 第 2 步还没跑

  /* 第一张卡的「开始」= 本步计时器 */
  fire('[data-act="timer-toggle"]');
  await wait(900);
  out.record_running = stepT().running === true;
  out.record_clock_ticking = document.querySelector('[data-timer-clock][data-timer-src="0"]').textContent;
  out.record_btn_pause = /暂停/.test(main());

  /* 暂停 / 继续 */
  fire('[data-act="timer-toggle"]');
  await wait(150);
  out.paused_running = stepT().running === false;
  out.paused_accumulated = stepT().accumulated > 0;
  fire('[data-act="timer-toggle"]');
  await wait(150);

  /* 等它到点（5 秒倒计时）→ 应该写进「第 1 步」的记录 */
  await wait(5200);
  out.over_rang = stepT().rang === true;
  out.over_clock = document.querySelector('[data-timer-clock][data-timer-src="0"]').textContent;
  out.over_toast = document.getElementById("toast").textContent;
  out.over_note = state.exp.steps[0].record.note;
  out.over_noteHasLine = /\[计时\] 倒计时结束/.test(state.exp.steps[0].record.note);
  out.over_step2_untouched = !/\[计时\]/.test(state.exp.steps[1].record.note);

  /* 记一次 → 写当前步（此时在第 1 步） */
  fire('[data-act="timer-log"]');
  await wait(250);
  out.log_note = state.exp.steps[0].record.note;
  out.log_count = stepT().logs.length;

  /* 翻到第 2 步再记一次：应该写到第 2 步（用的是**第 2 步自己的**计时器） */
  fire('[data-act="play-next"]');
  await wait(200);
  /* 第 2 步的计时器还没计时 → 先给它跑起来，再记一次 */
  const step2Toggle = Array.from(document.querySelectorAll('[data-act="timer-toggle"]'))[0];
  step2Toggle.click();
  await wait(1200);
  fire('[data-act="timer-log"]');
  await wait(250);
  out.log2_step2 = state.exp.steps[1].record.note;
  out.log2_usesStep2Timer = Timer.attach(state.exp.steps[1]).logs.length >= 1;
  out.log2_step1_untouched = state.exp.steps[0].record.note === out.log_note;

  /* 自由计时器：独立于步骤，能单独跑、单独归零，且到点不写记录
     ⚠️ 断言别写死「steps[0].running === false」：前面翻到第 2 步时已经给**第 2 步**的计时器开了机，
     这时步骤计时器本来就该在跑。正确的判据是「自由计时器的运行状态与任何步骤计时器都无关」。 */
  const freeT = () => Timer.attach(state.exp);
  out.free_initial_elapsed0 = Timer.elapsed(state.exp) === 0;
  const runningSteps = () => state.exp.steps.map((s, i) => (s.timer && s.timer.running ? i : -1)).filter((i) => i >= 0);
  out.free_steps_running_before = runningSteps();
  const freeToggle = Array.from(document.querySelectorAll('[data-timer-owner="free"] [data-act="timer-toggle"]'))[0];
  if (!freeToggle) throw new Error("找不到自由计时器的开始按钮");
  freeToggle.click();
  await wait(900);
  out.free_running = freeT().running === true;
  /* 自由计时器开跑，不许改变任何步骤计时器的运行状态 */
  out.free_steps_running_after = runningSteps();
  out.free_does_not_touch_step =
    JSON.stringify(out.free_steps_running_before) === JSON.stringify(out.free_steps_running_after);
  /* 期望 _active = 当时在跑的步骤计时器数 + 自由计时器 1 条（且**不许重复**） */
  out.free_active_count = Timer._active.length;
  out.free_active_expected = out.free_steps_running_after.length + 1;
  out.free_active_no_dup =
    new Set(Timer._active.map((a) => Timer._keyOf(a.exp, a.step))).size === Timer._active.length;
  const freeNoteBefore = state.exp.steps[0].record.note;
  freeT().mode = "countdown"; freeT().target = 1; freeT().accumulated = 0;
  freeT().startAt = Date.now() - 2000; freeT().rang = false;
  await wait(400);
  out.free_over_noWrite = freeT().rang === true && state.exp.steps[0].record.note === freeNoteBefore;

  /* 归零（对第 1 步的计时器）
     ⚠️ 别写死 data-timer-src="0"：前面「翻到第 2 步」那一步已经把 ui.playIndex 变成 1，
     编辑模式的计时卡宿主也跟着变成第 2 步了 —— 写死 0 会取到 null（真机上就是这么崩的）。 */
  const playIdx = ui.playIndex;
  const stepClock = () => document.querySelector('[data-timer-clock][data-timer-src="' + playIdx + '"]');
  fire('[data-act="timer-reset"]');
  await wait(200);
  out.reset_elapsed0 = Timer.elapsed(state.exp.steps[playIdx]) === 0;
  const sc = stepClock();
  if (!sc) throw new Error('找不到第 ' + playIdx + ' 步的时钟节点（data-timer-src="' + playIdx + '"）');
  out.reset_clock = sc.textContent;

  /* ---------- 3. 报告：计时章节（逐条 + 自由计时器） ---------- */
  goTo("report", e.id);
  fire('[data-act="rep-local"]');
  await wait(500);
  const md = (Store.report(e.id) || {}).markdown || "";
  out.report_hasTimerSection = /## 计时/.test(md) && /本次总用时/.test(md);
  out.report_perStep = /### 第 1 步/.test(md);
  out.report_freeSection = /### 自由计时器/.test(md);

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
  e.steps.forEach((s) => Timer.reset(Timer.attach(s)));
  Timer.reset(Timer.attach(e));
  Timer.stopTick();
  Store.removeExp(e.id);
  Store.listExps().filter((m) => /互传导入/.test(m.name || "")).forEach((m) => Store.removeExp(m.id));
  goTo("home");
  out.done = true;
  return out;
})()
