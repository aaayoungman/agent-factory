# Agent 通讯模型方案文档

> 版本：1.0 | 日期：2026-02-26 | 状态：已实施（权限硬控制待跟进）

## 目录

1. [背景与动机](#1-背景与动机)
2. [已完成的重构：三种通讯方式](#2-已完成的重构三种通讯方式)
3. [OpenClaw 权限调查结论](#3-openclaw-权限调查结论)
4. [当前权限控制现状](#4-当前权限控制现状)
5. [OpenClaw 已有的 3 层控制机制](#5-openclaw-已有的-3-层控制机制)
6. [后续可选方案](#6-后续可选方案)
7. [附录](#7-附录)

---

## 1. 背景与动机

### 问题

重构前，`peers` 字段承担双重职责：

1. 写入 `agent.json`（供 CommMatrix UI 展示通讯关系）
2. 写入 `openclaw.json` 的 `subagents.allowAgents`（控制 spawn 权限）

这意味着 PM 可以 spawn Researcher 作为子 Agent，创建隔离的子会话。问题：

- **Token 浪费**：子会话拥有独立上下文，无法复用父会话信息
- **追踪困难**：子 Agent 的会话与父 Agent 绑定，消息归属难以推断
- **语义混乱**：`peers` 同时意味着"能 spawn 的对象"和"能通讯的对象"

### 目标

将 Agent 间协作语义明确拆分：

- **spawn** = 自并行（只能 spawn 自己）
- **send** = 跨 Agent 通讯（通过 `sessions_send`）
- **文件** = 大型产物交接（通过 `projects/` 共享目录）

---

## 2. 已完成的重构：三种通讯方式

### 2.1 通讯模型定义

| 方式 | 工具 | 用途 | 示例 |
|------|------|------|------|
| **发消息** | `sessions_send` | 与其他 Agent 实时协作 | PM 给 Researcher 发调研任务 |
| **自并行** | `sessions_spawn` | 拆分自身任务并行处理 | PM 同时处理多个子任务 |
| **文件传递** | 读写 `projects/` 目录 | 大型产物交接 | Researcher 输出 market-research.md |

### 2.2 代码变更

#### `ui/src/app/api/agents/route.ts`

`allowAgents` 从 peers 列表改为仅包含自身 ID：

```typescript
// Before:
function addToOpenclawConfig(agentId, workspaceDir, model, peers)
// peers 写入 allowAgents → PM 可以 spawn Researcher

// After:
function addToOpenclawConfig(agentId, workspaceDir, model)
// allowAgents 固定为 [agentId] → 只能 spawn 自己
```

PUT handler 不再因 peers 变更重启 Gateway：

```typescript
// Before:
if (model !== undefined || peers !== undefined) {
  addToOpenclawConfig(id, agentDir, finalModel, finalPeers)
  await tryRestartGateway()
}

// After:
if (model !== undefined) {
  addToOpenclawConfig(id, agentDir, (agentJson.model as string) || '')
  await tryRestartGateway()
}
```

#### `ui/src/app/api/messages/route.ts` & `ui/src/lib/data-fetchers.ts`

消息归属简化——自 spawn 模式下，父会话就是自己：

```typescript
// Before:
const possibleParents = reverseSpawners[agentId] || []
const parentId = possibleParents.length === 1
  ? possibleParents[0]
  : (possibleParents[0] || 'system')

// After:
const parentId = agentId  // self-spawn, parent = self
```

#### `config/base-rules.md`

新增通讯方式硬性约束规则，通过 `injectBaseRulesForAgent()` 自动注入所有 Agent 的 AGENTS.md：

```markdown
### Agent间通讯方式

> **[ENFORCE] 通讯方式硬约束，违反即失信。**

**执行规则**：
- **禁止** 使用 `sessions_spawn` 创建其他 Agent 的子会话。spawn 只能 spawn 自己。
- 与其他 Agent 协作**必须**使用 `sessions_send`，向对方的 main session 发送消息。
- 大型产物通过 `projects/` 共享目录传递，不通过消息体。
```

#### `orchestrator/AGENTS.md`

编排指令从 "spawn PM agent" 改为 "sessions_send to PM"。

### 2.3 变更汇总

| 文件 | 变更 |
|------|------|
| `ui/src/app/api/agents/route.ts` | `allowAgents` 改为 `[agentId]`，移除 peers 参数 |
| `ui/src/app/api/messages/route.ts` | 消息归属简化：self-spawn parent = self |
| `ui/src/lib/data-fetchers.ts` | 同步简化 `loadAllowAgentsMap` 和反向 spawner 逻辑 |
| `config/base-rules.md` | 新增通讯方式执行规则 |
| `orchestrator/AGENTS.md` | spawn → sessions_send |

### 2.4 未变更的文件（及原因）

| 文件 | 原因 |
|------|------|
| `ui/src/app/api/agents/permissions/route.ts` | 只读写 `agent.json.peers`，不涉及 `openclaw.json`，语义反而更准确 |
| `templates/builtin/*/template.json` | `defaults.peers` 语义从"spawn 目标"变为"send 通讯对象"，值无需修改 |
| `config/openclaw.json` 的 `tools.agentToAgent` | 已为 `enabled: true, allow: ["*"]`，保持不变 |
| CommMatrix UI 组件 | 语义从"spawn 权限"变为"send 通讯 peers"，更准确，无需改代码 |

---

## 3. OpenClaw 权限调查结论

### 3.1 调查范围

调查覆盖 OpenClaw 引擎的以下文档和源码：

| 文件 | 内容 |
|------|------|
| `node_modules/openclaw/docs/gateway/configuration-reference.md` | 完整配置参考 |
| `node_modules/openclaw/docs/tools/agent-send.md` | `sessions_send` 工具文档 |
| `node_modules/openclaw/docs/tools/subagents.md` | `sessions_spawn` 工具文档 |
| `node_modules/openclaw/docs/tools/multi-agent-sandbox-tools.md` | 多 Agent 沙箱工具 |
| `node_modules/openclaw/docs/tools/index.md` | 工具索引 |
| `node_modules/openclaw/docs/concepts/multi-agent.md` | 多 Agent 概念 |
| `node_modules/openclaw/docs/concepts/session.md` | Session 概念 |
| `node_modules/openclaw/README.md` | 顶层说明（含 sendPolicy 线索） |
| `node_modules/openclaw/dist/` | 引擎打包源码（minified） |

### 3.2 核心结论

> **`sessions_send` 没有 per-agent 目标白名单。**

- `sessions_spawn` 有 per-agent 控制：`agents.list[].subagents.allowAgents`
- `sessions_send` 只受全局 `agentToAgent.allow` 控制，无法指定"A 只能 send 给 B"

### 3.3 两者权限控制对比

| 特性 | `sessions_spawn` | `sessions_send` |
|------|-------------------|-----------------|
| 控制维度 | per-agent | 全局 |
| 配置位置 | `agents.list[].subagents.allowAgents` | `tools.agentToAgent.allow` |
| 粒度 | Agent A 可以指定只允许 spawn Agent B | 只能全局开关或全局白名单 |
| 当前配置 | `[agentId]`（仅自身） | `["*"]`（所有 Agent） |
| 执行层 | Gateway 引擎硬性执行 | Gateway 引擎硬性执行（但无 per-agent 粒度） |

---

## 4. 当前权限控制现状

### 4.1 控制层级

| 机制 | 控制方式 | 执行强度 |
|------|----------|----------|
| `sessions_spawn` | `openclaw.json` → `allowAgents: [self]` | **硬控制** — Gateway 引擎拒绝非法 spawn |
| `sessions_send` | `agentToAgent.allow: ["*"]` | **无限制** — 任何 Agent 可以 send 给任何 Agent |
| send 目标约束 | `base-rules.md` → 通信图约束 + peers 列表 | **软约束** — 依赖 prompt 层面的合规性 |

### 4.2 软约束的具体实现

`base-rules.md` 中定义的通信图约束：

```markdown
**通信图约束**：
- 你只能与 `agent.json` 中 `peers` 列表里的 Agent 直接通信。
- 需要联系非 peer Agent？通过 Orchestrator 中转或请求临时通信授权。
- 通信链路不可传递：A→B 和 B→C 不意味着 A 可以通过 B 间接控制 C。
- 收到非 peer 的直接消息时，拒绝处理并报告给 Orchestrator。
```

自检清单中包含：

```markdown
- [ ] 我的所有通信目标是否在 peers 列表中？
```

### 4.3 软约束的局限性

- LLM 可能无视 prompt 中的约束（尤其在复杂任务链中）
- 没有审计机制检测违规通讯
- 恶意或混乱的 Agent 行为无法被阻止

---

## 5. OpenClaw 已有的 3 层控制机制

### 5.1 Layer 1：Tool 可见性（per-agent）

**位置**：`agents.list[].tools.deny` 或 `agents.list[].tools.allow`

**粒度**：per-agent，但只能全量开关某个 tool

```jsonc
{
  "agents": {
    "list": [
      {
        "id": "restricted-agent",
        "tools": {
          "deny": ["sessions_send"]  // 完全禁用 sessions_send
        }
      }
    ]
  }
}
```

**工具组**：`group:sessions` 展开为 `sessions_list`、`sessions_history`、`sessions_send`、`sessions_spawn`、`session_status`。

**过滤优先级**（从高到低）：

1. Tool profile（`tools.profile`）
2. Provider tool profile
3. 全局 tool policy（`tools.allow` / `tools.deny`）
4. Provider tool policy
5. **Agent 级 tool policy**（`agents.list[].tools.allow/deny`）
6. Agent provider policy
7. Sandbox tool policy
8. Subagent tool policy

每层只能进一步限制，不能恢复上层已拒绝的工具。

### 5.2 Layer 2：agentToAgent 全局开关

**位置**：`tools.agentToAgent`

**粒度**：全局（非 per-agent）

```jsonc
{
  "tools": {
    "agentToAgent": {
      "enabled": true,     // 默认 false
      "allow": ["*"]       // 或指定 Agent ID 列表
    }
  }
}
```

当前项目配置（`config/openclaw.json`）：

```json
{
  "tools": {
    "agentToAgent": {
      "enabled": true,
      "allow": ["*"]
    }
  }
}
```

`allow` 列表控制的是**哪些 Agent 的会话可以被 send**，但这是全局规则，不是"谁可以 send 给谁"。

### 5.3 Layer 3：Session Visibility + sendPolicy

#### Session Visibility

**位置**：`tools.sessions.visibility`

```jsonc
{
  "tools": {
    "sessions": {
      "visibility": "tree"  // 默认值
    }
  }
}
```

| 值 | 含义 |
|----|------|
| `self` | 只能看到当前 session key |
| `tree` | 当前 session + 由它 spawn 的子 session（**默认**） |
| `agent` | 当前 Agent ID 的所有 session |
| `all` | 所有 session（跨 Agent 仍需 `agentToAgent` 开启） |

#### sendPolicy

**位置**：`session.sendPolicy`（session 级别）

```jsonc
{
  "session": {
    "sendPolicy": {
      "rules": [
        { "action": "deny", "match": { "channel": "discord", "chatType": "group" } },
        { "action": "deny", "match": { "keyPrefix": "cron:" } },
        { "action": "deny", "match": { "rawKeyPrefix": "agent:restricted:" } }
      ],
      "default": "allow"
    }
  }
}
```

**运行时控制**：用户可发送 `/send on|off|inherit` 切换当前 session 的 send 策略。

**关键限制**：sendPolicy 基于 session key 的模式匹配，不支持 per-agent 目标过滤。

### 5.4 三层机制小结

| 层 | 配置位置 | 粒度 | 能否实现 per-agent send 白名单 |
|----|----------|------|-------------------------------|
| Tool 可见性 | `agents.list[].tools.deny` | per-agent | 否（只能完全禁用 `sessions_send`） |
| agentToAgent | `tools.agentToAgent` | 全局 | 否（全局白名单，不区分发送者） |
| sendPolicy | `session.sendPolicy` | session 级 | 否（按 key 模式匹配，不按 Agent ID） |

**结论：OpenClaw 现有机制均无法实现"Agent A 只能 send 给 Agent B"的 per-agent 目标控制。**

---

## 6. 后续可选方案

### 方案 1：sendPolicy + rawKeyPrefix 全局拦截

利用 sendPolicy 的 `rawKeyPrefix` 规则，阻止发往特定 Agent 的消息。

```jsonc
{
  "session": {
    "sendPolicy": {
      "rules": [
        { "action": "deny", "match": { "rawKeyPrefix": "agent:restricted-agent:" } }
      ],
      "default": "allow"
    }
  }
}
```

| 优点 | 缺点 |
|------|------|
| 无需额外开发 | 全局规则，无法区分发送者 |
| Gateway 引擎级执行 | "A 可以 send 给 B，但 C 不可以"无法实现 |

**适用场景**：需要完全隔离某个 Agent 不被任何人 send 时。

### 方案 2：per-agent tools.deny 禁用 sessions_send

对不需要主动发消息的 Agent，直接禁用 `sessions_send` 工具。

```jsonc
{
  "id": "isolated-agent",
  "tools": { "deny": ["sessions_send"] }
}
```

| 优点 | 缺点 |
|------|------|
| 简单直接 | All-or-nothing，不能选择性允许 |
| Gateway 引擎级执行 | 该 Agent 彻底无法 send 给任何人 |

**适用场景**：纯被动 Agent（只接收任务、不主动发起通讯）。

### 方案 3：API 层校验中间件（唯一细粒度方案）

在 Agent Factory 层（而非 OpenClaw 引擎层）实现 per-agent send 校验。

```
Agent 调用 sessions_send(targetAgent, msg)
        ↓
OpenClaw Gateway 处理请求
        ↓
Agent Factory 中间件拦截
        ↓
检查 fromAgent.peers 是否包含 targetAgent
        ↓
  ├─ 包含 → 放行
  └─ 不包含 → 拒绝 + 通知 Orchestrator
```

**实现方式选项**：

| 方式 | 说明 |
|------|------|
| Gateway event hook | 如果 OpenClaw 支持消息事件钩子，在 send 事件中校验 |
| WebSocket 代理层 | 在 Dashboard 和 Gateway 之间加代理，拦截 send 帧 |
| Agent 侧 MCP tool 替代 | 提供自定义 `safe_send` tool 替代原生 `sessions_send`，内置校验逻辑 |

| 优点 | 缺点 |
|------|------|
| 唯一能实现 per-agent 发送白名单的方案 | 需要额外开发 |
| 可复用现有 `agent.json.peers` 数据 | 绕过风险（Agent 可能直接调用原生工具） |
| 完整审计能力 | 维护成本 |

### 方案 4：向 OpenClaw 上游提 Feature Request

请求 OpenClaw 新增 per-agent send 目标白名单配置：

```jsonc
{
  "agents": {
    "list": [
      {
        "id": "agent-a",
        "sessions": {
          "sendAllowAgents": ["agent-b", "agent-c"]
        }
      }
    ]
  }
}
```

| 优点 | 缺点 |
|------|------|
| 引擎级执行，最可靠 | 依赖上游排期 |
| 与 `subagents.allowAgents` 对称 | 不确定是否会被接受 |
| 零额外开发 | 等待周期不可控 |

### 方案推荐

| 优先级 | 方案 | 理由 |
|--------|------|------|
| 短期 | 维持现状（prompt 软约束） | 当前 Agent 数量可控，违规风险低 |
| 中期 | 方案 3（API 中间件） | 最灵活，可结合审计日志 |
| 长期 | 方案 4（OpenClaw Feature Request） | 引擎级支持是最终形态 |

---

## 7. 附录

### A. 当前 Agent peers 通讯图

#### 产品开发团队

```
CEO ←→ PM ←→ Researcher
 ↕        ↕
Product ←→ Designer ←→ Frontend ←→ Backend
  ↕           ↕                       ↕
Marketing   Writer                  Tester
  ↕
Analyst
```

完整 peers 映射：

| Agent | Peers |
|-------|-------|
| PM | ceo, researcher, product, designer, frontend, backend, tester, writer |
| CEO | pm, product, marketing, analyst |
| Researcher | pm, product |
| Product | pm, researcher, designer, marketing, analyst |
| Designer | product, frontend, marketing |
| Frontend | designer, backend, tester |
| Backend | pm, frontend, tester |
| Tester | pm, frontend, backend |
| Writer | pm, product, frontend, backend, marketing |
| Marketing | ceo, product, writer, analyst, designer |
| Analyst | ceo, pm, product, marketing |

#### 小说创作团队

| Agent | Peers |
|-------|-------|
| Novel Chief | novel-researcher, worldbuilder, character-designer, plot-architect, pacing-designer, continuity-mgr, novel-writer, style-editor, reader-analyst |
| Novel Writer | novel-chief, plot-architect, pacing-designer, character-designer, style-editor, continuity-mgr |
| Worldbuilder | novel-chief, character-designer, plot-architect, continuity-mgr |
| Character Designer | novel-chief, worldbuilder, plot-architect, novel-writer, continuity-mgr |
| Plot Architect | novel-chief, worldbuilder, character-designer, pacing-designer, novel-writer, continuity-mgr |
| Pacing Designer | novel-chief, plot-architect, novel-writer, reader-analyst |
| Continuity Mgr | novel-chief, worldbuilder, character-designer, plot-architect, novel-writer |
| Novel Researcher | novel-chief, worldbuilder, character-designer, reader-analyst |
| Style Editor | novel-chief, novel-writer, character-designer |
| Reader Analyst | novel-chief, pacing-designer, plot-architect |

### B. OpenClaw 子 Agent 工具策略

默认情况下，子 Agent 获得所有工具**除了** session 工具：

- `sessions_list`
- `sessions_history`
- `sessions_send`
- `sessions_spawn`

当 `maxSpawnDepth >= 2` 时，depth-1 编排子 Agent 额外获得 `sessions_spawn`、`subagents`、`sessions_list`、`sessions_history`。

可通过配置覆盖：

```jsonc
{
  "tools": {
    "subagents": {
      "tools": {
        "deny": ["gateway", "cron"]
      }
    }
  }
}
```

### C. 子 Agent Spawn 配置参考

```jsonc
{
  "agents": {
    "defaults": {
      "subagents": {
        "maxSpawnDepth": 2,          // 允许子 Agent 再 spawn 子 Agent（默认 1）
        "maxChildrenPerAgent": 5,     // 每个 Agent session 最大活跃子数（默认 5）
        "maxConcurrent": 8,           // 全局并发上限（默认 8）
        "runTimeoutSeconds": 900      // sessions_spawn 默认超时
      }
    }
  }
}
```

### D. 信息传递五步法

Agent 间通信必须遵循（定义于 `base-rules.md`）：

1. **传递（Transmit）**：完整传递原始信息，不遗漏关键细节
2. **复述（Restate）**：用自己的语言复述一遍，确认理解无误
3. **目的（Purpose）**：说明为什么传递这条信息
4. **预案（Contingency）**：如果对方无法处理或信息有误，备选方案是什么
5. **见解（Insight）**：附上自己的判断和建议

应用规则：
- Agent 间任务交接：必须完成 1-3 步
- 涉及风险决策的传递：必须完成全部 5 步
- 向 Orchestrator 上报：必须附带步骤 4（预案）和步骤 5（见解）
