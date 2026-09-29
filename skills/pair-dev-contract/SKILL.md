---
name: pair-dev-contract
description: >
  珠科×华为云码道 Agent 创新赛「生活助手」项目的双人协作规约与接口契约。
  当用户要求写这个项目的代码、修改代码、解释代码、排查报错、设计界面时，
  必须严格遵守本文件的全部铁律与接口定义。任何与本文冲突的写法一律拒绝并提醒用户。
version: 1.0.0
updated: 2026-09-29
---

# 生活助手 · 双人协作规约（DeepSeek 工作手册）

> 这份文件是**两个人的合约**。凡是写这个项目的代码，不管谁来问，都按这份文件办。
> 目标是：**两个人各写各的，合起来一次就能跑。**

---

## 0. 怎么用这份文件

DeepSeek 网页版没有固定的「系统提示词」入口，所以用法是二选一：

**方法 A（推荐）· 上传文件**
把这份 `SKILL.md` 上传到 DeepSeek 对话里，然后发下面这段话「对表」：

```
请先完整阅读我上传的 SKILL.md，然后回答：
1. 我负责哪些文件？队长负责哪些文件？
2. 我要实现的 UI 层有哪几个函数？签名分别是什么？
3. 你作为助手，绝对不能做的三件事是什么？
4. 一条待办事项（TodoItem）有哪些字段？时间字段是什么格式？

确认无误后我们再开始写代码。
```

**只有它答对了，才继续往下干。** 答错说明它没吃进去，重新贴一遍。

**方法 B · 直接粘贴**
新建对话，第一条消息把本文件全文粘进去，然后发上面那段「对表」的话。

**每个新对话都要重来一次**（DeepSeek 不记得上一个对话的事）。

---

## 1. 项目一句话

> **把散落在通知、短信、课表、车票、快递里的零碎信息，自动收拢成一份看得懂、会提醒你冲突的生活日志。**

形态：**一个网页**（电脑浏览器 + 手机浏览器都能开）。
后续用 Capacitor 打包成安卓 APK。

---

## 2. 技术栈铁律（违反即打回）

| # | 铁律 | 原因 |
| --- | --- | --- |
| 1 | **只用原生 HTML / CSS / JavaScript** | 不装环境、不学框架，零基础也能改 |
| 2 | **禁止任何框架**（React/Vue/jQuery/Tailwind 一律不准） | 一上框架就要装 Node，零基础的人七天全耗在环境上 |
| 3 | **禁止 `import` / `export`**（不用 ES Module） | `file://` 双击打开时模块会被浏览器拦住，页面直接白屏 |
| 4 | **禁止用 `fetch` 读本地 json 文件** | `file://` 下会被 CORS 拦死 |
| 5 | **禁止硬编码任何 API Key、密码、Token** | 一旦推到 GitHub 就泄露了，且删除记录也删不干净 |
| 6 | **文件名一律小写英文**，不用中文文件名 | Windows 不区分大小写，换到别的系统会出问题 |
| 7 | **不装 Node.js、不敲命令行** | 双击 `index.html` 就能跑，这是初版的硬要求 |
| 8 | **页面必须能双击直接打开** | 评委复现成本必须是 0 |

> ⚠️ 第 3、4 条最容易犯，而且后果最严重 —— **页面直接白屏**，零基础的人根本查不出原因。

---

## 3. 文件归属（谁改哪个文件）

**规则：只改自己名下的文件。要改别人的，先说一声。**

| 文件 | 负责人 | 干什么 |
| --- | --- | --- |
| `index.html` | 🧑‍🎓 **新手** | 页面骨架，只放 `<div>` 和控件，逻辑一行都不写 |
| `css/style.css` | 🧑‍🎓 **新手** | 全部样式 |
| `js/ui.js` | 🧑‍🎓 **新手** | 界面层：渲染清单、显示结果、读输入框 |
| `js/schema.js` | 👑 **队长** | 数据结构定义 + 校验 + 默认值 |
| `js/parser.js` | 👑 **队长** | 解析引擎（规则版 + AI 版） |
| `js/storage.js` | 👑 **队长** | 本地存储（localStorage） |
| `js/app.js` | 👑 **队长** | 入口，把上面几个接起来 |
| `js/config.js` | 👑 **队长** | 配置。**只放不敏感的默认值（会进 git）** |
| `js/config.local.js` | 👑 **队长** | 密钥。**不进 git**，需要时才新建 |

**加载顺序**（写在 `index.html` 的 `</body>` 前面，顺序不能乱）：

```html
<script src="js/schema.js"></script>
<script src="js/config.js"></script>
<script src="js/parser.js"></script>
<script src="js/storage.js"></script>
<script src="js/ui.js"></script>
<script src="js/app.js"></script>
```

