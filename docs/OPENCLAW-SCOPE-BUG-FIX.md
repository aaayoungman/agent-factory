# OpenClaw Gateway Scope Bug 修复记录

## 问题描述

使用 `backend` 模式连接 OpenClaw Gateway 时，即使发送了正确的 scopes（如 `operator.admin`, `operator.read`, `operator.write`），调用 `chat.send` 等需要权限的方法时仍会报错：

```
Error: chat.send failed: missing scope: operator.write
```

## 根本原因

在 OpenClaw Gateway 代码中存在 Bug：当客户端没有 device identity 时，scopes 会被无条件清空，即使已经通过 token 认证成功。

### 问题代码位置

`/opt/homebrew/lib/node_modules/openclaw/dist/gateway-cli-fbk02TsX.js`

关键函数 `clearUnboundScopes`：

```javascript
const clearUnboundScopes = () => {
    if (scopes.length > 0 && !controlUiAuthPolicy.allowBypass) {
        scopes = [];
        connectParams.scopes = scopes;
    }
};
if (!device) clearUnboundScopes();
```

这段代码的逻辑问题：
1. 当没有 device 时会调用 `clearUnboundScopes()`
2. 但它没有检查认证是否成功，只要没有 device 就清空 scopes
3. 导致即使 token 认证成功，scopes 也被清空

## 修复方案

### 修复 1: 核心修复 (第 19030-19036 行)

修改 `clearUnboundScopes` 函数，只有在没有有效认证时才清空 scopes：

```javascript
const clearUnboundScopes = () => {
    // Fix: only clear scopes if there's no valid auth AND no bypass
    // Keep scopes if auth is valid (token/password auth succeeded)
    if (scopes.length > 0 && !controlUiAuthPolicy.allowBypass && !authOk && !sharedAuthOk) {
        scopes = [];
        connectParams.scopes = scopes;
    }
};
```

### 修复 2: 额外优化 (第 18833-18844 行)

让 `allowInsecureAuth` 配置也对本地连接生效：

```javascript
function resolveControlUiAuthPolicy(params) {
    const allowInsecureAuthConfigured = params.isControlUi && params.controlUiConfig?.allowInsecureAuth === true;
    const dangerouslyDisableDeviceAuth = params.isControlUi && params.controlUiConfig?.dangerouslyDisableDeviceAuth === true;
    // Fix: allowBypass should also be true when allowInsecureAuth is configured and client is local
    const allowBypass = dangerouslyDisableDeviceAuth || (allowInsecureAuthConfigured && params.isLocalClient);
    return {
        allowInsecureAuthConfigured,
        dangerouslyDisableDeviceAuth,
        allowBypass,
        device: dangerouslyDisableDeviceAuth ? null : params.deviceRaw
    };
}
```

并确保调用时传入 `isLocalClient` 参数：

```javascript
const controlUiAuthPolicy = resolveControlUiAuthPolicy({
    isControlUi,
    controlUiConfig: configSnapshot.gateway?.controlUi,
    deviceRaw,
    isLocalClient  // 新增
});
```

## 验证方法

使用 WebSocket 测试连接：

```javascript
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:19100', { headers: { Origin: 'http://127.0.0.1:19100' }});

ws.on('message', (data) => {
  const f = JSON.parse(data.toString());

  if (f.type === 'event' && f.event === 'connect.challenge') {
    ws.send(JSON.stringify({
      type: 'req', id: 'c', method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: 'test', mode: 'backend', version: '1.0.0', platform: 'darwin' },
        caps: [],
        auth: { token: 'agent-factory-internal-token-2026' },
        role: 'operator',
        scopes: ['operator.admin', 'operator.read', 'operator.write'],
      }
    }));
  }

  if (f.type === 'res' && f.id === 'c') {
    console.log('Connect result:', f.ok);
    if (f.ok) {
      ws.send(JSON.stringify({
        type: 'req', id: 's', method: 'chat.send',
        params: { sessionKey: 'main', message: 'hello', idempotencyKey: 'test-1' }
      }));
    }
  }

  if (f.type === 'res' && f.id === 's') {
    console.log('chat.send result:', f.ok, f.error);
    ws.close();
  }
});
```

预期输出：
```
Connect result: true
chat.send result: true undefined
```

## 相关配置文件

确保 `~/.openclaw/openclaw.json` 中 gateway 配置正确：

```json
{
  "gateway": {
    "port": 19100,
    "mode": "local",
    "controlUi": {
      "allowedOrigins": ["*"],
      "allowInsecureAuth": true
    },
    "auth": {
      "mode": "token",
      "token": "agent-factory-internal-token-2026"
    }
  }
}
```

## 更新 OpenClaw 后的处理

如果更新了 OpenClaw 包，上述修改可能会被覆盖。需要重新应用修复：

1. 找到 `gateway-cli-*.js` 文件
2. 搜索 `clearUnboundScopes` 函数
3. 应用上述修复
4. 重启 gateway

```bash
pkill -f "openclaw-gateway"
openclaw gateway --port 19100 &
```
