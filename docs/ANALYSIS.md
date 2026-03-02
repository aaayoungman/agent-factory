# Agent Factory Dashboard — 现状分析

> 分析时间：2026-02-20
> 分析范围：`ui/src/` 全部源码 + API 路由 + 数据层

---

## 1. 架构总览

```
ui/src/
├── app/                          # Next.js 14 App Router
│   ├── page.tsx                  # Dashboard 首页
│   ├── agents/page.tsx           # Agent 列表
│   ├── projects/page.tsx         # 项目管理
│   ├── skills/page.tsx           # 技能列表
│   ├── logs/page.tsx             # 日志监控
│   ├── settings/page.tsx         # 设置（含 Gateway/Provider/更新）
│   ├── setup/page.tsx            # 首次配置向导
│   └── api/                      # API 路由（Next.js Route Handlers）
│       ├── agents/               # GET agents, PUT model assignment
│       ├── auth-profiles/        # Setup Token CRUD
│       ├── env/                  # .env 文件 CRUD
│       ├── gateway/              # status/start/stop/restart/update
│       ├── health/               # Gateway health check
│       ├── logs/                 # Gateway logs.tail
│       ├── models/               # models.json CRUD + auth info
│       ├── projects/             # 文件系统读取 projects/
│       ├── sessions/             # Gateway sessions.list
│       ├── skills/               # 文件系统读取 skills/
│       └── usage/                # Gateway sessions.usage
├── components/                   # UI 组件
│   ├── layout-shell.tsx          # Sidebar + main 布局
│   ├── sidebar.tsx               # 固定宽度侧边栏 (264px)
│   ├── agent-card.tsx            # Agent 信息卡片
│   ├── log-list.tsx              # 日志列表（mono 字体）
│   ├── token-chart.tsx           # Token 用量柱状图 (recharts)
│   ├── agent-token-chart.tsx     # Agent 用量饼图 (recharts)
│   ├── phase-progress.tsx        # 项目阶段进度条
│   ├── stat-card.tsx             # 统计卡片
│   ├── data-provider.tsx         # 轮询初始化
│   ├── gateway-guard.tsx         # 无 API Key 时重定向 /setup
│   └── ui/                       # 基础 UI (card, badge)
└── lib/                          # 工具库
    ├── store.ts                  # Zustand 全局状态 (346行)
    ├── types.ts                  # 数据类型定义
    ├── agent-meta.ts             # 从 agents/ 目录读取 AGENTS.md
    ├── gateway-client.ts         # 通过 openclaw CLI 调用 Gateway
    ├── providers.ts              # Provider 定义（15个 AI 提供商）
    ├── i18n.ts                   # 中英切换 (zustand + persist)
    └── utils.ts                  # cn, formatNumber, timeAgo
```

## 2. 数据流

```
[Gateway (port 19100)]
    ↓ gwCall() — 通过 openclaw gateway call --json
[Next.js API Routes]
    ↓ fetch('/api/...')
[Zustand Store]
    ↓ useAppStore()
[React Components]
```

- **轮询机制**：DataProvider 在 mount 时调用 `initPolling()`
  - agents: 10s, usage: 30s, logs: 5s, health: 15s
- **数据源**：Gateway API + 文件系统读取（agents/, projects/, skills/）
- **无 WebSocket**：全靠 HTTP 轮询

## 3. 已有功能评估

### ✅ 可用
| 功能 | 质量 | 备注 |
|------|------|------|
| Dashboard 统计 | ★★★☆ | 4 个 StatCard + 图表，真实数据接入 |
| Agent 列表 | ★★★☆ | 卡片展示 + 模型分配表格 + 角色定义 |
| Projects 列表 | ★★☆☆ | 左右分栏，有详情页，但只读 |
| Skills 列表 | ★★☆☆ | 卡片展示，只读，无安装/卸载 |
| Logs 监控 | ★★★☆ | 过滤(level/agent) + 时间线 + 日志流 |
| Settings | ★★★★ | Gateway 控制 + OpenClaw 更新 + Provider 管理(含认证) |
| Setup 向导 | ★★★★ | 多 Provider 选择 + 多认证方式 + 自动启动 Gateway |
| 中英切换 | ★★★★ | 完整的 i18n |
| 暗色主题 | ★★★★ | 全局暗色，一致的设计语言 |

### ❌ 缺失
| 功能 | 严重程度 | 说明 |
|------|----------|------|
| **创建/编辑 Agent** | 🔴 高 | 只展示预定义 7 Agent，无新建/编辑/删除入口 |
| **Agent 工作空间** | 🔴 高 | 无法查看 Agent 的文件输出、对话历史、工作进度 |
| **Agent 间消息流** | 🔴 高 | 无 Agent 间通讯可视化，Logs 只有系统日志 |
| **移动端适配** | 🟡 中 | Sidebar 固定 264px，无汉堡菜单，手机不可用 |
| **创建/编辑 Project** | 🟡 中 | Projects 只读，无法从 UI 创建新项目 |
| **创建/管理 Skill** | 🟡 中 | Skills 只读，无安装/启用/禁用操作 |
| **实时通讯** | 🟢 低 | 全靠轮询，无 WebSocket 实时推送 |

## 4. 代码质量评估

### 优点
- 代码结构清晰，职责分离合理
- API Routes 统一处理错误和数据源标识
- Zustand store 集中管理状态
- i18n 从一开始就有，不是后期补丁
- Provider 系统设计良好（15个提供商 + 多认证方式）

### 问题
- **store.ts 过大** (346行)：所有状态挤在一个 store，应该按功能拆分
- **无错误边界**：组件出错会白屏
- **图表硬编码颜色**：没有跟随主题
- **无 loading 状态**：数据加载时没有骨架屏
- **类型不够严格**：部分 API 响应用 `any` 或 `Record<string, unknown>`
- **gateway-client 同步阻塞**：`execSync` 在 API 路由中阻塞 Node.js 事件循环

## 5. 关键依赖

- Next.js 14.2.35 (App Router)
- zustand (状态管理 + persist)
- recharts (图表)
- lucide-react (图标)
- tailwindcss (样式)
- clsx + tailwind-merge (className 合并)
