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
mkdir -p projects/{project_name}
cd projects/{project_name}
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
