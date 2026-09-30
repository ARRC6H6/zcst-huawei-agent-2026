---
name: shishi-protocol
description: >
  珠科×华为云码道 Agent 创新赛「拾事 Shishi」项目的**软件接口契约（唯一权威）**。
  规定数据模型、数据源适配器接口、冲突判定规则、存储与 IPC 边界、蓝牙帧协议、设计 token
  与命名铁律。凡是要写、改、查、解释这个项目的代码，必须先读本文件，并遵守其中全部铁律，
  接口签名一律不许私自改。本文件是原 `pair-dev-contract` 的升级替代版（旧版已作废）。
version: 2.0.0
updated: 2026-08-28
applies_to: 拾事 Shishi（Tauri v2 · Windows exe + Android APK）
---

# 拾事 Shishi · 软件接口契约（v2）

> 这份文件是**所有人的共同语言**。不管谁来问代码，都按这份文件办。
> 目标：**各写各的模块，合起来一次跑通，不用互相读对方的实现。**
>
> ⚠️ 旧版（v1 · 双人协作规约 · 原生 HTML/JS · TodoItem）**已作废**，不要再按旧版写代码。
> 本文档只规定**技术协议**：数据结构、接口签名、边界、格式、规则。
> 团队协作流程（对表、交接、痕迹归档）见 [`docs/工作须知.md`](../../docs/工作须知.md)。

---

## 0. 怎么用这份文件

DeepSeek 网页版没有系统提示词入口，用法二选一：

**方法 A（推荐）· 上传文件**
把这份 `SKILL.md` 上传到 DeepSeek 对话，再发「对表」指令（见 `docs/工作须知.md` §2）。

**方法 B · 直接粘贴**
新建对话，第一条消息把本文件全文粘进去，再发对表指令。

**每个新对话都要重来一次**（DeepSeek 不记得上一个对话）。
**对表答错了，就重新贴一遍，不要将就着干活。**

---

## 1. 作品一句话

> **把散落在课表、快递、车票、短信通知里的零碎信息，自动收拢成一份看得懂、会提醒你冲突的生活日程。**

| 项目 | 内容 |
| --- | --- |
| 作品名 | 拾事 Shishi |
| 形态 | Tauri v2 桌面 exe（Windows）+ 安卓 APK，双端**蓝牙互联** |
| 前端 | React 19 + TypeScript + Vite |
| 后端 | Rust（Tauri v2 `src-tauri`） |
| 主数据源 | 教务课表、快递100、12306 车票、用户历史信息 |
| 视觉参考 | 鲸鱼便签 Whale Notes（马卡龙 + 玻璃拟态），token 见 §3.9 |

> 📌 **本期范围红线**：四个数据源**只冻结接口，不做真实接入**；蓝牙**只冻结协议，不做传输实现**。
> 任何地方未实现，必须抛 `E_NOT_IMPLEMENTED` 或返回桩数据，**不许自己发明一套接口**。

---

## 2. 技术栈铁律（违反即打回）

| # | 铁律 | 原因 |
| --- | --- | --- |
| 1 | 前端只用 **React 19 + TypeScript + Vite**；Rust 只放 `src-tauri` | 与鲸鱼便签同版本系，环境经验可复用 |
| 2 | **UI 层永远不许发网络请求**（不许 `fetch`/`axios`） | 密钥会泄露、安卓端 CORS 拦死；请求只许出现在适配器层内 |
| 3 | 时间一律 **ISO8601 带 `+08:00`**，禁 `toISOString()`、禁 `Z` | 少 8 小时是经典 bug 源头 |
| 4 | **禁硬编码任何 Key / Token / 密码**；只许放 `*.local.ts` / `*.local.json`（已在 `.gitignore`） | 推到 GitCode 就泄露，删记录也删不干净 |
| 5 | 依赖必须**先登记**到 `docs/作品说明.md` 的「开源组件」表，再引 | 赛事硬性要求，漏登记是知识产权问题 |
| 6 | 桌面端与安卓端**共用同一套 TS 源码**，差异只许走 `platform()` 判断 + 平台条件样式 | 复制两份 UI 必然走岔 |
| 7 | 落盘只经 `db_save`；**UI 不许直接写文件** | 绕过原子写会把数据写坏 |
| 8 | JSON 字段一律 **camelCase**（Rust 侧必须 `#[serde(rename_all = "camelCase")]`） | 不冻结就会出现 `startAt` / `start_at` 两套 |
| 9 | **不许私自改动 §3 的任何签名、字段名、枚举值** | 接口是唯一能让多人并行不返工的东西 |

