# RepoCoach FE: 简历与面试材料

> 面向前端实习岗位的项目表述。请根据自己的实际开发过程调整措辞，面试中不要声称未参与或不了解的实现细节。

## 简历项目描述

### 一行版本

**RepoCoach FE | AI 驱动的 GitHub 项目深挖与前端面试训练平台**

线上演示：<https://repocoach-web.onrender.com>  ·  API：<https://repocoach-api.onrender.com/api/v1/health>

### 两到三行版本

基于 Next.js、NestJS、PostgreSQL 和 DeepSeek 构建面向前端实习生的 AI 面试训练平台。用户可导入公开 GitHub 仓库，系统提取 README、目录树和关键 TS/TSX 文件，围绕真实代码与岗位 JD 生成面试题并持久化评分，最终输出 React、Next.js、工程化和性能维度的能力报告。

### 技术亮点

- 使用 Next.js 14 + TypeScript 构建响应式工作台，包含注册登录、仓库导入、连续问答、复盘导出和能力报告等完整用户流程。
- 使用 NestJS 编排 GitHub Public API 和 DeepSeek；对模型输出做 JSON 解析与结构校验，Provider 异常时回退到本地确定性评分，避免 AI 服务故障阻塞主流程。
- 使用 Prisma + PostgreSQL 设计用户、会话、面试和回答关联模型；通过 HttpOnly Cookie 与按 userId 查询实现会话管理和数据隔离。
- 配置 Docker Compose 编排 Web、API、PostgreSQL，加入健康检查和自动 Prisma 迁移；通过 GitHub Actions 执行 Prisma 生成、Lint、4 个 API 测试和生产构建。

## 30 秒介绍

我做了一个帮助前端实习生练习项目面试表达的工具。用户导入公开 GitHub 项目并填写岗位 JD 后，后端先提取仓库上下文，再由 Agent 围绕真实文件提问。用户的回答会被评分并保存到 PostgreSQL，最后按 React、Next.js、工程化和性能四个维度生成训练报告。为了让 AI 依赖可控，我同时实现了 DeepSeek 调用和本地回退策略；部署上用 Docker Compose 管理三服务，并用 GitHub Actions 做持续验证。

## 高频追问与回答方向

### 为什么不在浏览器直接调用 DeepSeek 和 GitHub API？

密钥不应暴露在浏览器，仓库分析和模型调用也需要统一的限流、错误处理和输入边界。因此浏览器只调用 NestJS API，服务端再访问第三方服务。

### 如何防止用户 A 看到用户 B 的训练记录？

认证成功后服务端将随机 session token 写进 HttpOnly Cookie，只保存 token 哈希。SessionGuard 从 Cookie 恢复用户；所有面试和报告查询都带上 userId 条件，数据库关系还使用级联删除。

### AI 返回不符合预期怎么办？

DeepSeek 返回内容先被解析和校验，只有符合 Question/Evaluation 合约的数据才会进入后续流程。如果模型超时、网络错误或输出格式无效，API 会转用本地确定性提问和评分，因此训练主流程仍然可用。

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
- 未设置 DeepSeek Key 时产品使用本地评分兜底，不应宣称每次评分都由大模型生成。
- 当前版本已通过 Render 部署 Web、API 和 PostgreSQL，可在简历中写明线上演示地址；同时保留 Docker Compose 作为本地开发和自托管方案。
