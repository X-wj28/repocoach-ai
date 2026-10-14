# RepoCoach 演示与验收手册

当前四阶段升级已于2026-10-14发布，可在[Render工作台](https://repocoach-web.onrender.com)或本地演示。演示目标是让观众看到“回答如何被查证、评价如何保存、失败后如何继续”，再结合源码解释恢复边界。线上版本和验收范围见[发布总结](release-summary.md)。

## 启动前准备

需要 Node.js 22、已安装依赖和 PostgreSQL。首次启动按照 README 复制 `.env.example`，配置本地 `DATABASE_URL`；希望展示真实评分时配置 `DEEPSEEK_API_KEY`。未配置模型仍能训练和保存记录，但不会生成四项模型评分或训练记忆。

```powershell
docker compose up -d postgres
npm run db:generate
npm run db:deploy
npm run dev
```

访问 <http://localhost:3002>；<http://localhost:4000/api/v1/health> 应返回 `status: ok`。`db:deploy` 使用 `.env` 的目标数据库，演示前先确认指向本地。已有后台演示进程占用 3002/4000 时直接使用当前页面；不要同时启动第二套服务。

使用专门的演示账号，导入自己能够讲清楚的公开 React/Next.js 仓库。首次分析读取的是公开仓库已提交的代码，因此本地未推送改动不会出现在取证快照中。匿名 GitHub 访问受到配额限制，可在服务端配置只读 Token。演示回答使用真实文件和自己的理解，不需要刻意追求高分。

## 约八分钟的产品演示

| 时间     | 页面与操作                                                | 展示内容                                       |
| -------- | --------------------------------------------------------- | ---------------------------------------------- |
| 0–1 分钟 | 登录后打开“项目设置”，填写公开仓库地址与岗位 JD，分析仓库 | 实际文件、技术栈和固定版本的项目上下文         |
| 1–2 分钟 | 打开“面试训练”，开始训练，查看题目和源码片段              | 首题由实际文件规划；片段与行号由服务端生成     |
| 2–4 分钟 | 回答当前题，提交后展开“查看执行过程”；处理中刷新页面      | 回答先保存，取证与评分分阶段；刷新恢复同一任务 |
| 4–5 分钟 | 展开四项 Rubric 理由和“查看分析依据”                      | 引用可回到代码；无法判断的分项不被当作零分     |
| 5–6 分钟 | 完成或打开已有训练，进入“最近的面试”复盘并导出 Markdown   | 原回答、评价、源码依据和执行记录一起保存       |
| 6–7 分钟 | 查看“训练计划”，点击“查看原题与源码依据”，开始新训练      | 练习重点来自有据模型观察，最多优先两个维度     |
| 7–8 分钟 | 点击“清除训练记忆”，确认后再打开原复盘                    | 清除后未来计划重新积累；原始训练记录保留       |

处理中刷新会重新读取持久化任务。查看 SSE 重连时，在浏览器 Network 面板选择任务的 `/stream` 请求，观察事件的 `id`；实际切断连接后的自动重连应发送 `Last-Event-ID`。单纯切换 DevTools 的 Offline 可能保留已经建立的连接，不能把它当作断线验证；本地真实切断连接的验收记录见 [agent-acceptance.md](agent-acceptance.md)。

模型并非每次都会调用每个工具；取证助手根据问题决定是否需要继续读取。没有低分、可判断且带引用的观察时，训练计划可能没有新的薄弱项。演示时说明实际结果，不将工具调用数、事件数或分数写死。

## 不依赖外部服务的故障演示

以下命令使用明确指定的测试数据库，创建并最终删除随机 schema，启动随机本机端口的完整 NestJS 应用；不读取本地 `.env`，不发送真实模型、GitHub 或邮件请求。

```powershell
$env:TEST_DATABASE_URL = 'postgresql://repocoach:repocoach@localhost:5432/repocoach?schema=public'
npm run test:e2e
```

输出的八个场景可作为现场可重复的工程演示。第一次评分调用被测试替身主动设为传输失败，取证 checkpoint 已经保存；重新创建 NestJS 应用后恢复原答案，通过 HTTP 重试完成评分。测试断言取证调用次数不增加、证据和 Trace 不变、评分尝试从 1 变成 2。它还验证了完整四题、空状态 JSON、SSE 按游标补发、账号隔离、能力报告和记忆清除。

这是可控故障测试，不能描述成自然发生的 DeepSeek 故障，也不是模型质量评测。SSE 场景通过真实 HTTP 发送 `Last-Event-ID` 验证服务端补发；浏览器自动重连另有独立验证。

## 完整自动化检查

```powershell
npm run db:generate
npm run test:api
npm run test:web
npm run test:integration
npm run test:e2e
npm run eval:rubric
npm run lint
npm run build
```

两个数据库测试命令需要上面的 `TEST_DATABASE_URL`，各自使用独立随机 schema。`test:api`、`test:integration` 和 `test:e2e` 会重新构建 API，命令本身请顺序执行以免同时改写 `dist`。GitHub Actions执行同样的检查，[发布提交CI](https://github.com/X-wj28/repocoach-ai/actions/runs/38387987516)已全部通过。

`test:web` 用本地 HTTP 服务故意发送响应头后卡住响应体，验证请求会超时，包含正常响应和错误响应两种情况。`eval:rubric` 默认只校验 20 条合成样例；显式运行 `eval:rubric:live` 才会产生模型请求与费用。当前样例尚无人工标注或独立留出集。

## 讲解时打开的源码

| 观众追问                           | 建议阅读                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 怎样限定 Agent 能查到什么代码？    | `apps/api/src/github/repository-policy.ts`、`apps/api/src/agent/evidence-tools.ts`、`evidence-runtime.ts` |
| 如何只重试评分，不重新做主任务？   | `apps/api/src/agent/evaluation.worker.ts`、`evaluation.store.ts`、`rubric-scorer.ts`                      |
| 幂等、竞争写入与进程崩溃怎么处理？ | `evaluation.store.ts` 的 submit/claim/checkpointEvidence/complete；数据库集成测试                         |
| 为什么引用有效仍不证明评分正确？   | `rubric.ts`、20 条合成样例及 [rubric-and-recovery.md](rubric-and-recovery.md)                             |
| SSE 如何补发，历史事件是否持久化？ | `evaluation-events.ts`、`evaluation-stream.service.ts`、`apps/web/lib/api.ts`                             |
| 清除记忆时，旧任务晚到会怎样？     | `training-memory.store.ts` 的 epoch 检查、`practice-planner.ts`、数据库集成测试                           |
| 用户操作是否真的走通？             | `apps/api/test/e2e/http.test.cjs`、`apps/web/test/http.test.cjs`                                          |

外部模型调用的保证是至少一次；模型已返回而 checkpoint 未保存时，阶段可能重做。步骤事件用于观察，当前恢复点仍在取证/评分阶段。自动化测试验证工程契约，人工校准评分与生产吞吐评测是后续独立工作。