---

## 3. 冻结的接口契约 ⭐

> 本节是全文核心。**签名一旦定下，谁都不许私自改。** 要改走 §6 的变更流程。

### 3.1 核心实体 `ScheduleEvent`

**这是全项目唯一的「货币」**——模块之间传的、存的、显示的都是它。

```ts
interface ScheduleEvent {
  id: string;                 // evt_<yyyyMMdd>_<4位随机>，如 evt_20261002_4f2a
  title: string;              // 必填，非空
  kind: EventKind;            // 见下
  source: SourceKind;         // 见下
  startAt: string;            // ISO8601 带 +08:00，必填
  endAt: string | null;       // 时刻型事项为 null
  allDay: boolean;            // 快递到期这类整天事项为 true
  location: string | null;
  remindAt: string | null;    // 快递：arriveAt + 7 天
  remindDaily: boolean;       // 快递倒计时期间每天提醒
  status: EventStatus;        // todo | done | expired | canceled
  meta: ParcelMeta | TicketMeta | CourseMeta | ExamMeta | Record<string, never>;
  rawText: string;            // 原始输入，用于追溯，永不丢弃
  deviceId: string;           // 产生这条记录的设备
  rev: number;                // 整数自增，双端同步用
  createdAt: string;          // ISO8601 带 +08:00
  updatedAt: string;          // ISO8601 带 +08:00
  conflicts?: ConflictHit[];  // 🔴 只读派生，永远不落盘
}

type EventKind   = 'course' | 'parcel' | 'ticket' | 'exam' | 'meeting' | 'custom';
type SourceKind  = 'manual' | 'import' | 'exam_system' | 'kuaidi100' | 'rail12306' | 'history' | 'ble';
type EventStatus = 'todo' | 'done' | 'expired' | 'canceled';
```

**字段规则：**

| 字段 | 规则 |
| --- | --- |
| `id` | 前缀 `evt_`。老网页版的 `t_` 前缀**不读取、不迁移**（v2 从空数据开始） |
| `startAt` / `endAt` | 一律本地时间带偏移。跨天事项用 `startAt` 当天 + `endAt` 次日表示 |
| `allDay` | `true` 时 `endAt` 可以为 null，表示「整天」；冲突判定跳过 allDay |
| `rev` | 本机每次修改 +1；**桌面端为唯一真源**，合并规则见 §3.8 |
| `conflicts` | 由 `detectConflicts()` 计算后**临时挂上**，`db_save` 时必须剥掉 |

### 3.2 `meta` 按 `kind` 判别

| kind | meta 类型 | 字段 |
| --- | --- | --- |
| `parcel` 快递 | `ParcelMeta` | `carrier: string`、`trackingNo: string`、`pickupCode: string \| null`、`station: string \| null`、`arriveAt: string`、`expireAt: string` |
| `ticket` 车票 | `TicketMeta` | `trainNo: string`、`seatNo: string \| null`、`from: string`、`to: string`、`departAt: string`、`arriveAt: string`、`ticketNo: string \| null` |
| `course` 课表 | `CourseMeta` | `courseName: string`、`teacher: string \| null`、`semester: string`、`weekday: 1..7`、`period: string`（如 `3-4`）、`classroom: string \| null` |
| `exam` 考试 | `ExamMeta` | `courseName: string`、`seatNo: string \| null`、`examType: string` |
| 其它 | `{}` | 空对象，不许塞野字段 |