> 每个文件开头统一写：`window.SS = window.SS || {};`
> 全部挂到 `SS` 这个全局对象下，谁也别污染全局。

---

## 4. 冻结的接口契约 ⭐

> **这一节是整份文件的核心。签名一旦定下，两个人谁都不许私自改。**
> 要改？先跟对方说，两边一起改，改完一起测。

### 4.1 数据结构：`TodoItem`

**这是全项目唯一的「货币」**，模块之间传的、存的、显示的都是它。

```js
{
  id:        "t_20261001_4f2a",            // string  必填，格式 t_<日期>_<4位随机>
  title:     "开班会",                      // string  必填，不能为空
  startAt:   "2026-10-02T15:00:00+08:00",  // string|null  ISO8601 带时区
  endAt:     null,                          // string|null
  location:  "三教201",                     // string|null
  category:  "school",                      // "school"|"parcel"|"ticket"|"other"
  source:    "paste",                       // "paste"|"manual"|"import"
  rawText:   "明天下午3点在三教201开班会",   // string  原始输入，保留可追溯
  done:      false,                         // boolean
  createdAt: "2026-10-01T20:00:00+08:00",  // string
  updatedAt: "2026-10-01T20:00:00+08:00",  // string
  meta:      {}                             // object  分类专属字段
}
```

`meta` 按 `category` 填：

| category | meta 里放什么 |
| --- | --- |
| `parcel` 快递 | `{ carrier, pickupCode, station, arriveAt, expireAt }` |
| `ticket` 车票 | `{ trainNo, seatNo, from, to }` |
| `school` 校园 | `{ courseName, teacher }` |
| `other` 其它 | `{}` |

> 🔴 **快递 7 天倒计时的算法**：`expireAt = arriveAt + 7 天`（驿站保管 7 天，超期退回）。
> 剩余天数 = `expireAt - 今天`，**永远实时算，不存"剩余几天"**。

### 4.2 解析引擎 `SS.parser`

```js
/**
 * 把一段中文文本解析成待办
 * @param {string} rawText
 * @returns {Promise<ParseResult>}
 */
SS.parser.parse(rawText)
```

```js
// ParseResult
{
  ok:     true,                    // boolean
  engine: "rule",                  // "rule" | "ai"
  items: [                         // 可能解析出多条，一个都没有就是 []
    {
      title:      "开班会",                        // string 必填
      startAt:    "2026-10-02T15:00:00+08:00",   // string|null
      location:   "三教201",                      // string|null
      category:   "school",                       // 同 TodoItem
      confidence: 0.8                             // 0~1，规则版可以固定给 0.6
    }
  ],
  error:  null                     // string|null
}
```

> 🔴 **铁律：规则版和 AI 版必须返回完全相同的结构。**
> 这是「保底」的前提 —— AI 调不通时切成规则版，上层代码一行都不用改。
> 上层（`app.js`）**永远不许判断是哪个引擎**，只认 `ParseResult`。

### 4.3 存储层 `SS.storage`

```js
SS.storage.load()              // -> TodoItem[]   出错返回 []，永不返回 null
SS.storage.save(items)         // -> TodoItem[]
SS.storage.add(item)           // -> TodoItem[]   返回新的完整数组
SS.storage.update(id, patch)   // -> TodoItem[]
SS.storage.remove(id)          // -> TodoItem[]
```

- localStorage 的 key：**`shishi:v1:todos`**（带版本号，改结构要升版本）
- 值：`JSON.stringify(items)`

> 🔴 **铁律：storage 的函数永远返回全新数组，不许原地改。**
> 两边拿到同一个引用，一个人改了另一个人的数据就莫名其妙变了。

### 4.4 界面层 `SS.ui`（🧑‍🎓 新手实现）

```js
SS.ui.getInputText()            // -> string    读文本框内容（去掉首尾空格）
SS.ui.render(items)             // -> void      重绘整个清单；传 [] 要显示空状态
SS.ui.showParseResult(result)   // -> void      显示解析结果卡片
SS.ui.setStatus(text)           // -> void      底部/顶部显示一行提示文字
SS.ui.bindParse(handler)        // handler(rawText)  绑定「解析」按钮
SS.ui.bindAdd(handler)          // handler()         绑定「加入待办」按钮
SS.ui.bindView(handler)         // handler('all'|'today')  绑定「全部 / 今日」切换
SS.ui.setAddEnabled(on)         // -> void      控制「加入待办」按钮能不能点
SS.ui.bindManual(handler)       // handler()         绑定「手动录入」按钮（可选）
```

