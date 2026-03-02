# Async Messaging Design — Agent Factory

> 版本: 0.1.0 | 日期: 2026-02-27 | 状态: Draft

## 1. 概述

Agent Factory 的异步消息系统为多 Agent 协作提供跨 Agent 通信能力。当前基于 `peer-send` WebSocket 脚本 + OpenClaw Gateway 实现，支持同步等待回复和异步 fire-and-forget 两种模式。

### 设计目标

- **安全隔离**：Agent 只能与 `peers` 列表中的对等方通信
- **异步优先**：支持 `--no-wait` 模式，发送后立即返回
- **可审计**：所有消息经 Gateway 路由，可追踪
- **最小侵入**：不修改 OpenClaw 引擎，通过 operator 角色绕过 `visibility=agent` 限制

---

## 2. 当前架构

### 2.1 通信方式总览

| 方式 | 机制 | 场景 | 约束 |
|------|------|------|------|
| **Direct Messages** | `peer-send` + WebSocket | 实时 Agent 间协作 | 双方须在 `peers` 列表 |
| **Status Query** | `peer-status` 脚本 | 发送前检查可用性 | 仅查询已注册 Agent |
| **Subagent** | `sessions_send` | 向自己的子 Agent 发命令 | 只能操作自己 spawn 的 session |
| **Self-Spawn** | `sessions_spawn` | Agent 自并行 | 只能 spawn 自己 |
| **File Exchange** | 共享 `projects/` 目录 | 大型产物传递 | 无消息体大小限制 |

### 2.2 数据流

```
Agent A                    peer-send.mjs                  Gateway (WS:19100)              Agent B
  │                            │                               │                            │
  ├─ exec peer-send ──────────►│                               │                            │
  │   --to B --message "..."   │                               │                            │
  │                            ├── ws connect (operator) ─────►│                            │
  │                            │◄── hello-ok ──────────────────┤                            │
  │                            ├── chat.send ─────────────────►│                            │
  │                            │   sessionKey: agent:B:main    ├── deliver message ────────►│
  │                            │                               │◄── assistant response ─────┤
  │                            │◄── chat event (delta/final) ──┤                            │
  │◄── stdout (reply) ────────┤                               │                            │
```

### 2.3 安全模型

**三层防护**：

1. **引擎层**（硬约束）
   - `tools.sessions.visibility: "agent"` — 阻止 Agent 直接用 `sessions_send` 跨 Agent 通信
   - `subagents.allowAgents: [self]` — Agent 只能 spawn 自己

2. **脚本层**（中间层）
   - `peer-send.mjs` 以 operator 角色 + admin scopes 连接 Gateway
   - 发送前校验目标是否在发送方 `peers` 列表中

3. **接收端验证**（软约束，prompt 注入）
   - 收到 `[Inter-Agent Message from: {senderId}]` 消息时
   - 读取自身 `agent.json`，验证 `senderId` 在 `peers` 数组中
   - 不在则 BLOCK 并记录安全事件

---

## 3. 核心组件

### 3.1 `peer-send.mjs`

**路径**: `skills/peer-status/scripts/peer-send.mjs`

```bash
# 同步模式（等待回复）
node peer-send.mjs --from ceo --to pm --message "开始项目规划"

# 异步模式（fire-and-forget）
node peer-send.mjs --from ceo --to pm --message "开始项目规划" --no-wait

# 自定义超时
node peer-send.mjs --from ceo --to pm --message "..." --timeout 180
```

**异步模式输出**：
```json
{"ok": true, "sessionKey": "agent:pm:main", "idempotencyKey": "uuid-xxx"}
```

**同步模式输出**：直接返回对方回复文本到 stdout。

**异步消息头差异**：
- 同步：`[Inter-Agent Message from: ceo (CEO)]`
- 异步：`[Inter-Agent Message from: ceo (CEO)] [async — reply via peer-send]`

异步模式下消息头携带 `[async — reply via peer-send]` 标记，接收方据此判断需要通过 `peer-send` 主动回发结果，而非在 session 内回复（session 内回复无人监听）。

### 3.2 `peer-status.mjs`

**路径**: `skills/peer-status/scripts/peer-status.mjs`

```bash
node peer-status.mjs --agent-id ceo
```