> 🔴 **快递 7 天倒计时算法（冻结）**：
> `expireAt = arriveAt + 7 天`，`remindAt = arriveAt`，`remindDaily = true`。
> **剩余天数永远实时算**（`expireAt - today`），**不许把「剩余几天」存进任何字段**。

### 3.3 数据源适配器（统一出口）

四个数据源（`kuaidi100` / `exam_system` / `rail12306` / `history`）**对外只有这一个形状**：

```ts
interface DataSourceAdapter {
  id: SourceKind;
  /** 抓取。永远 resolve，永远不 reject —— 失败也要返回 AdapterResult{ ok:false } */
  fetch(query: SourceQuery): Promise<AdapterResult>;
}

interface SourceQuery {
  deviceId: string;
  since: string | null;   // ISO8601，增量抓取起点；首次为 null
  options?: Record<string, string>;  // 适配器私有参数，别的适配器不许读
}

interface AdapterResult {
  ok: boolean;
  source: SourceKind;
  events: EventDraft[];   // 待入日程的「草稿」
  hints: HistoryHint[];   // 🔴 只有 history 会给，其它适配器恒为 []
  error: ShishiError | null;
  fetchedAt: string;      // ISO8601 带 +08:00
}
```

**三条铁律：**

1. **适配器只产草稿，绝不写库。** 写库是聚合层的事，适配器不许碰 `db_save`。
2. **规则实现与桩实现必须返回完全相同的结构。** 换成真实调用时，上层一行都不用改。
3. **上层永远不许判断「是哪个适配器」**，只认 `AdapterResult`；唯一例外是 `hints` 非空即来自 history。

### 3.4 草稿 `EventDraft` 与去重

```ts
interface EventDraft {
  title: string;
  kind: EventKind;
  source: SourceKind;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  remindAt: string | null;
  remindDaily: boolean;
  meta: ScheduleEvent['meta'];
  rawText: string;
  externalId: string;      // 🔴 必填：快递单号 / 车次+日期 / 课程ID / 手工输入的 hash
  confidence: number;      // 0~1，桩实现固定给 0.6
}
```

> 🔴 **去重键（冻结）**：`dedupKey = source + ':' + externalId`
> 同一个 `dedupKey` **全库只允许一条**。重复抓到走 **update**（改 `title`/`startAt`/`meta`，`rev` +1），**不许 insert 出新的一条**。
> 快递单号变了就是新快递，别拿「驿站+姓名」当 externalId。

### 3.5 用户历史信息 = `HistoryHint`（只推荐，不造事件）

```ts
interface HistoryHint {
  id: string;
  kind: EventKind;
  title: string;
  suggestion: string;        // 中文一句，直接给 UI 显示，如「你上周三 15:00 有课，要加进课表吗？」
  basedOn: string[];         // 依据的历史事件 id
  confidence: number;        // 0~1
}
```

> 🔴 **`history` 适配器不许直接产事件**，只许产 `hints`。
> 用户点「采纳」之后，才由**用户操作**触发 `event_upsert`（`source: 'history'`）。

### 3.6 冲突判定（纯函数，结果不落盘）

```ts
type ConflictRule = 'overlap' | 'parcel_vs_course' | 'ticket_vs_course';

interface ConflictHit {
  rule: ConflictRule;
  withId: string;        // 撞上的另一条 id；自身到期类冲突填自己的 id
  level: 'warn' | 'error';  // ⚠️ 本期三条规则统一用 'warn'
  reason: string;        // 中文一句，直接显示，不许让 UI 自己拼
}

/** 纯函数：不许读存储、不许发请求、不许改传入数组 */
function detectConflicts(events: ScheduleEvent[]): Record<string, ConflictHit[]>;
```

