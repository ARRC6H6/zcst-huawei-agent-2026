# 实验助手 Lab Studio · 珠科 × 华为云「码道 Agent 创新赛」参赛作品

> 本仓库为 **华为开发者大赛 · 珠海科技学院华为云码道 Agent 创新赛** 的参赛作品仓库。
> 作品基于 **华为云码道 CodeArts** 编程智能体开发，形态为可运行、可复现的 Web 应用。

**作品一句话**：把一次生化实验做成一份**可编辑、可播放、可分享的流程文件**，并自动整理成实验报告参考版。

**⏰ 报名截止 2026-10-23（周五）** —— 倒计时与阶段安排见 [`docs/作战计划.md`](docs/作战计划.md)。

---

## 快速开始

**不需要装任何东西，不需要命令行，不需要联网。**

```bash
git clone https://github.com/ARRC6H6/zcst-huawei-agent-2026.git
cd zcst-huawei-agent-2026

# 零依赖，无需安装；直接打开：
start src/index.html          # Windows
# open src/index.html         # macOS
# xdg-open src/index.html     # Linux
```

跑验收自检（需要 Node.js，**仅用于校验，应用本身不依赖 Node**）：

```bash
node src/tools/check-syntax.mjs   src/index.html   # 内联脚本语法：2 项
node src/tools/check-page.mjs     src/index.html   # 页面与数据层：271 项（263 通过 + 8 项依赖 Tauri 工程，本仓库不含时自动 SKIP）
node src/tools/check-isotope.mjs  src/index.html   # 化学式同位素左上标：25 项
node src/tools/check-lan.mjs      src/index.html   # 局域网互传端到端：44 项（本仓库自动改用 Python 服务端跑同一套契约）
node src/tools/check-lan-edge.mjs src/index.html   # 边界 / 异常 / 重启恢复：34 项（Python 服务端下有 3 项 Rust 专属行为自动 SKIP）
node src/tools/e2e-headless.mjs                    # 真浏览器（headless Edge/Chrome）端到端：44 项
# 全部都必须「失败 0」（跳过的项是与 Tauri 工程或 Rust 专属行为相关的断言，不是失败）
```

> 应用是**单文件 HTML**：所有 HTML / CSS / JS 内联在一个文件里，零外链、零 CDN、零构建步骤。
> 把 `src/index.html` 拷到手机也能直接打开（桌面 / 平板 / 手机三端自适应）。

**可选：局域网互传**（同一 Wifi 下手机 ↔ 电脑互传实验文件与文本，零依赖）

```bash
python src/lan-server.py          # 或双击 src/start-lan.bat
# 终端会打印「同一Wifi下其他设备访问: http://192.168.x.x:8000」
# 其他设备浏览器打开该地址 → 进入实验助手 → 「局域网互传」页
```

> 不启动这个服务端时，应用**功能完全不变**（互传页只显示启动引导）。
> 服务端只用 Python 标准库，无需 `pip install`；数据只在本机局域网流动，不经任何云服务。

---

## 目录结构

