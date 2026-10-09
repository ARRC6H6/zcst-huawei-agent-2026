---
name: zhbit-lab-protocol
description: >
  珠科×华为云码道 Agent 创新赛「实验助手 Lab Studio」项目的**软件接口契约（唯一权威）**。
  规定实验文件数据模型（Exp / Step / mediaRef / timer）、存储层（Store / Media）签名与 key、
  计时器（每步一个 + 自由计时器）与 data-timer-src 动作路由、
  事件委托与哈希路由、报告与 LLM（OpenAI 兼容）接入约定、AI 生成实验步骤页、
  局域网互传页（#/lan + 可选 lan-server.py）、设计 token 与命名铁律。
  凡是要写、改、查、解释这个项目的代码，必须先读本文件，并遵守其中全部铁律，
  接口签名一律不许私自改。本文件是原 `shishi-protocol`（拾事 Shishi）的替代版（旧版已作废）。
  ⛔ 注意：「仪器摆放」画布与仪器库已于 2026-10-07 整体移除，§3.4 / §3.5 仅为历史留档。
version: 3.3.0
updated: 2026-10-08
applies_to: 实验助手 Lab Studio（单文件 HTML · 零依赖 · 桌面/平板/手机三端自适应）
---

# 实验助手 Lab Studio · 软件接口契约（v3）

> 这份文件是**所有人的共同语言**。不管谁来问代码，都按这份文件办。
> 目标：**各写各的区段，合起来一次跑通，不用互相读对方的实现。**
>
> ⚠️ 旧版 `shishi-protocol`（拾事 Shishi · Tauri v2 双端 · `ScheduleEvent` · BLE 帧协议）**已作废**，
> 对应的 `TodoItem` / `SS.` 命名空间原生骨架也已从仓库移除，**不要再按旧版写代码**。
>
> 本文档只规定**技术协议**：数据结构、接口签名、边界、格式、规则。
> 团队协作流程（对表、交接、痕迹归档）见 [`docs/工作须知.md`](../../docs/工作须知.md)。

---

## 0. 怎么用这份文件

DeepSeek 网页版没有系统提示词入口，用法二选一：

**方法 A（推荐）· 上传文件**
把这份 `SKILL.md` 上传到 DeepSeek 对话，再发「对表」指令（见 `docs/工作须知.md` §1）。

**方法 B · 直接粘贴**
新建对话，第一条消息把本文件全文粘进去，再发对表指令。

**每个新对话都要重来一次**（DeepSeek 不记得上一个对话）。
**对表答错了，就重新贴一遍，不要将就着干活。**

---

## 1. 作品一句话

> **把一次生化实验做成一份可编辑、可播放、可分享的流程文件，最后自动整理成实验报告参考版。**

| 项目 | 内容 |
| --- | --- |
| 作品名 | 实验助手 Lab Studio |
| 形态 | **单文件 HTML**（`src/index.html`），零依赖、零外链、双击即开 |
| 前端 | 原生 HTML + CSS + ES2017 JavaScript（无框架、无构建、无 npm 依赖） |
| 后端 | **核心功能无后端**（数据留在本机 localStorage + IndexedDB）；**可选的** `src/lan-server.py`（零依赖 Python 标准库）只服务「局域网互传」页，不启动它时应用功能完全不变 |
| 学科 | 大学生化实验（化学 / 生物 / 生化） |
| 交付物 | `.json` 实验文件（可分享 / 可导入导出）＋ 同 Wifi 下的文件与文本互传 |
| 页面 | 实验列表 / AI生成实验步骤 / 编辑模式 / 记录模式 / 实验报告 / 局域网互传 / 设置（共 7 个导航页） |
| 视觉参考 | 鲸鱼便签 Whale Notes（柔光玻璃 + 马卡龙六色），token 见 §3.9 |
| 依据文档 | [`docs/实验助手-需求与设计蓝图.md`](../../docs/实验助手-需求与设计蓝图.md) |

> 📌 **本期范围红线**：
> ① **不引入任何第三方库 / CDN / 构建步骤**（`check-page.mjs` 会直接判死）；
>    内联进 `index.html` 的 React / KaTeX / mhchem 属**已登记的开源组件**（见 `docs/作品说明.md` §六），
>    不是「引入依赖」——它们随文件一起内联，不需要安装、不产生外链；
> ② **不做后端**，数据只在本机，跨设备靠导出 `.json`；唯一例外是**局域网互传**的
>    可选配套服务端 `src/lan-server.py`（仅同一 Wifi 内收发文件与文本，不经任何云服务）；
> ③ **视频只登记元信息（占位）**，不落地文件、不存 IndexedDB；
> ④ **LLM 由使用者自填 Key**，未配置或失败一律降级到本地 markdown，不许报错卡死；
> ⑤ 蓝牙同步 / 双端原生同步（蓝图 §10）**仍不实现**；「同一 Wifi 设备互传」已由 §3.10 的
>    `#/lan` 页 + `lan-server.py` 落地，属本期已交付能力。

---

## 2. 技术栈铁律（违反即打回）

| # | 铁律 | 原因 |
| --- | --- | --- |
| 1 | **单文件、零依赖、零外链**：不许 `<script src>`、不许 CDN、不许 `npm install`、不许构建 | 交付形态就是「双击即开」；评委复现成本必须为 0 |
| 2 | **UI 层不许乱发网络请求**：全项目只允许**两处**网络出口 —— ① `callLLM()`（报告页，用户自配 Key）；② `#/lan` 页的局域网互传模块（`lanApi()` + 分片上传 XHR，见 §3.10）。其余任何视图都不许 `fetch` / `XMLHttpRequest` | 密钥泄露 + CORS 拦死；请求必须收口在具名函数里，且互传只走同一 Wifi、不经云 |
| 3 | **时间戳一律 `Date.now()` 毫秒数**，禁 `toISOString()`、禁 ISO 字符串、禁 `new Date(str)` 解析 | 少 8 小时 / 时区漂移是经典 bug 源头；毫秒数天然无时区 |
| 4 | **禁硬编码任何 Key / Token / 密码**；LLM 配置只存 `localStorage['zhbit-lab-llm']` | 推到 GitHub 就泄露，删记录也删不干净 |
| 5 | 依赖必须**先登记**到 `docs/作品说明.md` 的「开源组件」表，再引 | 赛事硬性要求；本项目除**已登记且已内联**的 React / KaTeX / mhchem 外，零第三方依赖 |
| 6 | **业务数据只经 `Store` / `Media`**；直接碰 `localStorage` 只允许主题那两处（§3.6） | 分散读写必然出现 key 写错、坏 JSON 未兜住 |
| 7 | 所有用户可填文本进 HTML **必须经 `esc()`**；markdown 进 HTML 必须经 `mdToHtml()` / `mdInline()` | 实验名 / 步骤文本是用户输入，不转义就是 XSS |
| 8 | **数据结构一变，`EXP_VERSION` 必须 +1**，并同步改本文件 §3.1、§6 变更日志 | 版本号是判断「读到的是哪代数据」的唯一依据 |
| 9 | ~~仪器一律先追加 `INST_LIB` 条目~~ → **已作废**：仪器库与画布已于 2026-10-07 整体移除（§3.4 / §3.5）。现在**不许再引用** `INST_LIB` / `canvasAct` / `cv-*` | 功能已删，残留引用会被 `check-page.mjs` 的反向断言判死 |
| 10 | **不许私自改动 §3 的任何签名、字段名、枚举值、key、token 名** | 接口是唯一能让多人并行不返工的东西 |
| 11 | 存储层**永不抛异常**（返回 `false` / `null` / `fallback`）；只有网络层允许 `throw` | 单文件应用抛异常就是白屏，用户没有任何恢复手段 |
| 12 | 改完必须跑校验，**全绿（失败 0 / 跳过项不算失败）**才许提交：`check-syntax`（2）、`check-page`（303：本仓库 295 项 + 8 项依赖 Tauri 工程的自动 SKIP）、`check-isotope`（25）、`check-ion`（57）、`check-mobile`（69，真浏览器手机视口）、`check-chem-ui`（15，真浏览器离子输入）、`check-lan`（44）、`check-lan-edge`（34）、`e2e-headless`（65，真浏览器） | 这是唯一能挡住「我这边是好的」的机器校验 |

---

## 3. 冻结的接口契约 ⭐

> 本节是全文核心。**签名一旦定下，谁都不许私自改。** 要改走 §6 的变更流程。

### 3.1 核心实体 `Exp`（实验文件）

**这是全项目唯一的「货币」**——存的、导出分享的、报告要读的，全是它。
实现锚点：`normalizeExp()`（`index.html` §3 存储层）。

```js
{
  v: 1,                    // 结构版本号，恒等于 EXP_VERSION
  id: "exp_xxx",           // 前缀 exp_，uid("exp_") 生成
  name: "银镜反应",         // 默认 "未命名实验"
  subject: "chemistry",    // "chemistry" | "biology" | "biochem"，默认 chemistry
  theme: "t-sky",          // 由 subject 决定，见 §3.9 映射表
  desc: "",                // 实验简介
  createdAt: 1759366440000, // Date.now() 毫秒数
  updatedAt: 1759366440000, // 任何保存都会强制刷新它（见 §3.6）
  rev: 1,                  // 本期恒为 1（不发自增）；双端同步落地时才启用
  steps: [ Step, ... ],    // 至少 1 条（UI 层保证，不在数据层校验）
  log: {
    total: "",             // 总记录：整场备注与异常
    totalImages: [ mediaRef ], // 总记录附图
  },
}
```

