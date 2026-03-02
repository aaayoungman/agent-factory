# Agent Factory Dashboard — 功能补全计划

> 基于 ANALYSIS.md 的分析结果制定
> 目标：补全 4 个核心缺失功能

---

## 实施顺序

按依赖关系和价值优先级排列：

### Phase 1: 移动端适配 (预计 30min)
**原因**：改动面最小，影响面最大，所有后续功能都需要在移动端可用

**改动清单：**
1. `sidebar.tsx` — 添加汉堡菜单按钮、overlay 模式
2. `layout-shell.tsx` — 响应式 `ml-64` → `md:ml-64`，移动端无左边距
3. 新增 `useMobile` hook — 检测屏幕宽度
4. 各页面头部 — 确保文字不溢出

**技术方案：**
- 移动端（<768px）：侧边栏隐藏，点击汉堡菜单滑出 overlay
- 桌面端（≥768px）：保持现有固定侧边栏
- 点击导航链接自动收起侧边栏

---

### Phase 2: 创建/编辑 Agent (预计 1h)
**原因**：核心功能，Agent 是整个系统的基础单元

**改动清单：**
1. `agents/page.tsx` — 添加"创建 Agent"按钮
2. 新增 `components/agent-form.tsx` — Agent 创建/编辑表单（Dialog）
   - 字段：ID、名称、角色、描述、模型选择
   - 生成 `agents/{id}/AGENTS.md` + `agents/{id}/agent.json`
3. `api/agents/route.ts` — 新增 POST（创建）、PUT（编辑）、DELETE
4. Agent 卡片 — 添加编辑/删除操作按钮
5. i18n — 添加创建/编辑相关文案

**数据写入：**
- `agents/{id}/AGENTS.md` — 从模板生成，包含角色描述
- `agents/{id}/agent.json` — `{ "model": "选择的模型" }`
- `agents/{id}/skills/` — 空目录

**角色模板：**
- 内置 8 个角色模板（pm/researcher/product/designer/frontend/backend/tester/custom）
- Custom 角色允许自定义职责描述

---

### Phase 3: Agent 工作空间 (预计 1.5h)
**原因**：让用户能看到每个 Agent 在做什么

**改动清单：**
1. 新增 `app/agents/[id]/page.tsx` — Agent 详情/工作空间页
2. 新增 `api/agents/[id]/workspace/route.ts` — 读取 Agent 工作目录文件
3. 新增 `api/agents/[id]/sessions/route.ts` — 获取 Agent 的会话历史
4. 新增 `components/file-tree.tsx` — 文件树组件
5. 新增 `components/session-viewer.tsx` — 会话消息查看器

**工作空间布局（三栏）：**
```
┌─────────────┬────────────────────────┬──────────────┐
│  Agent Info  │   Sessions / Messages  │  File Tree   │
│  + Status    │   (对话历史)            │  + Preview   │
│  + Model     │                        │              │
│  + Stats     │                        │              │
└─────────────┴────────────────────────┴──────────────┘
```

移动端改为 Tab 切换（Info / Sessions / Files）。

**数据源：**
- Agent Info → `/api/agents` + agent-meta
- Sessions → Gateway `sessions.list` (按 agentId 过滤)
- Messages → Gateway `sessions.history` (按 sessionKey)
- Files → 文件系统 `projects/{projectId}/` 下 Agent 的输出

---

### Phase 4: Agent 间消息流 (预计 1.5h)
**原因**：多 Agent 协作的可视化，是"AI 员工工厂"的核心展示

**改动清单：**
1. 新增 `app/messages/page.tsx` — Agent 消息中心
2. 新增 `api/messages/route.ts` — 聚合 Agent 间消息
3. 新增 `components/message-flow.tsx` — 消息流组件
4. 新增 `components/agent-network.tsx` — Agent 关系拓扑图
5. `sidebar.tsx` — 添加"消息"导航项
6. i18n — 添加消息相关文案

**消息流布局：**
```
┌──────────────────────────────────────────────────┐
│  Agent Network (拓扑图/连线图)                     │
│  [PM] ←→ [Researcher] ←→ [Product] ←→ [Designer] │
└──────────────────────────────────────────────────┘
┌──────────────┬───────────────────────────────────┐
│  Filter      │  Message Stream                    │
│  □ PM        │  [PM → Researcher] 请做市场调研     │
│  □ Designer  │  [Researcher → PM] 调研报告完成     │
│  □ Frontend  │  [PM → Product] 请基于调研写PRD     │
│  ...         │  ...                               │
└──────────────┴───────────────────────────────────┘
```

**数据源：**
- Gateway `sessions.list` — 获取所有会话
- Gateway `sessions.history` — 获取会话消息
- 从消息内容识别 Agent 间交互（spawn/send 事件）
- Logs 中的 Agent 活动事件

**消息类型：**
- `spawn` — Agent A 创建了 Agent B 的子任务
- `send` — Agent A 向 Agent B 发送消息
- `complete` — Agent 完成任务并返回结果
- `error` — 执行出错

---

## 文件清单（新增/修改）

### 新增文件
```
ui/src/
├── app/
│   ├── agents/[id]/page.tsx          # Agent 工作空间
│   ├── messages/page.tsx             # 消息中心
│   └── api/
│       ├── agents/[id]/
│       │   ├── workspace/route.ts    # Agent 文件列表
│       │   └── sessions/route.ts     # Agent 会话历史
│       └── messages/route.ts         # Agent 间消息聚合
├── components/
│   ├── agent-form.tsx                # Agent 创建/编辑表单
│   ├── file-tree.tsx                 # 文件树
│   ├── session-viewer.tsx            # 会话查看器
│   ├── message-flow.tsx              # 消息流
│   └── agent-network.tsx             # Agent 网络拓扑
└── hooks/
    └── use-mobile.ts                 # 移动端检测
```

### 修改文件
```
ui/src/
├── app/agents/page.tsx               # 添加创建按钮
├── api/agents/route.ts               # 添加 POST/PUT/DELETE
├── components/sidebar.tsx            # 移动端适配 + 消息导航
├── components/layout-shell.tsx       # 响应式布局
├── components/agent-card.tsx         # 编辑/删除/跳转按钮
├── lib/store.ts                      # 新增消息和工作空间状态
├── lib/types.ts                      # 新增类型定义
└── locales/zh.json, en.json          # 新增翻译
```

---

## 实施约束

1. **保持现有风格** — 暗色主题、Card 组件、lucide 图标、相同的间距
2. **不引入新依赖** — 尽量用现有的 recharts/lucide/tailwind
3. **API 兼容** — 新 API 保持 `{ source: 'gateway' | 'filesystem' | 'error' }` 格式
4. **i18n 完整** — 所有新增文案同时添加中英文
5. **移动端优先** — 每个新页面都要考虑响应式
6. **真实数据** — 不使用 mock data，无数据时显示空状态
