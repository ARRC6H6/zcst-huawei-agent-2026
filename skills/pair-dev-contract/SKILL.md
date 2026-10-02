---
name: zhbit-lab-protocol
description: >
  珠科×华为云码道 Agent 创新赛「实验助手 Lab Studio」项目的**软件接口契约（唯一权威）**。
  规定实验文件数据模型、存储层（Store / Media）签名与 key、仪器库替换接口、画布交互动作集、
  事件委托与哈希路由、报告与 LLM（OpenAI 兼容）接入约定、设计 token 与命名铁律。
  凡是要写、改、查、解释这个项目的代码，必须先读本文件，并遵守其中全部铁律，
  接口签名一律不许私自改。本文件是原 `shishi-protocol`（拾事 Shishi）的替代版（旧版已作废）。
version: 3.0.0
updated: 2026-10-02
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
| 后端 | **无**。数据全部留在本机（localStorage + IndexedDB） |
| 学科 | 大学生化实验（化学 / 生物 / 生化） |
| 交付物 | `.json` 实验文件（可分享 / 可导入导出） |
| 视觉参考 | 鲸鱼便签 Whale Notes（柔光玻璃 + 马卡龙六色），token 见 §3.9 |
| 依据文档 | [`docs/实验助手-需求与设计蓝图.md`](../../docs/实验助手-需求与设计蓝图.md) |

> 📌 **本期范围红线**：
> ① **不引入任何第三方库 / CDN / 构建步骤**（`check-page.mjs` 会直接判死）；
> ② **不做后端**，数据只在本机，跨设备靠导出 `.json`；
> ③ **视频只登记元信息（占位）**，不落地文件、不存 IndexedDB；
> ④ **LLM 由使用者自填 Key**，未配置或失败一律降级到本地 markdown，不许报错卡死；
> ⑤ 蓝牙同步 / 互传（蓝图 §10）**本期只留数据层伏笔**（`rev` 字段 + `.json` 格式），不实现传输。

---

## 2. 技术栈铁律（违反即打回）