**字段规则：**

| 字段 | 规则 |
| --- | --- |
| `id` | 前缀 `exp_`。旧版 `t_` / `evt_` 前缀**不读取、不迁移**（v3 从空数据开始） |
| `subject` | 只许三个枚举值；新增学科必须同时补 `SUBJECTS` 与 `theme` 映射，并升 `EXP_VERSION` |
| `theme` | 由 `subject` 映射：`chemistry→t-sky`、`biology→t-mint`、`biochem→t-lavender`。映射只发生在 `newExp()` 与 `exp-subject` 动作里；**`normalizeExp()` 对缺失 `theme` 的数据固定回落 `t-sky`，不按 `subject` 反推** —— 所以导入缺 `theme` 的老数据会丢掉学科配色，要改这里先想清楚兼容性 |
| `rev` | 本期**恒为 1**，全文没有任何自增逻辑；双端同步（蓝图 §10）落地时才启用。**不要依赖它判断新旧** |
| `log.totalImages` | 与 `Step.record.images` 同构，都是 `mediaRef[]` |

> 🔴 **报告不在 `Exp` 里面。** 它是独立存储的一份数据（§3.6 `KEYS.report`），
> 导出单实验时才一起打进包里（§3.8）。**不许把 `report` 塞进 `Exp`。**
> （蓝图 §3.1 的示意把 `report` 画在实验文件里，实现上刻意拆开了 —— 以本节为准。）

### 3.2 `Step`（反应步骤）

```js
{
  id: "s_xxx",            // 前缀 s_
  title: "加入硝酸银",      // 显示回落：stepTitle(s, i) → s.title || "步骤 " + (i+1)
  text: "",               // 文字描述
  equation: "",           // 反应方程式（纯文本，展示时等宽字体）
  tips: "",               // 安全小 TIPS
  images: [ mediaRef ],   // 步骤图片
  videos: [ mediaRef ],   // 视频：本期只有元信息，store 恒为 "external"
  timer: { ... },         // ★ 本步独立的计时器，见 §3.12
  record: { note: "", images: [ mediaRef ] },  // 记录模式下本步的记录
}
```

> ⛔ 旧版的 `canvas: { w, h, items, links }` 字段**已随「仪器摆放」整体移除**（§3.4），
> `normalizeStep()` 不再产出它；旧实验里残留的 `canvas` 会在下次归一化时被丢弃。

**步骤铁律：**

1. **五要素固定为 `text` / `images` / `videos` / `equation` / `tips`**，不许合并成一个大字段。
2. 每步**各有一个独立计时器** `timer`（§3.12）；另有实验级 `exp.timer` 作**自由计时器**。
3. `stepTitle(s, i)` 是步骤名的**唯一显示入口**；不许在视图里自己写 `s.title || "..."`。
4. 步骤顺序 = `steps` 数组顺序，**没有 `order` / `index` 字段**；排序只改数组（`step-move`）。
5. 步骤**至少保留 1 条**（`step-del` 在只剩一条时拒绝并 toast）。

### 3.3 媒体引用 `mediaRef`

```js
{
  id: "m_xxx",            // 前缀 m_
  kind: "image",          // "image" | "video"
  name: "现象.jpg",        // 原始文件名
  type: "image/jpeg",
  size: 123456,
  store: "idb",           // "idb" 落在 IndexedDB；"external" 只有元信息
  url: "",                // store === "external" 时可填外链；idb 时恒为 ""
  w: 0, h: 0,             // 本期恒为 0，预留给后续记录原始像素尺寸
}
```

**规则（冻结）：**

1. **图片**：`Media.addImage(file)` → 先 `compressImage(file)`（最长边 ≤ 1280、`image/jpeg`、`quality 0.82`）→
   `Media.put(id, blob)` 进 IndexedDB。**put 失败时把 `store` 改成 `"external"` 并照常返回**，不许抛。
2. **视频**：`Media.addVideo(file)` **只登记元信息**（`name` / `type` / `size`），`store` 恒为 `"external"`，
   不读文件内容、不进 IndexedDB。
3. 展示一律走 `Media.url(ref)`：`store !== "idb"` 时返回 `ref.url || ""`；`idb` 时取 Blob 并缓存 objectURL。
   **视图层不许自己 `URL.createObjectURL` 或直接读 IndexedDB。**
4. 导出 `.json` **不内嵌图片二进制**，只带 `mediaRef` 占位（蓝图 §3.3 定案）。
5. 删除素材走 `mediaDel(id)`：从**所有步骤的 `images` / `videos` / `record.images` 以及 `log.totalImages`** 里摘掉，
   再 `Media.del(id)`。

### 3.4 画布 `CanvasItem` / `Link` ⛔ 已整体移除（2026-10-07，仅留档）

> ⛔ **本节描述的「仪器摆放」功能已从实现中整体删除**（需求方明确「仪器摆放部分不要了」），
> **连代码带数据都删了**，不是隐藏、不是只摘入口：
>
> | 删掉的 | 具体 |
> | --- | --- |
> | 数据结构 | `step.canvas`（`CanvasItem` / `Link` 全部字段）；`normalizeStep()` 不再产出它 |
> | 运行时 | `canvasHTML` / `refreshCanvas` / `syncCanvasScale` / `canvasFit` / `curCanvas` / `itemHTML` / `linkLine` / `itemCenter` / `redrawLinks` / `canvasAct`；指针拖拽 `onPointerDown/Move/Up` |
> | 界面 | 编辑页「仪器摆放」卡片 + 仪器面板；记录页「仪器摆放（只读）」卡片；编辑页副标题里的「摆放仪器」 |
> | 动作 | 全部 13 个 `cv-*` 动作；`handleAct` 的 `default` 里 `cv-` 前缀转发也已删除 |
> | 状态 | `ui.canvasTool` / `ui.selected` / `ui.linkFrom` / `ui.scale` |
> | 报告 | 本地 markdown 不再从画布汇总「## 仪器与试剂」；分发给 LLM 的数据去掉每步 `instruments` |
> | 其他 | `Delete` 键删仪器、`window.resize → syncCanvasScale` 一并移除 |
>
> **现行行为**：每个步骤只有**五要素** —— 标题 / 文字 / 图片 / 视频（占位）/ 反应方程式 / 安全 TIPS，
> 外加记录模式的「现象·数据」。`check-page.mjs` 第 2 节是**反向断言**
> （源码里不能再出现 `INST_LIB` / `canvasAct` / `cv-*` / `data-canvas-host` 等标识符），删干净之前会 FAIL。
>
> 以下为**历史设计留档，不要照它实现**：

```js
CanvasItem = {
  id: "i_xxx",        // 前缀 i_
  inst: "beaker",     // INST_LIB 条目的 id（§3.5）
  x: 320, y: 180,     // 左上角坐标，逻辑画布坐标系
  rot: 0,             // 旋转角度，步进 15°
  scale: 1,           // 缩放，clamp 到 [0.4, 2.5]，保留 2 位小数
  label: "",          // 覆盖标签；空则显示库中 name（instName 负责回落）
  note: "",           // 该仪器在本步的说明
}

Link = {
  id: "l_xxx",        // 前缀 l_
  from: "i_a", to: "i_b",   // 两端 CanvasItem 的 id
  kind: "导管",       // 冻结：新建连线恒为 "导管"，目前没有 UI 修改入口
  note: "",           // 预留字段，目前没有 UI 修改入口
}
```

> ⛔ 以下「冻结的几何与层级规则」与「`canvasAct` 画布动作集（13 个）」**已随功能删除**，
> 仅作历史留档，**不要照它实现**：

**冻结的几何与层级规则（历史）：**

| 规则 | 值 |
| --- | --- |
| 逻辑画布尺寸 | **默认** `w: 1000`, `h: 620`（`newExp()` / `normalizeStep()` 的默认值）。⚠️ `normalizeStep` 会**保留**外部传入的 `w`/`h`，渲染按 `canvas` 自身尺寸走，所以不要假定恒为 1000×620。容器按宽度等比缩放，缩放比见 `canvasFit()` |
| 坐标吸附 | `10px`。**新增时立即吸附**；**拖拽过程中不吸附**，只在 `pointerup` 时把落点取整 |
| 旋转步进 | `15°`。`cv-rot±` 直接 ±15；拖旋转柄时按 `Math.round(角度/15)*15` 吸附 |
| 缩放下限 / 上限 | `0.4` / `2.5`。`cv-scale±` 各 ×1.1 / ×0.9 后 clamp；拖角柄按距离比例缩放，同样 clamp |
| 拖拽坐标边界 | `x ∈ [0, c.w - w]`、`y ∈ [0, c.h - h]`（`w`/`h` 取 `INST_LIB` 条目尺寸） |
| **只读画布** | 记录模式的画布宿主带 `data-ro="1"`，`onPointerDown` 见到它就**立即 return**，不产生任何拖拽/选中 |
| 空白处点击 | 点画布空白（`.cv-grid` / `.canvas-stage`）→ 清空 `ui.selected` 与 `ui.linkFrom`（取消连线起点） |
| **层级** | **没有 `z` 字段**。层级 = `items` 数组顺序，**末尾为最上层**（`cv-front` push 到末尾，`cv-back` unshift 到开头） |
| `flip` | **本期没有这个字段**，不要加 |
| 仪器尺寸 | 一律取 `INST_LIB` 条目的 `w` / `h`，**不许在画布层写死尺寸** |