```
.
├─ README.md                  # 本文件：作品总览
├─ LICENSE                    # 开源许可（MIT）
├─ .gitignore                 # Node / Python / Windows 通用忽略
├─ .gitattributes             # 换行符与文本规范
├─ .editorconfig              # 编辑器风格统一
├─ docs/
│  ├─ 作战计划.md              # ⭐ 行动总纲：倒计时阶段表、里程碑、风险、进度看板
│  ├─ 赛事关键信息.md          # 赛制、时间节点、报名与发布流程速查
│  ├─ 作品说明.md              # ⭐ 作品用途 / 用户 / 核心功能 / 界面风格 / 技术方案 / 开源组件 / 码道使用
│  ├─ 实验助手-需求与设计蓝图.md # ⭐ 需求定型文档：主流程、信息架构、数据模型、验收标准、决策台账
│  ├─ 工作须知.md              # 人看的协作流程：对表题、每天开工收工、必须停下来问的五件事
│  ├─ 提交清单.md              # 提交前的自检清单与命名规范
│  └─ 码道开发记录.md          # 开发过程流水
├─ skills/
│  └─ pair-dev-contract/
│     └─ SKILL.md            # ⭐ 冻结的接口契约 zhbit-lab-protocol v3（给 DeepSeek / 码道用）
├─ .evidence/                 # ⚠️ 码道使用痕迹证明（提交必需）
│  ├─ 01-ide-plugin-logs/     # IDE 插件使用日志与操作记录
│  ├─ 02-ai-prompts/          # AI 交互对话与 Prompt 截图
│  ├─ 03-codegen-history/     # 代码生成 / 重构 / 排错过程记录
│  └─ README.md               # 痕迹材料的整理说明
└─ src/
   ├─ index.html              # ⭐ 作品全部源码（单文件，共约 2.5 万行；其中手写业务代码约 4.3 千行 / 15 个区段，
   │                          #   含 3.5 计时器、13.1 互传自动导入；其余为内联的 React + KaTeX + mhchem 库）
   ├─ lan-server.py           # 可选：局域网互传服务端（零依赖 Python 标准库）
   ├─ start-lan.bat / .sh     # 可选：一键启动互传服务端
   ├─ 局域网互传-使用说明.md    # 互传功能的使用说明、存储位置、接口表、安全边界
   ├─ tools/app-html.mjs      # 单文件页面的定位（候选名 + mtime 兜底），构建 / 校验脚本共用
   ├─ tools/check-syntax.mjs  # 2 项内联脚本语法校验
   ├─ tools/check-page.mjs    # 271 项页面与数据层自动校验（263 通过 + 8 项 Tauri 相关断言在本仓库自动 SKIP）
   ├─ tools/check-isotope.mjs # 25 项化学式同位素角标（左上标）校验
   ├─ tools/check-lan.mjs     # 44 项互传端到端校验（真启动服务 + 真跑接口；本仓库自动用 Python 服务端）
   ├─ tools/check-lan-edge.mjs # 34 项边界 / 异常 / 重启恢复（Python 服务端下 3 项 Rust 专属行为自动 SKIP）
   ├─ tools/e2e-headless.mjs  # 44 项真浏览器（headless Edge/Chrome）端到端：真渲染 + 真点击 + 真滚动断言
   ├─ tools/check-timer-cdp.js # 真机（CDP）自测脚本：计时器（每步 + 自由）+ 下载即导入（配桌面 App 用）
   ├─ tools/gen-icons.py      # 图标生成：从「新图标模板.png」重采样出桌面 15 个 + Android 20 图 + 3 个 XML
   ├─ 新图标模板.png           # 图标素材（透明底 ∞）；换图标只改它再跑上面的脚本
   └─ README.md               # 源码说明：区段分工、自检命令、目标对照
```

---

## 作品信息

| 项目 | 内容 |
| --- | --- |
| 作品名称 | 实验助手 Lab Studio |
| 参赛组别 | 非专业组 |
| 队伍名称 | 吃白饭的大肥鱼 |
| 队伍成员 | 待补 |
| 指导老师 | 杨慧君 |
| 作品形态 | Web 应用（单文件 HTML，零依赖）；同一份源码可打包为桌面 exe / Android apk（构建产物不入库） |
| 核心 AI 工具 | 华为云码道 CodeArts |
| 仓库地址 | <https://github.com/ARRC6H6/zcst-huawei-agent-2026>（GitCode 导入后取地址填写） |

**核心功能**（详见 [`docs/作品说明.md`](docs/作品说明.md)）：