| 规则 | 触发条件 | 级别 | `reason` 示例 |
| --- | --- | --- | --- |
| `overlap` | 两条**非 allDay** 事件区间重叠（`a.start < b.end && b.start < a.end`） | `warn` | `与「数据结构」时间重叠 30 分钟` |
| `parcel_vs_course` | 快递 `expireAt` 当天有 `course` 事件 | `warn` | `快递当天到期，你当天 8:00-17:00 有课，记得提前取` |
| `ticket_vs_course` | 车票 `departAt` 与当天 `course` 事件区间重叠 | `warn` | `14:30 出发，撞「数据结构」` |

**实现要求（冻结）：**

1. 双方都要挂：A 撞 B 时，A 和 B 的冲突列表里各有一条（`withId` 互指）。
2. `reason` 里的数字（时长、时间）**必须算出来**，不许写死文本。
3. 冲突**只在渲染前算一次**，算完挂到 `conflicts`；`db_save` 前必须剥掉（否则会存过期结论）。
4. UI **只认** `data-conflict="warn" | "error"` 属性。**UI 层禁止自己判断冲突**，也禁止重新计算。

### 3.7 存储与 IPC 边界

```ts
interface DbSnapshot {
  version: 2;                 // 数据结构版本，改结构就 +1
  events: ScheduleEvent[];
  devices: DeviceRecord[];    // 见过面的设备
  savedAt: string;            // ISO8601 带 +08:00
}

interface DeviceRecord {
  deviceId: string;
  platform: 'windows' | 'android';
  appVersion: string;
  lastSeenAt: string;
}
```

- 桌面端存储 key：**`shishi:v2:events`**（旧 key `shishi:v1:todos` **不读、不迁移**）
- 安卓端存储 key 同名，但**安卓端不算真源**，见 §3.8
- 写入必须**先写临时文件再 rename**，崩了也不许把数据写坏

**Tauri command 表（Rust 侧签名冻结，snake_case）：**

| command | 入参 | 返回 | 说明 |
| --- | --- | --- | --- |
| `db_load` | — | `Result<DbSnapshot, ShishiError>` | 无文件返回空快照，**不许返回 null / 不许报错** |
| `db_save` | `snapshot: DbSnapshot` | `Result<(), ShishiError>` | 原子写 |
| `event_upsert` | `draft: EventDraft` | `Result<ScheduleEvent, ShishiError>` | 内部按 `dedupKey` 去重 |
| `event_remove` | `id: string` | `Result<(), ShishiError>` | 不存在时静默成功 |
| `source_fetch` | `query: SourceQuery` | `Result<AdapterResult, ShishiError>` | 桩实现，未接入返回 `E_NOT_IMPLEMENTED` |
| `ble_status` | — | `Result<BleStatus, ShishiError>` | |
| `ble_send` | `frame: FrameEnvelope` | `Result<(), ShishiError>` | |

> 🔴 **TS 侧只许调用包装函数**（`dbLoad()` / `dbSave()` / `eventUpsert()`…），
> **禁止在任何业务代码里直接写 `invoke('db_save')` 字符串**。
> 包装层放在 `src/ipc/`（或等价的单一模块），全项目只有这一处出现 command 名。
> 包装层负责：把 `ShishiError` 转成抛出 / 把 snake_case 差异吃干净。

### 3.8 蓝牙（BLE）协议 —— 传输层留 TODO，协议先冻结

**UUID（冻结，不许改）：**

| UUID | 用途 | 属性 |
| --- | --- | --- |
| `d5f1c0de-0001-4a1e-9c2b-5f1e00000001` | Service | — |
| `d5f1c0de-0001-4a1e-9c2b-5f1e00000002` | RX：手机 → 桌面 | Notify |
| `d5f1c0de-0001-4a1e-9c2b-5f1e00000003` | TX：桌面 → 手机 | Write |
| `d5f1c0de-0001-4a1e-9c2b-5f1e00000004` | INFO：设备信息 | Read |

**帧格式（冻结）：`6 字节头 + UTF-8 JSON payload`**