**`canvasAct(action, el)` —— 画布动作集（历史，共 13 个，现已全部删除）：**

| action | 作用 | 关键约束 |
| --- | --- | --- |
| `cv-add` | 按 `el.dataset.inst` 新增仪器，落在画布中央 ± 随机抖动 | 未知 `inst` 直接 return；新增后自动选中 |
| `cv-del` | 删除选中仪器，**并摘掉与之相连的所有 Link** | 无选中 → toast「先点选一个仪器」 |
| `cv-dup` | 复制选中仪器，`id` 重新生成，坐标 +20 / +20 | 复制项成为新选中 |
| `cv-rot+` / `cv-rot-` | 选中项 ±15° | 无选中 → toast |
| `cv-scale+` / `cv-scale-` | 选中项 ×1.1 / ×0.9，clamp 到 0.4~2.5 | 无选中 → toast |
| `cv-front` / `cv-back` | 选中项置顶 / 置底（改数组顺序） | 无选中 → toast |
| `cv-tool` | 在 `select` / `link` 两种模式间切换，并清空 `ui.linkFrom` | — |
| `cv-unlink` | 删掉**最后一条**连线（`links.pop()`） | 无连线 → toast |
| `cv-clear` | 清空本步全部仪器与连线（需 `confirm`） | 已空 → toast |
| `cv-label` | 用 `prompt` 改选中项 `label` | 取消（null）不写入 |

> 🔴 **现行 `handleAct()` 的 `default` 分支只转发 `lan-` 前缀给 `lanAct`，不再有 `cv-` 转发。**

### 3.5 仪器库 `INST_LIB` ⛔ 已整体移除（2026-10-07，仅留档）

> ⛔ **`INST_CATS` / `INST_LIB`（36 条）/ `instById` / `instName` / `renderInstIcon` / `instPanelHTML`
> 已随「仪器摆放」一并删除**，源码里搜不到任何一条。换美术接口（`imageUrl`）也随之作废。
> 以下为**历史设计留档，不要照它实现**：

```js
INST_CATS = [
  { id: "glass",   label: "玻璃器皿",   theme: "t-sky" },
  { id: "measure", label: "计量与通用", theme: "t-paper" },
  { id: "support", label: "支架与夹持", theme: "t-lavender" },
  { id: "heat",    label: "加热设备",   theme: "t-peach" },
  { id: "biology", label: "生物器材",   theme: "t-mint" },
];

INST_LIB 条目 = {
  id: "beaker",        // 唯一键，CanvasItem.inst 指向它
  name: "烧杯",
  cat: "glass",        // 必须是 INST_CATS 里存在的 id
  icon: "<svg .../>",  // 内联 SVG 线稿占位（stroke 1.8 / currentColor）
  imageUrl: "",        // ★ 替换接口：填了就优先渲染图片，覆盖 SVG
  w: 104, h: 104,      // 默认尺寸（画布未缩放时）
}
```

> 📌 若日后要**重做**仪器相关能力，应重新设计并升契约版本；`留痕` 里另有一份独立的
> 「实验器材 SVG 图鉴」产出（36 件线稿）可作素材来源，但**当前契约不含此功能**。

### 3.6 存储层 `Store` / `Media`（签名与 key 冻结）

#### 3.6.1 key 表（**冻结，改 key = 老用户数据全丢**）

| 数据 | 存储 | key / 库 |
| --- | --- | --- |
| 实验列表（摘要元信息） | localStorage | `zhbit-lab-exps` |
| 单个实验（步骤 / 记录） | localStorage | `zhbit-lab-exp:<expId>` |
| 单实验报告 | localStorage | `zhbit-lab-report:<expId>` |
| 主题选择 | localStorage | `zhbit-lab-theme` |
| LLM 配置 | localStorage | `zhbit-lab-llm` |
| 图片 Blob | IndexedDB | db `zhbit-lab` / store `media`（`keyPath: "id"`） |

集中定义在 `KEYS` 里，**业务代码不许出现字面量 key**，一律 `KEYS.xxx` / `KEYS.exp(id)`。

#### 3.6.2 `Store` 方法签名（全部同步）

```js
Store.readJSON(key, fallback) -> any      // 永不抛：坏 JSON / null 一律返回 fallback
Store.writeJSON(key, val)     -> boolean  // 失败 → toast 提示导出备份 + false
Store.listExps()              -> ExpSummary[]  // 过滤无 id 项，按 updatedAt 倒序
Store.getExp(id)              -> Exp | null    // isValidExp 不过 → null；过 → normalizeExp
Store.saveExp(exp)            -> boolean       // 见下方五条铁律
Store.removeExp(id)           -> boolean       // 同时删 exp 与 report 两条 key
Store.report(id)              -> Report        // 默认 { markdown:"", mode:"", model:"", generatedAt:null, fields:null }
Store.saveReport(id, rep)     -> boolean
```

`ExpSummary`（列表里存的精简对象，**不是完整 Exp**）：
`{ id, name, subject, desc, steps: <数量>, createdAt, updatedAt, theme }`

**`saveExp()` 五条铁律（冻结）：**

1. **先 `isValidExp(exp)`**，不合法 → toast「实验数据结构不合法，已拒绝保存」+ 返回 `false`，**绝不写入**。
2. 写入前**强制** `exp.updatedAt = Date.now()`（调用方不许自己定时间）。
3. 写入前**强制** `exp.v = EXP_VERSION`。
4. 先写 `KEYS.exp(id)`，成功后再更新 `KEYS.exps` 汇总：**按 id 覆盖，不许追加出第二条**。
5. 汇总列表写失败要返回 `false`（此时单实验已落盘、列表未更新，属于可接受的部分失败）。

**`isValidExp(e)` 的最小结构闸门（冻结）：**

```
e 是非 null 对象
且 e.id 是非空字符串
且 Array.isArray(e.steps)
且 每个 step 是非 null 对象、typeof step.id === "string"、Array.isArray(step.images)
```

> ⚠️ 这是**闸门不是全量校验**。别往里加业务规则（比如「标题不能为空」）——
> 会让老数据突然存不进去。要加规则必须走 §6 并升 `EXP_VERSION`。

**`normalizeExp()` / `normalizeStep()` 是唯一的补默认值入口**：任何从 localStorage / `.json` 进来的数据，
**必须先 `normalizeExp` 再用**，不许直接吃原始对象（老数据缺字段必然 `undefined`）。

#### 3.6.3 `Media` 方法签名（全部 async，失败降级不抛）

```js
Media.open()            -> Promise<IDBDatabase | null>   // 无 indexedDB 环境返回 null
Media.put(id, blob)     -> Promise<boolean>
Media.get(id)           -> Promise<Blob | null>
Media.del(id)           -> Promise<boolean>              // 同时 revoke 缓存的 objectURL
Media.url(ref)          -> Promise<string>               // store!=="idb" → ref.url || ""
Media.addImage(file)    -> Promise<mediaRef>             // 压缩 + 落库；落库失败自动降级 store:"external"
Media.addVideo(file)    -> mediaRef                      // 同步，只登记元信息
```

> 🔴 **`Media` 任何方法都不许 reject。** 全部失败路径 `resolve(null)` / `resolve(false)`。
> 降级链：IndexedDB 不可用 → 图片 `store:"external"`（图会不显示但流程不崩）。

#### 3.6.4 允许直接碰 localStorage 的唯一例外

主题读写（`initTheme()` / `applyTheme()` 里的 `KEYS.theme` 两处）。
**除此之外任何地方直接 `localStorage.setItem` 都算违规**，必须走 `Store`。

### 3.7 路由、视图与动作分发

**哈希路由（冻结）：** `#/<view>` 或 `#/<view>/<expId>`

```js
parseHash() -> { view: string, param: string | null }
// "#/record/p1" -> { view:"record", param:"p1" }
// "" / null     -> { view:"home",   param:null }
```

| view | 渲染函数 | 是否需要 expId |
| --- | --- | --- |
| `home` | `viewHome()` | 否 |
| `aigen` | `viewAI()` | 否 |
| `edit` | `viewEdit()` | 是 |
| `record` | `viewRecord()` | 是 |
| `report` | `viewReport()` | 是 |
| `lan` | `viewLan()` | 否 |
| `settings` | `viewSettings()` | 否 |

**无参数独立页（冻结）：** `BARE_VIEWS = ["home", "settings", "aigen", "lan"]`。
落在这四个 view 时 `goTo()` 直接把 `state.view` 设过去、不解析 `expId`，路由写作 `#/lan`（不带参数）。

**路由回落链（冻结）：**

1. `view` 不在 `VIEWS` 里 → 回落 `home`。
2. 需要 expId 但没有有效 id → `pickExpId()`：`param` 有效则用它 → 否则当前 `state.exp` → 否则列表第一个。
3. 仍然拿不到 id → toast「先新建一个实验」，回落 `home`。
4. `goTo()` 是**唯一导航入口**：切换前先 `persistExp()` 保存当前实验；
   除 `BARE_VIEWS` 外的页面每次进入都会重置 `ui.step = 0`、`ui.playIndex = 0`、`ui.selected = null`。
5. `render()` 是**唯一重绘入口**，内部顺序固定为：
   `main.innerHTML = viewXxx()` → `main.scrollTop = 0` → `syncNav()` → `refreshCanvas()` → `hydrateMedia()` → `hydrateChemInputs()`；
   若当前是 `lan` 页，再执行 `lanBind()` + `lanMaybeAutoConnect()`，否则 `lanStopPoll()`（离开互传页必须停轮询）。

