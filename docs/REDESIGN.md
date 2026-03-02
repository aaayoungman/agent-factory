# Agent Factory Dashboard 深度重设计方案

> 版本: v1.0 | 日期: 2026-02-20 | 作者: Master Controller

---

## 目录

1. [现状分析](#1-现状分析)
2. [架构总览](#2-架构总览)
3. [Phase 1: 响应式 UI 改造](#3-phase-1-响应式-ui-改造)
4. [Phase 2: Agent 生命周期管理](#4-phase-2-agent-生命周期管理)
5. [Phase 3: Agent Workspace 可视化](#5-phase-3-agent-workspace-可视化)
6. [Phase 4: Agent 通信/协作可视化](#6-phase-4-agent-通信协作可视化)
7. [Phase 5: 项目管理增强](#7-phase-5-项目管理增强)
8. [数据流架构](#8-数据流架构)
9. [新增 API 路由](#9-新增-api-路由)
10. [技术选型补充](#10-技术选型补充)
11. [优先级与排期](#11-优先级与排期)
12. [文件结构规划](#12-文件结构规划)

---

## 1. 现状分析

### 当前技术栈
- **框架**: Next.js 14 (App Router) + TypeScript
- **样式**: Tailwind CSS 3.4
- **状态**: Zustand 4.5
- **图表**: Recharts 2.12
- **图标**: Lucide React
- **Gateway**: OpenClaw 内置 Gateway，端口 19100，通过 `openclaw gateway call` CLI 调用

### 当前能力
| 功能 | 状态 |
|------|------|
| Agent 列表展示 | ✅ 只读 |
| Agent 模型分配 | ✅ 可操作 |
| 项目列表/详情 | ✅ 只读 |
| Token 用量图表 | ✅ |
| 日志查看 | ✅ 只读 |
| 健康检查 | ✅ |
| 创建/编辑/删除 Agent | ❌ |
| 启动/停止 Agent | ❌ |
| Workspace 文件浏览 | ❌ |
| Agent 间通信可视化 | ❌ |
| 创建项目 | ❌ |
| 响应式布局 | ❌ 固定 `ml-64` |

### 当前 Gateway API（通过 `gwCall` 调用）
- `agents.list` → Agent 列表
- `sessions.list` → Session 列表
- `usage.query` → 用量统计
- `health` / `status` → 健康状态
- `models.list` → 模型列表

### 当前 agents/ 目录结构
```
agents/
├── backend/   (AGENTS.md, TOOLS.md, agent.json, skills/)
├── designer/
├── frontend/
├── pm/
├── product/
├── researcher/
└── tester/
```
每个 agent.json 仅含 `{ "model": "anthropic/sonnet" }`。

---

## 2. 架构总览

```
┌─────────────────────────────────────────────────┐
│                 Next.js UI (port 3100)           │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Pages    │ │Components│ │ Zustand Store     │ │
│  │ (App     │ │ (响应式) │ │ (agents, projects,│ │
│  │  Router) │ │          │ │  sessions, ws)    │ │
│  └────┬─────┘ └──────────┘ └────────┬──────────┘ │
│       │                              │            │
│  ┌────▼──────────────────────────────▼──────────┐ │
│  │         Next.js API Routes (/api/*)          │ │
│  │  agents/ sessions/ projects/ workspace/ ...  │ │
│  └────┬─────────────────────────────────────────┘ │
└───────┼───────────────────────────────────────────┘
        │ (gwCall CLI + fs 操作)
┌───────▼───────────────────────────────────────────┐
│       OpenClaw Gateway (port 19100)                │
│   agents.list | sessions.* | usage.* | health      │
│   + agents/{id}/ 文件系统                           │
└────────────────────────────────────────────────────┘
```

**关键设计决策**：
1. Gateway 操作通过 `gwCall` (CLI 调用)，不直接 WebSocket
2. 文件系统操作（workspace 浏览、AGENTS.md 编辑）通过 Node.js `fs` 在 API Route 中完成
3. 实时性通过前端轮询（已有机制）+ 可选 SSE 增强

---

## 3. Phase 1: 响应式 UI 改造

**优先级: P0 | 工期: 2-3 天**

### 3.1 Layout 改造

**当前问题**: `layout.tsx` 中 `<main className="ml-64">` 硬编码，Sidebar 固定 `w-64`。

**方案**: 

```tsx
// layout.tsx — 新版
export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body>
        <ClientOnly>
          <DataProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />  {/* 响应式侧边栏 */}
              <main className="flex-1 overflow-y-auto p-4 md:p-6">
                {children}
              </main>
            </div>
          </DataProvider>
        </ClientOnly>
      </body>
    </html>
  )
}
```

### 3.2 Sidebar 响应式

| 断点 | 行为 |
|------|------|
| `< md` (移动端) | 隐藏侧边栏，顶部 hamburger 按钮，点击弹出 overlay 侧边栏 |
| `md ~ lg` (平板) | 折叠侧边栏（仅图标，w-16），hover 展开 |
| `>= lg` (桌面) | 完整侧边栏 w-64 |

**Store 新增**:
```ts
// store.ts 新增
sidebarOpen: boolean
setSidebarOpen: (open: boolean) => void
```

**Sidebar 组件改造**:
```tsx
export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useAppStore()
  
  return (
    <>
      {/* Mobile overlay */}
      <div className={cn(
        "fixed inset-0 z-50 bg-black/50 md:hidden transition-opacity",
        sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )} onClick={() => setSidebarOpen(false)} />
      
      <aside className={cn(
        "fixed md:relative z-50 h-screen bg-card border-r border-border",
        "flex flex-col transition-all duration-200",
        // Mobile: slide in/out
        "max-md:w-64", sidebarOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
        // Tablet: collapsed
        "md:w-16 lg:w-64",
      )}>
        {/* Nav items 在 md 断点只显示图标 */}
      </aside>
      
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-card border-b flex items-center px-4">
        <button onClick={() => setSidebarOpen(true)}>
          <Menu className="w-5 h-5" />
        </button>
        <span className="ml-3 font-bold">Agent Factory</span>
      </div>
    </>
  )
}
```

### 3.3 页面网格响应式

所有页面的 grid 改造规则：

```
grid-cols-1                     → 移动端单列
md:grid-cols-2                  → 平板双列
lg:grid-cols-3 / lg:grid-cols-4 → 桌面多列
```

**Dashboard 统计卡片**: `grid-cols-2 md:grid-cols-4`（移动端 2x2）
**Agent 列表**: `grid-cols-1 md:grid-cols-2`（已有，保持）
**项目详情**: 移动端堆叠，`lg:grid-cols-3` 改为列表上下排列

### 3.4 表格响应式

Agent 模型分配表格在移动端改为卡片列表：

```tsx
{/* 桌面表格 */}
<table className="hidden md:table w-full">...</table>

{/* 移动端卡片 */}
<div className="md:hidden space-y-3">
  {agents.map(a => (
    <div className="border rounded-lg p-3">
      <div className="font-medium">{a.name}</div>
      <select ...>{/* 模型选择 */}</select>
    </div>
  ))}
</div>
```

### 3.5 图表响应式

Recharts `ResponsiveContainer` 已支持自适应，确保外层容器有正确高度：
```tsx
<div className="h-48 md:h-64 lg:h-72">
  <ResponsiveContainer width="100%" height="100%">
    ...
  </ResponsiveContainer>
</div>
```

---

## 4. Phase 2: Agent 生命周期管理

**优先级: P0 | 工期: 4-5 天**

### 4.1 创建 Agent

**UI**: `/agents` 页顶部增加 "＋ 创建 Agent" 按钮 → 弹出 Modal/抽屉

**表单字段**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ID | text | ✅ | 英文小写+连字符，如 `data-analyst` |
| 名称 | text | ✅ | 显示名，如 "数据分析师" |
| 角色 | select | ✅ | 预设角色 + 自定义 |
| 描述 | textarea | ✅ | 一句话描述 |
| 模型 | select | | 从 models.list 获取，默认继承全局 |
| System Prompt | markdown editor | | AGENTS.md 内容 |
| 模板 | select | | 从现有 agent 克隆（可选） |

**后端 API**: `POST /api/agents`

```ts
// api/agents/route.ts — 新增 POST
export async function POST(req: Request) {
  const body = await req.json()
  const { id, name, role, description, model, systemPrompt } = body
  
  const agentDir = resolve(PROJECT_ROOT, 'agents', id)
  
  // 1. 创建目录
  mkdirSync(agentDir, { recursive: true })
  mkdirSync(resolve(agentDir, 'skills'), { recursive: true })
  
  // 2. 写 agent.json
  writeFileSync(resolve(agentDir, 'agent.json'), JSON.stringify({
    model: model || undefined
  }, null, 2))
  
  // 3. 写 AGENTS.md
  const agentsMd = systemPrompt || `# AGENTS.md — ${name}\n\n你是 ${id}。\n\n## 职责\n${description}\n`
  writeFileSync(resolve(agentDir, 'AGENTS.md'), agentsMd)
  
  // 4. 写 TOOLS.md（空模板）
  writeFileSync(resolve(agentDir, 'TOOLS.md'), `# TOOLS.md\n\n## Notes\n`)
  
  // 5. 注册到 Gateway（重启或调用 agents.register）
  try {
    gwCall('agents.register', { id, name, description })
  } catch {
    // Gateway 可能不支持热注册，需要重启
  }
  
  return NextResponse.json({ success: true, id })
}
```

**数据流**:
```
用户填表 → POST /api/agents → 写文件系统 agents/{id}/ → gwCall 注册 → 返回 → 刷新列表
```

### 4.2 编辑 Agent

**UI**: Agent 卡片增加 "编辑" 图标按钮 → 进入 `/agents/[id]/edit` 页面或 Modal

**编辑内容**:
- **AGENTS.md**: Monaco Editor（或 textarea + Markdown 预览）
  - 推荐新增依赖: `@monaco-editor/react`（重量级）或用 `textarea` + 实时 Markdown 预览（轻量）
  - **建议**: Phase 2 用 textarea + 预览，Phase 3 升级 Monaco
- **agent.json**: 模型选择（已有）
- **TOOLS.md**: textarea 编辑
- **名称/描述**: 存入新增的 `meta.json` 或解析 AGENTS.md 标题

**后端 API**: `PUT /api/agents/[id]`

```ts
// api/agents/[id]/route.ts
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { agentsMd, toolsMd, model, name, description } = await req.json()
  const agentDir = resolve(PROJECT_ROOT, 'agents', params.id)
  
  if (agentsMd !== undefined) {
    writeFileSync(resolve(agentDir, 'AGENTS.md'), agentsMd)
  }
  if (toolsMd !== undefined) {
    writeFileSync(resolve(agentDir, 'TOOLS.md'), toolsMd)
  }
  if (model !== undefined) {
    const config = JSON.parse(readFileSync(resolve(agentDir, 'agent.json'), 'utf-8'))
    config.model = model
    writeFileSync(resolve(agentDir, 'agent.json'), JSON.stringify(config, null, 2))
  }
  
  return NextResponse.json({ success: true })
}
```

### 4.3 启动/停止 Agent

**UI**: Agent 卡片增加开关或按钮

**实现方案**:
Gateway 通过 `sessions.spawn` / session 管理来控制 Agent。当前 Agent 的 "运行" 状态本质是有活跃 Session。

```ts
// 启动: 创建一个 idle session
gwCall('sessions.spawn', { agentId: id })

// 停止: 终止所有 session
const sessions = gwCall('sessions.list', { agentId: id })
for (const s of sessions) {
  gwCall('sessions.kill', { sessionId: s.id })
}
```

**注意**: OpenClaw Agent 是被动的（由消息触发），没有 "daemon" 概念。启动/停止更像是 "启用/禁用" — 可以通过在 agent.json 中增加 `"enabled": false` 字段来实现。

### 4.4 删除 Agent

**UI**: 确认弹窗（二次确认 + 输入 Agent ID）

```ts
// DELETE /api/agents/[id]
import { rmSync } from 'fs'

export async function DELETE(req, { params }) {
  const agentDir = resolve(PROJECT_ROOT, 'agents', params.id)
  if (!existsSync(agentDir)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  
  // 先停止所有 session
  try { gwCall('sessions.killByAgent', { agentId: params.id }) } catch {}
  
  // 删除目录
  rmSync(agentDir, { recursive: true, force: true })
  
  return NextResponse.json({ success: true })
}
```

### 4.5 克隆 Agent

```ts
// POST /api/agents/[id]/clone
import { cpSync } from 'fs'

export async function POST(req, { params }) {
  const { newId } = await req.json()
  const src = resolve(PROJECT_ROOT, 'agents', params.id)
  const dst = resolve(PROJECT_ROOT, 'agents', newId)
  
  cpSync(src, dst, { recursive: true })
  
  // 修改克隆后的 AGENTS.md 标题
  const md = readFileSync(resolve(dst, 'AGENTS.md'), 'utf-8')
  writeFileSync(resolve(dst, 'AGENTS.md'), md.replace(params.id, newId))
  
  return NextResponse.json({ success: true, id: newId })
}
```

### 4.6 Agent 详情页

新增路由: `/agents/[id]`

**布局**:
```
┌─────────────────────────────────────────┐
│ ← 返回  Agent名称  状态Badge  操作按钮组 │
├──────────┬──────────────────────────────┤
│ 侧边信息 │ Tab 内容区                   │
│ - 模型   │ [概览|配置|Workspace|日志]    │
│ - 状态   │                              │
│ - Token  │                              │
│ - 创建时间│                              │
└──────────┴──────────────────────────────┘
```

移动端: 侧边信息折叠为顶部卡片，Tab 内容区全宽。

---

## 5. Phase 3: Agent Workspace 可视化

**优先级: P1 | 工期: 3-4 天**

### 5.1 文件树

**UI**: Agent 详情页 "Workspace" Tab 中展示

```
workspace-main/          ← 或 agents/{id}/ 的工作目录
├── 📁 memory/
│   ├── context.md
│   └── decisions.md
├── 📁 output/
│   └── report.md
├── 📄 AGENTS.md
├── 📄 TOOLS.md
└── 📄 agent.json
```

**后端 API**: `GET /api/workspace/tree?path=agents/backend`

```ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const basePath = searchParams.get('path') || ''
  const absPath = resolve(PROJECT_ROOT, basePath)
  
  // 安全检查: 不能超出 PROJECT_ROOT
  if (!absPath.startsWith(PROJECT_ROOT)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  const tree = buildTree(absPath, 3) // maxDepth=3
  return NextResponse.json({ tree })
}

function buildTree(dir: string, maxDepth: number, depth = 0) {
  if (depth >= maxDepth) return []
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
    .sort((a, b) => (b.isDirectory() ? 1 : 0) - (a.isDirectory() ? 1 : 0) || a.name.localeCompare(b.name))
  
  return entries.map(e => ({
    name: e.name,
    type: e.isDirectory() ? 'dir' : 'file',
    children: e.isDirectory() ? buildTree(resolve(dir, e.name), maxDepth, depth + 1) : undefined,
  }))
}
```

### 5.2 文件内容预览

**UI**: 点击文件 → 右侧面板显示内容

| 文件类型 | 渲染方式 |
|----------|----------|
| `.md` | Markdown 渲染（`react-markdown` + `remark-gfm`） |
| `.ts/.tsx/.js/.json` | 代码高亮（`highlight.js` 或 `shiki`） |
| `.png/.jpg/.svg` | 图片预览 |
| 其他 | 纯文本 |

**后端**: `GET /api/workspace/file?path=agents/backend/AGENTS.md`

```ts
export async function GET(req: Request) {
  const filePath = searchParams.get('path')
  const absPath = resolve(PROJECT_ROOT, filePath)
  // 安全检查 + 大小限制 (1MB)
  const stat = statSync(absPath)
  if (stat.size > 1024 * 1024) return NextResponse.json({ error: 'File too large' }, { status: 413 })
  
  const content = readFileSync(absPath, 'utf-8')
  const ext = extname(absPath).slice(1)
  return NextResponse.json({ content, ext, size: stat.size })
}
```

**新增依赖**:
```json
{
  "react-markdown": "^9.0.0",
  "remark-gfm": "^4.0.0",
  "highlight.js": "^11.9.0"
}
```

### 5.3 Memory 文件查看

Agent 的 memory/ 目录（如果 Gateway 使用了 memory 功能）：
- 特殊 UI 处理：时间线视图，按修改时间排列
- Markdown 渲染 memory 内容
- 搜索功能

### 5.4 文件编辑（可选增强）

在 Phase 3 实现只读预览。Phase 4+ 可以加 textarea 编辑 + 保存：

```ts
// PUT /api/workspace/file
export async function PUT(req: Request) {
  const { path, content } = await req.json()
  writeFileSync(resolve(PROJECT_ROOT, path), content)
  return NextResponse.json({ success: true })
}
```

---

## 6. Phase 4: Agent 通信/协作可视化

**优先级: P1 | 工期: 5-7 天**

### 6.1 实时消息流

**数据源**: `gwCall('sessions.list')` + `gwCall('usage.query')` 可获取 Session 级别数据。Agent 间通信通过 `sessions_spawn` / `sessions_announce` 等机制。

**UI**: `/communications` 新页面

```
┌────────────────────────────────────────────────┐
│ 🔄 实时消息流                                    │
├────────────────────────────────────────────────┤
│ [PM] ──→ [Designer]: "请设计登录页面原型"        │
│ [Designer] ──→ [Frontend]: "原型已完成，见附件"   │
│ [Backend] ──→ [Tester]: "API 已就绪，请测试"     │
│ ...                                             │
└────────────────────────────────────────────────┘
```

**实现**: 
- 轮询 `sessions.list` 获取最新 session
- 解析 session 的 `parentSession` / `spawnedBy` 关系
- 渲染为消息流

```ts
// API Route
export async function GET() {
  const sessions = gwCall('sessions.list', { limit: 50 }) as { sessions: any[] }
  
  const messages = sessions.sessions
    .filter(s => s.spawnedBy || s.parentSession)
    .map(s => ({
      from: s.spawnedBy || 'user',
      to: s.agentId,
      sessionId: s.id,
      timestamp: s.createdAt,
      status: s.status,
    }))
  
  return NextResponse.json({ messages })
}
```

### 6.2 任务 DAG 可视化

**依赖**: 项目的 Task 已有 `dependencies` 字段，可直接渲染 DAG。

**方案**: 用 CSS Grid 或 SVG 手绘简单 DAG（避免重依赖如 D3/React Flow）。

```
[需求分析] ──→ [UI设计] ──→ [前端开发] ──┐
     │                                    ├──→ [集成测试]
     └──→ [API设计] ──→ [后端开发] ──────┘
```

**轻量实现**:
```tsx
function TaskDAG({ tasks }: { tasks: Task[] }) {
  // 按 phase 分层
  const layers = groupBy(tasks, t => t.phase)
  
  return (
    <div className="flex gap-8 overflow-x-auto p-4">
      {Object.entries(layers).map(([phase, phaseTasks]) => (
        <div key={phase} className="flex flex-col gap-3 min-w-[160px]">
          <div className="text-xs text-muted-foreground font-medium">Phase {phase}</div>
          {phaseTasks.map(t => (
            <div key={t.id} className={cn(
              "rounded-lg border p-3 text-sm",
              t.status === 'completed' && "border-green-500/50 bg-green-500/10",
              t.status === 'running' && "border-amber-500/50 bg-amber-500/10 animate-pulse",
              t.status === 'failed' && "border-red-500/50 bg-red-500/10",
            )}>
              {t.name}
              <div className="text-xs text-muted-foreground mt-1">{t.assignedAgent}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

### 6.3 协作时间线

**UI**: 垂直时间线，展示 Agent 活动序列

```tsx
function Timeline({ events }) {
  return (
    <div className="relative pl-8 space-y-4">
      <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" />
      {events.map(e => (
        <div key={e.id} className="relative">
          <div className="absolute left-[-22px] w-4 h-4 rounded-full bg-primary border-2 border-background" />
          <div className="text-xs text-muted-foreground">{formatTime(e.timestamp)}</div>
          <div className="text-sm"><strong>{e.agent}</strong> {e.action}</div>
        </div>
      ))}
    </div>
  )
}
```

### 6.4 Session 历史

**UI**: `/agents/[id]` 详情页的 "Sessions" Tab

```ts
// 获取特定 Agent 的 sessions
const sessions = gwCall('sessions.list', { agentId: id, limit: 20 })
```

展示每个 Session 的:
- ID、创建时间、状态
- Token 用量
- 消息数
- 展开查看对话记录（如果 Gateway 支持 `sessions.messages`）

---

## 7. Phase 5: 项目管理增强

**优先级: P2 | 工期: 4-5 天**

### 7.1 创建项目

**UI**: `/projects` 页顶部 "＋ 新建项目" → Modal

**表单**:
| 字段 | 类型 | 说明 |
|------|------|------|
| 项目名称 | text | |
| 需求描述 | textarea (Markdown) | 详细需求 |
| Agent 团队 | multi-select | 选择参与的 Agent |
| 优先级 | select | 高/中/低 |

**后端**:
```ts
// POST /api/projects
export async function POST(req: Request) {
  const { name, description, agents } = await req.json()
  
  // 1. 在 projects/ 目录创建项目文件
  const projectId = `proj-${Date.now()}`
  const projectDir = resolve(PROJECT_ROOT, 'projects', projectId)
  mkdirSync(projectDir, { recursive: true })
  
  writeFileSync(resolve(projectDir, 'project.json'), JSON.stringify({
    id: projectId, name, description, agents,
    status: 'planning', createdAt: new Date().toISOString(),
  }, null, 2))
  
  writeFileSync(resolve(projectDir, 'README.md'), `# ${name}\n\n${description}\n`)
  
  // 2. 触发 Orchestrator（通过 spawn session）
  try {
    gwCall('sessions.spawn', {
      agentId: 'pm',  // PM agent 作为入口
      message: `新项目: ${name}\n\n需求:\n${description}`,
    })
  } catch (e) {
    // 记录但不阻塞
    console.error('Failed to trigger orchestrator:', e)
  }
  
  return NextResponse.json({ success: true, id: projectId })
}
```

### 7.2 项目实时监控

增强现有项目详情页:
- **实时进度条**: 基于 Task 完成比例
- **Agent 活动指示器**: 哪些 Agent 当前在处理此项目的任务
- **Token 消耗曲线**: 项目级别的 token 使用趋势

### 7.3 项目产出物浏览

复用 Phase 3 的文件树组件，指向项目的 output 目录。

---

## 8. 数据流架构

### 8.1 State 管理（Zustand Store 扩展）

```ts
// store.ts 新增字段
interface AppState {
  // ... existing ...
  
  // Phase 1: 响应式
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  
  // Phase 2: Agent CRUD
  createAgent: (data: CreateAgentInput) => Promise<void>
  updateAgent: (id: string, data: UpdateAgentInput) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
  cloneAgent: (id: string, newId: string) => Promise<void>
  
  // Phase 3: Workspace
  fileTree: FileNode[] | null
  selectedFile: { path: string; content: string; ext: string } | null
  fetchFileTree: (basePath: string) => Promise<void>
  fetchFileContent: (path: string) => Promise<void>
  
  // Phase 4: Communications
  communications: CommMessage[]
  fetchCommunications: () => Promise<void>
  
  // Phase 5: Project management
  createProject: (data: CreateProjectInput) => Promise<void>
}
```

### 8.2 轮询策略

| 数据 | 间隔 | 说明 |
|------|------|------|
| agents | 10s | 已有 |
| usage | 30s | 已有 |
| logs | 5s | 已有 |
| health | 15s | 已有 |
| communications | 5s | 新增 |
| file tree | 手动刷新 | 不自动轮询 |

---

## 9. 新增 API 路由

| 路由 | 方法 | 功能 | Phase |
|------|------|------|-------|
| `/api/agents` | POST | 创建 Agent | P2 |
| `/api/agents/[id]` | GET | Agent 详情 | P2 |
| `/api/agents/[id]` | PUT | 更新 Agent | P2 |
| `/api/agents/[id]` | DELETE | 删除 Agent | P2 |
| `/api/agents/[id]/clone` | POST | 克隆 Agent | P2 |
| `/api/agents/[id]/toggle` | POST | 启用/禁用 | P2 |
| `/api/workspace/tree` | GET | 文件树 | P3 |
| `/api/workspace/file` | GET | 读取文件 | P3 |
| `/api/workspace/file` | PUT | 写入文件 | P3+ |
| `/api/communications` | GET | Agent 间消息 | P4 |
| `/api/projects` | POST | 创建项目 | P5 |
| `/api/projects/[id]` | GET | 项目详情 | P5 |

---

## 10. 技术选型补充

### 新增依赖（按需引入）

| 包 | 用途 | Phase | 大小 |
|----|------|-------|------|
| `react-markdown` | Markdown 渲染 | P3 | ~50KB |
| `remark-gfm` | GFM 扩展 | P3 | ~10KB |
| `highlight.js` | 代码高亮 | P3 | ~30KB (按需) |
| `react-resizable-panels` | 可拖拽面板 | P3 | ~15KB |

### 不推荐引入
- **Monaco Editor**: 太重 (~2MB)，用 textarea + 高亮预览替代
- **React Flow / D3**: DAG 可用 CSS Grid + SVG 手绘
- **Socket.io**: 保持轮询方案，Gateway 不暴露 WS 给前端

---

## 11. 优先级与排期

```
Week 1:  [P0] Phase 1 — 响应式 UI     (2-3 天)
         [P0] Phase 2 — Agent CRUD     (开始)
Week 2:  [P0] Phase 2 — Agent CRUD     (完成, 4-5 天)
         [P1] Phase 3 — Workspace      (开始)
Week 3:  [P1] Phase 3 — Workspace      (完成, 3-4 天)
         [P1] Phase 4 — 通信可视化      (开始)
Week 4:  [P1] Phase 4 — 通信可视化      (完成, 5-7 天)
Week 5:  [P2] Phase 5 — 项目管理增强    (4-5 天)
```

**总计**: ~4-5 周，可并行开发前后端。

---

## 12. 文件结构规划

```
ui/src/
├── app/
│   ├── layout.tsx                    ← 改造: 响应式
│   ├── page.tsx                      ← 改造: 响应式网格
│   ├── agents/
│   │   ├── page.tsx                  ← 改造: + 创建按钮
│   │   └── [id]/
│   │       ├── page.tsx              ← 新增: Agent 详情页
│   │       └── edit/page.tsx         ← 新增: Agent 编辑页
│   ├── projects/
│   │   ├── page.tsx                  ← 改造: + 创建按钮
│   │   └── [id]/page.tsx            ← 新增: 项目详情
│   ├── communications/
│   │   └── page.tsx                  ← 新增: 通信可视化
│   ├── api/
│   │   ├── agents/
│   │   │   ├── route.ts             ← 改造: + POST
│   │   │   └── [id]/
│   │   │       ├── route.ts         ← 新增: GET/PUT/DELETE
│   │   │       └── clone/route.ts   ← 新增
│   │   ├── workspace/
│   │   │   ├── tree/route.ts        ← 新增
│   │   │   └── file/route.ts        ← 新增
│   │   ├── communications/
│   │   │   └── route.ts             ← 新增
│   │   └── projects/
│   │       └── route.ts             ← 改造: + POST
│   └── ...
├── components/
│   ├── sidebar.tsx                   ← 改造: 响应式
│   ├── mobile-header.tsx             ← 新增
│   ├── agent-card.tsx                ← 改造: + 操作按钮
│   ├── agent-create-modal.tsx        ← 新增
│   ├── agent-edit-form.tsx           ← 新增
│   ├── file-tree.tsx                 ← 新增
│   ├── file-preview.tsx              ← 新增
│   ├── markdown-renderer.tsx         ← 新增
│   ├── code-highlight.tsx            ← 新增
│   ├── task-dag.tsx                  ← 新增
│   ├── timeline.tsx                  ← 新增
│   ├── message-stream.tsx            ← 新增
│   ├── confirm-dialog.tsx            ← 新增
│   └── ui/
│       ├── card.tsx
│       ├── badge.tsx
│       ├── modal.tsx                 ← 新增
│       ├── tabs.tsx                  ← 新增
│       ├── dropdown.tsx              ← 新增
│       └── toggle.tsx               ← 新增
├── lib/
│   ├── store.ts                     ← 扩展
│   ├── types.ts                     ← 扩展
│   ├── gateway-client.ts            ← 保持
│   └── utils.ts                     ← 保持
└── styles/
    └── globals.css                  ← 微调
```

---

## 总结

本方案以**渐进式增强**为原则：
1. **Phase 1** 零新依赖，纯 Tailwind 响应式改造
2. **Phase 2** 核心 CRUD，基于文件系统 + Gateway CLI，无需 Gateway 协议扩展
3. **Phase 3-5** 逐步增加可视化能力，每个 Phase 独立可交付

所有操作都通过 Next.js API Routes 中转，前端不直接操作文件系统或 Gateway，保持安全边界。
