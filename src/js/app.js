/* ============================================================
   app.js —— 入口，把上面几个模块接起来
   负责人：👑 队长
   契约见 SKILL.md §4.5

   这个文件是「接线板」：
   新手的界面层（ui）和队长的逻辑层（parser / storage）在这里对接。
   两边谁都不用管对方内部怎么实现。
   ============================================================ */

window.SS = window.SS || {};

(function (SS) {
  'use strict';

  /** 刚解析出来、还没入库的那一条 */
  var pendingItem = null;

  /** 当前视图：'all' 全部 | 'today' 今日 */
  var currentView = 'all';

  /* ------------------------------------------------------------
     启动
     ------------------------------------------------------------ */
  function boot() {
    SS.ui.init();
    SS.ui.bindParse(onParse);
    SS.ui.bindAdd(onAdd);
    SS.ui.bindView(onViewChange);
    SS.ui.setAddEnabled(false);

    refresh();
    SS.ui.setStatus('骨架已就绪 · 待实现见 src/README.md 的 TODO 清单');
  }

  /* ------------------------------------------------------------
     解析
     ------------------------------------------------------------ */
  function onParse(text) {
    if (!text) {
      SS.ui.setStatus('先在文本框里粘一段文字');
      return;
    }

    SS.ui.setStatus('解析中…');

    Promise.resolve()
      .then(function () { return SS.parser.parseAuto(text); })
      .then(function (result) {
        if (!result || !result.ok || !result.items || result.items.length === 0) {
          pendingItem = null;
          SS.ui.setAddEnabled(false);
          SS.ui.showParseResult(result || { items: [] });
          SS.ui.setStatus('没解析出来：' + ((result && result.error) || '文本里可能没有时间或地点'));
          return;
        }

        pendingItem = SS.schema.create(result.items[0]);
        SS.ui.showParseResult(result);
        SS.ui.setStatus('解析成功（' + result.engine + ' 引擎），点「加入待办」');
      })
      .catch(function (err) {
        pendingItem = null;
        SS.ui.setAddEnabled(false);
        SS.ui.setStatus('解析出错：' + (err && err.message ? err.message : err));
      });
  }

  /* ------------------------------------------------------------
     加入待办
     ------------------------------------------------------------ */
  function onAdd() {
    if (!pendingItem) {
      SS.ui.setStatus('先解析一条，再点「加入待办」');
      return;
    }
    var items = SS.storage.add(pendingItem);
    pendingItem = null;
    SS.ui.setAddEnabled(false);
    refresh(items);
    SS.ui.setStatus('已加入待办');
  }

  /* ------------------------------------------------------------
     视图切换
     ------------------------------------------------------------ */
  function onViewChange(view) {
    currentView = view;
    refresh();
  }

  /** 取出要显示的数据（全部 / 今天）并让界面重画 */
  function refresh(items) {
    var all = items || SS.storage.load();
    var shown = currentView === 'today' ? filterToday(all) : all;
    SS.ui.render(shown);
    SS.ui.setStatus(
      currentView === 'today'
        ? '今日 ' + shown.length + ' 条'
        : '全部 ' + all.length + ' 条'
    );
  }

  /**
   * 筛出「今天」的条目
   *
   * TODO（👑 队长 · D5 的任务）：
   *   只保留 startAt 落在今天的条目。
   *   提示：startAt 形如 '2026-10-02T15:00:00+08:00'，
   *        对比前 10 位（'2026-10-02'）和今天的日期字符串就行。
   *        没有 startAt 的条目不算今天（或者你想算也行，先定死一个口径，别两边理解不一样）。
   */
  function filterToday(items) {
    // TODO
    return items;
  }

  /* ------------------------------------------------------------
     页面加载完就启动
     ------------------------------------------------------------ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window.SS);
