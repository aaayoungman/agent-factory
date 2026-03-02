# Chat Architecture — Agent Factory Dashboard

## 概述

Dashboard 的聊天功能通过 **OpenClaw Gateway WebSocket 协议** 与 Agent 对话。
Agent 运行在 Gateway runtime 中，拥有完整工具链，支持多 Agent 协作。

## 架构图

```
┌──────────────┐     HTTP/SSE      ┌──────────────────┐    WebSocket     ┌──────────────────┐
│   Browser    │ ──────────────→   │  Next.js API      │ ──────────────→ │  OpenClaw Gateway │
│  (AgentChat) │ ← SSE stream ──  │  /api/agents/     │ ← chat events─  │  (port 19100)     │
│              │                   │  [id]/chat        │                  │                   │
└──────────────┘                   └──────────────────┘                  ├──────────────────┤
                                                                         │  Agent Runtime    │
                                                                         │  ┌─────────────┐ │
                                                                         │  │ PM Agent    │ │
                                                                         │  │ ┌─exec      │ │
                                                                         │  │ ├─web_search│ │
                                                                         │  │ ├─memory    │ │
                                                                         │  │ └─sessions_ │ │
                                                                         │  │   send/spawn│ │
                                                                         │  └─────────────┘ │
                                                                         │  ┌─────────────┐ │
                                                                         │  │ Backend     │ │
                                                                         │  │ Agent       │ │
                                                                         │  └─────────────┘ │
                                                                         │  ... more agents  │
                                                                         └──────────────────┘
```

## 协议流程

### 1. 连接认证

```json
// → 发送 connect 帧
{
  "type": "req",
  "id": "<uuid>",
  "method": "connect",
  "params": {
    "minProtocol": 1,
    "maxProtocol": 1,
    "client": { "id": "agent-factory-dashboard", "mode": "backend" },
    "auth": { "token": "<gateway-token>" },
    "role": "operator",
    "scopes": ["operator.admin"]
  }
}

// ← 收到 hello-ok 响应
{ "type": "res", "id": "<uuid>", "ok": true, "payload": { ... } }
```

### 2. 发送消息

```json
// → 发送 chat.send 帧
{
  "type": "req",
  "id": "<uuid>",
  "method": "chat.send",
  "params": {
    "sessionKey": "dashboard:pm",
    "message": "分析一下这个需求",
    "idempotencyKey": "<uuid>"
  }
}
```

### 3. 接收 Streaming 响应

Gateway 通过 event 广播 agent 的回复：

```json
// ← delta event（增量文本，实时推送）
{
  "type": "evt",
  "event": "chat",
  "payload": {
    "runId": "<idempotencyKey>",
    "sessionKey": "dashboard:pm",
    "seq": 1,
    "state": "delta",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "好的，让我分析..." }]
    }
  }
}

// ← final event（回复完成）
{
  "type": "evt",
  "event": "chat",
  "payload": {
    "runId": "<idempotencyKey>",
    "state": "final",
    "message": { ... },
    "usage": { "input_tokens": 150, "output_tokens": 300 }
  }
}
```

## Session 管理

- **Session Key 格式**：`dashboard:{agentId}`（如 `dashboard:pm`）
- **持久化**：Session 由 Gateway 管理，跨请求保持上下文
- **每个 Agent 独立 Session**：不同 agent 的对话互不干扰

## 多 Agent 协作

因为 agent 运行在 Gateway runtime 中，它们可以：

1. **sessions_send**：向其他 agent 的 session 发送消息
2. **sessions_spawn**：创建子 agent session 执行任务
3. **共享工具链**：所有 agent 共享 exec、web_search、memory 等工具

示例协作流程：
```
用户 → PM Agent → sessions_spawn → Researcher Agent → 调研结果
                → sessions_spawn → Designer Agent   → 设计文档
                → sessions_spawn → Frontend Agent   → 前端代码
```

## 文件结构

```
ui/src/
├── lib/
│   ├── gateway-chat.ts      # WebSocket 客户端：连接、认证、消息收发
│   └── gateway-client.ts    # 现有 RPC 客户端（用于非 chat 的 gateway 调用）
├── app/
│   └── api/agents/[id]/chat/
│       └── route.ts          # API Route：HTTP/SSE 到 WebSocket 的桥接
└── app/agents/[id]/
    └── page.tsx              # AgentChat 组件：SSE streaming UI
```

## 与直接调 LLM API 的区别

| 特性 | 直接调 API | 通过 Gateway |
|------|-----------|-------------|
| 工具访问 | ❌ 无 | ✅ 完整工具链 |
| Session 持久化 | ❌ 无状态 | ✅ 跨请求保持 |
| Agent 间协作 | ❌ 不可能 | ✅ sessions_send/spawn |
| 记忆系统 | ❌ 无 | ✅ memory read/write |
| 命令执行 | ❌ 无 | ✅ exec |
| Streaming | ✅ 可以 | ✅ SSE via WebSocket |
