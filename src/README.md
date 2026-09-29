# 作品源码 · 拾事

> 「拾事」—— 把散落在通知、短信、课表、车票、快递里的零碎信息，
> 自动收拢成一份看得懂、会提醒你冲突的生活日志。

**形态**：一个网页。电脑浏览器、手机浏览器都能直接打开。

---

## 怎么跑起来

**不需要装任何东西，不需要命令行。**

1. 双击 `index.html`
2. 就完了

> 手机上想看：把整个 `src` 文件夹拷到手机，用浏览器打开 `index.html`；
> 或者把文件夹传到局域网里，手机浏览器访问。

---

## 文件分工（**只改自己名下的文件**）

| 文件 | 负责人 | 干什么 |
| --- | --- | --- |
| `index.html` | 🧑‍🎓 新手 | 页面骨架，只放标签，不写逻辑 |
| `css/style.css` | 🧑‍🎓 新手 | 全部样式 |
| `js/ui.js` | 🧑‍🎓 新手 | 界面层：渲染清单、显示结果 |
| `js/schema.js` | 👑 队长 | 数据结构 |
| `js/parser.js` | 👑 队长 | 解析引擎 |
| `js/storage.js` | 👑 队长 | 本地存储 |
| `js/app.js` | 👑 队长 | 入口接线 |
| `js/config.js` | 👑 队长 | 配置（**不放密钥**） |
| `js/config.local.js` | 👑 队长 | 密钥（**不进 git**，自己新建） |

⚠️ **详细的接口契约、交接流程、22 条坑，全在 [`../skills/pair-dev-contract/SKILL.md`](../skills/pair-dev-contract/SKILL.md)。动手前先读它。**

---

## TODO 清单（做完一条勾一条）

### 👑 队长

- [ ] `schema.js` · `create()` —— 补全 TodoItem 的所有字段
- [ ] `schema.js` · `normalize()` —— 补默认值，兼容老数据
- [ ] `schema.js` · `validate()` —— 校验 title / id / category
- [ ] `storage.js` · `load()` —— **记得包 try/catch**（这条最容易白屏）
- [ ] `storage.js` · `save()` / `add()` / `update()` / `remove()` —— 全部返回新数组
- [ ] `parser.js` · `parse()` —— 规则解析（中文时间、地点、事项）
- [ ] `app.js` · `filterToday()` —— 筛出今天的条目
- [ ] `parser.js` · `parseByAI()` —— 大模型解析（D6）

### 🧑‍🎓 新手

- [ ] `ui.js` · `render()` —— 渲染待办清单（**D4 的主任务**）
- [ ] `ui.js` · `showParseResult()` —— 显示解析结果卡片
- [ ] `ui.js` · `bindManual()` —— 手动录入（可选）
- [ ] `css/style.css` —— 把界面调好看（随便改，别怕）
- [ ] `index.html` —— 按需要补控件

---

## 十天目标对照

| 天 | 谁 | 目标 |
| --- | --- | --- |
| D1 | 新手 | 打开环境，学会「改代码 → 保存 → 刷新看变化」 |
| D2 | 新手 | 骨架已经搭好了，确认页面能打开、底栏有字 |
| D3 | 队长 | `parser.js` 的规则解析能用 |
| D4 | 新手 | `render()` + `showParseResult()` 写完，清单能显示 |
| D5 | 队长 | `storage.js` 全部写完，**刷新数据不丢**（保底里程碑） |
| D6 | 队长 | 接大模型，`parseByAI()` 能用 |
| D7 | 一起 | 手动录入 + 美化 + 录屏 + 归档痕迹 |

> 做到 D5 就算**保底成功**。别为了冲进度把前面的做塌。

---

## 自检

```js
// 在浏览器里按 F12 打开控制台，粘这几行，应该都不报错：
SS.schema.newId()          // -> 't_20261001_xxxx'
SS.schema.toIso()          // -> '2026-10-01T20:00:00+08:00'
SS.storage.load()          // -> []（或者你存进去的数组）
SS.ui.getInputText()       // -> ''（文本框里的内容）
```
