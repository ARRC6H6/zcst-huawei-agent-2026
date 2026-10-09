# 作品源码 · 实验助手 Lab Studio

> 「实验助手」—— 把一次生化实验做成一份**可编辑、可播放、可分享的流程文件**：
> 编辑模式里写好每个反应步骤（文字 / 图片 / 视频占位 / 反应方程式 / 安全 TIPS）并在画布上摆好仪器，
> 记录模式里逐步播放、边做边记，最后交给 LLM（或本地）生成实验报告参考版。

**形态**：一个网页。电脑浏览器、平板、手机都能直接打开。

---

## 怎么跑起来

**不需要装任何东西，不需要命令行，不需要联网。**

1. 双击 `src/index.html`
2. 就完了

> 手机上想看：把 `index.html` 这一个文件拷到手机，用浏览器打开即可（零依赖、零外链）。
> 想在线预览：仓库开启 GitHub Pages 后直接访问 Pages 地址。

### 可选：局域网互传（同一 Wifi 下手机 ↔ 电脑）

应用本体不需要服务端；要用「局域网互传」页，才需要在**任意一台设备**上跑一次：

```bash
python lan-server.py        # 或双击 start-lan.bat（Windows）/ ./start-lan.sh（Linux、macOS）
```

终端会打印 `同一Wifi下其他设备访问: http://192.168.x.x:8000`，其他设备浏览器打开该地址即可。
细节见 [`局域网互传-使用说明.md`](局域网互传-使用说明.md)。**不启动它，应用功能完全不变。**

---

## 文件分工（**只改自己名下的文件**）

单文件工程，所有人改的是**同一个文件的不同区段**。动手前先看 `index.html` 里的分区注释：

| 区段 | 区段注释锚点 | 负责人 | 干什么 |
| --- | --- | --- | --- |
| 1 图标与常量 | `1. 图标与常量` | 🧑‍🎓 新手 | `ICON` / `NAV` / `SUBJECTS` / `KEYS` |
| 2 通用工具 | `2. 通用工具` | 👑 队长 | `esc` / `uid` / `clamp` / `toast` / `download` |
| 3 存储层 | `3. 存储层` | 👑 队长 | `Store`（localStorage）+ `Media`（IndexedDB） |
| 3.5 计时器 | `3.5 计时器` | 👑 队长 | `Timer`（**每步一个 + 自由计时器**）/ `normalizeTimer` / `migrateTimers` / `timerEditHTML` / `timerRecordHTML` / `resolveTimer` |
| 4 主题 | `4. 主题` | 🧑‍🎓 新手 | `applyTheme` / `resolvedTheme` / 令牌 |
| 5 运行时状态 | `5. 运行时状态` | 👑 队长 | `ui` / `state` |
| ~~6 仪器库~~ | ⛔ **已移除**（2026-10-07） | — | `INST_LIB` 等已整体删除，勿再引用 |
| ~~7 仪器画布~~ | ⛔ **已移除**（2026-10-07） | — | 渲染 / Pointer 交互 / `canvasAct` 已整体删除 |
| 8 通用视图片段 | `8. 通用视图片段` | 🧑‍🎓 新手 | `pageHead` / `mediaItemHTML` |
| 9 视图 | `9. 视图` | 🧑‍🎓 新手 | `viewHome` / `viewEdit` / `viewRecord` / `viewReport` / `viewSettings` |
| 10 导航 / 路由 | `10. 导航 / 路由` | 👑 队长 | `parseHash` / `goTo` / `render` |
| 11 报告与 LLM | `11. 报告生成` | 👑 队长 | `REPORT_PROMPT` / `callLLM` / `buildLocalMarkdown` |
| 12 AI 生成实验步骤 | `12. AI 生成实验步骤` | 👑 队长 | `viewAI` / `GEN` / `GEN_PROMPT` / `aiParseJSON` / Office 解析 |
| 13 局域网互传 | `13. 局域网互传` | 👑 队长 | `viewLan` / `LAN` / `lanAct` / 分片上传 / 轮询 |
| 13.1 下载即导入 | `13.1 互传「下载即导入」` | 👑 队长 | `lanAutoDetect` / `lanAutoBuildExp` / `lanImportText` / `lanImportOnDownload` / `lanAutoHTML` / `lanAutoBanner` |
| 14 动作分发 | `14. 动作分发` | 👑 队长 | `handleAct`（唯一动作入口） |
| 15 启动 | `15. 启动` | 👑 队长 | `boot()` |
| 样式 | `<style>` 段 | 🧑‍🎓 新手 | 全部 CSS，令牌一律走 `var(--x)` |