**输出**：
```json
[
  {"id": "pm", "name": "Project Manager", "status": "busy", "updatedAt": "2026-02-27T10:30:00Z"},
  {"id": "researcher", "name": "Researcher", "status": "online", "updatedAt": null}
]
```

- **busy**: 最近 5 分钟内有 session 活动
- **online**: 已注册但无近期活动

### 3.3 WebSocket 协议帧

**连接帧**（operator 角色）：
```json
{
  "type": "req", "method": "connect",
  "params": {
    "minProtocol": 3, "maxProtocol": 3,
    "client": {"id": "peer-send", "mode": "backend", "version": "1.0.0"},
    "auth": {"token": "<AGENT_FACTORY_TOKEN>"},
    "role": "operator",
    "scopes": ["operator.admin", "operator.read", "operator.write"]
  }
}
```

**发送帧**：
```json
{
  "type": "req", "method": "chat.send",
  "params": {
    "sessionKey": "agent:{toId}:main",
    "message": "[Inter-Agent Message from: {fromId} ({senderName})]\n\n{message}",
    "idempotencyKey": "uuid"
  }
}
```

**响应事件**：
```json
{
  "type": "event", "event": "chat",
  "payload": {
    "runId": "idempotencyKey",
    "sessionKey": "agent:{toId}:main",
    "state": "delta|final|error|aborted",
    "message": {"role": "assistant", "content": [{"type": "text", "text": "..."}]}
  }
}
```

---

## 4. UI 消息中心

### 4.1 页面结构 (`ui/src/app/messages/page.tsx`)

| 区域 | 功能 |
|------|------|
| **Channel List** | 项目频道（按项目分组）+ 点对点频道 |
| **Agent Graph** | 拓扑可视化：实线=实际通信（宽度=消息量），虚线=配置的 peer 关系 |
| **Comm Matrix** | N×N 权限矩阵，一键切换 peer 关系 |
| **Timeline** | 选中频道的消息时间线 |

### 4.2 API 端点

```
GET  /api/messages                    # 消息列表（摘要）
GET  /api/messages?full=1             # 完整内容（截断 2000 字符）
GET  /api/messages?agents=a,b         # 按 Agent 对过滤
GET  /api/messages?projectId=xxx      # 按项目过滤

GET  /api/agents/permissions          # 当前 peer 关系矩阵
PUT  /api/agents/permissions          # 更新 peer 关系
     body: { permissions: { "agentId": ["peer1", "peer2"] } }
```

### 4.3 消息类型

| 类型 | 颜色 | 说明 |
|------|------|------|
| `spawn` | 蓝色 | 父 Agent 派发任务 |
| `send` | 绿色 | 子 Agent / peer 回复 |
| `complete` | 亮绿 | 任务完成标记 |
| `error` | 红色 | 错误消息 |
| `log` | 灰色 | 活动日志 |

### 4.4 通信矩阵预设

- **Pipeline**：线性链（CEO → PM → Researcher → ... → Tester）
- **Star**：PM 为中心，其他 Agent 均连接 PM
- **Full Mesh**：全连接
- **None**：清空所有连接

---

## 5. 已知局限与改进方向

### 5.1 当前局限

| 问题 | 说明 |
|------|------|
| **全局 allow** | `agentToAgent.allow: ["*"]` 是全局配置，无法按 Agent 细粒度控制 |
| **软约束依赖合规** | 接收端验证靠 prompt 注入，Agent 理论上可忽略 |
| **无消息持久化** | 消息存在 Gateway session 中，重启后丢失 |
| **无消息队列** | 目标 Agent 忙碌时，消息直接进入其 session，无排队机制 |

### 5.2 改进方向

#### 短期（v0.3）

1. **消息持久化**
   - 在 `projects/{projectId}/messages/` 或 `agents/{id}/messages/` 落盘
   - JSON lines 格式，每条消息一行
   - 消息 API 同时查询 Gateway session + 落盘文件

2. **异步回调机制**
   - `peer-send --no-wait --callback` 模式
   - 目标 Agent 处理完成后，自动通过 `peer-send` 回复发送方
   - 回复消息携带原始 `idempotencyKey` 用于关联

