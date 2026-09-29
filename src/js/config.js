/* ============================================================
   config.js —— 配置（可提交版）
   负责人：👑 队长

   ⚠️ 这个文件会进 git，所以：
      · 这里永远不放密钥
      · 密钥写在 js/config.local.js 里（已加入 .gitignore，不会提交）

   接大模型时的两步：
     1. 新建 src/js/config.local.js，内容：
          window.SS = window.SS || {};
          SS.config.AI.enabled = true;
          SS.config.AI.endpoint = 'https://...';
          SS.config.AI.apiKey = 'sk-...';
     2. 在 index.html 里加一行（放 config.js 之后、parser.js 之前）：
          <script src="js/config.local.js"></script>
   ============================================================ */

window.SS = window.SS || {};

(function (SS) {
  'use strict';

  SS.config = {
    /** 大模型配置；初版保持关闭，用规则解析（保底策略，见 SKILL.md §4.2） */
    AI: {
      enabled: false,
      endpoint: '',
      apiKey: '',
      model: ''
    },

    /** 快递在驿站保管几天，超期退回 */
    PARCEL_KEEP_DAYS: 7,

    /** 一天里待办超过多少条就提示「今天有点满」 */
    HEAVY_DAY_THRESHOLD: 5
  };

})(window.SS);
