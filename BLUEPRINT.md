# AI员工工厂 — 统一架构蓝图

> 基于口袋AIGC展示的"AI员工工厂"概念，结合Yuan现有OpenClaw + Claude Opus 4.6基础设施，从零构建的自洽方案。
> 
> 版本：v1.0 | 2026-02-19

---

## 目录

1. [务实评估：口袋AIGC宣传vs现实](#1-务实评估)
2. [统一架构总览](#2-统一架构总览)
3. [L0 基础层：OpenClaw Gateway](#3-l0-基础层)
4. [L1 能力层：Skills + Tools](#4-l1-能力层)
5. [L2 角色层：Agent定义与生成](#5-l2-角色层)
6. [L3 协作层：多Agent编排](#6-l3-协作层)
7. [L4 应用层：产品开发团队 & AI运营接单](#7-l4-应用层)
8. [L5 管理层：Dashboard UI](#8-l5-管理层)
9. [安全边界与治理](#9-安全边界与治理)
10. [成本估算](#10-成本估算)
11. [落地路线图](#11-落地路线图)
12. [之前分析冲突点的统一解答](#12-冲突点解答)

---

## 1. 务实评估

### 口袋AIGC宣传中可信的部分

| 宣称 | 可信度 | 理由 |
|------|--------|------|
| 用OpenClaw + Claude Opus做多Agent协作 | ✅ 高 | OpenClaw原生支持多Agent路由、sessions_spawn、agent-to-agent通信，这是真实可用的 |
| 7角色Agent Team半天出Demo | ⚠️ 中 | 对于UI/前端为主的项目，agent确实能快速生成代码骨架；但"中型产品"的定义很模糊，半天出的大概率是可演示但不可生产的原型 |
| Skill Agent框架 | ⚠️ 中 | Anthropic的Skills机制是真实存在的（workspace的skills/目录），但"框架"这个词是包装——Skills就是结构化的指令+脚本文件，不是独立框架 |
| AI运营Agent自动在猪八戒接单 | ⚠️ 低-中 | 技术上可行（browser tool可以操作网页），但自动接单涉及账号风控、客户沟通质量、交付承诺，实际转化率存疑 |
| AgentHub Dashboard | ⚠️ 中 | 可以用Canvas或本地Web服务做，但大概率是定制开发的前端，不是OpenClaw内置功能 |
| "用AI造AI" / Agent Factory | ⚠️ 低 | Agent的AGENTS.md和Skills可以由另一个Agent生成，但这本质上是"用模板+LLM填充生成配置文件"，不是真正的自我进化 |

### 营销包装成分

1. **"工厂"隐喻过度** — 实际是：预定义好Agent模板 → LLM根据项目需求填充参数 → 写入配置文件。这叫"模板化配置生成"，不是"工厂"
2. **"半天出产品"** — 大概率是前端页面+mock数据的Demo，不含真实后端、数据库、部署
3. **"自动接单赚钱"** — 展示的是流程可行性，不是稳定的商业闭环

### 我们能做到什么

**短期（1-2周）可落地：** 多Agent团队协作开发原型项目
**中期（1-2月）可落地：** Agent模板库 + 半自动化项目启动流程
**长期探索：** AI运营接单（需要大量试错和人工兜底）

---

## 2. 统一架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│  L5 管理层：Dashboard UI（可选，Canvas或独立Web App）             │
│  - 查看Agent状态、任务进度、token消耗、日志                       │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP API / Canvas eval
┌────────────────────────────▼────────────────────────────────────┐
│  L4 应用层：具体业务场景                                         │
│  ┌──────────────────────┐  ┌──────────────────────┐             │
│  │ 产品开发团队          │  │ AI运营接单            │             │
│  │ (7角色协作)           │  │ (平台监控+投标+交付)  │             │
│  └──────────┬───────────┘  └──────────┬───────────┘             │
└─────────────┼──────────────────────────┼────────────────────────┘
              │ sessions_spawn/send       │
┌─────────────▼──────────────────────────▼────────────────────────┐
│  L3 协作层：多Agent编排                                          │
│  - Orchestrator Agent（主编排者）                                 │
│  - sessions_spawn → 并发子任务                                   │
│  - sessions_send → Agent间消息传递                               │
│  - 文件系统作为共享状态（project/ 目录）                           │
└────────────────────────────┬────────────────────────────────────┘
                             │ 调用
┌────────────────────────────▼────────────────────────────────────┐
│  L2 角色层：Agent 定义                                           │
│  - 每个Agent = 独立workspace + AGENTS.md + skills/ + 工具权限    │
│  - Agent Factory = 模板 + LLM填充 → 生成Agent配置               │
└────────────────────────────┬────────────────────────────────────┘
                             │ 依赖
┌────────────────────────────▼────────────────────────────────────┐
│  L1 能力层：Skills + Tools                                       │
│  - Skills = ~/.openclaw/skills/ (全局共享)                       │
│  -        + workspace/skills/ (Agent私有)                        │
│  - Tools = OpenClaw内置 (exec, read, write, browser, web等)      │
└────────────────────────────┬────────────────────────────────────┘
                             │ 运行于
┌────────────────────────────▼────────────────────────────────────┐
│  L0 基础层：OpenClaw Gateway                                     │
│  - 单进程Node.js，管理所有Agent/Session                          │
│  - 模型路由：Opus主脑 / Sonnet前台                               │
│  - Channel连接（Telegram等）                                     │
│  - Mac mini 本地运行                                             │
└─────────────────────────────────────────────────────────────────┘
```

### 核心设计原则

1. **OpenClaw就是编排层** — 不需要额外框架。OpenClaw的sessions_spawn + sessions_send + agent-to-agent已经提供了完整的编排能力
2. **文件系统是共享状态** — Agent间通过共享的project/目录交换产物（PRD文档、设计稿、代码等），不需要额外的消息队列或数据库
3. **Skills是能力单元** — 每个Skill是一个目录，包含指令文件+可选脚本，Agent按需加载

---

## 3. L0 基础层：OpenClaw Gateway

### 当前状态（已就绪）

Yuan的Mac mini已经运行OpenClaw Gateway，配置：
- 主模型：Claude Opus 4.6（深度分析、代码生成）
- 前台模型：Claude Sonnet（轻量交互）
- Channel：Telegram（已配置）

### 需要调整的配置

编辑 `~/.openclaw/openclaw.json`，启用多Agent和agent-to-agent通信：

```json5
{
  agents: {
    list: [
      {
        id: "main",
        default: true,
        workspace: "~/.openclaw/workspace-main",
        // 主控agent，也是日常交互入口
        subagents: {
          allowAgents: ["pm", "researcher", "product", "designer", "frontend", "backend", "tester", "ops"]
        }
      },
      {
        id: "pm",
        workspace: "~/.openclaw/workspace-pm",
      },
      {
        id: "researcher",
        workspace: "~/.openclaw/workspace-researcher",
      },
      {
        id: "product",
        workspace: "~/.openclaw/workspace-product",
      },
      {
        id: "designer",
        workspace: "~/.openclaw/workspace-designer",
      },
      {
        id: "frontend",
        workspace: "~/.openclaw/workspace-frontend",
      },
      {
        id: "backend",
        workspace: "~/.openclaw/workspace-backend",
      },
      {
        id: "tester",
        workspace: "~/.openclaw/workspace-tester",
      },
      {
        id: "ops",
        workspace: "~/.openclaw/workspace-ops",
      }
    ]
  },
  tools: {
    agentToAgent: {
      enabled: true,
      allow: ["main", "pm", "researcher", "product", "designer", "frontend", "backend", "tester", "ops"]
    }
  }
}
```

### 模型路由策略

| 任务类型 | 模型 | 理由 |
|---------|------|------|
| 编排决策、架构设计、复杂推理 | Opus 4.6 | 需要深度分析 |
| 代码生成、文档写作 | Opus 4.6 | 质量要求高 |
| 状态查询、简单问答、格式转换 | Sonnet | 省token |
| 并发子任务（多个Agent同时跑） | Sonnet | 成本控制，大部分子任务不需要Opus级别 |

配置方法：在每个Agent的workspace中通过AGENTS.md指定，或在openclaw.json的agent配置中设置model override。

---

## 4. L1 能力层：Skills + Tools

### Skills到底是什么（一次讲清楚）

**Skills是OpenClaw的模块化能力扩展机制。** 物理上，每个Skill是一个目录，结构如下：

```
skills/
└── web-scraping/
    ├── skill.md          # 核心：指令文件，告诉Agent这个skill做什么、怎么做
    ├── scrape.sh         # 可选：辅助脚本
    └── templates/        # 可选：模板文件
        └── report.md
```

`skill.md` 示例：

```markdown
# Web Scraping Skill

## 触发条件
当用户需要从网页提取结构化数据时使用此skill。

## 执行步骤
1. 使用 web_fetch 获取目标页面
2. 如果页面需要JavaScript渲染，改用 browser tool
3. 提取所需数据，输出为JSON或Markdown表格
4. 如果需要批量抓取，使用 scrape.sh 脚本

## 约束
- 遵守robots.txt
- 单次请求间隔 ≥ 2秒
- 最大并发3个页面
```

**Skills不是代码框架，不是API，不是独立服务。** 它就是一组指令+资源文件，Claude在需要时加载并遵循。

### Skills的两个存放位置

| 位置 | 作用 | 访问范围 |
|------|------|---------|
| `~/.openclaw/skills/` | 全局共享Skills | 所有Agent可用 |
| `workspace/skills/` | Agent私有Skills | 仅该Agent可用 |

### 本方案需要的Skills清单

**全局共享Skills（放在 `~/.openclaw/skills/`）：**

| Skill名称 | 功能 | 实现方式 |
|-----------|------|---------|
| `project-init` | 初始化项目目录结构 | skill.md + init.sh模板脚本 |
| `code-review` | 代码审查流程 | skill.md（审查标准和checklist） |
| `test-runner` | 运行测试套件 | skill.md + exec调用 |
| `deploy-preview` | 本地预览/部署 | skill.md + docker/vite配置 |
| `doc-writer` | 文档生成规范 | skill.md + 模板 |
| `browser-automation` | 网页自动化操作 | skill.md（browser tool使用规范） |

**Agent私有Skills示例（放在各workspace/skills/）：**

- PM的workspace: `skills/requirement-analysis/` — 需求拆解方法论
- Designer的workspace: `skills/ui-generation/` — UI生成规范（Tailwind组件库等）
- Frontend的workspace: `skills/react-patterns/` — React最佳实践

### 具体实现：创建一个Skill

以 `project-init` 为例，完整创建步骤：

```bash
# 1. 创建skill目录
mkdir -p ~/.openclaw/skills/project-init

# 2. 创建skill.md
cat > ~/.openclaw/skills/project-init/skill.md << 'EOF'
# Project Init Skill

## 触发条件
当需要启动一个新项目时使用。

## 输入
- 项目名称
- 项目类型（web-app / api / fullstack / static）
- 技术栈偏好（可选）

## 执行步骤

### 1. 创建项目目录
```bash
mkdir -p /Users/yuan/.openclaw/workspace-main/projects/{project_name}
cd /Users/yuan/.openclaw/workspace-main/projects/{project_name}
```

### 2. 根据项目类型初始化
- **web-app**: `npm create vite@latest . -- --template react-ts`
- **api**: 创建 Express/Fastify 骨架
- **fullstack**: 前后端分离目录 `client/` + `server/`
- **static**: 纯HTML/CSS/JS

### 3. 创建共享目录结构
```
projects/{project_name}/
├── docs/              # 所有文档（PRD、设计文档等）
│   ├── prd.md         # 产品需求文档
│   ├── tech-design.md # 技术设计文档
│   └── api-spec.md    # API规范
├── design/            # 设计产物
├── src/               # 源代码
├── tests/             # 测试
└── .project-meta.json # 项目元信息（状态、分工等）
```

### 4. 创建 .project-meta.json
```json
{
  "name": "{project_name}",
  "type": "{project_type}",
  "created": "{timestamp}",
  "status": "initialized",
  "phases": [
    {"name": "requirement", "status": "pending"},
    {"name": "design", "status": "pending"},
    {"name": "development", "status": "pending"},
    {"name": "testing", "status": "pending"},
    {"name": "delivery", "status": "pending"}
  ]
}
```

## 输出
- 已初始化的项目目录
- .project-meta.json 文件
- 确认消息
EOF
```

---

## 5. L2 角色层：Agent定义与生成

### 每个Agent的构成

一个Agent在OpenClaw中由以下文件定义：

```
~/.openclaw/workspace-{agentId}/
├── AGENTS.md           # 角色定义：身份、职责、行为规则
├── TOOLS.md            # 该agent的工具使用备注
├── skills/             # 私有skills
│   └── {skill-name}/
│       └── skill.md
└── memory/             # 持久化记忆
    └── *.md
```

### 7个角色的AGENTS.md（完整定义）

#### PM (项目经理)

```markdown
# AGENTS.md — PM Agent

你是项目经理(PM)，负责项目全局协调。

## 身份
- 角色：项目经理
- 汇报对象：Orchestrator (main agent)
- 协作对象：所有团队成员

## 核心职责
1. 接收项目需求，分解为可执行的任务列表
2. 制定项目计划和里程碑
3. 协调各角色的工作顺序和依赖关系
4. 跟踪进度，识别阻塞，调整计划
5. 汇总各阶段产物，向Orchestrator报告

## 工作流程
1. 收到项目brief → 输出初步任务分解（写入 docs/task-breakdown.md）
2. 协调 Researcher 做市场调研 → 等待调研报告
3. 基于调研结果，指导 Product 写PRD
4. PRD确认后，协调 Designer → Frontend → Backend 的流水线
5. 开发完成后，触发 Tester 测试
6. 全部通过后，汇总交付物

## 输出格式
- 任务分解：docs/task-breakdown.md
- 进度报告：docs/progress-{date}.md
- 状态更新：更新 .project-meta.json

## 约束
- 不直接写代码或做设计
- 所有决策记录在docs/中
- 遇到阻塞立即上报Orchestrator
```

#### Researcher (市场调研)

```markdown
# AGENTS.md — Researcher Agent

你是市场调研专员。

## 核心职责
1. 根据PM的调研任务，收集市场信息
2. 分析竞品（功能、定价、用户评价）
3. 识别目标用户画像和需求痛点
4. 输出调研报告

## 工具使用
- 主要使用 web_search 和 web_fetch
- 需要深度分析时使用 browser tool

## 输出
- docs/market-research.md — 完整调研报告
- 包含：市场规模、竞品对比表、用户画像、机会点

## 约束
- 信息必须标注来源URL
- 数据优先用2025-2026年的
- 不编造数据
```

#### Product (产品经理)

```markdown
# AGENTS.md — Product Agent

你是产品经理，负责将需求转化为产品设计。

## 核心职责
1. 基于调研报告，定义产品范围和核心功能
2. 编写PRD（产品需求文档）
3. 定义用户故事和验收标准
4. 设计信息架构和页面流程

## 输入
- docs/market-research.md（来自Researcher）
- PM的任务说明

## 输出
- docs/prd.md — 产品需求文档，包含：
  - 产品目标
  - 核心功能列表（P0/P1/P2优先级）
  - 用户故事（As a... I want... So that...）
  - 页面列表和流程图（文字描述）
  - 验收标准

## 约束
- P0功能不超过5个（MVP原则）
- 每个功能必须有明确的验收标准
```

#### Designer (设计师)

```markdown
# AGENTS.md — Designer Agent

你是UI/UX设计师。

## 核心职责
1. 基于PRD设计页面布局
2. 定义设计规范（颜色、字体、间距）
3. 输出可直接用于开发的组件描述

## 输入
- docs/prd.md

## 输出
- design/design-system.md — 设计规范
- design/pages/ — 每个页面的布局描述（结构化Markdown）
- 如果条件允许，直接输出Tailwind CSS组件代码

## 工具使用
- 可以用 exec 运行设计工具生成图片
- 可以用 browser 查找参考设计

## 约束
- 优先使用已有组件库（shadcn/ui, Tailwind）
- 移动端优先设计
```

#### Frontend (前端开发)

```markdown
# AGENTS.md — Frontend Agent

你是前端开发工程师。

## 核心职责
1. 基于设计文档实现前端页面
2. 实现页面交互逻辑
3. 对接后端API

## 技术栈
- React 18+ / TypeScript
- Tailwind CSS
- Vite构建

## 输入
- design/ 目录的设计文档
- docs/api-spec.md（来自Backend）

## 输出
- src/client/ 或 src/ 目录下的前端代码
- 可运行的前端项目

## 工具使用
- exec: npm install, npm run dev, 等
- write/edit: 写代码
- browser: 验证页面效果

## 约束
- 组件必须TypeScript类型安全
- 每个页面一个独立组件文件
- API调用统一封装在 api/ 目录
```

#### Backend (后端开发)

```markdown
# AGENTS.md — Backend Agent

你是后端开发工程师。

## 核心职责
1. 设计API架构
2. 实现API端点
3. 设计数据模型
4. 编写API文档

## 技术栈
- Node.js / TypeScript
- Express 或 Fastify
- SQLite（原型期）/ PostgreSQL（生产）

## 输入
- docs/prd.md
- docs/tech-design.md

## 输出
- src/server/ 目录下的后端代码
- docs/api-spec.md — OpenAPI格式的API文档
- 数据库schema

## 约束
- API遵循RESTful规范
- 所有端点必须有输入验证
- 错误处理标准化
```

#### Tester (测试工程师)

```markdown
# AGENTS.md — Tester Agent

你是测试工程师。

## 核心职责
1. 根据PRD的验收标准编写测试用例
2. 编写自动化测试
3. 执行测试并报告结果
4. 发现bug时记录到 docs/bugs.md

## 输入
- docs/prd.md（验收标准）
- src/ 目录下的代码

## 输出
- tests/ 目录下的测试代码
- docs/test-report.md — 测试报告
- docs/bugs.md — Bug列表

## 工具使用
- exec: 运行测试 (vitest, playwright等)
- browser: E2E测试验证

## 约束
- 核心功能100%覆盖
- Bug必须包含：复现步骤、期望行为、实际行为
```

### Agent Factory：生成Agent配置的流程

"用AI造AI"的实际实现方式：

**不是动态运行时生成Agent**，而是**一次性生成配置文件后，Agent就固定运行**。

具体流程：

```
用户输入项目需求
    │
    ▼
Orchestrator (main agent) 分析需求
    │
    ▼
判断需要哪些角色（可能不总是7个，简单项目可能只要3-4个）
    │
    ▼
对每个角色：
    ├── 读取角色模板（上面定义的AGENTS.md模板）
    ├── 根据项目具体需求调整（比如技术栈从React改为Vue）
    ├── 写入对应workspace
    └── 确保openclaw.json中已注册该agent
    │
    ▼
生成项目目录结构（调用 project-init skill）
    │
    ▼
启动协作流程
```

**这就是Agent Factory的全部。** 没有什么神秘的元编程或自进化——就是模板+定制。

---

## 6. L3 协作层：多Agent编排

### 编排方式：不需要额外框架

OpenClaw的 `sessions_spawn` 和 `sessions_send` 已经提供了完整的编排能力。编排逻辑写在Orchestrator（main agent）的AGENTS.md中。

### 协作模型

```
                    ┌─────────────┐
                    │ Orchestrator│ (main agent, Opus)
                    │  接收需求    │
                    │  分解任务    │
                    │  协调流程    │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    sessions_spawn   sessions_spawn   sessions_spawn
          │                │                │
          ▼                ▼                ▼
     ┌────────┐      ┌────────┐      ┌────────┐
     │  PM    │      │Research│      │  ...   │
     │(子agent)│      │(子agent)│      │        │
     └────┬───┘      └────┬───┘      └────────┘
          │                │
          │   写文件到      │  写文件到
          │   project/docs/ │  project/docs/
          ▼                ▼
    ┌─────────────────────────────────┐
    │  共享文件系统 (project/ 目录)    │
    │  - docs/prd.md                  │
    │  - docs/market-research.md      │
    │  - src/                         │
    │  - .project-meta.json           │
    └─────────────────────────────────┘
```

### 具体编排流程（产品开发场景）

Orchestrator的执行逻辑（写在main agent的AGENTS.md中的协作规则）：

```
## 产品开发协作流程

当收到"开发产品X"的指令时：

### Phase 1: 需求分析（串行）
1. spawn PM agent → 输入：项目brief → 输出：task-breakdown.md
2. spawn Researcher agent → 输入：PM的调研任务 → 输出：market-research.md
3. spawn Product agent → 输入：调研报告 + brief → 输出：prd.md

### Phase 2: 设计（串行）
4. spawn Designer agent → 输入：prd.md → 输出：design/

### Phase 3: 开发（可并行）
5. spawn Backend agent → 输入：prd.md → 输出：src/server/ + api-spec.md
6. spawn Frontend agent → 输入：design/ + api-spec.md → 输出：src/client/
   （Backend和Frontend可以并行，Frontend先用mock数据，Backend输出api-spec后Frontend再对接）

### Phase 4: 测试（串行）
7. spawn Tester agent → 输入：prd.md + src/ → 输出：test-report.md

### Phase 5: 迭代
8. 如果test-report有bug → 回到Phase 3修复
9. 最多迭代3轮

### 每个Phase的完成判定
- 子agent完成后，Orchestrator读取输出文件
- 检查输出是否符合预期格式
- 符合则进入下一Phase，不符合则要求子agent修正
```

### Agent间通信的两种方式

| 方式 | 机制 | 适用场景 |
|------|------|---------|
| **文件传递** | Agent A写文件到project/，Agent B读取 | 产物传递（PRD、代码、设计文档） |
| **sessions_send** | Agent间直接消息 | 实时协调（"API接口改了，你更新一下"） |

**推荐以文件传递为主。** 原因：
- 产物可追溯、可审查
- 不依赖Agent同时在线
- Orchestrator可以在中间检查质量

### Reflect迭代机制

口袋AIGC提到的"Reflect"就是：

```
Agent输出产物 → Orchestrator（或另一个Agent）Review → 反馈修改意见 → Agent修正 → 再Review
```

实现方式：Orchestrator在每个Phase完成后，自己review产物质量（或spawn一个review子agent），不合格则发反馈给原Agent要求修改。

这不需要特殊框架，就是Orchestrator的判断逻辑 + sessions_spawn的重复调用。

---

## 7. L4 应用层

### 7.1 产品开发团队

**输入：** 一句话需求描述，如"做一个宠物社区App"

**输出：** 可运行的项目代码 + 完整文档

**实际操作方式：**

Yuan在Telegram对main agent说：
> "启动产品开发：做一个宠物社区App，核心功能是宠物照片分享和附近宠物主人社交"

main agent执行：
1. 调用project-init skill创建项目目录
2. 按Phase 1-5顺序spawn各Agent
3. 每个Phase完成后在Telegram通知Yuan进度
4. 遇到需要人工决策的点（如技术栈选择）主动询问Yuan
5. 全部完成后汇总报告

**实际耗时估计：**
- Phase 1（需求）：30-60分钟
- Phase 2（设计）：20-40分钟
- Phase 3（开发）：2-4小时
- Phase 4（测试）：30-60分钟
- 总计：4-7小时（不含人工review时间）

"半天出Demo"是合理的，但仅限于前端为主的项目，且是Demo级别不是生产级别。

### 7.2 AI运营接单

**这是高风险、高复杂度的应用，建议作为中期目标。**

架构：

```
┌──────────────────────────────────────┐
│  Ops Agent (运营Agent)                │
│                                      │
│  1. 平台监控                          │
│     - browser tool 定时访问猪八戒等    │
│     - 筛选匹配的需求（关键词+预算）    │
│                                      │
│  2. 投标/报价                         │
│     - 根据需求生成报价方案             │
│     - ⚠️ 必须人工审核后才能提交        │
│                                      │
│  3. 需求确认                          │
│     - 客户沟通（半自动，关键回复人审）  │
│                                      │
│  4. 交付                              │
│     - 触发产品开发团队流程             │
│     - 交付物人工审核后提交             │
└──────────────────────────────────────┘
```

**关键限制：**
- 猪八戒等平台有反爬/反自动化机制，账号可能被封
- 客户沟通质量直接影响接单成功率，纯AI沟通风险大
- 交付质量必须人工把关

**建议的落地方式：**
- Phase 1：半自动 — Agent找需求并推送给Yuan，Yuan决定是否投标
- Phase 2：人审自动 — Agent生成报价方案，Yuan一键审核提交
- Phase 3：不建议完全自动 — 始终保留人工审核环节

---

## 8. L5 管理层：Dashboard UI

### 方案选择

| 方案 | 复杂度 | 适用阶段 |
|------|--------|---------|
| **Telegram通知** | 零开发 | 立即可用 |
| **Canvas呈现** | 低 | 短期 |
| **独立Web Dashboard** | 高 | 中期 |

### 短期方案：Telegram + Canvas

不需要开发独立的Dashboard。利用现有能力：

1. **Telegram通知**：每个Phase完成后自动推送进度
2. **Canvas**：需要查看详细状态时，用canvas tool渲染一个状态页面

Canvas实现示例：
```javascript
// Orchestrator可以调用canvas呈现项目状态
canvas.present({
  url: "data:text/html,<html>...",  // 动态生成的状态页面
  // 或者渲染一个本地HTML文件
})
```

### 中期方案：本地Web Dashboard

如果需要更丰富的管理界面，可以让Frontend Agent开发一个简单的Dashboard：
- 读取各项目的 `.project-meta.json` 展示状态
- 读取日志文件展示Agent活动
- 展示token消耗统计

这个Dashboard本身就可以作为"AI员工工厂"的第一个产品来开发。

---

## 9. 安全边界与治理

### Agent权限控制

```json5
// 在openclaw.json中为每个agent设置工具权限
{
  agents: {
    list: [
      {
        id: "researcher",
        tools: {
          allow: ["web_search", "web_fetch", "read", "write"],
          deny: ["exec", "browser"]  // 调研agent不需要执行命令
        }
      },
      {
        id: "frontend",
        tools: {
          allow: ["exec", "read", "write", "edit", "browser"],
          deny: ["message", "nodes"]  // 开发agent不需要发消息
        },
        sandbox: {
          mode: "all",  // 所有exec在sandbox中运行
          scope: "agent"
        }
      }
    ]
  }
}
```

### "自进化"的边界

口袋AIGC提到的agent自进化，实际边界必须明确：

| 允许 | 禁止 |
|------|------|
| Agent更新自己workspace的memory/文件 | Agent修改自己的AGENTS.md |
| Agent在项目目录内自由创建文件 | Agent修改openclaw.json |
| Agent提出改进建议（写入建议文件） | Agent自动安装全局npm包 |
| Orchestrator调整任务分配 | 任何Agent修改其他Agent的workspace |

**核心原则：Agent可以在自己的沙箱内自由操作，但不能修改自己的"宪法"（AGENTS.md和系统配置）。**

### 人工审核点

在整个流程中，以下节点必须人工介入：

1. **项目启动前** — Yuan确认需求理解正确
2. **PRD完成后** — Yuan review产品方向
3. **开发完成后** — Yuan验收Demo
4. **对外提交前** — 任何对外发布/提交必须Yuan审核

---

## 10. 成本估算

### Token消耗模型

| 阶段 | Agent | 估计token（输入+输出） | 模型 | 成本(USD) |
|------|-------|----------------------|------|----------|
| 需求分析 | PM | ~20K | Opus | $0.60 |
| 市场调研 | Researcher | ~50K | Sonnet | $0.45 |
| PRD | Product | ~30K | Opus | $0.90 |
| 设计 | Designer | ~25K | Sonnet | $0.23 |
| 后端开发 | Backend | ~80K | Opus | $2.40 |
| 前端开发 | Frontend | ~100K | Opus | $3.00 |
| 测试 | Tester | ~40K | Sonnet | $0.36 |
| 编排协调 | Orchestrator | ~30K | Opus | $0.90 |
| **合计** | | **~375K** | | **~$8.84** |

> 按 Opus: $15/M input + $75/M output (估计平均$30/M)，Sonnet: $3/M input + $15/M output (估计平均$9/M)
> 
> 实际成本取决于项目复杂度，简单项目可能$3-5，复杂项目可能$15-25

### 月度运营成本（假设每周做2-3个项目）

| 项目 | 月成本 |
|------|--------|
| Claude API（~10个项目/月） | $80-250 |
| Mac mini电费 | ~$5 |
| 网络 | 已有 |
| **总计** | **$85-255/月** |

这个成本非常合理。如果能通过AI运营接单覆盖成本，就是正循环。

---

## 11. 落地路线图

### Phase 1：基础搭建（1-2天）

- [ ] 配置openclaw.json多Agent
- [ ] 创建7个Agent的workspace和AGENTS.md
- [ ] 创建全局共享Skills（project-init等）
- [ ] 测试sessions_spawn和文件传递

### Phase 2：单Agent验证（3-5天）

- [ ] 单独测试每个Agent能否完成其职责
- [ ] 调优AGENTS.md（会需要多轮迭代）
- [ ] 确定哪些任务用Opus、哪些用Sonnet

### Phase 3：团队协作验证（1周）

- [ ] 用一个简单项目跑完整流程（比如"做一个todo app"）
- [ ] 发现瓶颈并修正（最大的瓶颈通常是Agent间的产物格式不匹配）
- [ ] 优化Orchestrator的编排逻辑

### Phase 4：实战项目（第2-3周）

- [ ] 用一个真实需求跑流程
- [ ] 记录所有人工介入点
- [ ] 计算实际token消耗

### Phase 5：AI运营探索（第4周+）

- [ ] 创建Ops Agent
- [ ] 半自动模式：Agent找需求，人工决策
- [ ] 逐步提高自动化程度

---

## 12. 之前分析冲突点的统一解答

### 冲突1："不需要额外框架" vs "需要编排层"

**统一回答：不需要额外框架，OpenClaw本身就是编排层。**

OpenClaw的sessions_spawn、sessions_send、agent-to-agent通信组合起来，就是一个完整的编排系统。编排逻辑写在Orchestrator的AGENTS.md中，由Claude执行。不需要LangChain、CrewAI或任何外部框架。

如果未来需要更复杂的编排（如跨机器的Agent协作），可以用A2A Protocol，但这是中长期目标。

### 冲突2：Skill框架到底是什么

**统一回答：Skill就是 `skills/` 目录下的结构化指令文件。**

- 物理形态：一个目录，包含 `skill.md`（指令）+ 可选的脚本/模板文件
- 存放位置：`~/.openclaw/skills/`（全局）或 `workspace/skills/`（agent私有）
- 不是JSON注册表，不是API框架，不是独立服务
- 之前提到的"skill-registry.json"是错误的——OpenClaw用目录结构自动发现Skills，不需要注册文件

### 冲突3：团队生成是动态生成AGENTS.md还是模板+定制

**统一回答：模板+定制，一次性生成，不是动态的。**

- 预先准备好7个角色的AGENTS.md模板（本文档已给出）
- 启动项目时，Orchestrator根据项目需求微调模板（如改技术栈）
- 写入对应workspace后，Agent配置就固定了
- 不会在运行时动态修改Agent定义

---

## 总结

这份方案的核心思想是：**用OpenClaw的原生能力做一切，不引入额外复杂度。**

- **编排** = OpenClaw的sessions_spawn + AGENTS.md中的流程定义
- **能力** = Skills目录 + OpenClaw内置Tools
- **通信** = 文件系统 + sessions_send
- **管理** = Telegram通知 + Canvas（短期）/ Web Dashboard（中期）

口袋AIGC展示的效果，80%可以用这个方案复现。剩下的20%是营销包装和特殊场景（如全自动接单的稳定性）。

**下一步行动：** 如果Yuan同意这个方案，我可以立即开始Phase 1的配置工作。