| 字节 | 名称 | 说明 |
| --- | --- | --- |
| 0 | `version` | 固定 `0x01`，不匹配直接丢帧 |
| 1 | `type` | 见下表 |
| 2 | `seq` | 0~255 循环递增 |
| 3 | `fragIdx` | 分片序号，从 0 开始 |
| 4 | `fragTotal` | 分片总数，单帧为 1 |
| 5 | `flags` | 保留，本期固定 `0x00` |

- **单帧 payload ≤ 200 字节**。超了就分片，`fragTotal > 1` 时接收方必须按 `fragIdx` 顺序重组完才解析。
- 重组超时（建议 5 秒）就丢弃整包，**不许把残缺 JSON 往上层传**。

**`type` 定义与 payload：**

| type | 名称 | 方向 | payload |
| --- | --- | --- | --- |
| `0x01` | `HELLO` | 双向 | `{ deviceId, platform: 'windows'\|'android', appVersion, ts }` |
| `0x02` | `EVENT_PUSH` | 手机 → 桌面 | `{ draft: EventDraft, clientRev: number }` |
| `0x03` | `EVENT_ACK` | 桌面 → 手机 | `{ ackSeq: number, accepted: boolean, assignedId?: string, reason?: string }` |
| `0x04` | `REMINDER` | 桌面 → 手机 | `{ eventId, title, remindAt, level: 'warn'\|'error' }` |
| `0x05` | `TIME_SYNC` | 桌面 → 手机 | `{ desktopTs: string }` |
| `0x06` | `PING` | 双向 | `{}` |
| `0x7F` | `ERROR` | 双向 | `{ code: ErrorCode, message }` |

**数据流向铁律：**

1. **桌面端是唯一真源**。手机推送的 `EventDraft` 只是草稿，**收到 `EVENT_ACK{accepted:true}` 才算成功**。
2. 桌面收到 `EVENT_PUSH` 后：按 `dedupKey` 去重 → `event_upsert` → 回 `EVENT_ACK`。
3. 手机端 `clientRev` 落后于桌面 `rev` 时，**以桌面为准**（本期不做冲突合并，直接覆盖并记日志）。
4. 时间一律以桌面为准，手机收到 `TIME_SYNC` 后校正自己的显示，**不许反过来改桌面时间**。

> 🚧 **明确留白（TODO，谁都不许私自决定）**：
> 主从角色（谁 Central / 谁 Peripheral）、MTU 协商、断线重连、重传与丢帧补偿、
> 安卓运行时权限申请、后台存活策略。**这些要动之前先在群里说，改完同步进本节。**

### 3.9 设计 token（沿用鲸鱼便签，冻结）

```css
:root {
  /* 马卡龙六色（事件卡片按 kind 取色） */
  --color-paper:    #FFFFFF;
  --color-mint:     #8FE3BD;
  --color-peach:    #FFB59B;
  --color-lavender: #B9ADFF;
  --color-lemon:    #FFD977;
  --color-sky:      #8EC9FF;

  /* 文字与强调 */
  --ink: #1A1F33;
  --ink-soft: #3F4761;
  --ink-faint: #6F7893;
  --accent: #6A7BFF;
  --danger: #FF6B81;

  /* 玻璃与形状 */
  --glass-bg: rgba(250, 251, 255, 0.52);
  --glass-blur: 20px;
  --r-window: 15px;
  --r-card: 13px;

  /* 动效（统一缓动，禁 linear / ease） */
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --fast: 0.16s var(--ease);
  --mid: 0.28s var(--ease);
}
```

**`kind` → 颜色映射（冻结）：**

| kind | token | 用途 |
| --- | --- | --- |
| `course` | `--color-sky` | 课表 |
| `parcel` | `--color-peach` | 快递 |
| `ticket` | `--color-lavender` | 车票 |
| `exam` | `--color-lemon` | 考试 |
| `meeting` | `--color-mint` | 会议/例会 |
| `custom` | `--color-paper` | 自定义 |

- 冲突态：`[data-conflict="warn"]` 用 `--danger` 做**左侧色条 + 标题淡红**（本期全部 warn，不做红字刷屏）。
- 安卓端不支持窗口级透明模糊，**平台条件样式里退回 `--glass-bg` 实心近似值**，不许另配一套配色。

