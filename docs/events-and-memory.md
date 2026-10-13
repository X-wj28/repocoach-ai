# 执行事件、SSE 与训练记忆

RepoCoach现在把每个回答的执行阶段与步骤保存到PostgreSQL，通过SSE推送进度。断线后浏览器按事件序号补发；历史复盘可以加载相同事件。训练计划只使用有证据的模型分项观察，能回到原训练，支持清除。

## 事件与业务状态

一次训练是`Interview`，一道题的回答任务是`EvaluationRun`，运行步骤是`EvaluationEvent`。每个run有从1开始的独立序号，`(runId, sequence)`唯一；同一事务递增`lastEventSeq`并插入事件，回滚不会消耗序号。

| 事件 | 保存边界 |
| --- | --- |
| `run.created` | 不可改写回答与版本创建成功 |
| `evidence.started` / `evaluation.started` | 条件领取阶段租约成功，含尝试次数和是否恢复 |
| `model.started` / `model.finished` | 模型取证调用前后，只保存次数和工具请求数 |
| `tool.started` / `tool.finished` | 工具调用前后，保存固定工具名称、结果状态、受限文件路径和耗时 |
| `evidence.selected` | 证据包与Trace checkpoint提交 |
| `run.failed` / `run.retried` | 失败或重试状态提交 |
| `evaluation.finished` | 最终评价、题号推进、训练记忆与完成事件整体提交 |

阶段状态与对应事件共享事务；工具步骤本身的事件是独立事务，并通过当前租约token和到期时间限制写入。步骤记录用于观察执行，**不是工具结果checkpoint**：取证中途重启仍可能重做该阶段，历史会同时保留原尝试和恢复尝试。外部调用仍至少一次。

升级前的任务仅补一条`run.snapshot`，记录迁移时状态，不伪造过去的工具过程。旧任务结果保持可复盘，新事件从其已有序号继续写入。

## SSE与回放契约

| 方法与路径 | 作用 |
| --- | --- |
| `GET /api/v1/interviews/evaluations/:runId/events?after=N` | 返回N之后最多100条事件、状态快照、next与hasMore |
| `GET /api/v1/interviews/evaluations/:runId/stream` | Cookie认证的SSE，支持`Last-Event-ID`或初始`after=N` |
| `GET /api/v1/training-memory?projectId=...` | 当前用户、当前项目的有据观察与训练重点 |
| `POST /api/v1/training-memory/clear` | 清除当前用户全部项目的记忆，保留原问答 |

流发送`evaluation-event`（带`id: sequence`）和`run-state`（不改游标）。先认证、检查所有权和游标，再发送流响应头。事件页只查询观察到的状态序号以内的数据，避免新事件与旧状态混在一页。

前端使用带凭据的原生EventSource，按序号去重，网络重连自动带最后ID。页面刷新重新加载当前任务与历史，不依赖浏览器保存回答副本。SSE不可用时，每5秒查询状态兜底；展开时间线仍可加载遗漏的历史事件。失败和完成状态关闭连接，用户重试后重新订阅并去重。

服务端仅在连接活跃时每750毫秒检查持久化事件，每15秒发送心跳；单条连接最长150秒。每5秒重新检查登录态，撤销会话后停止发送。每用户最多3条连接，每API进程最多200条；连接关闭或背压等待中断时释放资源。这些是限额，没有进行吞吐压测。

这是数据库轮询驱动的SSE推送，不是PostgreSQL LISTEN/NOTIFY或分布式消息总线。连接限额也只在单实例内计算。没有活跃任务/连接时不会因本功能持续查库。

实现参考：[MDN SSE及自动重连](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)、[EventSource凭据选项](https://developer.mozilla.org/en-US/docs/Web/API/EventSource/withCredentials)、[NestJS SSE说明](https://docs.nestjs.com/techniques/server-sent-events)。本项目使用普通GET加流式响应，以便在发送200之前完成异步所有权与游标校验。

## 有证据的训练记忆

只从新完成任务的有效DeepSeek Rubric生成分项观察。每条保留criterion、能力维度、0–4分、原理由、run与题号、证据ID；通过原run读取版本与文件来源。`null`、演示、非法引用不生成观察；旧历史不自动回填。

每用户/项目保留最近40条观察，同一run/分项唯一。按“能力维度+Rubric分项”取最新观察：低于3列为优先练习，后续达到3或4只结束同维度该项的弱点。它是模型估计的练习记录，不是长期人格画像或已认证能力。

新训练最多调整两个不同能力维度的题目：优先排序薄弱项，0–1使用基础难度、2使用进阶难度，补上固定的练习提示。题目继续使用当前仓库快照，历史文件仅作为来源展示，不替代新题源码。若当前仓库没有对应题目维度，就不强行生成。评分器不会收到旧分数或弱点，减少历史标签对新评分的影响。

清除时锁定用户行、递增`memoryEpoch`并删除记忆。任务提交保存当时epoch；完成时只有epoch一致才写入。这样清除前的运行即使晚到完成，也不能重新写回旧记忆。清除影响未来新训练，已经创建的题目与原始复盘保留；清除后新任务可以形成新观察。

## 已验证与边界

2026-10-13，真实GitHub/DeepSeek/数据库流程产生23条连续事件，主动断开后按Last-Event-ID补发到完成，生成3条有据观察，下一轮训练按来源调整重点。

浏览器测试通过本地临时代理断开真实SSE连接，检测到自动请求`Last-Event-ID: 3`，事件连续去重并显示反馈。另验证历史事件加载、原题引用、390像素布局及清除按钮；清除后记忆为空，原问答仍可查询。离线标记本身没有切断已建立连接，因此没有把该操作单独当作断线验收。

自动化测试覆盖事件格式与游标、连接关闭与会话撤销、连接限额、规划源码不变、进度保存失败不继续模型调用。真实PostgreSQL测试覆盖并发连续序号、100条分页、完成回滚无完成事件、记忆用户/项目隔离、清除对旧任务的屏障以及强观察更新练习历史。

前三阶段的人工校准仍待后续：20条合成Rubric样例没有人工复核或独立留出集。多Agent、逐工具恢复、分布式事件总线与生产吞吐指标不在本轮交付中。按照用户安排，完成整体验收后再统一部署Render；当前改动仍在本地。
