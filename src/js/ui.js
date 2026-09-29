/* ============================================================
   ui.js —— 界面层
   负责人：🧑‍🎓 新手
   契约见 SKILL.md §4.4

   这个文件里已经有几个「范例函数」是写好的（标了 ✅），
   照着它们的风格，把标了 TODO 的两个函数补上就行。
   ============================================================ */

window.SS = window.SS || {};

(function (SS) {
  'use strict';

  /** 缓存 DOM 元素，别每次都 document.getElementById */
  var el = {};

  /** app.js 通过 bindXxx 塞进来的回调 */
  var handlers = { parse: null, add: null, view: null };

  /** 页面加载后调用一次 */
  function init() {
    el.input     = document.getElementById('raw-input');
    el.btnParse  = document.getElementById('btn-parse');
    el.btnAdd    = document.getElementById('btn-add');
    el.btnManual = document.getElementById('btn-manual');
    el.resultBox = document.getElementById('parse-result');
    el.list      = document.getElementById('todo-list');
    el.empty     = document.getElementById('empty-state');
    el.status    = document.getElementById('status-bar');
    el.viewAll   = document.getElementById('btn-view-all');
    el.viewToday = document.getElementById('btn-view-today');
  }

  /* ------------------------------------------------------------
     ✅ 以下五个是「范例」，已经写好了。
        你写 render() 和 showParseResult() 的时候，照着它们的风格来。
     ------------------------------------------------------------ */

  /** ✅ 读输入框的内容 */
  function getInputText() {
    return el.input ? el.input.value.trim() : '';
  }

  /** ✅ 在底栏显示一行提示文字 */
  function setStatus(text) {
    if (el.status) el.status.textContent = text;
  }

  /** ✅ 绑定「解析」按钮 */
  function bindParse(handler) {
    handlers.parse = handler;
    if (el.btnParse) {
      el.btnParse.addEventListener('click', function () {
        handler(getInputText());
      });
    }
  }

  /** ✅ 绑定「加入待办」按钮 */
  function bindAdd(handler) {
    handlers.add = handler;
    if (el.btnAdd) {
      el.btnAdd.addEventListener('click', function () { handler(); });
    }
  }

  /** ✅ 绑定「全部 / 今日」切换 */
  function bindView(handler) {
    handlers.view = handler;
    function pick(view, activeBtn, otherBtn) {
      if (activeBtn)  activeBtn.classList.add('is-active');
      if (otherBtn)   otherBtn.classList.remove('is-active');
      handler(view);
    }
    if (el.viewAll) {
      el.viewAll.addEventListener('click', function () { pick('all', el.viewAll, el.viewToday); });
    }
    if (el.viewToday) {
      el.viewToday.addEventListener('click', function () { pick('today', el.viewToday, el.viewAll); });
    }
  }

  /** ✅ 控制「加入待办」按钮能不能点 */
  function setAddEnabled(on) {
    if (el.btnAdd) el.btnAdd.disabled = !on;
  }

  /* ------------------------------------------------------------
     TODO（🧑‍🎓 新手）：下面两个是你要写的
     ------------------------------------------------------------ */

  /**
   * TODO · D4 的任务：渲染待办清单
   * @param {Array} items TodoItem[]
   *
   * 要做的事：
   *   1. 先把 el.list 清空（el.list.innerHTML = ''）
   *   2. items 是空数组时，把 el.empty 显示出来（el.empty.hidden = false），然后 return
   *   3. 不是空数组时，把 el.empty 藏起来（el.empty.hidden = true）
   *   4. 遍历 items，每条造一个 <li class="todo-item"> 塞进 el.list
   *
   * 每条要显示（对应 SKILL.md §4.4）：
   *   · 标题    -> <span class="todo-title">
   *   · 时间    -> 在 <div class="todo-meta"> 里
   *   · 地点    -> 同上
   *   · 已完成  -> 给 <li> 加上 is-done 这个 class（样式已经写好了）
   *   · 「完成」按钮 -> 点击后调用 SS.storage.update(id, { done: true }) 再重新渲染
   *   · 「删除」按钮 -> 点击后调用 SS.storage.remove(id) 再重新渲染
   *
   * 小提示：
   *   · 用 document.createElement，别用 innerHTML 拼字符串（容易出 XSS 和引号问题）
   *   · 时间想显示成「今天 15:00」这种好看的样子，可以写个 formatTime() 小函数
   *   · 不知道怎么下手，就把这段注释整个丢给 DeepSeek，让它先写第一版
   */
  function render(items) {
    // TODO
  }

  /**
   * TODO · D4 的任务：显示解析结果卡片
   * @param {object} result ParseResult
   *
   * 要做的事：
   *   1. 把 el.resultBox 的 hidden 去掉（el.resultBox.hidden = false）
   *   2. 在里面显示解析出来的第一条：事项 / 时间 / 地点
   *      （可以直接照着 css 里 .result-fields / .result-field 的类名写）
   *   3. 显示的时候记得调 setAddEnabled(true)，让「加入待办」能点
   *
   * 注意：items 可能为空，为空时把卡片藏起来 + setAddEnabled(false)
   */
  function showParseResult(result) {
    // TODO
  }

  /**
   * TODO（可选 · 加分）：手动录入
   *
   * 「手动录入」按钮（id 是 btn-manual）现在是没反应的，因为解析不准的时候
   * 需要能自己加一条。最简单的做法：点一下弹两个 prompt() 问事项和时间，
   * 拼成一条丢给 SS.storage.add()。
   * 想做好看点就自己搭一个小表单，不用急。
   */
  function bindManual(handler) {
    // TODO
  }

  SS.ui = {
    init: init,
    getInputText: getInputText,
    setStatus: setStatus,
    bindParse: bindParse,
    bindAdd: bindAdd,
    bindView: bindView,
    setAddEnabled: setAddEnabled,
    render: render,
    showParseResult: showParseResult,
    bindManual: bindManual
  };

})(window.SS);