> ⛔ **「仪器摆放」已整体移除**（需求变更）：仪器库、画布渲染与 Pointer 交互、连线、
> `cv-*` 全部动作、`step.canvas` 字段、报告里的「仪器与试剂」汇总**连代码带数据都删了**。
> 每个步骤现在只有五要素：标题 / 文字 / 图片 / 视频（占位）/ 反应方程式 / 安全 TIPS。
> `check-page.mjs` 第 2 节是**反向断言**（源码里不能再出现这些标识符），删干净之前会 FAIL。

> 📌 第 16 区段起是**内联的第三方库**（`<script id="chem-input-lib">`，React + KaTeX + mhchem），
> 由 `chem-input` 源工程构建后内联而来，**不要手改**。

⚠️ **冻结的接口契约、12 条铁律、交接流程、坑清单，全在 [`../skills/pair-dev-contract/SKILL.md`](../skills/pair-dev-contract/SKILL.md)。
动手前先读它。**

---

## 自检（动手后必跑）

```bash
node src/tools/check-syntax.mjs  src/index.html   #   2 项 内联脚本语法
node src/tools/check-page.mjs    src/index.html   # 298 项 页面与数据层（另 8 项依赖 Tauri 工程，本仓库自动跳过 → 合计 306）
node src/tools/check-isotope.mjs src/index.html   #  25 项 化学式同位素左上标
node src/tools/check-ion.mjs     src/index.html   #  64 项 离子电荷（右上角带正负号）
node src/tools/check-lan.mjs     src/index.html   #  44 项 互传端到端（自动改用同目录 lan-server.py）
node src/tools/check-mobile.mjs  src/index.html   #  75 项 手机视口（320/360/412）真浏览器：有没有被裁 + 兜底缩放
node src/tools/check-chem-ui.mjs src/index.html   #  18 项 离子输入真浏览器交互（shadow DOM 里真点、真写回数据）
node src/tools/e2e-headless.mjs                   #  65 项 真浏览器端到端（真渲染 / 真点击 / 真下载并读回离线 MD）
```

- `check-syntax.mjs`：内联的两段 `<script>` 能不能被解析（改完最容易踩的低级坑）。
- `check-page.mjs`（**306 项**）：脚本可执行 / 数据模型与持久化 / **「仪器摆放」已删干净的反向断言** /
  各视图渲染 / 本地报告与 markdown 渲染 / 注入防护 / 媒体与视频占位 / LLM 约定 / 主题三态 / 令牌完整性 /
  路由回落 / 单文件零外链形态 / AI 页 / 局域网互传页 /
  **计时器（每步独立 + 自由计时器、预设、到点写记录、报告逐条列出）** /
  **下载即导入（格式识别、去重、报错、非 .json 不处理）** / 手机端缩放声明 /
  **导出格式选择（离线 MD / 在线 JSON）** / **离线 MD 内容与图片内嵌** / **手机溢出兜底（`Fit`）**。
  其中 8 项断言同时要看 Tauri 工程（`src-tauri/` 的 Rust 与配置、`gen/android` 的 MainActivity），
  本仓库只放 Web 作品，缺这些文件时它们会显示为 `SKIP` 而不是 `FAIL`。
- `check-isotope.mjs`：抽出内联的 chem-input 库，真跑 `smartConvert` 与 KaTeX 渲染，
  断言「质量数一律落在元素符号左上角」（`^18O`、`O^18`、`H2O^18`、`C^14O2`），且不误伤 `Fe^3+` / `SO4^2-` 电荷。
- `check-ion.mjs`（64 项）：离子电荷的两层断言 —— ① 纯函数（`^3+` / `^+` / `^2-` / `^-` 的生成与范围夹取）；
  ② **真渲染结构**：电荷必须落在元素符号**右侧**的上标块（`msupsub`）里、**带正负号**，
  且没有走 KaTeX 的 `llap`（那是左上标/质量数的排法）。
- `check-mobile.mjs` / `check-chem-ui.mjs`：**真浏览器**里用同源 iframe 造手机视口
  （headless 窗口有 ~504px 最小宽度，`--window-size=360` 拿不到真视口），前者逐页量「有没有元素画到屏幕右边之外」，
  后者在 shadow DOM 里真点离子按钮并检查 `step.equation` 是否写对。