`render(items)` 里每条要显示：**标题、时间、地点、是否完成**，并带「完成」「删除」两个按钮。

> 📌 **脚手架已就位**：`src/` 里已经把上面这些函数名都摆好了。
> `getInputText` / `setStatus` / `bindParse` / `bindAdd` / `bindView` / `setAddEnabled`
> 已经写好当范例；**剩下 `render` / `showParseResult` / `bindManual` 三个是新手的作业**。
> 队长那边的 `parser.parse` / `storage.*` / `schema.create` 也留了 TODO 和实现提示。

### 4.5 接线（👑 队长写在 `app.js`）

```js
window.SS = window.SS || {};

SS.ui.bindParse(async (text) => {
  if (!text) { SS.ui.setStatus('先粘一段文字进来吧'); return; }
  SS.ui.setStatus('解析中…');
  const result = await SS.parser.parse(text);
  SS.ui.showParseResult(result);
});

SS.ui.bindAdd(() => {
  const items = SS.storage.add(pendingItem);   // pendingItem 由 showParseResult 后写入
  SS.ui.render(items);
});
```

---

## 5. 命名规范

| 类型 | 规范 | 例子 |
| --- | --- | --- |
| 文件名 | 全小写英文 | `parser.js` ✅ `解析.js` ❌ |
| 全局命名空间 | 统一挂 `SS` | `SS.parser.parse()` |
| 函数 / 变量 | camelCase | `getInputText` |
| 常量 | UPPER_SNAKE | `MAX_ITEMS` |
| 待办 id | `t_` 前缀 | `t_20261001_4f2a` |
| 存储 key | `shishi:` 前缀 | `shishi:v1:todos` |
| CSS 类名 | kebab-case | `.todo-item` |

---

## 6. 交接流程

### 开工前（每天第一件事）

1. **拉最新代码**（队长操作）
2. 看一眼对方昨天动了哪些文件
3. 确认自己今天只碰自己名下的文件

### 收工前（每天最后一件事）

1. **保证页面能打开、控制台不报红**（这一步没做到不许走）
2. 提交推送（队长操作）
3. **口头/群里说一句**：今天改了哪个文件、加了什么功能
4. **截图归档**到 `.evidence/02-ai-prompts/`，并往 `docs/码道开发记录.md` 补一行

### 冲突预防三条

- 一个功能**只由一个人做完**，别两个人同时写
- 要改对方的文件 → **先说一声**，改完通知回去
- 传文件时**整个文件夹打包**，别只发 `index.html`（漏了 `js/` 会白屏）

---

## 7. 坑清单（血泪版）

### A. 打开就跑不起来

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| A1 | 页面**全白**，控制台报 `Cannot use import statement outside a module` | 用了 `import` / `export`，`file://` 不支持模块 | **禁用 ES Module**，用普通 `<script>` + 全局 `SS` |
| A2 | 页面白，报 CORS / `Failed to fetch` | 用 `fetch` 读了本地 `.json` 文件 | 数据放 `localStorage`，或直接写死在 `.js` 里 |
| A3 | 中文全变成「锟斤拷」或方块 | 缺 `<meta charset="utf-8">` | `index.html` 的 `<head>` 第一行就写上 |
| A4 | 改完没反应，还是老样子 | 浏览器缓存了旧的 js | `Ctrl + F5` 强制刷新；或 `F12` → Network 勾 Disable cache |
| A5 | 点按钮没反应，也没报错 | 脚本加载顺序错了，`ui.js` 在 `schema.js` 前面 | 严格按 §3 的顺序写 `<script>` |
| A6 | 别人电脑上打不开 | 用了绝对路径 `C:\Users\...` | 一律用相对路径 `js/ui.js` |
| A7 | 报 `xxx is not defined` | 忘了挂到 `SS` 上，或文件没引入 | 每个文件开头写 `window.SS = window.SS || {};` |

### B. 数据存不住 / 存坏了

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| B1 | 刷新后数据全没了 | 存的是对象没 `JSON.stringify` | 存前 `stringify`，读后 `parse` |
| B2 | 页面直接白屏 | localStorage 里是坏数据，`JSON.parse` 抛异常 | **`load()` 必须包 `try/catch`，出错返回 `[]`** |
| B3 | 老数据没有新字段，界面显示 `undefined` | 数据结构升级了但老数据还在 | 读取时**补默认值**（`Object.assign(默认值, 老数据)`） |
| B4 | 改了字段，别人的数据读不出来 | 没升版本号 | 存储 key 带版本 `shishi:v1:todos`，改结构就升到 `v2` |
| B5 | 一个人改了数据，另一个人的也跟着变 | 两边共用同一个数组引用 | **所有函数返回新数组**，用 `{...item}` / `[...items]` |
| B6 | 时间排序乱了 | 存的是 `"明天下午3点"` 这种文字 | **一律存 ISO8601**（`2026-10-02T15:00:00+08:00`），显示时才转文字 |
| B7 | 列表里出现两条一模一样的 | id 重复（用了 `Math.random()` 太小） | id 用「时间戳 + 随机」`t_20261001_4f2a` |