| # | 铁律 | 原因 |
| --- | --- | --- |
| 1 | **单文件、零依赖、零外链**：不许 `<script src>`、不许 CDN、不许 `npm install`、不许构建 | 交付形态就是「双击即开」；评委复现成本必须为 0 |
| 2 | **UI 层不许发网络请求**，全项目只允许 `callLLM()` 一处 `fetch` | 密钥泄露 + 安卓/浏览器 CORS 拦死；请求必须收口在一个函数里 |
| 3 | **时间戳一律 `Date.now()` 毫秒数**，禁 `toISOString()`、禁 ISO 字符串、禁 `new Date(str)` 解析 | 少 8 小时 / 时区漂移是经典 bug 源头；毫秒数天然无时区 |
| 4 | **禁硬编码任何 Key / Token / 密码**；LLM 配置只存 `localStorage['zhbit-lab-llm']` | 推到 GitHub 就泄露，删记录也删不干净 |
| 5 | 依赖必须**先登记**到 `docs/作品说明.md` 的「开源组件」表，再引 | 赛事硬性要求；本项目目前**零第三方依赖** |
| 6 | **业务数据只经 `Store` / `Media`**；直接碰 `localStorage` 只允许主题那两处（§3.6） | 分散读写必然出现 key 写错、坏 JSON 未兜住 |
| 7 | 所有用户可填文本进 HTML **必须经 `esc()`**；markdown 进 HTML 必须经 `mdToHtml()` / `mdInline()` | 实验名 / 步骤文本是用户输入，不转义就是 XSS |
| 8 | **数据结构一变，`EXP_VERSION` 必须 +1**，并同步改本文件 §3.1、§6 变更日志 | 版本号是判断「读到的是哪代数据」的唯一依据 |
| 9 | 仪器一律**先追加 `INST_LIB` 条目**，不许在画布/视图里写死仪器名与尺寸 | 美术资源后续替换只改 `imageUrl`，改别处就白干 |
| 10 | **不许私自改动 §3 的任何签名、字段名、枚举值、key、token 名** | 接口是唯一能让多人并行不返工的东西 |
| 11 | 存储层**永不抛异常**（返回 `false` / `null` / `fallback`）；只有网络层允许 `throw` | 单文件应用抛异常就是白屏，用户没有任何恢复手段 |
| 12 | 改完必须跑 `node src/tools/check-page.mjs src/index.html`，**通过 88 / 失败 0** 才许提交 | 这是唯一能挡住「我这边是好的」的机器校验 |

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
  canvas: { w: 1000, h: 620, items: [ CanvasItem ], links: [ Link ] },
  record: { note: "", images: [ mediaRef ] },  // 记录模式下本步的记录
}
```

**步骤铁律：**

1. **五要素固定为 `text` / `images` / `videos` / `equation` / `tips`**，不许合并成一个大字段。
2. 每步**各有一张仪器画布**（`canvas`），不是整个实验一张。
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

### 3.4 画布 `CanvasItem` / `Link`

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

> 📌 `CanvasItem.note` 同样是**预留字段**（`cv-add` 会写成 `""`，但没有 UI 读取或修改它）。
> 将来要开放"仪器说明"的编辑，**走新增 `cv-*` 动作**（见 §3.4 动作表），不要塞进别的动作里。

**冻结的几何与层级规则：**

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

**连线的创建不在 `canvasAct` 里**，而在 `onPointerDown`：`ui.canvasTool === "link"` 时，
第一次点仪器记 `ui.linkFrom`（toast「已选起点，再点一个仪器完成连线」），
第二次点**另一个**仪器就 `links.push({ id: uid("l_"), from, to, kind: "导管", note: "" })` 并清空 `linkFrom`。
**点同一个仪器不会自连。**

**`canvasAct(action, el)` —— 画布动作集（冻结，共 13 个）：**

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

> 🔴 `handleAct()` 的 `default` 分支把**任何 `cv-` 前缀**的动作转给 `canvasAct`。
> 所以新增画布动作时，**只需在 `canvasAct` 里加分支，`handleAct` 不用动**。

### 3.5 仪器库 `INST_LIB`（美术替换接口）

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

**三条冻结规则：**

1. **渲染唯一入口是 `renderInstIcon(item, size)`**：它接收带 `.inst`（仪器库 id）的**实例对象**，
   `imageUrl` 非空 → 渲染 `<img>`（`object-fit: contain`）；否则把 `icon` 的 `width/height` 换成实际尺寸后渲染 SVG。
   **两个调用点都走它**：画布里的仪器（`itemHTML`，传 CanvasItem、尺寸取库中 `w`/`h`）
   与编辑页左侧仪器面板（`instPanelHTML`，传 `{ inst: x.id }`、尺寸 17）。
   ⚠️ 面板**不许**再直接 `x.icon.replace(...)` —— 那样填了 `imageUrl` 也不换图，且校验测不出来。
2. **条目 id 全库唯一**；`cat` 必须命中 `INST_CATS`，**不许出现孤儿分类**，也不许有空的分类。
3. 仪器清单必须**含 `beaker` / `test-tube` / `microscope` / `alcohol-lamp` / `petri-dish`**
   （校验硬性项），且总数 **≥ 30**（当前 36 条：glass 13 / measure 6 / support 5 / heat 4 / biology 8）。

> 📌 **后续换美术只做一件事**：给对应条目填 `imageUrl`。画布与仪器面板会一起生效；
> 禁止把图片路径写进视图或画布代码。

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
| `edit` | `viewEdit()` | 是 |
| `record` | `viewRecord()` | 是 |
| `report` | `viewReport()` | 是 |
| `settings` | `viewSettings()` | 否 |

**路由回落链（冻结）：**

1. `view` 不在 `VIEWS` 里 → 回落 `home`。
2. 需要 expId 但没有有效 id → `pickExpId()`：`param` 有效则用它 → 否则当前 `state.exp` → 否则列表第一个。
3. 仍然拿不到 id → toast「先新建一个实验」，回落 `home`。
4. `goTo()` 是**唯一导航入口**：切换前先 `persistExp()` 保存当前实验；
   除 `home` / `settings` 外每次进入都会重置 `ui.step = 0`、`ui.playIndex = 0`、`ui.selected = null`。
5. `render()` 是**唯一重绘入口**，内部顺序固定为：
   `main.innerHTML = viewXxx()` → `main.scrollTop = 0` → `syncNav()` → `refreshCanvas()` → `hydrateMedia()`。

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
> `matchMedia("(prefers-color-scheme: dark)")` 的 `change`（跟随系统主题时同步）。

**表单同步（冻结）：** `input` 事件只认三个 `data-scope`：

| 标记 | 落点 |
| --- | --- |
| `data-scope="exp"` + `data-field` | `state.exp[field]` |
| `data-scope="record"` | 当前步骤 `record.note` |
| `data-scope="total"` | `exp.log.total` |
| 无 scope + `data-field` | 当前步骤的该字段（`title` 时额外 `updateStepName()`） |
| `data-llm="baseUrl\|apiKey\|model"` | **不自动写**，必须点「保存配置」（`llm-save`） |

所有 `input` 都走 `saveSoon()`（350ms 防抖）落盘，**不许每敲一个字就同步写 localStorage**。

**`handleAct` 动作清单（冻结，除 `cv-*` 外的全部）：**

```
theme                                  exp-new / exp-open / exp-dup / exp-del / exp-export / exp-import
exp-subject                            step-add / step-open / step-del / step-move
media-add / media-del                  play-prev / play-next / play-go
go-edit / go-record / go-report        rep-local / rep-llm / rep-copy / rep-export
set-theme / llm-save / llm-test / llm-prompt
data-export-all / data-clear           （default → cv-* → canvasAct）
```

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

---

## 4. 命名与统一错误

| 类型 | 规范 | 例子 |
| --- | --- | --- |
| 实验 id | `exp_` + 随机 | `exp_k3f9a2x1b7` |
| 步骤 id | `s_` + 随机 | `s_9a2k3f1b7` |
| 媒体 id | `m_` + 随机 | `m_7f2a91c0d3` |
| 仪器实例 id | `i_` + 随机 | `i_2b8c14e5f6` |
| 连线 id | `l_` + 随机 | `l_5d0e77a1c2` |
| 存储 key | `zhbit-lab-` 前缀 | `zhbit-lab-exp:exp_xxx` |
| 函数 / 变量 | camelCase | `buildLocalMarkdown()` |
| 常量 / 令牌名 | UPPER_SNAKE / `--kebab` | `INST_LIB`、`--tint-line` |
| CSS 类名 | kebab-case | `.exp-card`、`.player-dot` |
| data 属性 | kebab-case | `data-act`、`data-canvas-host`、`data-ro` |
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
| 画布层 `canvasAct` | 前置条件不满足 → `toast("先点选一个仪器")` 之类，然后 `return` |
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
3. ❌ 在 UI 层 `fetch`（唯一例外：`callLLM()`）
4. ❌ 硬编码 API Key / Token；把 `apiKey` 写进导出的 `.json`
5. ❌ 把 `report` 塞进 `Exp`；把 `conflicts` 式的派生数据写进存储
6. ❌ 绕过 `Store` / `Media` 直接读写 storage；绕过 `normalizeExp` 直接用原始数据
7. ❌ 每敲一个字就写一次 localStorage（必须走 `saveSoon()` 防抖）
8. ❌ 改完不跑 `check-page.mjs` 就提交
9. ❌ 假设队友读过你的代码 —— **接口是唯一的沟通渠道**

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
| B7 | 层级乱的 | 想当然加了 `z` 字段 | **没有 `z`**，层级 = `items` 数组顺序，用 `cv-front` / `cv-back` |

### C. 画布与交互

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| C1 | 手机上拖不动仪器 | 用了 mouse 事件 | 一律 Pointer Events（`pointerdown/move/up`），鼠标触摸一套代码 |
| C2 | 点新按钮没反应 | 只写了模板没加 `handleAct` case | 新增交互 = `data-act` + `handleAct` 一个 case；`cv-` 前缀自动转 `canvasAct` |
| C3 | 画布尺寸对不上 | 在画布层写死了尺寸 | 尺寸一律取 `INST_LIB` 条目的 `w` / `h` |
| C4 | 缩放/旋转越界 | 忘了 clamp | 缩放 clamp `[0.4, 2.5]`、旋转步进 15°、坐标吸附 10px |
| C5 | 加仪器点不动 | `data-inst` 的 id 不存在于 `INST_LIB` | 仪器面板渲染时直接用 `INST_LIB` 的 id，别手写字符串 |

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
| F2 | 未登记开源组件 | 随手引了库 | 本项目零第三方依赖；将来引依赖前先登记 `docs/作品说明.md` |
| F3 | 密钥进了 Git | 写在普通配置文件 | 只存浏览器 localStorage；仓库里不许出现任何 Key |
| F4 | 提交了跑不起来的版本 | 改完没跑校验 | 提交前必跑 `node src/tools/check-page.mjs src/index.html`，88 项全绿 |

---

## 8. 一句话总结

> **一个 `Exp` 走天下，写库只经 `Store`/`Media`，交互只认 `data-act`，报告永远有本地兜底。**
> 四个字收尾：**先读契约，再动手**。