---

## 4. 命名与统一错误

| 类型 | 规范 | 例子 |
| --- | --- | --- |
| 事件 id | `evt_` + 日期 + 4 位随机 | `evt_20261002_4f2a` |
| 去重键 | `source:externalId` | `kuaidi100:SF1234567890` |
| 存储 key | `shishi:v2:events` | 改结构就升 `v3` |
| TS 变量 / 函数 | camelCase | `detectConflicts()` |
| TS 类型 / 组件 | PascalCase | `ScheduleEvent`、`EventCard` |
| Rust 函数 | snake_case | `db_save` |
| **JSON 字段（一律）** | camelCase | `startAt` ✅ `start_at` ❌ |
| CSS 类名 | kebab-case | `.event-card` |
| 冲突标记属性 | `data-conflict` | `data-conflict="warn"` |
| BLE UUID | 全小写带连字符 | 见 §3.8 |

```ts
type ErrorCode =
  | 'E_INPUT' | 'E_STORAGE' | 'E_NETWORK' | 'E_AUTH'
  | 'E_BLE'   | 'E_NOT_IMPLEMENTED' | 'E_UNKNOWN';

interface ShishiError { code: ErrorCode; message: string; detail?: string }
```

> 🔴 **契约统一（冻结）**：
> **Rust command 一律返回 `Result<T, ShishiError>`**；**TS 适配器一律 resolve，失败也返回 `AdapterResult{ok:false}`**。
> 两边表现不同是故意的：command 是内部调用（异常要好定位），适配器是外部数据（失败是常态，要给 UI 显示原因）。
> 未实现的桩实现，一律 `E_NOT_IMPLEMENTED` + `message: '本期未接入'`。

---

## 5. 给 AI（DeepSeek / 码道）的行为规范

**必须做：**

1. 写任何代码**之前**，先用一句话复述：「我理解的数据结构是 …，这次要改的是 … 接口」
2. 只输出**要改的那一段**，不要整个文件重写
3. 输出后说明：**改了哪个文件的哪个函数、怎么验证它好了**
4. 时间一律 ISO8601 带 `+08:00`
5. 涉及存储 / JSON 解析一律 `try/catch`，失败降级不崩
6. 未实现的桩，明确返回 `E_NOT_IMPLEMENTED`，**不要假装实现**
7. 有不确定性就直说「我不确定 X，建议先试 Y」

**绝对不能做：**

1. ❌ 私自改动 §3 的字段名、枚举值、函数签名、UUID、token 名
2. ❌ 在 UI 层发网络请求、判断冲突、直接写存储
3. ❌ 让适配器写库，或让 `history` 适配器直接产事件
4. ❌ 把 `conflicts` 存进 `DbSnapshot`
5. ❌ 硬编码 Key / Token / 密码
6. ❌ 引入未登记的开源依赖
7. ❌ 桌面端和安卓端各写一套 UI
8. ❌ 假设队友读过你的代码 —— **接口是唯一的沟通渠道**

**当需求会动到冻结的接口时，先停下来回一句：**

> 「这会动到冻结的接口 `xxx`（§3.x），按 §6 要先升版本并在群里说一声。确认了我再写。」

---

## 6. 契约变更流程（改接口之前必读）

1. **先说**：在群里说明「要改哪个接口、为什么、影响谁」，等一句「可以」。
2. **同时改**：契约文档 + 所有调用方 **一次改完**，不许先改一半。
3. **升版本**：`DbSnapshot.version` +1，存储 key 升号（`shishi:v2:events` → `v3`），本文档 `version` 升号。
4. **记一笔**：往下面「变更日志」加一行。
5. **验一遍**：改动方自己跑通一次再通知大家。

### 变更日志