### C. 两个人对不上

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| C1 | 合并后一堆冲突，代码看不懂 | **两个人同时改了同一个文件** | 严格按 §3 的文件归属，只改自己那份 |
| C2 | 报 `SS.parser.parse is not a function` | 一方把函数改名了，另一方不知道 | **接口签名冻结**（§4），要改必须两边一起改 |
| C3 | 上层代码崩了 | 规则版返回数组，AI 版返回对象 | **两个引擎返回同一个 `ParseResult` 结构** |
| C4 | 一方跑得起来，另一方白屏 | 传文件漏了 `js/` 目录 | 传**整个文件夹**，不要单个文件 |
| C5 | 昨天写好的功能今天不见了 | 一方用旧版本覆盖了新的 | 开工前先拉最新；收工前必须提交 |
| C6 | 两个人对「完成」的定义不一样 | 没沟通就各自实现 | 有歧义先问，别自己猜 |
| C7 | **API Key 被推到 GitHub 了** | 硬编码在 `config.js` 里 | 密钥只写 `js/config.local.js`（已在 `.gitignore` 里）；`config.js` 里永远只放不敏感的默认值 |
| C8 | 没报错但就是不对 | 一方改了逻辑没通知另一方 | **收工前口头说一句「改了啥」** —— 这条最土也最有用 |

### D. 调大模型 API

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| D1 | 浏览器直连 API 报 CORS 错误 | 大多数大模型接口不给浏览器跨域 | **初版先用规则解析**；要直连走「本地小转发」或选支持 CORS 的服务 |
| D2 | 返回的不是 JSON，解析崩了 | 模型爱在 JSON 外面加解释、加 ```json | Prompt 里写死「**只输出 JSON，不要任何解释、不要代码块标记**」，解析前先剥掉首尾杂字符 |
| D3 | 偶尔解析出乱七八糟的东西 | 模型不稳定 | `try/catch` 兜住，失败就**回退规则解析**（保底） |
| D4 | 解析不出时间 | 只给了「下周三」这种相对时间 | 把**今天的日期**塞进 Prompt，让模型算绝对日期 |
| D5 | 每次结果不一样 | 温度参数太高 | `temperature` 设 0 ~ 0.2 |
| D6 | 调用很慢，界面卡住 | 同步等待 | 调用期间把按钮置灰 + 显示「解析中…」 |

### E. 到最后才发现

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| E1 | 交材料时**没有码道痕迹** | 攒到最后才补，补不出来 | **每天收工前 15 分钟**截图归档，这是死规矩 |
| E2 | 评委电脑上跑不起来 | 只在开发机验证过 | 阶段 3 换一台干净电脑，照 README 走一遍 |
| E3 | **APK 打不出来** | 拖到最后才发现环境不对 | **国庆期间就先打个 Hello World 的 APK 验证链路** |
| E4 | 演示当天数据是空的 | 演示数据在开发机的 localStorage 里 | 准备一个「一键灌演示数据」的按钮 |

---

## 8. 给 AI 的行为规范

**必须做：**

1. 写任何代码**之前**，先用一句话复述：「我理解的数据结构是 …，这次要改的是 … 函数」
2. **只输出要改的那部分**，不要整个文件重写
3. 输出后说明：**改了哪个文件的哪个函数、怎么验证它好了**
4. 时间一律用 **ISO8601 带 `+08:00`** 格式
5. 涉及 `localStorage` 一律包 `try/catch`
6. 有不确定性就明说「我不确定 X，建议你先试 Y」

**绝对不能做：**

1. ❌ 引入任何框架、库、CDN 链接
2. ❌ 使用 `import` / `export` / `type="module"`
3. ❌ 硬编码 API Key、Token、密码
4. ❌ 私自改动 §4 里的接口签名
5. ❌ 把整个文件重写成完全不同的结构（零基础的人看不懂、会崩）
6. ❌ 假设用户懂命令行、懂 Git、懂构建工具 —— **他不敲命令行的**

**当用户问的问题需要改接口时：**

> 先停下来，回一句：
> 「这会动到冻结的接口 `xxx`，建议你先跟队长确认一下，确认了我再写。」

---

## 9. 一句话总结

> **接口冻死，文件分家，每天对表，收工截图。**
> 做到这十六个字，双人编程就不会互相踩脚。