**事件委托（冻结，两个 data 属性收口全部交互）：**

| 属性 | 语义 | 处理 |
| --- | --- | --- |
| `data-go="<view>"`（+ 可选 `data-param`） | 导航 | `boot()` 里统一 → `goTo()` |
| `data-act="<action>"`（+ 业务 data-*） | 动作 | `boot()` 里统一 → `handleAct(action, el)` |

> 🔴 **视图里不许给自己生成的新按钮单独 `addEventListener`。**
> 新增交互 = 在模板里写 `data-act="xxx"` + 在 `handleAct` 里加一个 `case`。
> 全项目**只允许存在下列监听**，多一处就要在契约里补登记：
> `click`（委托 `data-go` / `data-act`）、`input`（表单同步）、`keydown`（编辑页 `Delete` 删仪器）、
> `hashchange`（路由）、`resize`（画布等比缩放，120ms 防抖）、`beforeunload`（落盘）、
> `pointerdown`（`document`，画布）+ `pointermove` / `pointerup` / `pointercancel`（`window`，拖动时挂载）、
> `matchMedia("(prefers-color-scheme: dark)")` 的 `change`（跟随系统主题时同步）、
> `dragover` / `dragleave` / `drop`（**仅** `#/lan` 页的上传拖拽区，`lanBind()` 里绑在 `[data-lan-drop]` 上）、
> `setInterval`（**仅** `#/lan` 页的 5 秒轮询，`lanStartPoll()` / `lanStopPoll()` 成对出现）。

**表单同步（冻结）：** `input` 事件只认三个 `data-scope`：

| 标记 | 落点 |
| --- | --- |
| `data-scope="exp"` + `data-field` | `state.exp[field]` |
| `data-scope="record"` | 当前步骤 `record.note` |
| `data-scope="total"` | `exp.log.total` |
| 无 scope + `data-field` | 当前步骤的该字段（`title` 时额外 `updateStepName()`） |
| `data-llm="baseUrl\|apiKey\|model"` | **不自动写**，必须点「保存配置」（`llm-save`） |
| `data-ai="doc"` | AI 页的课件正文 → `GEN.docText`（只进内存，不落盘） |
| `data-lan="base"` / `data-lan="clip"` | 局域网互传页的服务端地址 / 待发送文本，**按需读取，不进 `input` 委托** |

所有 `input` 都走 `saveSoon()`（350ms 防抖）落盘，**不许每敲一个字就同步写 localStorage**。
（`data-lan` 两个输入框例外：它们不改实验数据，值在点「连接」「发送」时按需 `querySelector` 读取。）

**`handleAct` 动作清单（冻结）：**

```
theme                                  exp-new / exp-open / exp-dup / exp-del / exp-export / exp-import
exp-subject                            step-add / step-open / step-del / step-move
media-add / media-del                  play-prev / play-next / play-go
go-edit / go-record / go-report        rep-local / rep-llm / rep-copy / rep-export
set-theme / llm-save / llm-test / llm-prompt / llm-deepseek
ai-pick / ai-run / ai-import-new / ai-import-append / ai-clear / ai-prompt
ai-copy-prompt / ai-copy-json / ai-import-json / ai-paste-json
lan-connect / lan-refresh / lan-copy / lan-pick / lan-clear
lan-dl / lan-del / lan-clip-send / lan-clip-copy
timer-toggle / timer-reset / timer-log / timer-mode / timer-target
timer-clear-target / timer-custom / go-edit-timer
exp-export-md / exp-export-json / exp-export-close      （导出格式选择，2026-10-09 新增）
fit-reset                                             （撤销溢出兜底缩放，2026-10-09 新增）
data-export-all / data-clear           （default → lan-* → lanAct；不再有 cv-* 转发）
```

> 前缀转发（冻结）：`handleAct` 的 `default` 分支只把 **`lan-`** 前缀转给 `lanAct(action, el)`。
> 新增互传动作**必须**用 `lan-` 前缀。
>
> ⭐ **`timer-*` 动作要先经 `resolveTimer(el)` 判定作用于哪个计时器**（读 DOM 上的 `data-timer-src`），
> 详见 §3.12；这几个动作一律走 `refreshTimer()` 局部重画，**不许整页 `render()`**。

### 3.8 报告与 LLM 接入

**报告数据（独立存储，不进 `Exp`）：**

```js
Report = {
  markdown: "",        // 生成的 markdown 全文
  mode: "local",       // "local" | "llm"
  model: "",           // mode==="llm" 时记模型名
  generatedAt: null,   // Date.now() 毫秒数
  fields: null,        // ⚠️ 只存在于 Store.report() 的默认值对象里；localReport/llmReport 写入的对象不含它，
                       //    所以生成过报告后读到的是 undefined。本期不使用，启用前先统一写入
}
```

**两条生成路径（冻结）：**

1. **本地**：`buildLocalMarkdown(exp)` → `Store.saveReport(id, { mode:"local", model:"", ... })`。
   输出固定含：# 实验名 → （有简介才输出）实验简介 → （有仪器才输出）仪器与试剂 →
   （有方程式才输出）反应方程式 → 实验步骤 → **实验现象与数据表格**（列固定 `步骤 | 操作 | 现象/数据 | 备注`）→
   （有 TIPS 才输出）注意事项 → （有总记录才输出）总记录。
2. **LLM**：`REPORT_PROMPT.replace("{{DATA}}", JSON.stringify(collectReportData(exp), null, 2))` → `callLLM()`。

**降级链（冻结，不许出现"点一下没反应"）：**

```
未配置 apiKey        → 直接走 localReport()（toast 说明）
callLLM 抛错         → toast「LLM 调用失败：…，已降级本地生成」→ localReport()
```

**LLM 协议（OpenAI 兼容，冻结）：**

```js
callLLM(prompt)  // POST {baseUrl}/chat/completions
// baseUrl 默认 "https://api.openai.com/v1"（末尾斜杠会被剥掉）
// headers: Content-Type: application/json, Authorization: Bearer {apiKey}
// body:    { model: cfg.model || "gpt-4o-mini", temperature: 0.3, messages: [{ role:"user", content: prompt }] }
// 返回:    data.choices[0].message.content（空则抛 "返回内容为空"）
```

**`REPORT_PROMPT` 的冻结要点**（改提示词不许动这四条）：

1. 必须含 `{{DATA}}` 占位符（唯一注入点，不许自己拼字符串）。
2. 必须要求**简体中文**输出。
3. 必须要求「实验现象与数据」用 **Markdown 表格**，列为 `步骤 | 操作 | 现象/数据 | 备注`。
4. 必须声明**不得编造未提供的数据**，缺失统一标「（待补充）」。

**`collectReportData(exp)` 返回形状（冻结，就是发给 LLM 的 JSON）：**

```js
{
  name, subject, desc,
  steps: [{ no, title, text, equation, tips, instruments: string[], observed, images: number }],
  totalLog,
}
// instruments 由该步 canvas.items 逐个经 instName() 映射（此处不去重，去重在本地报告里做）
// images 只给数量，不发二进制
```

**导出 / 导入格式（冻结）：**

| 包 | `kind` | 内容 |
| --- | --- | --- |
| 单实验可分享文件 | `"zhbit-lab-experiment"` | `{ kind, v, exportedAt, exp, report }` |
| 全量备份 | `"zhbit-lab-backup"` | `{ kind, v, exportedAt, exps: Exp[] }` |
| 单实验离线文件 | （不是 JSON，见下）`*.md` | 纯 Markdown 文本，**单向**（不可再导入） |

> ⭐ **「导出」先选格式**（2026-10-09）：`data-act="exp-export"` 不再直接下 JSON，而是打开格式选择弹窗
> （挂载在独立的 `#dialogHost` 上，**不在 `#main` 里**，所以整页 `render()` 不碰它、也不会被顺带清掉）：
> `exp-export-json` = 原「可分享文件」（上表第一行，**结构一字未改**）；
> `exp-export-md` = 离线 Markdown（下表）。弹窗关闭：点遮罩空白处（点 `.dlg` 内部不算）/ Esc / `exp-export-close`。
> 打开与关闭走 `openExportDialog(id)` / `closeExportDialog()`，状态是 `ui.exportId`。

**离线 Markdown（`buildOfflineMarkdown(exp, resolveImage?)`，2026-10-09 新增）：**

- 定位：**一个 `.md` 带走整个实验**，离线可读、可打印、不依赖 App 与网络 —— 所以图片一律
  经 `Media.dataURL(ref)`（内部 `blobToDataURL()`，`FileReader.readAsDataURL`）转 **base64 内嵌**。
- 内容顺序：`# 实验名` → 元信息引用块 → `## 实验简介` → `## 反应方程式一览` → 每步一节
  （正文 / `**反应方程式**` / `**安全小 TIPS**` / `**图片**` / `**现象 / 数据**` / `**记录图片**` / `**计时**` + 日志表）
  → `## 总记录` → `## 自由计时器（不绑定步骤）` → 导出标记注释。每步之间用 `---` 分隔。
- 硬约定：图片读不到（本机 IndexedDB 被清）时**如实写一行「未能内嵌」占位**，不许静默丢图；
  视频不内嵌，只登记文件名；`resolveImage` 可注入（自检脚本用它塞假图，避免依赖 IndexedDB）。
- 与 `buildLocalMarkdown()` 是**两份不同的东西**：后者是「实验报告」口吻、进报告页；前者是「离线实验文件」。

