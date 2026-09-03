# RepoCoach FE

面向前端实习生的 GitHub 项目深挖与 AI 技术面试训练工具。

RepoCoach FE 读取公开的 React/Next.js 项目和目标岗位 JD，围绕真实代码进行自适应技术面试，并生成带有项目证据的反馈和训练计划。项目已接入 DeepSeek、GitHub Public API、账号认证和 SQLite 持久化，同时保留无需模型密钥即可体验的本地兜底模式。

## 项目结构

```text
apps/
  web/       Next.js 前端工作台
  api/       NestJS API 和 Agent 编排入口
packages/
  shared/    前后端共享类型
docs/        产品和技术设计文档（后续补充）
```

## 本地运行

需要 Node.js 22.5+ 和 npm 10+（使用内置 `node:sqlite`）。

```bash
npm install
npm run dev
```

- 前端：http://localhost:3000
- 后端健康检查：http://localhost:4000/api/v1/health

也可以分开启动：

```bash
npm run dev:web
npm run dev:api
```

复制 `.env.example` 为仓库根目录的 `.env`。配置 `DEEPSEEK_API_KEY` 后启用真实模型；没有模型密钥时，后端自动使用本地评分逻辑。建议配置只读 `GITHUB_TOKEN` 以提高 GitHub API 请求额度。导入公开仓库时，后端会读取仓库元信息、README、目录树和高相关的 TypeScript/TSX 文件。

面试与回答默认保存在 `apps/api/data/repocoach.db`。数据库目录不会提交到 GitHub，可通过 `REPOCOACH_DB_PATH` 修改位置。

## MVP 范围

- 输入公开 GitHub 仓库并展示项目上下文
- 邮箱注册登录、HttpOnly Cookie 会话和用户数据隔离
- React/Next.js 项目深挖面试
- 根据回答动态推进问题
- 保存面试会话和结果
- 生成技术能力反馈与下一步训练计划

暂不支持私有仓库、GitHub OAuth、自动修改代码、自动合并 PR 和语音面试。

## 后续路线

1. 接入 GitHub OAuth 和公开仓库同步。
2. 增加仓库分层检索，只向模型提供与当前问题相关的代码。
3. 接入可替换的真实模型 Provider，并记录 token、延迟和失败原因。
4. 增加测试集，对问题相关性、反馈准确度和引用代码正确性做评估。

## 开源说明

项目采用 MIT License。请勿将 GitHub Token、模型 API Key 或其他密钥提交到仓库。
