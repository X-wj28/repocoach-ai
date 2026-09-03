# RepoCoach FE

面向前端实习生的 GitHub 项目深挖与 AI 技术面试训练工具。

RepoCoach FE 读取公开的 React/Next.js 项目和目标岗位 JD，围绕真实代码进行自适应技术面试，并生成带有项目证据的反馈和训练计划。当前仓库包含可运行的前端工作台和一个无需模型密钥即可体验的 Agent mock 后端。

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

需要 Node.js 20+ 和 npm 10+。

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

复制 `.env.example` 为 `.env.local`（前端）或 `.env`（后端）即可覆盖默认配置。首版使用本地 Agent mock，不配置模型密钥也能完整体验导入后的面试界面。

## MVP 范围

- 输入公开 GitHub 仓库并展示项目上下文
- React/Next.js 项目深挖面试
- 根据回答动态推进问题
- 保存面试会话和结果
- 生成技术能力反馈与下一步训练计划

暂不支持私有仓库、自动修改代码、自动合并 PR 和语音面试。

## 后续路线

1. 接入 GitHub OAuth 和公开仓库同步。
2. 增加仓库分层检索，只向模型提供与当前问题相关的代码。
3. 接入可替换的真实模型 Provider，并记录 token、延迟和失败原因。
4. 增加测试集，对问题相关性、反馈准确度和引用代码正确性做评估。

## 开源说明

项目采用 MIT License。请勿将 GitHub Token、模型 API Key 或其他密钥提交到仓库。