导入规则：读 `data.exp ? data.exp : data` → **必须过 `isValidExp`**（不过就 toast「文件结构不合法，已拒绝」）→
`normalizeExp` → **重新分配 `exp_` id**（避免覆盖本机同 id 实验）→ 名字追加「（导入）」→
若包里有 `report.markdown` 则一并存回。**任何异常都走 catch 并 toast「解析失败」，不许白屏。**

**markdown 渲染**：只走 `mdToHtml()` / `mdInline()`（支持 h1~h4、表格、`-` 列表、`>` 引用、`**粗体**`、`` `代码` ``）。
**不引第三方 markdown 库**；`mdInline` 内部先 `esc()` 再替换，**转义顺序不许调换**。

### 3.9 设计 token（沿用鲸鱼便签，冻结）

**六色马卡龙（`--tint` / `--tint-2` / `--tint-line` / `--tone` 四件套）：**

| 类 | `--tint` | `--tone` |
| --- | --- | --- |
| `.t-paper` 云白 | `#ffffff` | `#8d97b4` |
| `.t-mint` 薄荷 | `#ecfdf5` | `#2fb98a` |
| `.t-peach` 蜜桃 | `#fff4ef` | `#f4815c` |
| `.t-lavender` 薰衣草 | `#f4f1ff` | `#8b7cff` |
| `.t-lemon` 柠檬 | `#fffaeb` | `#d9a520` |
| `.t-sky` 天空 | `#f1f8ff` | `#4f9bff` |

**核心语义 token（`index.html` 的 `:root` 为唯一权威）：**

```css
:root {
  --ink: #1a1f33;  --ink-soft: #3f4761;  --ink-faint: #6f7893;
  --accent: #6a7bff;  --danger: #ff6b81;  --ok: #2fb98a;  --warn: #d9a520;
  --r-window: 15px;  --r-card: 13px;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --fast: 0.16s var(--ease);  --mid: 0.28s var(--ease);
  --mono: ui-monospace, "Cascadia Mono", Consolas, "SF Mono", monospace;
  /* 玻璃面：--surface-1..3 / --surface-hi / --surface-low / --surface-ghost / --surface-bar */
  /* 投影：--shadow-card / --shadow-pop / --shadow-app / --shadow-icon / --shadow-tab */
  /* 画布：--canvas-bg / --grid / --link-line */
}
```

**功能 → 配色映射（冻结）：**

| 功能 | 类 |
| --- | --- |
| 实验列表 home | `t-paper` |
| 编辑模式 edit | `t-sky` |
| 记录模式 record | `t-peach` |
| 实验报告 report | `t-lemon` |
| 设置 settings | `t-lavender` |
| 学科 chemistry / biology / biochem | `t-sky` / `t-mint` / `t-lavender` |

**视觉铁律**（新增 / 改动的代码必须遵守；括注是**既有的历史例外**，别照抄、也别顺手扩大）：

1. **深色只写一份** `:root[data-theme="dark"]` 令牌块；**浅色里的每个语义 token 都必须在深色里有覆盖**
   （豁免项仅 `--r-window` / `--r-card` / `--ease` / `--fast` / `--mid` / `--mono`，与 `check-page.mjs` 的 `SHAPE_EXEMPT` 一致）。
2. 新样式**禁止裸写颜色**，一律 `var(--x)`；**不许引用未定义的 `var()`**。
   *历史例外*：品牌标与主按钮的固定渐变 `#7b8aff → #5f6ef5`、5 处反白 `color: #fff`（`.brand-mark` / `.btn-primary` /
   `.step-item.on .step-no` / `.chip.on` / `.media-del`）、吐司底 `rgba(26,31,51,.92)`。
   校验目前**只拦 `background: #fff` 一种写法**（`check-page.mjs`），其余靠人眼。
3. 新动画缓动只用 `var(--ease)` 系。*历史例外*：背景光斑 `animation: drift … ease-in-out`（5 处）与空态 `float`。
4. 移动端断点 `@media (max-width: 860px)` 切单栏 + 底部 Tab；正文 ≥ 14px、主要触控目标 ≥ 44px、
   `:hover` 一律补 `:active` 等价反馈。
   *历史例外*：移动端 `.btn` 40px / `.chip`·`.inst-chip` 36px / `.step-item` 42px —— **新增按钮不得低于 44px**。
5. 图标一律内联 SVG（`currentColor`、主图标线宽 `1.8`），**不许外链图标库**。
   *历史例外*：Logo `1.7`、空态大图标 `1.2`、缩略图与 Tab 图标 `1.3` —— 按尺寸微调是既有约定，**新增图标统一 1.8**。

> ⚠️ `check-page.mjs` 对视觉规则**只覆盖了一部分**（深色令牌齐全、无未定义 `var()`、无 `background: #fff`、
> 断点与 tabbar 存在）。第 2~5 条的例外清单得**人眼过一遍**，别默认机器已经拦住了。

### 3.10 局域网互传（`#/lan` + 可选 `src/lan-server.py`）

**定位**：同一 Wifi 下，手机 / 平板 / 电脑用浏览器互传**实验文件与文本**，数据只在本机局域网流动。
页面本身不依赖服务端：连不上时只显示引导，**不许报错卡死、不许影响其他六个页面**。

**存储 key（冻结）：** `localStorage['zhbit-lab-lan'] = { base: "http://192.168.1.23:8000" }`
—— 只存服务端地址，用于「下次打开自动连接」。实验数据仍只走 `Store` / `Media`。

**地址解析（冻结）**：`lanDefaultBase()` —— 页面是 `http(s)://` 打开时取 `location.origin`（同源自动连接）；
`file://` 打开时取上述 localStorage 里记的地址。

**服务端接口（`lan-server.py`，冻结；零依赖 Python 3.7+ 标准库）：**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/`（及 `/index.html`、真实文件名） | 返回单文件实验助手页面 |
| GET | `/api/server-info` | `{ok,host,ip,ips,port,urls,chunkSize,files}` |
| GET | `/api/files` | `{ok,files:[{id,name,size,time}]}` |
| GET | `/api/download?id=` | 流式下载，`Content-Disposition` 带原名（RFC 5987） |
| DELETE | `/api/files?id=` | 删除文件与索引 |
| POST | `/api/upload/init` | body `{name,size,lastModified}` → `{id,chunkSize,totalChunks,uploaded,done}` |
| POST | `/api/upload/chunk?id=&index=` | body 为原始分片字节（原子落盘 `<i>.part.tmp` → `os.replace`） |
| GET | `/api/upload/status?id=` | 已传分片下标（外部续传用） |
| POST | `/api/upload/complete` | body `{id}` → 按序合并；**缺片必须 409，不许产出残缺文件** |
| GET / POST | `/api/clip` | `{text,time}` 全局单条文本剪贴板 |

**客户端约定（冻结）：**

| 项 | 值 |
| --- | --- |
| 文件指纹 = id | 服务端 `md5(name\|size\|lastModified)[:16]`，前端**不自己算**（只发三个字段） |
| 分片 | 默认 4 MB（`--chunk-mb` 可调，下限 256 KB）；`file.slice()` 逐片上传 |
| 秒传 | `init` 返回 `done:true` → 直接标记完成，不传任何分片 |
| 断点续传 | `init` 返回 `uploaded:[...]` → 跳过这些下标；上传失败单片重试 1 次 |
| 上传实现 | `XMLHttpRequest` + `upload.onprogress` 出进度与速度（`fetch` 无上传进度） |
| 轮询 | `#/lan` 页 5 秒 `setInterval` 刷新文件列表 + 文本；**离开页面必须 `lanStopPoll()`** |
| 重绘 | 进度与列表用 `lanPaintStatus/Files/Prog/Clip` **局部重绘**，不许整页 `render()`（会把输入框顶掉） |
| 转义 | 文件名 / 文本一律 `esc()` 进 `innerHTML`（文件名来自别的设备，等同不可信输入） |
| 跨域 | 服务端对所有 `/api/*` 返回 `Access-Control-Allow-Origin: *` 并处理 `OPTIONS` 预检，`file://` 双击打开也能连 |

> 🔴 **安全边界（必须写进任何文档）**：本功能**无鉴权**，局域网内任何能访问该地址的设备都可上传 / 下载 / 删除，
> 仅限可信网络，**不可暴露公网**。服务端只服务单文件页面与 `/api/*`，不提供任意路径读取。

### 3.11 AI 生成实验步骤（`#/aigen`）

**定位**：把老师发的课件（`.ppt/.pptx/.doc/.docx/.txt/.md`）交给大模型，生成一份可编辑的实验文件。
**离线通路必须常在**：复制提示词 → 自行到任意大模型对话框 → 把返回的 JSON 粘回来（`ai-paste-json`）。