| 版本 | 日期 | 改了什么 | 谁 |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-29 | 初版：原生 HTML/JS 双人规约、`TodoItem`、`SS.` 命名空间 | — |
| 2.0.0 | 2026-08-28 | **全面重写**：改 Tauri v2 双端；`TodoItem` → `ScheduleEvent`；新增适配器接口、冲突规则、BLE 帧协议、设计 token；旧版作废 | — |

---

## 7. 坑清单（Tauri v2 双端版 · 血泪）

### A. 跑不起来

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| A1 | `tauri build` 报 `link.exe not found` | 缺 MSVC 生成工具 | 装 VS Build Tools（含 C++ 桌面开发），Rust 用 `stable-x86_64-pc-windows-msvc` |
| A2 | 窗口一片白 | WebView2 缺失 / 前端没起来 | 先 `pnpm dev` 起 Vite，再开 Tauri；检查 `devUrl` 端口 |
| A3 | 透明圆角窗口失效 | 忘记 acrylic / 平台不支持 | 桌面用 `window_vibrancy`；安卓走实心近似值（§3.9） |
| A4 | 安卓打不出 APK | 缺 Android SDK / NDK / 签名 | 提前把 Hello World APK 跑通，别拖到最后 |
| A5 | `1420` 端口占用 | 上次 dev 没杀干净 | 先关掉旧进程再起 |
| A6 | 队友电脑跑不起来 | 用了绝对路径 | 一律相对路径 + 环境变量 |

### B. 时间与数据

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| B1 | 时间差 8 小时 | 用了 `new Date().toISOString()` | 手写带 `+08:00` 的格式化函数 |
| B2 | 刷新数据全丢 | 没落盘或写坏 | 只经 `db_save`，原子写 |
| B3 | 页面白屏 | 读到坏 JSON 后 `JSON.parse` 抛异常 | 解析必须 `try/catch`，坏数据返回空快照并告警 |
| B4 | 列表出现两条一样的快递 | 没用 `dedupKey` 去重 | `source:externalId` 全库唯一 |
| B5 | 界面显示 `undefined` | 老数据没有新字段 | 读取时补默认值（`Object.assign(默认值, 老数据)`） |
| B6 | 一个人改了数据，另一个也跟着变 | 共用同一个数组引用 | 所有函数返回新数组，用 `{...}` / `[...]` |
| B7 | 存进去一堆冲突结论 | 忘了剥 `conflicts` | `db_save` 前统一剥掉 |

### C. 双端与 IPC

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| C1 | 前端拿到 `undefined` | Rust 返回了 `start_at`，前端等 `startAt` | 结构体必须 `#[serde(rename_all = "camelCase")]` |
| C2 | `invoke` 报找不到 command | 名字写错 / 没注册 | 命令名只在包装层出现一次；`generate_handler!` 里登记 |
| C3 | 安卓上请求被拦 | UI 层直接 `fetch` | 请求只许在适配器层 / Rust 侧 |
| C4 | 蓝牙连不上 | 安卓 12+ 未申请运行时 BLE 权限 | 权限申请属于 §3.8 留白，动之前先说 |
| C5 | 手机推了但桌面没数据 | 没等 `EVENT_ACK` 就认为成功 | 桌面为唯一真源，收到 ACK 才算成功 |
| C6 | 两边结论不一致 | 各自实现冲突判定 | 只许调 `detectConflicts()` |

### D. 材料与提交

| # | 症状 | 原因 | 怎么躲 |
| --- | --- | --- | --- |
| D1 | 交材料时没有码道痕迹 | 攒到最后补，补不出来 | **每天收工前 15 分钟**截图归档，死规矩 |
| D2 | 未登记开源组件 | 随手引了库 | 引依赖前先登记 `docs/作品说明.md` |
| D3 | 密钥进了 Git | 写在普通配置文件 | 只放 `*.local.*`，确认在 `.gitignore` 里 |

---

## 8. 一句话总结

> **一个 `ScheduleEvent` 走天下，适配器只产草稿，冲突只由纯函数算，桌面才是唯一真源。**
> 四个字收尾：**先读契约，再动手**。
