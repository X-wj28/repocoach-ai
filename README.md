# RepoCoach FE

[![CI](https://github.com/X-wj28/repocoach-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/X-wj28/repocoach-ai/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-MIT-0f766e)](LICENSE) [![Node](https://img.shields.io/badge/node-22-339933)](https://nodejs.org/)

面向前端实习生的 GitHub 项目深挖与 AI 技术面试训练工具。

RepoCoach FE 会读取公开的 React/Next.js 仓库和目标岗位 JD，围绕真实代码生成项目面试题，评价回答，并持续沉淀个人能力报告。项目支持 DeepSeek 真实模型，也提供无需模型密钥的本地兜底模式。

## 线上演示

- 前端工作台：[repocoach-web.onrender.com](https://repocoach-web.onrender.com)
- API 健康检查：[repocoach-api.onrender.com/api/v1/health](https://repocoach-api.onrender.com/api/v1/health)

首次访问免费实例可能需要等待几十秒唤醒。演示环境只允许读取公开 GitHub 仓库，不会修改仓库内容。

## 核心能力

- 公开 GitHub 仓库分析：识别技术栈、README、目录树和关键 TypeScript/TSX 文件
- AI Agent 面试：结合项目代码与岗位 JD 生成问题、追问和结构化评价
- 代码依据：候选题绑定真实文件片段与行号，模型追问的文件路径经过服务端校验
- 按需查证：受限 Tool Calling 调用代码搜索、文件阅读和词法结构工具，保存 commit 与检索记录
- 分阶段恢复：先保存回答，再取证、评分；证据 checkpoint、租约和尝试上限支持进程恢复与仅重试失败阶段
- 四项 Rubric：正确性、代码依据、技术取舍与失败边界引用真实证据；无法判断时保留理由，不生成能力总分
- 可靠提交：最终评价和题号在同一事务提交，同题相同回答返回已有任务或评价
- 可复现评测：20 条合成样例、版本化评分结果、排序和引用校验；尚未经人工校准
- 实时执行过程：SSE推送取证与评分步骤，断线按事件序号补发，历史复盘可加载原执行记录
- 可追溯训练计划：有代码依据的模型分项形成练习观察，新训练优先练薄弱项；支持清除记忆并保留原始复盘
- 快速训练启动：仓库上下文持久化到 PostgreSQL，首题由上下文规划器即时生成，避免同步等待模型
- 完整账号体系：邮箱注册登录、`HttpOnly` Cookie 会话和用户数据隔离
- 训练记录：保存每次问答、评分、优点和改进建议，支持回放与 Markdown 导出
- 能力报告：按 React、Next.js、工程化和性能意识聚合真实训练信号
- 工程化交付：Prisma 迁移、PostgreSQL、Docker Compose 和 GitHub Actions CI

## 产品界面

| 项目深挖面试                                        | 能力报告                                       |
| --------------------------------------------------- | ---------------------------------------------- |
| ![项目深挖面试](docs/assets/interview-training.png) | ![能力报告](docs/assets/capability-report.png) |

![仓库分析与项目设置](docs/assets/project-settings.png)

![四项Rubric与源码依据（本地新版）](docs/assets/rubric-feedback.png)

![可追溯训练计划（本地新版）](docs/assets/training-memory.png)

面试问题、评价和报告由实际 API 返回。规则演示反馈不计入能力评分。截图可用于快速了解主要用户流程。

Agent 工程能力的分阶段升级见 [升级路线](docs/agent-upgrade-roadmap.md)，状态机与评测基线见 [评分与恢复说明](docs/rubric-and-recovery.md)，实时进度与练习计划见 [事件与记忆](docs/events-and-memory.md)，实际验证见 [验收记录](docs/agent-acceptance.md)。八分钟演示流程、故障演示和检查命令见 [演示手册](docs/demo-guide.md)。新增 Agent 功能尚未发布到线上演示环境。

## 简历与面试材料

可直接用于简历和项目面试的中文描述、技术亮点和讲解提纲见 [docs/resume-project.md](docs/resume-project.md)。本次升级的前后对比、验证范围与实际成效见 [升级总结](docs/release-summary.md)。

## 技术架构

```text
Browser
  |
  v
Next.js 14 + React + TypeScript
  |
  | REST + SSE + HttpOnly Cookie
  v
NestJS API
  |-- GitHub Public API
  |-- DeepSeek API / local fallback
  '-- Prisma ORM --> PostgreSQL
```

```text
apps/
  web/       Next.js 前端工作台
  api/       NestJS API、Agent 编排、认证与报告
packages/
  shared/    前后端共享类型
docs/        产品和架构文档
```

## 本地开发

需要 Node.js 22+、npm 10+ 和 Docker Desktop。

1. 从 `.env.example` 复制一份 `.env`。
2. 启动 PostgreSQL 并应用迁移。
3. 启动前后端开发服务器。

```powershell
npm install
docker compose up -d postgres
npm run db:deploy
npm run dev
```

- 前端：<http://localhost:3002>
- API 健康检查：<http://localhost:4000/api/v1/health>

Windows 上 Docker/WSL 可能保留端口 3000，因此本项目默认使用 3002。

## 部署

Web 和 API 可部署到 Render，数据库使用 PostgreSQL，完整步骤见 [docs/deployment.md](docs/deployment.md)。Render 免费数据库到期后的 Neon 空库恢复方案见 [迁移说明](docs/neon-recovery.md)。

## Docker 一键启动

下面的命令会构建 Web、API 和 PostgreSQL，并在 API 启动前自动应用 Prisma 迁移：

```powershell
docker compose up -d --build
docker compose ps
```

停止服务但保留数据库：

```powershell
docker compose down
```

## 环境变量

| 变量                  | 用途                           | 默认值                         |
| --------------------- | ------------------------------ | ------------------------------ |
| `NEXT_PUBLIC_API_URL` | 浏览器访问 API 的地址          | `http://localhost:4000/api/v1` |
| `WEB_ORIGIN`          | API 允许跨域访问的前端地址     | `http://localhost:3002`        |
| `DATABASE_URL`        | 本机开发数据库连接             | PostgreSQL 本地容器            |
| `DOCKER_DATABASE_URL` | API 容器访问数据库的连接       | Compose 内部 PostgreSQL        |
| `DEEPSEEK_API_KEY`    | 启用真实 DeepSeek Agent        | 未配置时使用本地兜底           |
| `DEEPSEEK_TIMEOUT_MS` | 模型请求超时；配置模型的故障进入阶段失败 | `20000`                   |
| `GITHUB_TOKEN`        | 提高 GitHub API 请求额度       | 可选                           |
| `COOKIE_SECURE`       | HTTPS 部署时启用 Secure Cookie | 本地 `false`                   |
| `EMAIL_VERIFICATION_REQUIRED` | 注册是否必须完成邮箱验证码 | 本地 `false`，生产建议 `true` |
| `RESEND_API_KEY`       | Resend HTTPS 发信 API Key       | 生产必填（开启验证时）          |
| `EMAIL_FROM`           | Resend 已验证的发件人           | 测试可用 `RepoCoach <onboarding@resend.dev>` |

不要提交 `.env`、GitHub Token 或模型 API Key。

## 常用命令

```powershell
npm run dev             # 启动本地开发环境
npm run build           # 构建前端和 API
npm run lint            # 检查前端代码
npm run test:api        # 构建并执行 API 单元测试
npm run test:web        # 前端 HTTP 响应体超时与错误处理
npm run test:integration # 真实 PostgreSQL 测试，需显式设置 TEST_DATABASE_URL
npm run test:e2e        # 完整 NestJS HTTP 流程，随机测试 schema，不调用外部服务
npm run eval:rubric      # 校验20条合成样例，不调用模型
npm run eval:rubric:live # 可选真实模型评测，产生模型费用
npm run db:generate     # 生成 Prisma Client
npm run db:migrate      # 创建开发迁移
npm run db:deploy       # 应用已有迁移
npm run db:check        # 只读检查数据库连接、应用表和迁移状态
npm run db:import-sqlite # 导入旧 SQLite 数据，可重复执行
```

## 数据与安全边界

仓库内容始终按不可信输入处理，Agent 提示词会忽略仓库内试图改变任务或索取信息的指令。应用只读取公开仓库，不修改代码、不创建 PR，也不会把 Token 返回给浏览器。

用户、会话、面试记录和报告存储在 PostgreSQL 中。Prisma 数据模型位于 `apps/api/prisma/schema.prisma`。

## CI

每次推送到 `main` 或创建 Pull Request 时，GitHub Actions 会执行：

1. `npm ci`
2. Prisma Client 生成
3. 前端 lint
4. API 自动化测试
5. PostgreSQL 迁移与阶段恢复集成测试
6. 合成 Rubric 样例结构校验（不调用模型）
7. 前后端生产构建

## 当前范围

当前版本面向公开仓库和文本面试，已提供 Render 线上演示。私有仓库、GitHub OAuth 和语音面试属于后续迭代。

## License

MIT