| 项 | 约定 |
| --- | --- |
| 提示词 | `GEN_PROMPT`，唯一注入点 `{{DOC}}`；要求「只输出一个 JSON」「不要输出仪器画布」「配好 `subject`/`theme`」 |
| 解析 | `aiParseJSON()` 容忍 ```json 围栏与 `{exp:{}}` 整包；无 JSON 必须**明确报错**，不许静默 |
| 校验 | `aiValidateGen()` → `{errors,warnings}`；缺名称 / 非法学科 / 空步骤 / 步骤缺文字描述都要拦下 |
| 落地 | `aiBuildExp()` 建实验（每步画布留空，交给用户摆放）；`aiImport("new"/"append")` 分别新建 / 追加到当前实验 |
| 文档解析 | `.docx/.pptx` 走内联 ZIP + deflate；旧版 `.doc/.ppt` 直读 OLE2 正文；`aiDecodeText()` 兼容 UTF-8 / GBK |
| 网络 | AI 页的「生成」按钮可用 `callLLM()`（同 §3.8 的 OpenAI 兼容约定）；**不许新增第二处 `fetch`** |

### 3.12 计时器（**每步一个** + 自由计时器）

**定位**：每个步骤有**自己独立**的计时器；记录模式另有一条**不绑定步骤的自由计时器**，随时可改可跑。

**两个挂载点，结构同构（`normalizeTimer()` 两边共用）：**

```js
step.timer = {          // ★ 每步一个（主用法）
  mode: "stopwatch",    // "stopwatch" 正计时 / "countdown" 倒计时
  target: 0,            // 倒计时目标秒数（正计时为 0）
  running: false,       // 是否正在跑
  startAt: 0,           // 本轮开始时间戳（暂停后归 0）
  accumulated: 0,       // 已累计毫秒（暂停保留）
  rang: false,          // 本轮是否已响过（到点只响一次）
  logs: [{ at, ms, step }],  // 每次「记一次」，最多 20 条
}

exp.timer = { ...同上 }      // ★ 自由计时器（不绑定任何步骤）
```

| 项 | 约定（冻结） |
| --- | --- |
| 编辑模式 | 「**本步**计时器预设」卡：正计时 / 倒计时 + 6 个快捷预设（`TIMER_PRESETS = [30,60,120,300,600,1800]`）+ 自定义「分 / 秒」+「应用」。**只预置当前步**，不在这里开始 |
| 记录模式 · 本步计时器 | 播放到某步时，这一条的**开始 / 暂停 / 继续 / 归零 / 记一次** |
| 记录模式 · 自由计时器 | 独立一张卡，**不绑定步骤**，且**卡上就能改模式与时长**（不必回编辑页） |
| 到点（本步） | 蜂鸣 3 声 + 震动 + toast，并**自动往这一步的「现象 / 数据」写一行 `[计时] 倒计时结束 MM:SS`** |
| 到点（自由） | 蜂鸣 + 震动 + toast；**不写任何步骤记录**（它不属于某一步） |
| 记一次 | 写当前步的「现象 / 数据」；自由计时器的 log 里额外记下**当时的步号** |
| 同时运行 | `Timer._active` 是**集合**，多个计时器可同时跑（不同步、不同计时器互不干扰） |
| ⭐ **动作路由** | DOM 上必须有 **`data-timer-src`**：`"free"` = 自由计时器；数字 = 第 N 步；缺省则兜底（记录模式→自由，其余→当前步）。由 `resolveTimer(el)` 解析，`timer-*` 动作一律先调它 |
| ⭐ **卡片标记** | 每张计时卡带 `data-timer-host` + `data-timer-owner`；时钟节点带 `data-timer-clock` + `data-timer-src`；自定义分 / 秒输入框也带 `data-timer-src`（避免两张卡的输入框串味） |
| 局部重绘 | ⚠️ `timer-*` 动作**一律走 `refreshTimer()`**，**不许整页 `render()`**（会顶掉输入框焦点；历史上还曾把页面顶回最上） |
| 旧数据迁移 | `migrateTimers()`：旧版「整个实验一个」的 `exp.timer` 若有用过痕迹，就**幂等**下放一份副本到第一步；`exp.timer` 保留成自由计时器 —— 两边都不丢 |
| 报告 | 用过计时器才写「## 计时」，并**逐步列出**（`### 第 N 步`）+ 单列 `### 自由计时器`；`collectReportData().timer` 带 `summary()` 汇总 |
| 存储 key | 计时器**存在实验体内**（`step.timer` / `exp.timer`），**不新增 localStorage key** |
| 报告章节名 | 「## 计时」与「本次总用时」为**冻结文案**（旧报告消费方依赖） |

> 🔴 **加新的计时器按钮时，务必把它放进带 `data-timer-src` 的卡里**，否则动作会落到错误的计时器上。

### 3.13 方程式输入 `chem-input`（内联组件，2026-10-09 补文档）

组件源码在**另一个工程**（`正式项目\实验助手-化学方程式输入板块\chem-input`，React + KaTeX + mhchem），
打包产物**内联**在页面的 `<script id="chem-input-lib">` 里。

| 项 | 约定 |
| --- | --- |
| 元素与属性 | `<chem-input value="..." placeholder="..." max-history="20">`；`value` 与页面双向同步 |
| 事件（冻结） | `chem-change` → `detail = { raw, latex }`；`chem-balance` → `detail = BalanceResult`。页面侧只在 `hydrateChemInputs()` 里收口 |
| 改组件源码后 | `npm run build` → `node tools\inline-chem.mjs`（`--check` 只比对）；**页面里那份不重新内联就还是旧组件** |
| 离子电荷输入（新增） | 工具条 `.chem-ion-bar`：`.chem-ion-num`（1~9）+ `.chem-ion-btn-plus` / `.chem-ion-btn-minus`，各自带 `.chem-ion-preview` 真渲染预览 |
| 电荷写法（冻结） | 插到光标处的片段为 `^3+` / `^+`（±1 省略数字）/ `^2-` / `^-`；纯函数 `ionChargeToken(n, sign)`、`ionSnippet(formula, n, sign)`、`ionPrefixAt(raw, caret)` |
| 电荷渲染（冻结） | `smartConvert()` 必须把电荷粘成 `^{3+}` / `^{2-}`，且**必须在 `\s*\+\s* → ' + '` 空格归一化之前做**（归一化会把 `^3+` 拆成 `^3 + `，mhchem 于是只把 `3` 放进右上角、`+` 掉到外面变成独立一项）。只认**紧挨着**的形态：`^` 紧贴前面的原子、符号紧贴数字/`^`。末尾可再兜一次**花括号**形态（`^{3 + }` → `^{3+}`） |
| ⚠️ 电荷归一化的红线 | **绝不许**把「气体/沉淀记号后面的加号」当电荷：`5Cl2 ^ + 8H2O` 里那个 `^ +` 是「↑ + 反应物分隔符」，被吃成 `5Cl2 ^{+} 8H2O` 会让 `parseFormula` 崩、`chem-input` 的 shadow root 渲染成空 div（**方程式输入框整块消失**）。历史上真发生过，且桌面校验全绿、只有真机才抓到 —— 所以 `check-ion.mjs` 专门有「气体/沉淀记号后的 + 是分隔符」两项，别再放宽这条正则 |
| 解析容错（冻结） | `parseFormula()` / `checkBalance()` **永远不许抛异常**（它们跑在 React 渲染里，抛出去就是整个组件白屏式消失）：多余的右括号、只有括号、空箭头等畸形输入一律返回可读提示 |

### 3.14 手机端适配与溢出兜底（2026-10-09 新增）

| 项 | 约定 |
| --- | --- |
| 第一手段 | 响应式布局（`@media` 档位）。**优先修根因**：网格轨道一律 `minmax(0, 1fr)`，会在窄屏撑宽的文本容器加 `min-width: 0`（`.step-item-name` 这种 `nowrap` 标题必须 `flex:1;min-width:0`） |
| 兜底触发 | 只有**真量到**有元素画到视口右边界之外（`.bg` 光斑是故意出血的装饰，排除）才整页缩小；判据见 `Fit.quickOverflow()` + `Fit.overflow()` |
| 兜底实现（冻结） | `<html data-fit>` + `--fit-s`（缩放系数）→ CSS `html[data-fit] { zoom: var(--fit-s) }`；缩放下限 `Fit.MIN = 0.55` |
| 高度补偿（冻结） | `html[data-fit] body { min-height: calc(100dvh / var(--fit-s)) }`、`html[data-fit] .frame { height: calc(100dvh / var(--fit-s)) }`。**zoom 不影响 vh/dvh**，漏了这条整页会缩成一条 |
| 用户可见 | `.fit-hint`「已自动缩小到 N% 以适应屏幕」+ `data-act="fit-reset"`（`Fit.reset()`：本次会话不再自动缩，直到窗口尺寸变化）。**不许静默改尺寸** |
| 为什么用 `zoom` 不用 `transform: scale` | painted 几何量与 `window.innerWidth` 同坐标系（量得准）、布局视口变成 `innerWidth / zoom`（真的多给内容 CSS 像素）、`position:fixed`（tabbar / toast）仍相对视口定位 |
| 验收 | `node tools/check-mobile.mjs`：同源 iframe 造 320/360/412 真手机视口（headless 窗口有 ~504px 最小宽度，`--window-size=360` 拿不到真视口），逐页断言「无元素越过视口右边界 + `#main` 没被横向裁掉 + 不该无谓缩放」，并验兜底「缩完真不溢出 / 高度补偿对 / 能还原」 |

---

## 4. 命名与统一错误

