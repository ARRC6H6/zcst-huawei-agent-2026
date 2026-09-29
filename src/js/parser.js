/* ============================================================
   parser.js —— 解析引擎（作品的「心脏」）
   负责人：👑 队长
   契约见 SKILL.md §4.2

   🔴 两条铁律：
      1. 返回的永远是 ParseResult { ok, engine, items, error }
      2. 规则版和 AI 版必须返回完全相同的结构
         这样 AI 调不通时切成规则版，上层代码一行都不用改
   ============================================================ */

window.SS = window.SS || {};

(function (SS) {
  'use strict';

  /**
   * 解析一段中文文本 -> 待办
   * @param {string} rawText
   * @returns {Promise<object>} ParseResult
   *
   * ParseResult = {
   *   ok:     boolean,
   *   engine: 'rule' | 'ai',
   *   items:  [{ title, startAt, location, category, confidence }],
   *   error:  string | null
   * }
   *
   * TODO（队长）：规则解析版 —— 这是国庆第 D3 天的任务
   *
   * 提示：中文时间表达可以先用「关键词 + 正则」硬怼，够了。
   *   相对日：今天 / 明天 / 后天 / 大后天
   *   时段：  早上 / 上午 / 中午 / 下午 / 晚上
   *   点钟：  3点 / 3点半 / 15:00 / 15：00 / 三点
   *   地点：  「在XXX」「XXX教室」「X教XXX」「X区X栋」
   *   事项：  剩下的那部分文字，去掉时间地点就是事项
   *
   * 建议写法：
   *   1. 先把「明天」这类相对日换成绝对日期（用 SS.schema.toIso 拼）
   *   2. 再抠时间、抠地点
   *   3. 剩下的当 title
   *   4. 拿不准的时候，confidence 给低一点（比如 0.3），别硬猜
   */
  function parse(rawText) {
    var text = (rawText || '').trim();

    if (!text) {
      return Promise.resolve({
        ok: false, engine: 'rule', items: [], error: '输入是空的'
      });
    }

    // TODO: 实现规则解析
    return Promise.resolve({
      ok: false,
      engine: 'rule',
      items: [],
      error: '规则解析还没实现（见 src/README.md 的 TODO 清单）'
    });
  }

  /**
   * 大模型解析（国庆第 D6 天的任务）
   *
   * TODO（队长）：
   *   1. config.AI.enabled 为 false 时，直接 return parse(rawText)  ← 保底
   *   2. Prompt 里必须把「今天的日期」带上，否则模型算不出「下周三」是几号
   *   3. Prompt 里写死：只输出 JSON，不要解释、不要 ``` 代码块标记
   *   4. 返回后先剥掉首尾杂字符，再 JSON.parse，并且用 try/catch 兜住
   *   5. 任何一步失败 -> 回退到 parse(rawText)
   *   6. engine 字段填 'ai'
   *
   * ⚠️ 浏览器直连大模型接口通常会被 CORS 拦住（见 SKILL.md 坑 D1），
   *    先在 DeepSeek 网页里试通，再决定怎么接。
   */
  function parseByAI(rawText) {
    if (!SS.config || !SS.config.AI || !SS.config.AI.enabled) {
      return parse(rawText);
    }
    // TODO
    return parse(rawText);
  }

  /**
   * 统一入口：上层只调这个，不关心用的是哪个引擎
   */
  function parseAuto(rawText) {
    if (SS.config && SS.config.AI && SS.config.AI.enabled) {
      return parseByAI(rawText);
    }
    return parse(rawText);
  }

  SS.parser = {
    parse: parse,
    parseByAI: parseByAI,
    parseAuto: parseAuto
  };

})(window.SS);