- `check-lan.mjs`：真启动服务端（默认 Rust 内置服务端；本仓库没有 `src-tauri` 时自动退回同目录的
  `lan-server.py`，两者 1:1 对齐同一套契约），跑通初始化 / 分片 / 状态 / 合并 / 列表 / 下载 / 秒传 /
  断点续传 / 空文件 / 文本互传 / 删除 / 路径穿越 / CORS。
- `check-lan-edge.mjs`（34 项）：边界 / 异常 / 重启恢复。
- `e2e-headless.mjs`（65 项）：**真浏览器**（headless Edge/Chrome）端到端 —— 真渲染 + 真点击 +
  真滚动位置断言 + **真下载并读回离线 Markdown**，验的是 DOM 桩验不到的东西（尤其「点按钮不许把页面顶回最上」）。
- `app-html.mjs`：单文件页面的定位（候选名 `原型.html` / `实验助手*.html` / `index.html` + mtime 兜底），
  上面几个脚本共用；**页面文件改名时只改这里**（本仓库里真源叫 `src/index.html`）。
- `inline-chem.mjs`：把方程式输入组件（独立工程 `chem-input`）的构建产物重新内联进 `src/index.html`
  的 `<script id="chem-input-lib">`；`--check` 只比对不写盘。本仓库没有组件工程源码，
  它找不到产物时会打印指引并以退出码 2 结束（**正常现象**，不是本仓库的校验项）。

**必须全部 `失败 0` 才算没跑偏。** 这条同时是蓝图 §11 第 10 项验收标准。

浏览器里还有一层手动自检（F12 控制台）：

```js
KEYS.exps                // -> 'zhbit-lab-exps'
parseHash()              // -> { view: 'home', param: null }
Store.listExps().length  // -> 0（或你存进去的实验数量）
NAV.length               // -> 7（含「局域网互传」）
newExp('x','chemistry').steps[0].timer.mode  // -> 'stopwatch'（每步自带一个计时器）
```

---

## 十天目标对照

| 天 | 谁 | 目标 | 状态 |
| --- | --- | --- | --- |
| D1 | 新手 | 打开 `index.html`，学会「改代码 → 保存 → 刷新看变化」 | ✅ |
| D2 | 新手 | 认准 `NAV` / `ICON` / `KEYS`：会改一个导航名、会加一个图标 | ✅ |
| D3 | 队长 | `Store` / `Media` 吃透：刷新不丢数据，脏数据被拒 | ✅ |
| D4 | 新手 | `viewEdit` 五要素输入 + `viewRecord` 播放器能显示 | ✅ |
| D5 | 队长 | ~~画布 `canvasAct` 全部动作可用~~ → **保底里程碑改为「编辑/记录双模式闭环 + 报告可出」** | ✅ |
| D6 | 队长 | `callLLM` + `buildLocalMarkdown` 双路报告都能出 | ✅ |
| D7 | 一起 | 主题三态、三端自适应、`check-page` 全绿、归档痕迹 | ✅ |

> ⚠️ **D5 的原始目标（画布 `canvasAct`）已于 2026-10-07 随「仪器摆放」整体移除**，
> 保底里程碑相应改为「编辑 / 记录双模式闭环 + 报告可出」。上面已逐一勾掉实际完成情况。

**十天之后的追加批次**（均已交付）：AI 生成实验步骤页 · 化学方程式输入器 · 局域网互传页 +
「下载即导入」· 实验卡片一键分享 · 记录模式计时器（每步独立 + 自由计时器）· Tauri 双端打包
（Windows exe / Android apk）· 图标统一为 ∞ 模板 · 设置页外链修复与教学卡折叠 · 版本 0.5.0。
**0.5.1 追加**：手机端「页面被裁」根因修复 + 真溢出才整页缩小的兜底 · 导出可选「离线 Markdown /
在线 JSON」（离线 MD 图片 base64 内嵌）· 方程式输入加「离子电荷」（`^3+` / `^+` / `^2-`，右上角带正负号）。

---

## 上游文档

- 需求与设计蓝图：[`../docs/实验助手-需求与设计蓝图.md`](../docs/实验助手-需求与设计蓝图.md)
- 接口契约（唯一权威）：[`../skills/pair-dev-contract/SKILL.md`](../skills/pair-dev-contract/SKILL.md)
- 人看的协作流程：[`../docs/工作须知.md`](../docs/工作须知.md)