| 类型 | 规范 | 例子 |
| --- | --- | --- |
| 实验 id | `exp_` + 随机 | `exp_k3f9a2x1b7` |
| 步骤 id | `s_` + 随机 | `s_9a2k3f1b7` |
| 媒体 id | `m_` + 随机 | `m_7f2a91c0d3` |
| 仪器实例 id | ~~`i_` + 随机~~ ⛔ 已随画布移除（§3.4） | ~~`i_2b8c14e5f6`~~ |
| 连线 id | ~~`l_` + 随机~~ ⛔ 已随画布移除（§3.4） | ~~`l_5d0e77a1c2`~~ |
| 存储 key | `zhbit-lab-` 前缀 | `zhbit-lab-exp:exp_xxx`、`zhbit-lab-fold` |
| 函数 / 变量 | camelCase | `buildLocalMarkdown()` |
| 常量 / 令牌名 | UPPER_SNAKE / `--kebab` | `TIMER_PRESETS`、`--tint-line` |
| CSS 类名 | kebab-case | `.exp-card`、`.player-dot`、`.card-fold` |
| data 属性 | kebab-case | `data-act`、`data-timer-src`、`data-timer-host`、`data-fold` |
| 布尔判断 | 用现成工具 | `has(v)`（非空判断）、`clamp(v,a,b)` |
| 转义 | 一律 `esc()` | `esc(e.name)` |

> 🔴 **`uid(prefix)` 的真实格式**：`prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)`。
> 也就是**去掉前缀通常 10 位**（6 位随机 + 4 位时间戳后缀；30 万次实测全部为 10 位）。
> ⚠️ 但**长度不保证固定**：`Math.random().toString(36)` 给的是最短往返表示，
> 当随机值的小数部分不足 6 位时会变短（例如 `Math.random()` 恰好返回 `0.5` → `"0.i"`，随机段只有 1 位）。
> 所以：**不要按固定长度或固定正则去校验 id**，一律用 `uid()` 生成、当普通字符串处理。
> 所有 id **必须用 `uid()` 生成，不许手写**（手写 id 一定撞车或不合格式）。

**统一错误约定（单文件应用，没有异常类型）：**

| 层 | 失败表现 |
| --- | --- |
| 存储层 `Store` / `Media` | **永不抛**：返回 `false` / `null` / `fallback`，需要告知用户就 `toast()` |
| ~~画布层 `canvasAct`~~ | ⛔ 已随功能移除（§3.4） |
| 计时器 `timer-*` | 找不到宿主 → 直接 `return`（不抛）；「还没开始计时」就 `toast("还没开始计时")` |
| 路由层 `goTo` | 拿不到实验 → toast + 回落 `home` |
| 网络层 `callLLM` | **抛 `Error`**，由 `llmReport()` catch 后 toast + 降级本地生成 |
| 视图层渲染 | 数据缺失 → 用 `emptyHTML()` 给空态，**不许抛** |

> 🔴 **只有网络层允许 `throw`，其余一律降级。** 这是单文件应用的生存底线：抛出去就是白屏。

---

## 5. 给 AI（DeepSeek / 码道）的行为规范

**必须做：**

1. 写任何代码**之前**，先用一句话复述：「我理解要改的是 `xxx`（§3.x），数据形状是 …」
2. 只输出**要改的那一段**，**不要整个 2000 行文件重写**（会冲掉别人写的区段）
3. 输出后说明：**改了哪个区段的哪个函数、怎么验证它好了**（优先给一条 `check-page` 能覆盖的断言）
4. 时间戳一律 `Date.now()` 毫秒数；显示走 `fmtDate()`
5. 涉及存储 / `JSON.parse` / `FileReader` 一律 `try/catch`，失败降级不崩
6. 新增 UI 交互一律走 `data-act` + `handleAct`，**不许单独绑事件**
7. 用户可填文本一律 `esc()`；报告 markdown 一律 `mdToHtml()` / `mdInline()`
8. 未实现的部分明确 return 空态或 toast，**不要假装实现**
9. 有不确定性就直说「我不确定 X，建议先试 Y」

**绝对不能做：**

1. ❌ 私自改动 §3 的字段名、枚举值、函数签名、存储 key、token 名
2. ❌ 引入任何外部依赖（CDN / `<script src>` / npm 包 / 构建步骤）
3. ❌ 在 UI 层乱 `fetch`（唯一两处例外：`callLLM()` 与 §3.10 的 `lanApi()` / 分片 XHR）
4. ❌ 硬编码 API Key / Token；把 `apiKey` 写进导出的 `.json`
5. ❌ 把 `report` 塞进 `Exp`；把 `conflicts` 式的派生数据写进存储
6. ❌ 绕过 `Store` / `Media` 直接读写 storage；绕过 `normalizeExp` 直接用原始数据
7. ❌ 每敲一个字就写一次 localStorage（必须走 `saveSoon()` 防抖）
8. ❌ 改完不跑校验就提交（`check-page` / `check-isotope` / `check-lan` 三套全绿）
9. ❌ 假设队友读过你的代码 —— **接口是唯一的沟通渠道**
10. ❌ 把互传页做成「连不上就白屏 / 抛异常」；连不上必须是**引导态**，且不许在非 `#/lan` 页面发起任何互传请求

**当需求会动到冻结的接口时，先停下来回一句：**

> 「这会动到冻结的接口 `xxx`（§3.x），按 §6 要先升 `EXP_VERSION` 并在群里说一声。确认了我再写。」

---

## 6. 契约变更流程（改接口之前必读）

1. **先说**：在群里说明「要改哪个接口、为什么、影响谁」，等一句「可以」。
2. **同时改**：契约文档 + 所有调用方 **一次改完**，不许先改一半。
3. **升版本**：`EXP_VERSION` +1，本文档 `version` 升号；**改存储 key 的一律升号**（`zhbit-lab-exp:<id>` 的读写要带版本兼容判断，或明确声明不读旧数据）。
4. **补校验**：`src/tools/check-page.mjs` 里加一条能挡住这次改动的断言。
5. **记一笔**：往下面「变更日志」加一行。
6. **验一遍**：改动方自己跑 `check-page.mjs` 全绿再通知大家。

### 变更日志

| 版本 | 日期 | 改了什么 | 谁 |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-29 | 初版：原生 HTML/JS 双人规约、`TodoItem`、`SS.` 命名空间（`pair-dev-contract`） | — |
| 2.0.0 | 2026-08-28 | 改 Tauri v2 双端：`TodoItem` → `ScheduleEvent`，新增适配器接口、冲突规则、BLE 帧协议（`shishi-protocol`，**已作废**） | — |
| 3.0.0 | 2026-10-02 | **全面重写**：作品改为「实验助手 Lab Studio」单文件 HTML；`ScheduleEvent`/适配器/冲突/BLE 全部作废，替换为 `Exp`/`Step`/`mediaRef`/`CanvasItem`、`Store`/`Media`、`INST_LIB` 替换接口、`canvasAct` 动作集、哈希路由与 `data-act` 事件委托、`REPORT_PROMPT` 与 OpenAI 兼容接入、新设计 token；定义 `EXP_VERSION = 1` | — |
| 3.1.0 | 2026-10-05 | **补齐 v3.0.0 之后落地的三个能力，并修正与现实不符的条款**：① 新增 §3.11「AI 生成实验步骤页」；② 新增 §3.10「局域网互传」（`#/lan` + 可选 `src/lan-server.py`，含存储 key `zhbit-lab-lan`、10 个 HTTP 接口、分片/秒传/续传/局部重绘/5 秒轮询约定、无鉴权安全边界）；③ §3.7 视图表补 `aigen`/`lan`，`BARE_VIEWS` 明确为 4 个，动作清单补 `ai-*` / `lan-*` 与 `lan-` 前缀转发；④ 铁律 2 由「只有 `callLLM()` 能发请求」改为「`callLLM()` + `#/lan` 互传模块两处收口」；⑤ 铁律 5 / 红线① 补记**已内联并登记**的 React 18.3.1 / KaTeX / mhchem；⑥ 铁律 12 由「`check-page` 88 项」改为**三套校验**（153/155 + 25 + 33）；⑦ §7 补「G. 局域网互传」坑表。**`EXP_VERSION` 仍为 1**（`Exp` 数据结构未变），互传只新增独立 storage key | — |
| **3.2.0** | **2026-10-08** | **① 计时器改为「每步一个 + 自由计时器」**（新增 §3.12）：`step.timer` 每步独立，`exp.timer` 变为不绑定步骤的**自由计时器**；§3.2 的 `Step` 结构补 `timer` 字段；§3.7 动作清单补 8 个 `timer-*` / `go-edit-timer`；新增 **`data-timer-src` 动作路由**（`resolveTimer()`）与 `data-timer-host` / `data-timer-owner` / `data-timer-clock` 标记约定；`migrateTimers()` 幂等迁移旧数据。② **「仪器摆放」整体移除**：§3.4（画布 `CanvasItem`/`Link`）与 §3.5（`INST_LIB` 仪器库）标为 ⛔ 仅留档，其数据结构、运行时、13 个 `cv-*` 动作、`cv-` 前缀转发、`step.canvas` 字段全部作废；§3.2 去掉 `canvas` 字段；§3.7 的 `default` 只保留 `lan-` 前缀转发。③ 命名铁律第 9 条（先追加 `INST_LIB`）作废；`i_` / `l_` id 规则作废。④ **铁律 12 的校验基线更新**为 2 / 271（本仓库 263 + 8 SKIP）/ 25 / 44 / 34 / 44。⑤ 新增折叠卡存储 key `zhbit-lab-fold`。**`EXP_VERSION` 仍为 1**（旧字段只增不改：`step.timer` 为新增；旧 `exp.timer` 语义变更但字段名沿用，旧数据由 `migrateTimers()` 兼容） | — |
| **3.3.0** | **2026-10-09** | **① 导出改为格式二选一**：`exp-export` 打开格式选择弹窗（新动作 `exp-export-md` / `exp-export-json` / `exp-export-close`，宿主 `#dialogHost`，状态 `ui.exportId`）；新增 **离线 Markdown**（`buildOfflineMarkdown()` + `Media.dataURL()`，图片 base64 内嵌，读不到图写占位）——JSON 包结构与导入规则**一字未改**。② **新增 §3.13「方程式输入 `chem-input`」**：补记元素属性/事件契约、`tools/inline-chem.mjs` 重新内联流程、离子电荷写法（`^3+` / `^+` / `^2-` / `^-`）与 **`smartConvert()` 必须把电荷粘成 `^{3+}`** 的冻结规则（否则 mhchem 把 +/− 挤出右上角上标）。③ **新增 §3.14「手机端适配与溢出兜底」**：`minmax(0,1fr)` / `min-width:0` 硬化约定、`<html data-fit>` + `--fit-s` + `zoom` 兜底、`calc(100dvh / var(--fit-s))` 高度补偿、`.fit-hint` + `fit-reset`。④ **铁律 12 校验基线**更新为 2 / 306（本仓库 298 + 8 SKIP）/ 25 / 64 / 75 / 18 / 65 / 44 / 34。⑤ **兜底缩放改两条路，运行时实测选一条**：`zoom` 与 `transform: scale()`（只缩 `#main > .view`，多出的布局高度用负 margin 收掉）；**不能只看 `CSS.supports("zoom")`** —— Android WebView（Chrome/113）上 `zoom` 假生效（supports 与 computed 都报 0.5，元素一个像素没缩），必须用 100px 探针实测（`Fit.detectZoom()`）。走 transform 那条时还要 `html[data-fit-tf] #main > .view { animation: none }`（CSS 动画优先级高于内联 `transform`）。⑥ §3.13 补两条红线：电荷归一化**只在紧挨着时**生效且必须在空格归一化之前（否则吃掉 `5Cl2 ^ + 8H2O` 的 `+`，`chem-input` 直接渲染成空 div）；`parseFormula` / `checkBalance` **永不抛异常**。**`EXP_VERSION` 仍为 1**（`Exp` / `Step` 数据结构未变：只新增导出格式与 UI） | — |

