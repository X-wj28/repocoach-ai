# RepoCoach FE: 简历与面试材料

> 面向前端实习岗位的项目表述。请根据自己的实际开发过程调整措辞，面试中不要声称未参与或不了解的实现细节。

本文保留仓库根目录入口；完整的最新技术亮点、恢复边界与面试讲解见 [docs/resume-project.md](docs/resume-project.md)，当前运行版本与真实验收见 [2026-10-28 发布记录](docs/releases/2026-10-28.md)。

## 简历项目描述

### 一行版本

**RepoCoach FE | AI 驱动的 GitHub 项目深挖与前端面试训练平台**

线上演示：<https://repocoach-web.onrender.com>  ·  API：<https://repocoach-api.onrender.com/api/v1/health>

### 两到三行版本

基于 Next.js、NestJS、PostgreSQL 和 DeepSeek 构建面向前端实习生的 AI 面试训练平台。用户可导入公开 GitHub 仓库，系统提取 README、目录树和关键 TS/TSX 文件，围绕真实代码与岗位 JD 生成面试题并持久化评分，最终输出 React、Next.js、工程化和性能维度的能力报告。

### 技术亮点

- 使用 Next.js 14 + TypeScript 构建响应式工作台，包含注册登录、仓库导入、连续问答、复盘导出和能力报告等完整用户流程。
- 使用 NestJS 编排固定代码版本的受限 Tool Calling 与四项 Rubric 评分；取证与评分独立持久化，Provider 故障保留失败阶段，重试评分复用已保存依据，不改成演示分。
- 使用 Prisma + PostgreSQL 设计用户、会话、面试和回答关联模型；通过 HttpOnly Cookie 与按 userId 查询实现会话管理和数据隔离。
- 构建五阶段可视化训练工作台，源码与评分引用联动，支持草稿恢复、逐题复盘、交互式报告和本次训练小结。
- 配置 Docker Compose、健康检查和自动 Prisma 迁移；GitHub CI 通过 69 项 API 测试、19 项前端测试、11 个 PostgreSQL 场景、8 个 HTTP 场景和六组浏览器验收。Render 免费前后端连接现有 Neon 数据库。

## 30 秒介绍

我做了一个基于真实代码的项目面试 Agent。导入公开仓库后固定代码版本，以受限工具查证回答，再给出带源码引用的四项评价。回答、取证和评分分阶段持久化，评分失败可以复用证据继续；前端把执行状态、源码、逐题复盘和下一次练习连接起来。已有真实数据库、HTTP 和浏览器验证，评分质量尚未经独立人工校准。

## 高频追问与回答方向

### 为什么不在浏览器直接调用 DeepSeek 和 GitHub API？

密钥不应暴露在浏览器，仓库分析和模型调用也需要统一的限流、错误处理和输入边界。因此浏览器只调用 NestJS API，服务端再访问第三方服务。

### 如何防止用户 A 看到用户 B 的训练记录？

认证成功后服务端将随机 session token 写进 HttpOnly Cookie，只保存 token 哈希。SessionGuard 从 Cookie 恢复用户；所有面试和报告查询都带上 userId 条件，数据库关系还使用级联删除。

### AI 返回不符合预期怎么办？

模型输出、分项范围和证据 ID 通过校验后才能保存成功评价。模型超时或格式无效会保存阶段失败并保留题号；取证已完成时只重试评分。未配置模型才使用无分演示反馈，演示和无法判断不计入能力均分。

### 为什么选择 Prisma 和 PostgreSQL？

训练数据有明确的用户、会话、面试、回答关系，适合关系型数据库。Prisma 提供类型安全查询、迁移历史和可读的数据模型；PostgreSQL 更适合后续在云端部署与扩展，而不是把数据留在本地 SQLite 文件中。

### Docker 部署中如何保证启动顺序？

Compose 先等待 PostgreSQL health check 通过，API 启动命令应用 Prisma 迁移，然后 Web 等待 API health check。这样避免 API 在数据库未就绪时启动失败。

## 可现场演示的流程

1. 注册一个新账号，演示 Cookie 登录态和账号工作区。
2. 导入公开 GitHub 仓库，展示识别出的技术栈与关键文件。
3. 开始训练并提交包含加载、错误、缓存或 SSR 的回答。
4. 打开能力报告，说明评分如何映射到四个能力维度。
5. 打开最近训练记录，展示复盘和 Markdown 导出。
6. 打开 GitHub Actions，展示 CI 的绿色运行结果。

## 诚实边界

- GitHub 仓库仅支持公开只读访问。
- 未设置 DeepSeek Key 时使用不计入能力分的演示反馈，已配置模型后的故障保留为失败阶段。
- 当前 Web、API 部署在 Render 免费服务，PostgreSQL 位于 Neon；保留 Docker Compose 作为本地开发和自托管方案。