1. 多实验管理：新建 / 复制 / 删除 / 导入 / 导出，导出即得可分享的 `.json` 实验文件
2. AI 生成实验步骤：把课件（`.ppt/.pptx/.doc/.docx/.txt/.md`）交给大模型生成实验文件；也支持「复制提示词 → 粘贴 JSON」的离线通路
3. 编辑模式：每步五要素（文字 / 图片 / 视频 / 反应方程式 / 安全 TIPS）+ 仪器摆放画布（拖拽 / 缩放 / 旋转 / 连线）；
   反应方程式带所见即所得输入器（元素周期表点选、配平校验、KaTeX + mhchem 渲染，同位素质量数按规范显示在元素**左上角**）
4. 记录模式：逐步只读播放 + 分步记录 + 总记录；内置**整场实验计时器**（编辑模式预设定时，记录模式手动开始 / 暂停 / 归零 / 记一次，倒计时到点响铃并把用时自动写进当前步骤记录）
5. 实验报告：LLM（OpenAI 兼容，用户自配）生成，无 API 时本地 markdown 表格兜底（用过计时器时报告自动带「计时」章节）
6. 局域网互传：同一 Wifi 下手机 / 电脑互传文件与文本，大文件分片 + 断点续传 + 同文件秒传，数据不经云端（可选配套零依赖服务端）；**手机端支持双指缩放**放大看清单与地址
7. **下载即导入**：在共享文件列表里点「下载」时，若该文件是实验 `.json`（实验包 / 全部备份 / 大模型生成的实验 JSON），会**同时自动加进「我的实验」**；谁下载谁导入，电脑与手机（接收端）同样生效；图片 / 文档等其它类型不受影响，认不出的 `.json` 会在互传页、首页横幅与提示条三处明确报错；**不做任何后台监听与轮询**，点下载才是触发键
8. 三端自适应 + 浅色 / 深色 / 跟随系统三态

---

## 参赛要点（摘自赛事推文）

- **报名截止**：10 月 23 日，截止后不可修改队员与队名。
- **组队规则**：2–5 人一组，每人仅可加入 1 支队伍，支持跨专业组队，可配 1 名指导老师；每件作品仅可由 1 支队伍推报。
- **开发要求**：开发过程必须使用 **华为云码道 CodeArts** 作为核心 AI 编程工具。
- **作品要求**：须原创、可运行、可复现；禁止提交毕业设计、课程论文、已获国家级奖项或国际竞赛获奖作品。
- **提交材料**：作品压缩包 + 码道使用痕迹证明（IDE 日志 / AI 对话与 Prompt 截图 / 代码生成重构排错记录）。
- **命名格式**：`作品名称+队伍名称+版本号+联系方式.zip`。

完整信息见 [`docs/赛事关键信息.md`](docs/赛事关键信息.md)。

---

## 协作方式

改代码前**必须**先读两份文件：

| 角色 | 先读 | 为什么 |
| --- | --- | --- |
| 人（你） | [`docs/工作须知.md`](docs/工作须知.md) | 怎么跟自己的 DeepSeek 对表、每天开工收工、什么时候必须停下来问 |
| AI（DeepSeek / 码道） | [`skills/pair-dev-contract/SKILL.md`](skills/pair-dev-contract/SKILL.md) | 冻结的接口契约：数据结构、存储签名、画布动作集、报告与 LLM 约定、设计 token |

**契约是唯一的沟通渠道**：各写各的区段，合起来一次跑通，不用互相读对方的实现。
接口一旦定下**不许私自改**；确需改动走契约 §6 的变更流程（升 `EXP_VERSION` + 补校验断言 + 记变更日志）。

---

## 许可

本项目基于 [MIT License](LICENSE) 开源。

**第三方开源组件**（均为**内联**进 `src/index.html` 的库，不需要安装、不产生外链；
`lan-server.py` 只用 Python 标准库，无第三方依赖）：

| 组件 | 版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| React / React DOM | 18.3.1 | MIT | 化学方程式输入器的组件渲染 |
| KaTeX（含 `contrib/mhchem`） | 0.16.47 | MIT | 反应方程式的化学式排版渲染 |

完整标注（名称 / 版本 / 用途 / 许可 / 来源）见 [`docs/作品说明.md`](docs/作品说明.md) 第六节。
