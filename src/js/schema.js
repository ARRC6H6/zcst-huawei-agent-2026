/* ============================================================
   schema.js —— 数据结构定义（全项目唯一的「货币」）
   负责人：👑 队长
   契约见 SKILL.md §4.1。字段名一旦定下，谁都不许私自改。
   ============================================================ */

window.SS = window.SS || {};

(function (SS) {
  'use strict';

  /** 四种分类，别自己加，要加先跟对方说 */
  var CATEGORIES = ['school', 'parcel', 'ticket', 'other'];

  /** 存储 key（带版本号；改数据结构就升到 v2，见 SKILL.md 坑 B4） */
  var STORAGE_KEY = 'shishi:v1:todos';

  function pad(n, len) {
    var s = String(n);
    while (s.length < (len || 2)) s = '0' + s;
    return s;
  }

  /**
   * 生成唯一 id：t_<日期>_<4位随机>
   * ✅ 已实现，你可以照这个风格写别的函数
   */
  function newId() {
    var d = new Date();
    var date = '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    var rand = Math.random().toString(36).slice(2, 6);
    return 't_' + date + '_' + rand;
  }

  /**
   * 当前时间 -> ISO8601 带时区，例如 2026-10-02T15:00:00+08:00
   *
   * ⚠️ 不要用 new Date().toISOString()！
   * 那个返回的是 UTC（少 8 小时），是把时间搞乱的经典原因（见 SKILL.md 坑 B6）
   */
  function toIso(date) {
    var d = date || new Date();
    var off = -d.getTimezoneOffset();          // 东八区是 +480 分钟
    var sign = off >= 0 ? '+' : '-';
    var abs = Math.abs(off);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) +
      sign + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60);
  }

  /**
   * 创建一个完整的 TodoItem
   * @param {object} partial 只要给 title 就够，其它字段自动补默认值
   * @returns {object} TodoItem（结构见 SKILL.md §4.1）
   *
   * TODO（队长）：把下面这个骨架补完整
   *   必填：id、title、createdAt、updatedAt
   *   默认：startAt=null  endAt=null  location=null
   *         category='other'  source='manual'  rawText=''  done=false  meta={}
   */
  function create(partial) {
    var p = partial || {};
    return {
      id: p.id || newId(),
      title: p.title || '未命名事项',
      // TODO: startAt / endAt / location / category / source / rawText / done / meta
      createdAt: p.createdAt || toIso(),
      updatedAt: p.updatedAt || toIso()
    };
  }

  /**
   * 补默认值，让「老数据」也能用（见 SKILL.md 坑 B3）
   * 场景：以后给 TodoItem 加了新字段，localStorage 里的旧数据没有这个字段，
   *      不补默认值界面就会显示 undefined。
   *
   * TODO（队长）：
   *   用 create() 拼出默认值，再把 item 里已有的字段盖上去。
   */
  function normalize(item) {
    // TODO
    return item;
  }

  /**
   * 校验
   * @returns {{ok: boolean, errors: string[]}}
   *
   * TODO（队长）：
   *   至少检查 title 非空、id 非空、category 在 CATEGORIES 里
   */
  function validate(item) {
    // TODO
    return { ok: true, errors: [] };
  }

  SS.schema = {
    CATEGORIES: CATEGORIES,
    STORAGE_KEY: STORAGE_KEY,
    newId: newId,
    toIso: toIso,
    create: create,
    normalize: normalize,
    validate: validate
  };

})(window.SS);