3. **消息优先级**
   - 支持 `--priority high|normal|low`
   - high 优先级消息中断当前任务处理

#### 中期（v0.4）

4. **消息队列（Inbox 模型）**
   - 每个 Agent 维护 inbox 文件：`agents/{id}/inbox.jsonl`
   - `peer-send` 写入目标 inbox 而非直接发送到 session
   - Agent 空闲时轮询 inbox 处理待办消息
   - 支持消息确认（ACK）和重试

5. **WebSocket Proxy 中间件**
   - 在 Gateway 前加一层 proxy
   - 拦截 `chat.send` 帧，校验发送方→接收方 peer 关系
   - 将软约束提升为硬约束

6. **消息审计日志**
   - 记录所有跨 Agent 消息：时间、发送方、接收方、摘要
   - UI 提供审计视图

#### 长期（v0.5+）

7. **OpenClaw 引擎增强请求**
   - `perAgentSendAllowList`：按 Agent 配置发送白名单
   - 原生消息队列支持
   - 消息 ACK/NACK 协议

8. **事件驱动编排**
   - Agent 发布事件（如 `research.complete`）
   - 其他 Agent 订阅感兴趣的事件
   - Orchestrator 作为事件总线

---

## 6. 配置参考

### 6.1 `config/openclaw.json` 相关字段

```json
{
  "tools": {
    "agentToAgent": {
      "enabled": true,
      "allow": ["*"]
    },
    "sessions": {
      "visibility": "agent"
    }
  },
  "agents": {
    "list": [
      {
        "id": "pm",
        "subagents": {
          "allowAgents": ["pm"]
        }
      }
    ]
  }
}
```

### 6.2 `agent.json` peers 字段

```json
{
  "id": "pm",
  "name": "Project Manager",
  "peers": ["ceo", "researcher", "frontend-dev", "backend-dev", "tester"]
}
```

### 6.3 `config/base-rules.md` 通信规则

**允许**：
- ✅ `peer-send` 脚本发送跨 Agent 消息
- ✅ `peer-status` 查询 peer 状态
- ✅ `sessions_send` 操作自己的子 session
- ✅ `sessions_spawn` 自并行

**禁止**：
- ❌ `sessions_send` 向其他 Agent 发消息
- ❌ spawn 其他 Agent
- ❌ `sessions_list` 查看其他 Agent 状态
- ❌ `sessions_history` 读取其他 Agent 对话

---

## 7. 信息传输协议

Agent 间发送结构化消息时，推荐遵循五步协议：

1. **Transmit** — 明确传递核心信息
2. **Restate** — 接收方复述确认理解
3. **Purpose** — 说明消息目的和期望动作
4. **Contingency** — 定义失败回退方案
5. **Insight** — 附加上下文和建议

---

## 附录 A: 消息流完整示例

```
CEO 要求 PM 启动项目规划：

1. CEO 执行: peer-status --agent-id ceo
   → PM status: "online"

2. CEO 执行: peer-send --from ceo --to pm --message "启动 Q2 产品规划，产出需求文档"
   → peer-send 校验 PM 在 CEO 的 peers 列表中 ✓
   → ws connect (operator) → hello-ok
   → chat.send to agent:pm:main
   → PM 收到消息，校验 CEO 在自身 peers 列表中 ✓
   → PM 处理并回复: "收到，我将在 2 小时内产出初版 PRD..."
   → CEO 在 stdout 收到回复

3. PM 需要 Researcher 协助（异步）：
   → peer-send --from pm --to researcher --message "调研竞品 X/Y/Z 功能对比" --no-wait
   → 消息头: [Inter-Agent Message from: pm (PM)] [async — reply via peer-send]
   → 返回: {"ok": true, "sessionKey": "agent:researcher:main", "idempotencyKey": "..."}
   → PM 继续其他工作，不阻塞等待

4. Researcher 收到异步消息后：
   → 识别 [async — reply via peer-send] 标记
   → 先回发确认: peer-send --from researcher --to pm --message "已收到调研任务，预计30分钟" --no-wait
   → 完成调研后回发结果: peer-send --from researcher --to pm --message "竞品调研完成：X优势是...Y优势是..." --no-wait
   → PM 在自己的 session 中收到 Researcher 的回复
```
