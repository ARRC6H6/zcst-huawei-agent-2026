/* ============================================================
   storage.js —— 本地存储（localStorage）
   负责人：👑 队长
   契约见 SKILL.md §4.3

   🔴 两条铁律：
      1. load() 出错必须返回 []，永远不返回 null（否则上层崩）
      2. 所有函数都返回「全新的数组」，不许原地改（否则两边数据串味）
   ============================================================ */

window.SS = window.SS || {};

(function (SS) {
  'use strict';

  const KEY = (SS.schema && SS.schema.STORAGE_KEY) || 'shishi:v1:todos';

  /**
   * 读取全部待办
   * @returns {Array} TodoItem[]，出错时返回 []
   *
   * TODO（👑 队长 · D5 的任务）：
   *
   *   var raw = localStorage.getItem(KEY);
   *   if (!raw) return [];
   *   try {
   *     var arr = JSON.parse(raw);
   *     if (!Array.isArray(arr)) return [];
   *     return arr.map(SS.schema.normalize);   // 补默认值，兼容老数据
   *   } catch (e) {
   *     console.warn('[storage] 数据坏了，已重置', e);
   *     return [];                              // ⚠️ 关键：绝不能把异常抛出去
   *   }
   *
   * ⚠️ 为什么一定要 try/catch：localStorage 里一旦有坏数据，
   *    JSON.parse 会抛异常，整个页面就白屏了（见 SKILL.md 坑 B2）
   */
  function load() {
    // TODO
    return [];
  }

  /**
   * 覆盖保存
   * @returns {Array} 保存后的数组
   *
   * TODO（👑 队长）：JSON.stringify + localStorage.setItem，返回传进来的数组
   */
  function save(items) {
    // TODO
    return [];
  }

  /**
   * 新增一条
   * @returns {Array} 新的完整数组（不是在原数组上 push！）
   *
   * TODO（👑 队长）：
   *   把 item 先过一遍 SS.schema.create() 补全字段，再拼到数组末尾。
   *   别忘了写 createdAt / updatedAt（用 SS.schema.toIso()）
   */
  function add(item) {
    // TODO
    return [];
  }

  /**
   * 改一条
   * @returns {Array} 新的完整数组
   *
   * TODO（👑 队长）：按 id 找到那一条，浅合并 patch，更新时间戳
   *   提示：map + 展开运算符，别直接改原对象
   */
  function update(id, patch) {
    // TODO
    return [];
  }

  /**
   * 删一条
   * @returns {Array} 新的完整数组
   *
   * TODO（👑 队长）：filter 掉对应 id
   */
  function remove(id) {
    // TODO
    return [];
  }

  SS.storage = {
    KEY: KEY,
    load: load,
    save: save,
    add: add,
    update: update,
    remove: remove
  };

})(window.SS);