---

## 7. 坑清单（单文件版 · 血泪）

### A. 跑不起来 / 白屏

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| A1 | 双击后一片白 | `JSON.parse` 读到坏数据抛异常，`boot()` 中断 | 所有读存储走 `Store.readJSON`（内部已 `try/catch`）；`normalizeExp` 补默认值 |
| A2 | 手机上打不开 / 样式全乱 | 少了 `viewport` meta 或用了桌面断点 | `<meta name="viewport">` + `@media (max-width: 860px)` 单栏 + 底部 Tab |
| A3 | 队友好好的、我这打开是旧版 | 浏览器缓存了旧 HTML | `Ctrl+F5` 硬刷新；或确认改的是 `src/index.html` |
| A4 | 加了 `<script src="...">` 后校验失败 | 违反铁律 1 | 一切 JS/CSS 内联；靠 `renderInstIcon` 换美术，不靠外链 |

### B. 数据

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| B1 | 刷新数据全丢 | 直接改了 `state.exp` 没落盘 | 改完调 `persistExp()` / `saveSoon()`；`input` 走防抖，结构性改动立即存 |
| B2 | 列表里出现两条同名实验 | `saveExp` 用了 push 而不是按 id 覆盖 | 汇总列表先 `filter(m => m.id !== exp.id)` 再 push |
| B3 | 界面显示 `undefined` | 老数据缺新字段 | 读取先过 `normalizeExp`，不许直接吃原始对象 |
| B4 | 存不进去，还弹「结构不合法」 | `isValidExp` 闸门没过（典型：`steps` 不是数组 / step 缺 `images`） | 造数据一律走 `newExp()` / `normalizeStep()`，别手搓对象 |
| B5 | 图片在别的设备上看不到 | `.json` 不内嵌图片二进制（设计如此） | 属预期行为；跨设备要图得连图片一起传 |
| B6 | 删了素材，步骤里还留着空白框 | 只删了 IndexedDB 没删引用 | 一律走 `mediaDel(id)`（它扫全部容器 + `log.totalImages`） |
| B7 | ~~层级乱的~~ | ⛔ 画布已移除，`z` / `items` 顺序 / `cv-front` 都不存在了（§3.4） | — |
| B8 | 旧实验的计时器数据不见了 | 直接把 `exp.timer` 当「每步一个」用 | 读实验一律走 `normalizeExp()`（内含 `migrateTimers()`，会幂等下放到第一步） |

### C. 交互与计时器

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| C1 | ~~手机上拖不动仪器~~ | ⛔ 指针拖拽已随画布移除（§3.4） | — |
| C2 | 点新按钮没反应 | 只写了模板没加 `handleAct` case | 新增交互 = 模板 `data-act="xxx"` + `handleAct` 一个 `case`；**只有 `lan-` 前缀会自动转发** |
| C3 | 计时器按钮改错了别的步骤 | 按钮没放进带 `data-timer-src` 的卡里 | `timer-*` 动作靠 `data-timer-src` 定位；自由计时器写 `"free"`，第 N 步写数字（§3.12） |
| C4 | 点计时器按钮后输入框失焦 / 页面跳顶 | 用了整页 `render()` | `timer-*` 一律走 `refreshTimer()` 局部重画 |
| C5 | 倒计时到点写错了步骤 | 没区分「本步计时器」与「自由计时器」 | 本步 → 写该步记录；自由 → **只响铃不写记录**（§3.12） |

### D. 报告与 LLM

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| D1 | 点「分发给 LLM」没反应 | 未配置 Key 且没走降级 | 降级链必须在：无 Key → 本地生成 + toast |
| D2 | 请求失败后页面卡住 | `fetch` 抛错没 catch | `callLLM` 的错必须由 `llmReport()` catch → toast → `localReport()` |
| D3 | 生成的表格错行 | 单元格里有 `\|` 或换行 | 表格内容一律过 `cell()`（转义竖线、换行压成空格） |
| D4 | 报告里出现 `undefined` / 空章节 | 没做「有内容才输出」判断 | 每个章节前用 `has()` 判空再 push |
| D5 | 提示词改了效果崩 | 动了 `{{DATA}}` 注入点或四条冻结要求 | 见 §3.8，改提示词不许动那四条 |
| D6 | 密钥出现在导出的 `.json` 里 | 把 LLM 配置写进了实验包 | `zhbit-lab-llm` 只在本机；导出包固定只含 `exp` + `report` |

### E. 主题与视觉

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| E1 | 深色下某块是白的 | 裸写了 `#fff` 或该 token 没有深色覆盖 | 只用 `var(--x)`；浅色每个 token 都要有深色覆盖 |
| E2 | 样式没生效 | `var(--x)` 里 `x` 写错/未定义 | 新增 token 要在 `:root` 声明并在深色里覆盖 |
| E3 | 安卓上玻璃效果失效 | 不支持 `backdrop-filter` | 已有实心近似兜底；别另配一套配色 |

### F. 材料与提交

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| F1 | 交材料时没有码道痕迹 | 攒到最后补，补不出来 | **每天收工前 15 分钟**截图归档，死规矩 |
| F2 | 未登记开源组件 | 随手引了库 | 内联的 React / KaTeX / mhchem 已登记在 `docs/作品说明.md` §六；再引任何依赖前必须先登记 |
| F3 | 密钥进了 Git | 写在普通配置文件 | 只存浏览器 localStorage；仓库里不许出现任何 Key |
| F4 | 提交了跑不起来的版本 | 改完没跑校验 | 提交前必跑 `node src/tools/check-page.mjs src/index.html`（153/155 项）+ `check-isotope.mjs`（25）+ `check-lan.mjs`（33），全绿 |

### G. 局域网互传

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| G1 | 手机打开地址进不去 | 用了 `127.0.0.1`、两台设备不同 Wifi、或 Windows 防火墙没放行 | 用终端打印的局域网 IP（`192.168.x.x`）；首次运行选「允许访问专用网络」 |
| G2 | 双击 HTML 打开时互传页连不上 | `file://` 与 `http://` 不同源 | 在页面「服务端地址」里填 `http://192.168.x.x:8000`（服务端已开 CORS）；填一次会记住 |
| G3 | 上传完成但下载的文件打不开 | 缺片也让它合并了 | 服务端 `complete` 必须校验全部分片，缺片返回 409；前端 `uploaded` 要跳过已传分片 |
| G4 | 大文件传到一半断了要重头来 | 没做断点续传 | `init` 会回报 `uploaded`，前端只补缺失分片；分片落盘用 `.part.tmp` + `os.replace` 保证原子 |
| G5 | 中文文件名变成乱码 / 下载名丢了 | 用原名当磁盘文件名或没按 RFC 5987 编码 | 磁盘只用 16 位十六进制 id，原名存 `files.json`；下载头用 `filename*=UTF-8''…` |
| G6 | 传完页面卡住 | 轮询没停 / 整页重绘抢焦点 | 离开 `#/lan` 必须 `lanStopPoll()`；进度与列表一律局部重绘 |
| G7 | 被同网段他人上传/删了文件 | 本功能**无鉴权** | 仅限可信局域网；**绝不把端口暴露到公网**；重要数据另行备份 |

---

## 8. 一句话总结

> **一个 `Exp` 走天下，写库只经 `Store`/`Media`，交互只认 `data-act`，报告永远有本地兜底。**
> 四个字收尾：**先读契约，再动手**。
