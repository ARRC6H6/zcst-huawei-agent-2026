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
| 4 主题 | `4. 主题` | 🧑‍🎓 新手 | `applyTheme` / `resolvedTheme` / 令牌 |
| 5 运行时状态 | `5. 运行时状态` | 👑 队长 | `ui` / `state` |
| 6 仪器库 | `6. 仪器库` | 🧑‍🎓 新手 | `INST_CATS` / `INST_LIB`（只追加条目） |
| 7 仪器画布 | `7. 仪器画布` | 👑 队长 | 渲染 + Pointer 交互 + `canvasAct` |
| 8 通用视图片段 | `8. 通用视图片段` | 🧑‍🎓 新手 | `pageHead` / `mediaItemHTML` |
| 9 视图 | `9. 视图` | 🧑‍🎓 新手 | `viewHome` / `viewEdit` / `viewRecord` / `viewReport` / `viewSettings` |
| 10 导航 / 路由 | `10. 导航 / 路由` | 👑 队长 | `parseHash` / `goTo` / `render` |
| 11 报告与 LLM | `11. 报告生成` | 👑 队长 | `REPORT_PROMPT` / `callLLM` / `buildLocalMarkdown` |
| 12 AI 生成实验步骤 | `12. AI 生成实验步骤` | 👑 队长 | `viewAI` / `GEN` / `GEN_PROMPT` / `aiParseJSON` / Office 解析 |
| 13 局域网互传 | `13. 局域网互传` | 👑 队长 | `viewLan` / `LAN` / `lanAct` / 分片上传 / 轮询 |
| 14 动作分发 | `14. 动作分发` | 👑 队长 | `handleAct`（唯一动作入口） |
| 15 启动 | `15. 启动` | 👑 队长 | `boot()` |
| 样式 | `<style>` 段 | 🧑‍🎓 新手 | 全部 CSS，令牌一律走 `var(--x)` |

> 📌 第 16 区段起是**内联的第三方库**（`<script id="chem-input-lib">`，React + KaTeX + mhchem），
> 由 `chem-input` 源工程构建后内联而来，**不要手改**。

⚠️ **冻结的接口契约、12 条铁律、交接流程、坑清单，全在 [`../skills/pair-dev-contract/SKILL.md`](../skills/pair-dev-contract/SKILL.md)。
动手前先读它。**

---

## 自检（动手后必跑）

```bash
node src/tools/check-page.mjs    src/index.html   # 153 项（工作区放有课程素材时 155 项）
node src/tools/check-isotope.mjs src/index.html   # 25 项
node src/tools/check-lan.mjs     src/index.html   # 33 项
```

- `check-page.mjs`：脚本可执行 / 仪器库与替换接口 / 数据模型与持久化 / 画布交互 / 各视图渲染 /
  本地报告与 markdown 渲染 / 注入防护 / 媒体与视频占位 / LLM 约定 / 主题三态 / 令牌完整性 /
  路由回落 / 单文件零外链形态 / AI 页 / 局域网互传页。
- `check-isotope.mjs`：抽出内联的 chem-input 库，真跑 `smartConvert` 与 KaTeX 渲染，
  断言「质量数一律落在元素符号左上角」（`^18O`、`O^18`、`H2O^18`、`C^14O2`），且不误伤 `Fe^3+` / `SO4^2-` 电荷。
- `check-lan.mjs`：真启动 `lan-server.py`，跑通初始化 / 分片 / 状态 / 合并 / 列表 / 下载 / 秒传 /
  断点续传 / 空文件 / 文本互传 / 删除 / 路径穿越 / CORS。

**三套必须全部 `失败 0` 才算没跑偏。** 这条同时是蓝图 §11 第 10 项验收标准。

浏览器里还有一层手动自检（F12 控制台）：

```js
INST_LIB.length          // -> 36
KEYS.exps                // -> 'zhbit-lab-exps'
parseHash()              // -> { view: 'home', param: null }
Store.listExps().length  // -> 0（或你存进去的实验数量）
NAV.length               // -> 7（含「局域网互传」）
```

---

## 十天目标对照

| 天 | 谁 | 目标 |
| --- | --- | --- |
| D1 | 新手 | 打开 `index.html`，学会「改代码 → 保存 → 刷新看变化」 |
| D2 | 新手 | 认准 `INST_LIB` 与 `NAV`：会加一个仪器、会改一个导航名 |
| D3 | 队长 | `Store` / `Media` 吃透：刷新不丢数据，脏数据被拒 |
| D4 | 新手 | `viewEdit` 五要素输入 + `viewRecord` 播放器能显示 |
| D5 | 队长 | 画布 `canvasAct` 全部动作可用（**保底里程碑**） |
| D6 | 队长 | `callLLM` + `buildLocalMarkdown` 双路报告都能出 |
| D7 | 一起 | 主题三态、三端自适应、`check-page` 全绿、归档痕迹 |

> 做到 D5 就算**保底成功**。别为了冲进度把前面的做塌。

---

## 上游文档

- 需求与设计蓝图：[`../docs/实验助手-需求与设计蓝图.md`](../docs/实验助手-需求与设计蓝图.md)
- 接口契约（唯一权威）：[`../skills/pair-dev-contract/SKILL.md`](../skills/pair-dev-contract/SKILL.md)
- 人看的协作流程：[`../docs/工作须知.md`](../docs/工作须知.md)
