# Agent Factory Dashboard v2 — 深度重设计文档

> 版本：v2.0 | 2026-02-20
> 基于现有 Next.js + Tailwind + Zustand 架构，面向 Agent 全生命周期管理

---

## 目录

1. [现状分析](#1-现状分析)
2. [设计原则](#2-设计原则)
3. [一、响应式自适应](#3-响应式自适应)
4. [二、Agent 生命周期管理](#4-agent-生命周期管理)
5. [三、Agent Workspace 可视化](#5-agent-workspace-可视化)
6. [四、Agent 间通信可视化](#6-agent-间通信可视化)
7. [五、项目管理增强](#7-项目管理增强)
8. [API Routes 总览](#8-api-routes-总览)
9. [数据流架构](#9-数据流架构)
10. [OpenClaw Gateway 能力边界](#10-openclaw-gateway-能力边界)
11. [组件树总览](#11-组件树总览)
12. [优先级排序与实施计划](#12-优先级排序与实施计划)

---

## 1. 现状分析

### 当前架构

| 层级 | 技术 | 状态 |
|------|------|------|
| Framework | Next.js (App Router) | ✅ |
| Styling | Tailwind CSS + 自定义 design tokens | ✅ |
| State | Zustand (单 store) | ✅ |
| API | Next.js Route Handlers → `gwCall()` (openclaw CLI) | ✅ |
| I18n | 自建 `useTranslation` + JSON locale | ✅ |

### 现有页面

| 路由 | 功能 | 备注 |
|------|------|------|
| `/` | Dashboard 总览 (stats + charts + agent/project 摘要) | 信息密度高，布局合理 |
| `/agents` | Agent 列表 + 模型分配 | 只读，无 CRUD |
| `/projects` | 项目列表 + 详情（左列表右详情） | 只读，无创建/触发 |
| `/skills` | Skills 列表 | 只读 |
| `/logs` | 日志流 | 只读 |
| `/settings` | 设置 | 基础配置 |

### 核心问题

1. **固定 `ml-64` 布局** — 移动端完全不可用
2. **只读仪表盘** — 无法创建/编辑/控制 Agent
3. **无 Workspace 可视化** — 看不到 Agent 的文件、memory、产出物
4. **无通信可视化** — 看不到 Agent 间消息流和协作关系
5. **项目管理弱** — 无法创建项目、触发 Orchestrator、实时监控

---

## 2. 设计原则

1. **渐进增强** — 移动端优先，桌面端利用多余空间
2. **操作驱动** — 从只读变为可操作（CRUD + 控制）
3. **实时感知** — WebSocket/SSE 推送状态变化
4. **最小 API 面** — 尽量用 Gateway 已有能力，自建部分薄而专注

---

## 3. 响应式自适应

### 3.1 断点设计

```
Mobile:  < 768px   — 单列，侧边栏收为底部导航或汉堡菜单
Tablet:  768-1024px — 侧边栏收窄(icon-only, w-16)，内容区自适应
Desktop: > 1024px   — 完整侧边栏 w-64 + 内容区
```

### 3.2 Layout 改造

**当前：**
```tsx
<Sidebar />  {/* fixed w-64 */}
<main className="ml-64 min-h-screen p-6">{children}</main>
```

**V2：**
```tsx
// layout.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body>
        <ClientOnly>
          <DataProvider>
            <ResponsiveLayout>{children}</ResponsiveLayout>
          </DataProvider>
        </ClientOnly>
      </body>
    </html>
  )
}
```

#### 新组件：`ResponsiveLayout`

```tsx
// components/responsive-layout.tsx
'use client'
import { useState, useEffect } from 'react'
import { Sidebar } from './sidebar'
import { MobileNav } from './mobile-nav'
import { useMediaQuery } from '@/hooks/use-media-query'

export function ResponsiveLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (isMobile) {
    return (
      <div className="min-h-screen pb-16">
        {/* Overlay sidebar (slide-in) */}
        {sidebarOpen && (
          <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
            <Sidebar variant="overlay" onClose={() => setSidebarOpen(false)} />
          </>
        )}
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-card border-b border-border">
          <button onClick={() => setSidebarOpen(true)}>☰</button>
          <span className="font-bold text-sm">Agent Factory</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
        </header>
        <main className="p-4">{children}</main>
        <MobileNav />
      </div>
    )
  }

  const collapsed = isTablet
  return (
    <div className="flex min-h-screen">
      <Sidebar variant={collapsed ? 'collapsed' : 'full'} />
      <main className={`flex-1 min-h-screen p-6 ${collapsed ? 'ml-16' : 'ml-64'}`}>
        {children}
      </main>
    </div>
  )
}
```

#### 新组件：`MobileNav`

```tsx
// components/mobile-nav.tsx — 底部导航栏 (移动端)
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, FolderKanban, ScrollText, Settings } from 'lucide-react'

const tabs = [
  { href: '/', icon: LayoutDashboard, label: 'Home' },
  { href: '/agents', icon: Users, label: 'Agents' },
  { href: '/projects', icon: FolderKanban, label: 'Projects' },
  { href: '/logs', icon: ScrollText, label: 'Logs' },
  { href: '/settings', icon: Settings, label: 'More' },
]

export function MobileNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex justify-around py-2">
      {tabs.map(({ href, icon: Icon, label }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 text-[10px] ${active ? 'text-primary' : 'text-muted-foreground'}`}>
            <Icon className="w-5 h-5" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
```

### 3.3 Sidebar 改造

在现有 `Sidebar` 上增加 `variant` prop：

| variant | 表现 |
|---------|------|
| `full` | 当前样式 (w-64, 图标+文字) |
| `collapsed` | w-16, 只显示图标, tooltip 显示文字 |
| `overlay` | 全屏覆盖, 带关闭按钮 (移动端) |

### 3.4 Hook: `useMediaQuery`

```tsx
// hooks/use-media-query.ts
import { useState, useEffect } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}
```

### 3.5 Grid 响应式规则

所有页面 grid 统一使用：
```
grid-cols-1          → mobile
md:grid-cols-2       → tablet
lg:grid-cols-3/4     → desktop
```

当前 Dashboard 的 `lg:grid-cols-4` 已合理，只需确保所有卡片在小屏上堆叠。

---

## 4. Agent 生命周期管理

### 4.1 功能总览

| 操作 | 说明 | 触发方式 |
|------|------|---------|
| **创建** | 填表 → 生成 `agents/{id}/AGENTS.md` + `agent.json` | 创建表单 |
| **启动** | 在 Gateway 注册并激活 session | 按钮 |
| **停止** | 终止活跃 session | 按钮 |
| **编辑** | 修改 AGENTS.md / agent.json / 模型 | 内联编辑器 |
| **删除** | 停止 + 清理文件 (需确认) | 按钮 + 确认弹窗 |
| **克隆** | 复制 agent 目录 → 新 ID | 按钮 |

### 4.2 UI 布局

#### `/agents` 页面重构

```
┌──────────────────────────────────────────────────────────────┐
│ Agents                                           [+ Create] │
│ 3 online · 2 offline · 1 busy                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ 🤖 orch..   │  │ 📋 PM       │  │ 🔬 Research │  ...     │
│  │ ● online    │  │ ● online    │  │ ○ offline   │          │
│  │ opus-4.6    │  │ sonnet      │  │ sonnet      │          │
│  │ [▶][✏️][⋯] │  │ [▶][✏️][⋯] │  │ [▶][✏️][⋯] │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                              │
│  点击卡片 → 展开详情面板 (右侧 slide-in 或下方展开)            │
│                                                              │
│  ┌─ Agent Detail ──────────────────────────────────────────┐ │
│  │ Tabs: [Overview] [AGENTS.md] [Files] [Sessions] [Logs] │ │
│  │                                                          │ │
│  │ Overview:                                                │ │
│  │   Name: PM Agent          Role: pm                       │ │
│  │   Model: sonnet           Status: online                 │ │
│  │   Tokens: 45.2K           Tasks: 12                      │ │
│  │   Description: ...                                       │ │
│  │   System Prompt: (editable)                              │ │
│  │                                                          │ │
│  │ AGENTS.md:                                               │ │
│  │   (Monaco/CodeMirror 编辑器, 可保存)                      │ │
│  │                                                          │ │
│  │ Files: → Workspace 文件树 (见 §5)                         │ │
│  │ Sessions: → 活跃 session 列表                             │ │
│  │ Logs: → 该 Agent 的日志流                                 │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**移动端**：卡片单列，点击卡片进入 `/agents/[id]` 详情子页面。

#### 创建 Agent 表单（Modal / Drawer）

```
┌─ Create Agent ─────────────────────────────────┐
│                                                 │
│  ID *           [____________]  (kebab-case)    │
│  Name *         [____________]                  │
│  Role           [▼ orchestrator / pm / ...]     │
│                 [  custom: __________ ]         │
│  Description    [________________________]     │
│                 [________________________]     │
│  Model          [▼ default / opus / sonnet]     │
│                                                 │
│  System Prompt / AGENTS.md                      │
│  ┌────────────────────────────────────────────┐ │
│  │ # AGENTS.md — {Name}                       │ │
│  │                                             │ │
│  │ 你是{Role}，负责...                          │ │
│  │ (预填模板, 用户可编辑)                       │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  Template: [▼ Blank / PM / Frontend / ...]      │
│  (选模板自动填充 AGENTS.md)                      │
│                                                 │
│              [Cancel]  [Create Agent]            │
└─────────────────────────────────────────────────┘
```

### 4.3 组件结构

```
components/
├── agents/
│   ├── agent-grid.tsx          # Agent 卡片网格 (含搜索/过滤)
│   ├── agent-card-v2.tsx       # 增强卡片 (操作按钮)
│   ├── agent-detail.tsx        # 详情面板 (tabs)
│   ├── agent-create-dialog.tsx # 创建弹窗
│   ├── agent-editor.tsx        # AGENTS.md 编辑器
│   ├── agent-actions.tsx       # 启动/停止/克隆/删除操作
│   └── agent-status-badge.tsx  # 状态 badge
```

### 4.4 交互流程

**创建 Agent:**
```
用户点击 [+ Create] 
  → 弹出 CreateDialog
  → 选择模板 (可选) → 自动填充字段
  → 用户编辑 ID/Name/Role/Description/AGENTS.md
  → 点击 [Create Agent]
  → POST /api/agents/create
    → 服务端：mkdir agents/{id}/, 写入 AGENTS.md + agent.json
    → 如果 Gateway 运行中，调用 gwCall('agents.register', {...})
  → 刷新 Agent 列表
```

**启动/停止 Agent:**
```
用户点击 [▶ Start]
  → POST /api/agents/{id}/start
    → gwCall('sessions.spawn', { agentId: id })
  → Agent 状态变为 online

用户点击 [⏹ Stop]
  → POST /api/agents/{id}/stop
    → gwCall('sessions.kill', { agentId: id }) (终止所有该 agent 的 session)
  → Agent 状态变为 offline
```

**编辑 Agent:**
```
用户在详情面板切到 [AGENTS.md] tab
  → 加载 GET /api/agents/{id}/file?path=AGENTS.md
  → 用 CodeMirror 编辑
  → 点击 [Save] → PUT /api/agents/{id}/file { path: 'AGENTS.md', content: '...' }
  → 写入文件系统
```

**克隆 Agent:**
```
用户点击 [⋯] → Clone
  → 弹出对话框：输入新 ID
  → POST /api/agents/clone { sourceId, newId }
  → 服务端：cp -r agents/{sourceId}/ agents/{newId}/, 修改 agent.json 中的 id
  → 刷新列表
```

### 4.5 所需 API Routes

| Method | Route | 说明 | 数据源 |
|--------|-------|------|--------|
| GET | `/api/agents` | Agent 列表 (已有) | Gateway + 文件系统 |
| POST | `/api/agents/create` | 创建 Agent | 文件系统 |
| PUT | `/api/agents/[id]` | 更新 agent.json | 文件系统 |
| DELETE | `/api/agents/[id]` | 删除 Agent | 文件系统 + Gateway |
| POST | `/api/agents/[id]/start` | 启动 Agent | Gateway |
| POST | `/api/agents/[id]/stop` | 停止 Agent | Gateway |
| POST | `/api/agents/clone` | 克隆 Agent | 文件系统 |
| GET | `/api/agents/[id]/file` | 读取 Agent 文件 | 文件系统 |
| PUT | `/api/agents/[id]/file` | 写入 Agent 文件 | 文件系统 |

---

## 5. Agent Workspace 可视化

### 5.1 功能

- **文件树浏览**：展示 Agent workspace 目录结构
- **文件预览**：Markdown 渲染、代码高亮、JSON 格式化
- **Memory 查看**：`memory/*.md` 文件列表，内容预览
- **产出物查看**：项目目录下该 Agent 产出的文件

### 5.2 UI 布局

嵌入在 Agent Detail 的 `[Files]` tab 中，也可作为独立页面 `/agents/[id]/workspace`。

```
┌─ Workspace: PM Agent ──────────────────────────────────────┐
│                                                             │
│  ┌─ File Tree ──────┐  ┌─ Preview ───────────────────────┐ │
│  │ 📁 workspace-pm  │  │                                  │ │
│  │  ├── AGENTS.md ◀ │  │  # AGENTS.md — PM Agent         │ │
│  │  ├── TOOLS.md    │  │                                  │ │
│  │  ├── 📁 memory/  │  │  你是项目经理(PM)，负责...       │ │
│  │  │   ├── ctx.md  │  │                                  │ │
│  │  │   └── notes.md│  │  ## 核心职责                     │ │
│  │  ├── 📁 skills/  │  │  1. 接收项目需求...              │ │
│  │  │   └── 📁 ...  │  │                                  │ │
│  │  └── agent.json  │  │  (Markdown rendered)             │ │
│  └──────────────────┘  └──────────────────────────────────┘ │
│                                                             │
│  ── Memory Files ─────────────────────────────────────────  │
│  │ 📝 ctx.md         │ Updated 2m ago  │ 1.2KB │ [View]  │ │
│  │ 📝 session-log.md │ Updated 1h ago  │ 4.5KB │ [View]  │ │
└─────────────────────────────────────────────────────────────┘
```

**移动端**：文件树和预览上下排列，文件树默认折叠为面包屑导航。

### 5.3 组件结构

```
components/
├── workspace/
│   ├── file-tree.tsx           # 递归文件树组件
│   ├── file-preview.tsx        # 文件内容预览 (MD/code/JSON/image)
│   ├── workspace-panel.tsx     # 左右分栏容器
│   ├── memory-list.tsx         # memory/ 文件专门列表
│   └── breadcrumb-nav.tsx      # 路径面包屑 (移动端)
```

### 5.4 文件预览策略

| 文件类型 | 渲染方式 | 库 |
|---------|---------|------|
| `.md` | Markdown → HTML | `react-markdown` + `remark-gfm` |
| `.ts/.tsx/.js/.json` | 语法高亮 | `highlight.js` 或 `shiki` (轻量) |
| `.json` | 格式化 + 折叠 | 自带 JSON.stringify + 折叠 UI |
| 图片 | `<img>` 预览 | 原生 |
| 其他 | 纯文本 | `<pre>` |

### 5.5 所需 API Routes

| Method | Route | 说明 |
|--------|-------|------|
| GET | `/api/agents/[id]/tree` | 返回 workspace 目录树 (递归, 可限深度) |
| GET | `/api/agents/[id]/file?path=...` | 读取文件内容 |
| PUT | `/api/agents/[id]/file` | 写入文件内容 |

**实现：** 纯文件系统操作，读取 Agent workspace 目录。

```ts
// /api/agents/[id]/tree/route.ts
import { readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

function buildTree(dir: string, base: string, depth = 0, maxDepth = 4) {
  if (depth > maxDepth) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
    .map(e => {
      const fullPath = join(dir, e.name)
      const relPath = relative(base, fullPath)
      if (e.isDirectory()) {
        return { name: e.name, path: relPath, type: 'dir', children: buildTree(fullPath, base, depth + 1, maxDepth) }
      }
      const stat = statSync(fullPath)
      return { name: e.name, path: relPath, type: 'file', size: stat.size, mtime: stat.mtime }
    })
}
```

---

## 6. Agent 间通信可视化

### 6.1 功能

| 功能 | 说明 |
|------|------|
| **消息流** | 实时展示 Agent 间的消息传递 |
| **任务 DAG** | 可视化任务依赖关系图 |
| **协作时间线** | 按时间轴展示各 Agent 的活动 |
| **Session 历史** | 查看 session 详情和消息记录 |

### 6.2 UI 布局

新增页面 `/comms` 或作为 Dashboard 的子视图。

#### 消息流视图

```
┌─ Agent Communications ─────────────────────────────────────┐
│                                                             │
│  Tabs: [Message Flow] [Task DAG] [Timeline] [Sessions]     │
│                                                             │
│  ── Message Flow (Live) ──────────────────────────────────  │
│                                                             │
│  14:32:05  orchestrator → pm                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 启动项目：宠物社区App                                 │   │
│  │ 请进行任务分解，输出到 docs/task-breakdown.md         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  14:33:12  pm → orchestrator                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 任务分解完成。共 12 个任务，5 个阶段。                 │   │
│  │ 文件已写入 docs/task-breakdown.md                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  14:33:15  orchestrator → researcher                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 进行宠物社区市场调研...                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Filter: [All Agents ▼]  [All Types ▼]  [🔍 Search]       │
└─────────────────────────────────────────────────────────────┘
```

#### 任务 DAG 视图

```
┌─ Task DAG ──────────────────────────────────────────────────┐
│                                                              │
│  ┌──────────┐                                                │
│  │ 需求分析  │ ── PM ✅                                      │
│  └────┬─────┘                                                │
│       │                                                      │
│  ┌────▼─────┐                                                │
│  │ 市场调研  │ ── Researcher ✅                               │
│  └────┬─────┘                                                │
│       │                                                      │
│  ┌────▼─────┐                                                │
│  │ PRD 编写 │ ── Product 🔄 running                          │
│  └────┬─────┘                                                │
│       │                                                      │
│  ┌────▼─────┐                                                │
│  │ UI 设计  │ ── Designer ⏳ pending                          │
│  └────┬─────┘                                                │
│       ├────────────────┐                                     │
│  ┌────▼─────┐    ┌─────▼────┐                                │
│  │ 前端开发  │    │ 后端开发  │   (可并行)                    │
│  │ Frontend  │    │ Backend   │                               │
│  └────┬─────┘    └─────┬────┘                                │
│       └────────┬───────┘                                     │
│           ┌────▼─────┐                                       │
│           │  测试     │ ── Tester                             │
│           └──────────┘                                       │
│                                                              │
│  (使用 SVG / Canvas 绘制，节点可点击查看详情)                   │
└──────────────────────────────────────────────────────────────┘
```

#### 协作时间线

```
┌─ Timeline ──────────────────────────────────────────────────┐
│                                                              │
│  Agent        14:30    14:35    14:40    14:45    14:50      │
│  ─────────────┼────────┼────────┼────────┼────────┼───      │
│  orchestrator ████░░░░░███░░░░░░░░░░░░░░░████░░░░░          │
│  pm           ░░░░█████░░░░░░░░░░░░░░░░░░░░░░░░░░░          │
│  researcher   ░░░░░░░░░████████░░░░░░░░░░░░░░░░░░░          │
│  product      ░░░░░░░░░░░░░░░░░██████████░░░░░░░░░          │
│  designer     ░░░░░░░░░░░░░░░░░░░░░░░░░░░████████          │
│  frontend     ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░          │
│  backend      ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░          │
│                                                              │
│  █ = active session   ░ = idle                               │
└──────────────────────────────────────────────────────────────┘
```

#### Session 历史

```
┌─ Sessions ──────────────────────────────────────────────────┐
│                                                              │
│  ID          Agent        Started      Duration   Status     │
│  ────────────────────────────────────────────────────────    │
│  sess-a1b2   pm           14:30:05     5m 12s     done       │
│  sess-c3d4   researcher   14:35:20     8m 45s     done       │
│  sess-e5f6   product      14:44:10     —          active     │
│                                                              │
│  点击 → 展开 session 消息记录                                  │
│                                                              │
│  ┌─ Session sess-a1b2 ──────────────────────────────────┐   │
│  │ [system] 你是PM Agent...                              │   │
│  │ [user] 启动项目：宠物社区App...                        │   │
│  │ [assistant] 收到，我来进行任务分解...                   │   │
│  │ [tool_use] write docs/task-breakdown.md               │   │
│  │ [assistant] 任务分解完成，共12个任务...                 │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 组件结构

```
components/
├── comms/
│   ├── message-flow.tsx        # 实时消息流
│   ├── task-dag.tsx            # DAG 可视化 (SVG)
│   ├── collaboration-timeline.tsx  # 甘特图式时间线
│   ├── session-list.tsx        # Session 列表
│   ├── session-detail.tsx      # Session 消息详情
│   └── dag-node.tsx            # DAG 节点组件
```

### 6.4 DAG 渲染方案

**推荐：** 使用 `@xyflow/react`（React Flow）或轻量 SVG 自绘。

对于 MVP，用 CSS Grid + 连线 SVG 即可：

```tsx
// task-dag.tsx — 简化实现
function TaskDAG({ tasks }: { tasks: Task[] }) {
  // 按 phase 分层
  const layers = groupBy(tasks, t => t.phase)
  return (
    <div className="relative">
      <svg className="absolute inset-0 pointer-events-none">
        {/* 绘制依赖连线 */}
      </svg>
      <div className="flex flex-col gap-8">
        {Object.entries(layers).map(([phase, tasks]) => (
          <div key={phase} className="flex gap-4 justify-center">
            {tasks.map(t => <DAGNode key={t.id} task={t} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 6.5 所需 API Routes

| Method | Route | 说明 | 数据源 |
|--------|-------|------|--------|
| GET | `/api/sessions` | Session 列表 (已有) | Gateway |
| GET | `/api/sessions/[id]` | Session 详情 + 消息 | Gateway |
| GET | `/api/sessions/[id]/messages` | Session 消息记录 | Gateway |
| GET | `/api/comms/flow` | Agent 间消息流 (聚合) | Gateway logs + sessions |

### 6.6 实时推送方案

**方案 A (推荐 MVP)：** 轮询 — 当前已有 5s/10s 轮询，够用。

**方案 B (中期)：** SSE (Server-Sent Events)

```ts
// /api/events/route.ts
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      // 订阅 Gateway 的日志/session 变化
      // 推送给客户端
    }
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  })
}
```

**方案 C (长期)：** WebSocket — Gateway 原生支持 WS，可直接从前端连接。

---

## 7. 项目管理增强

### 7.1 功能

| 功能 | 说明 |
|------|------|
| **创建项目** | 填写需求 → 自动初始化目录 → 触发 Orchestrator |
| **实时监控** | 查看进行中项目的 Phase 进度、Agent 活动 |
| **产出物浏览** | 浏览项目目录下的所有文件 |
| **项目控制** | 暂停/恢复/取消项目 |

### 7.2 UI 布局

#### 创建项目（Modal / 全屏向导）

```
┌─ Create Project ───────────────────────────────────────────┐
│                                                             │
│  Step 1 of 3: Project Brief                                 │
│                                                             │
│  Project Name *    [_________________________]              │
│                                                             │
│  Description *                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 做一个宠物社区App，核心功能是宠物照片分享                  ││
│  │ 和附近宠物主人社交。                                      ││
│  │                                                          ││
│  │ 目标用户：养宠物的年轻人                                   ││
│  │ 竞品参考：小红书宠物板块                                   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  Project Type    [▼ fullstack / web-app / api / static]     │
│  Tech Stack      [▼ React+Node / Vue+Python / ...]          │
│                                                             │
│  Step 2: Team Configuration                                 │
│  ┌──────────────────────────────────────────────┐          │
│  │ ☑ PM          ☑ Researcher    ☑ Product      │          │
│  │ ☑ Designer    ☑ Frontend      ☑ Backend      │          │
│  │ ☑ Tester      ☐ Ops                          │          │
│  └──────────────────────────────────────────────┘          │
│                                                             │
│  Step 3: Confirm & Launch                                   │
│  预估耗时：4-7小时  预估Token：~375K (~$8.84)              │
│                                                             │
│                    [Cancel]  [← Back]  [🚀 Launch]          │
└─────────────────────────────────────────────────────────────┘
```

#### 项目监控（改造 `/projects/[id]`）

```
┌─ Project: 宠物社区App ──────────────────────────────────────┐
│                                                              │
│  Status: 🔄 In Progress   Phase: 3/5 (Development)          │
│  Started: 14:30   Elapsed: 2h 15m   Tokens: 180K ($5.40)    │
│                                                              │
│  ── Phase Progress ─────────────────────────────────────────│
│  ✅ Requirement  ✅ Design  🔄 Development  ⏳ Test  ⏳ Ship │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░   │
│                                                              │
│  ── Active Agents ──────────────────────────────────────────│
│  🔄 Frontend — 实现首页组件 src/pages/Home.tsx               │
│  🔄 Backend  — 设计 API 端点 docs/api-spec.md               │
│  ✅ Product  — PRD 完成 (14:55)                              │
│  ✅ Designer — 设计完成 (15:10)                              │
│                                                              │
│  ── Task DAG ──────────────────────────────────── (inline)  │
│  (嵌入简化版 DAG)                                            │
│                                                              │
│  ── Artifacts ──────────────────────────────────────────────│
│  📁 docs/                                                    │
│    📄 prd.md (Product, 15:02)                                │
│    📄 task-breakdown.md (PM, 14:38)                          │
│    📄 api-spec.md (Backend, 15:45, 🔄 writing...)           │
│  📁 design/                                                  │
│    📄 design-system.md (Designer, 15:12)                     │
│  📁 src/                                                     │
│    📁 client/ (Frontend, 🔄 in progress)                     │
│    📁 server/ (Backend, 🔄 in progress)                      │
│                                                              │
│  [⏸ Pause]  [🔄 Refresh]  [📁 Open Folder]                 │
└──────────────────────────────────────────────────────────────┘
```

### 7.3 组件结构

```
components/
├── projects/
│   ├── project-create-wizard.tsx   # 多步创建向导
│   ├── project-monitor.tsx         # 实时监控面板
│   ├── project-artifacts.tsx       # 产出物文件浏览器
│   ├── project-phase-bar.tsx       # Phase 进度条 (增强版)
│   ├── project-active-agents.tsx   # 活跃 Agent 列表
│   └── project-controls.tsx        # 暂停/恢复/取消按钮

app/
├── projects/
│   ├── page.tsx                    # 项目列表 (改造)
│   └── [id]/
│       └── page.tsx                # 项目详情/监控
```

### 7.4 交互流程

**创建项目 → 触发 Orchestrator:**

```
用户完成 Create Wizard → 点击 [Launch]
  → POST /api/projects/create
    → 服务端:
      1. mkdir projects/{id}/
      2. 写入 .project-meta.json
      3. 调用 project-init skill 初始化目录结构
      4. gwCall('sessions.spawn', {
           agentId: 'orchestrator',
           message: `启动产品开发项目: ${brief}`,
           context: { projectId: id, team: selectedAgents }
         })
  → 返回 projectId
  → 前端跳转 /projects/{id} (监控页)
```

**实时监控:**
```
/projects/[id] 页面加载
  → GET /api/projects/{id} (meta + file tree)
  → GET /api/projects/{id}/activity (活跃 agent + 最新操作)
  → 每 5s 轮询刷新
  → 检测 .project-meta.json 的 phase 变化 → 更新 UI
```

### 7.5 所需 API Routes

| Method | Route | 说明 | 数据源 |
|--------|-------|------|--------|
| GET | `/api/projects` | 项目列表 (已有, 增强) | 文件系统 |
| POST | `/api/projects/create` | 创建项目 + 触发 Orchestrator | 文件系统 + Gateway |
| GET | `/api/projects/[id]` | 项目详情 (meta + stats) | 文件系统 |
| GET | `/api/projects/[id]/tree` | 项目文件树 | 文件系统 |
| GET | `/api/projects/[id]/file` | 读取项目文件 | 文件系统 |
| GET | `/api/projects/[id]/activity` | 活跃 Agent + 最新操作 | Gateway sessions |
| POST | `/api/projects/[id]/control` | 暂停/恢复/取消 | Gateway |

---

## 8. API Routes 总览

### 现有 (保留)

| Route | 说明 |
|-------|------|
| `GET /api/health` | Gateway 健康检查 |
| `GET /api/agents` | Agent 列表 |
| `GET/PUT /api/agents/model` | Agent 模型管理 |
| `GET /api/usage` | Token 用量统计 |
| `GET /api/models` | 模型列表 |
| `GET /api/logs` | 日志 |
| `GET /api/sessions` | Session 列表 |
| `GET /api/skills` | Skills 列表 |

### 新增

| Route | 说明 | 优先级 |
|-------|------|--------|
| `POST /api/agents/create` | 创建 Agent | P0 |
| `PUT /api/agents/[id]` | 更新 Agent | P0 |
| `DELETE /api/agents/[id]` | 删除 Agent | P1 |
| `POST /api/agents/[id]/start` | 启动 Agent | P0 |
| `POST /api/agents/[id]/stop` | 停止 Agent | P0 |
| `POST /api/agents/clone` | 克隆 Agent | P2 |
| `GET /api/agents/[id]/tree` | Workspace 文件树 | P0 |
| `GET /api/agents/[id]/file` | 读取 Agent 文件 | P0 |
| `PUT /api/agents/[id]/file` | 写入 Agent 文件 | P1 |
| `POST /api/projects/create` | 创建项目 | P0 |
| `GET /api/projects/[id]` | 项目详情 | P0 |
| `GET /api/projects/[id]/tree` | 项目文件树 | P1 |
| `GET /api/projects/[id]/file` | 项目文件内容 | P1 |
| `GET /api/projects/[id]/activity` | 项目活跃状态 | P1 |
| `POST /api/projects/[id]/control` | 项目控制 | P2 |
| `GET /api/sessions/[id]` | Session 详情 | P1 |
| `GET /api/sessions/[id]/messages` | Session 消息 | P1 |
| `GET /api/comms/flow` | Agent 间消息流 | P2 |

---

## 9. 数据流架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Next.js Client)                 │
│                                                              │
│  Zustand Store ←── fetch(/api/...) ←── polling (5-30s)      │
│       │                                                      │
│       ├── agents[]          ← /api/agents                    │
│       ├── projects[]        ← /api/projects                  │
│       ├── sessions[]  (new) ← /api/sessions                  │
│       ├── usageDaily[]      ← /api/usage                     │
│       ├── logs[]            ← /api/logs                      │
│       ├── health            ← /api/health                    │
│       └── commsFlow[] (new) ← /api/comms/flow                │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP
┌──────────────────────▼──────────────────────────────────────┐
│              Next.js API Routes (Server)                     │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ gwCall()    │  │ fs (read/    │  │ child_process      │ │
│  │ → openclaw  │  │ write/mkdir) │  │ (spawn openclaw)   │ │
│  │   CLI       │  │              │  │                    │ │
│  └──────┬──────┘  └──────────────┘  └────────────────────┘ │
└─────────┼───────────────────────────────────────────────────┘
          │ exec → ws://127.0.0.1:19100
┌─────────▼───────────────────────────────────────────────────┐
│                OpenClaw Gateway (port 19100)                  │
│                                                              │
│  agents.list / sessions.list / sessions.spawn / usage.get    │
│  sessions.send / sessions.kill / logs.query                  │
└──────────────────────────────────────────────────────────────┘
```

### Zustand Store 增强

新增 state 字段：

```ts
interface AppState {
  // ... existing ...

  // Sessions (enhanced)
  sessions: SessionInfo[]
  fetchSessions: () => Promise<void>

  // Communication flow
  commsFlow: CommMessage[]
  fetchCommsFlow: () => Promise<void>

  // Active project monitoring
  activeProjectId: string | null
  setActiveProject: (id: string | null) => void
  projectActivity: ProjectActivity | null
  fetchProjectActivity: (id: string) => Promise<void>
}

interface SessionInfo {
  id: string
  agentId: string
  status: 'active' | 'done' | 'error'
  startedAt: string
  endedAt?: string
  messageCount: number
  tokenCount: number
}

interface CommMessage {
  id: string
  timestamp: string
  from: string  // agent ID
  to: string    // agent ID
  type: 'spawn' | 'send' | 'file' | 'complete'
  summary: string
  sessionId?: string
}

interface ProjectActivity {
  projectId: string
  activeAgents: { agentId: string; task: string; status: string }[]
  recentFiles: { path: string; agent: string; action: string; time: string }[]
  phase: number
  totalPhases: number
}
```

---

## 10. OpenClaw Gateway 能力边界

### Gateway 已提供 (可直接使用)

| 能力 | Gateway API | 用途 |
|------|------------|------|
| Agent 列表 | `agents.list` | 获取已注册 Agent |
| Session 管理 | `sessions.list/spawn/send/kill` | 启动/停止/通信 |
| 日志查询 | `logs.query` | 获取 Agent 活动日志 |
| 用量统计 | `usage.get` | Token/Cost 统计 |
| 模型管理 | `models.list/set` | 模型配置 |
| 健康检查 | `health` | 系统状态 |

### 需要自建 (Dashboard 层)

| 能力 | 实现方式 | 原因 |
|------|---------|------|
| Agent CRUD | 文件系统操作 (mkdir, writeFile) | Gateway 不管 Agent 文件内容 |
| Workspace 浏览 | fs.readdir / fs.readFile | 纯文件操作 |
| 项目创建 | 文件系统 + sessions.spawn | 组合操作 |
| 项目文件浏览 | fs.readdir / fs.readFile | 纯文件操作 |
| Agent 模板库 | 静态 JSON/MD 文件 | 本地模板 |
| 消息流聚合 | 解析 logs + sessions | Gateway 没有专门的通信日志 API |
| 实时推送 | SSE/WS (中期) | Gateway WS 不直接暴露给浏览器 |

### Gateway 缺失但可扩展的

| 能力 | 说明 | 解决方案 |
|------|------|---------|
| Session 消息历史 | `sessions.list` 只返回摘要 | 解析 Gateway 日志文件 或 等 Gateway 后续支持 |
| Agent 注册/注销 | 目前 Agent 配置在 openclaw.json | Dashboard 直接修改 openclaw.json + restart |
| 文件变更监听 | 无 push 机制 | 轮询 stat() 或使用 fs.watch |

---

## 11. 组件树总览

```
app/
├── layout.tsx                      # ← 改为 ResponsiveLayout
├── page.tsx                        # Dashboard (增强响应式)
├── agents/
│   ├── page.tsx                    # Agent 列表 (重构: grid + CRUD)
│   └── [id]/
│       ├── page.tsx                # Agent 详情 (NEW)
│       └── workspace/
│           └── page.tsx            # Workspace 浏览 (NEW)
├── projects/
│   ├── page.tsx                    # 项目列表 (增强: + Create)
│   └── [id]/
│       └── page.tsx                # 项目监控 (NEW)
├── comms/
│   └── page.tsx                    # 通信可视化 (NEW)
├── skills/
│   └── page.tsx                    # (现有)
├── logs/
│   └── page.tsx                    # (现有)
├── settings/
│   └── page.tsx                    # (现有)
└── api/
    ├── health/route.ts             # (现有)
    ├── agents/
    │   ├── route.ts                # (现有, 增强)
    │   ├── model/route.ts          # (现有)
    │   ├── create/route.ts         # NEW
    │   └── [id]/
    │       ├── route.ts            # NEW (PUT/DELETE)
    │       ├── start/route.ts      # NEW
    │       ├── stop/route.ts       # NEW
    │       ├── tree/route.ts       # NEW
    │       └── file/route.ts       # NEW
    ├── projects/
    │   ├── route.ts                # (现有, 增强)
    │   ├── create/route.ts         # NEW
    │   └── [id]/
    │       ├── route.ts            # NEW
    │       ├── tree/route.ts       # NEW
    │       ├── file/route.ts       # NEW
    │       ├── activity/route.ts   # NEW
    │       └── control/route.ts    # NEW
    ├── sessions/
    │   ├── route.ts                # (现有)
    │   └── [id]/
    │       ├── route.ts            # NEW
    │       └── messages/route.ts   # NEW
    ├── comms/
    │   └── flow/route.ts           # NEW
    ├── usage/route.ts              # (现有)
    ├── models/route.ts             # (现有)
    ├── logs/route.ts               # (现有)
    └── skills/route.ts             # (现有)

components/
├── responsive-layout.tsx           # NEW
├── mobile-nav.tsx                  # NEW
├── sidebar.tsx                     # 改造 (variant prop)
├── agents/
│   ├── agent-grid.tsx              # NEW
│   ├── agent-card-v2.tsx           # NEW (替代 agent-card.tsx)
│   ├── agent-detail.tsx            # NEW
│   ├── agent-create-dialog.tsx     # NEW
│   ├── agent-editor.tsx            # NEW
│   └── agent-actions.tsx           # NEW
├── workspace/
│   ├── file-tree.tsx               # NEW
│   ├── file-preview.tsx            # NEW
│   ├── workspace-panel.tsx         # NEW
│   └── memory-list.tsx             # NEW
├── comms/
│   ├── message-flow.tsx            # NEW
│   ├── task-dag.tsx                # NEW
│   ├── collaboration-timeline.tsx  # NEW
│   ├── session-list.tsx            # NEW
│   └── session-detail.tsx          # NEW
├── projects/
│   ├── project-create-wizard.tsx   # NEW
│   ├── project-monitor.tsx         # NEW
│   ├── project-artifacts.tsx       # NEW
│   └── project-controls.tsx        # NEW
├── ui/
│   ├── badge.tsx                   # (现有)
│   ├── card.tsx                    # (现有)
│   ├── dialog.tsx                  # NEW (通用弹窗)
│   ├── tabs.tsx                    # NEW (通用 tabs)
│   ├── tooltip.tsx                 # NEW (collapsed sidebar 用)
│   └── dropdown.tsx                # NEW (操作菜单)
├── stat-card.tsx                   # (现有)
├── token-chart.tsx                 # (现有)
├── agent-token-chart.tsx           # (现有)
├── log-list.tsx                    # (现有)
├── phase-progress.tsx              # (现有)
├── data-provider.tsx               # (现有)
├── client-only.tsx                 # (现有)
└── language-switcher.tsx           # (现有)

hooks/
├── use-media-query.ts              # NEW
└── use-polling.ts                  # NEW (统一轮询逻辑)

lib/
├── gateway-client.ts               # (现有)
├── agent-meta.ts                   # (现有)
├── agent-templates.ts              # NEW (Agent 角色模板)
├── i18n.ts                         # (现有)
├── store.ts                        # (现有, 增强)
├── types.ts                        # (现有, 增强)
└── utils.ts                        # (现有)
```

---

## 12. 优先级排序与实施计划

### P0 — 核心基础 (Week 1)

| 任务 | 估时 | 说明 |
|------|------|------|
| 响应式 Layout 改造 | 4h | ResponsiveLayout + MobileNav + Sidebar variant |
| Agent 创建表单 | 4h | CreateDialog + POST /api/agents/create |
| Agent 启动/停止 | 2h | start/stop API + 按钮 |
| Workspace 文件树 | 4h | tree API + FileTree + FilePreview 组件 |
| 项目创建向导 | 4h | CreateWizard + POST /api/projects/create |
| **小计** | **18h** | |

### P1 — 增强功能 (Week 2)

| 任务 | 估时 | 说明 |
|------|------|------|
| Agent 编辑 (AGENTS.md) | 3h | CodeMirror/textarea 编辑器 + PUT API |
| Agent 删除 (带确认) | 2h | DELETE API + 确认弹窗 |
| Agent 详情页 (Tabs) | 4h | /agents/[id] + tabs (Overview/Files/Sessions/Logs) |
| 项目监控页 | 4h | /projects/[id] + phase bar + active agents |
| Session 列表增强 | 3h | session detail + 消息历史 |
| 项目产出物浏览 | 3h | project tree + file preview |
| **小计** | **19h** | |

### P2 — 高级可视化 (Week 3)

| 任务 | 估时 | 说明 |
|------|------|------|
| 消息流视图 | 4h | /comms + message-flow 组件 |
| 任务 DAG | 6h | SVG DAG 渲染 (或 React Flow) |
| 协作时间线 | 4h | 甘特图式时间线 |
| Agent 克隆 | 2h | clone API + UI |
| 项目控制 (暂停/恢复) | 2h | control API + UI |
| Memory 专项查看器 | 2h | memory-list 组件 |
| **小计** | **20h** | |

### P3 — 打磨 (Week 4)

| 任务 | 估时 | 说明 |
|------|------|------|
| SSE 实时推送 | 4h | 替代部分轮询 |
| Agent 模板库 UI | 3h | 预设模板选择器 |
| 深色/浅色主题切换 | 2h | CSS variables |
| 国际化补全 | 2h | 新增页面的 i18n |
| 性能优化 | 3h | React.memo, 虚拟列表, 按需加载 |
| **小计** | **14h** | |

### 总计

| Phase | 工时 | 产出 |
|-------|------|------|
| P0 | ~18h | 可用的响应式 + Agent CRUD + 项目创建 |
| P1 | ~19h | 完整的 Agent 管理 + 项目监控 |
| P2 | ~20h | 通信可视化 + DAG + 时间线 |
| P3 | ~14h | 实时推送 + 打磨 |
| **总计** | **~71h** | **完整 Dashboard v2** |

---

## 附录 A: Agent 模板数据

```ts
// lib/agent-templates.ts
export const AGENT_TEMPLATES = [
  {
    id: 'orchestrator',
    name: 'Orchestrator',
    role: 'orchestrator',
    icon: '🎯',
    description: '项目编排者，协调所有 Agent 的工作流程',
    agentsMd: `# AGENTS.md — Orchestrator\n\n你是项目编排者...\n\n## 核心职责\n...`,
  },
  {
    id: 'pm',
    name: 'Project Manager',
    role: 'pm',
    icon: '📋',
    description: '项目经理，负责任务分解和进度跟踪',
    agentsMd: `# AGENTS.md — PM Agent\n\n你是项目经理...\n\n## 核心职责\n...`,
  },
  // ... 其他角色 (参照 BLUEPRINT.md §5 的完整定义)
]
```

## 附录 B: 新增依赖

| 包 | 用途 | 大小 |
|----|------|------|
| `react-markdown` + `remark-gfm` | Markdown 渲染 | ~50KB |
| `highlight.js` (按需加载语言) | 代码高亮 | ~30KB (按需) |
| `@xyflow/react` (可选) | DAG 可视化 | ~150KB |

无需引入 UI 库 (shadcn 已有 card/badge 手写组件，新增 dialog/tabs/tooltip 同样手写)。

---

*文档完成。按 P0→P1→P2→P3 迭代实施，每个 Phase 独立可交付。*
