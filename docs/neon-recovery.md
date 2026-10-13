# 使用 Neon 免费 PostgreSQL 恢复线上演示

本次已确认的故障是 Render PostgreSQL 到期。用户已选择保持免费、从空数据库重新开始并完成配置操作，随后 API 健康检查已恢复 200。旧账号和训练记录不会迁入新库；业务注册与数据写入仍需验收。

## 创建新数据库

1. 登录 [Neon Console](https://console.neon.tech/)，选择 **Free** 计划，创建 `repocoach` 项目。选择尽量接近 Render API 的区域。
2. 保留默认数据库和角色即可。数据库名不必叫 `repocoach`，连接串里的名称必须与实际数据库一致。
3. 打开 **Connect**。本项目是持续运行的 NestJS API，这次先选择 **Direct connection / 关闭 Connection pooling**；同一个直连 URL 可供现有 Prisma Client 和启动迁移使用，无需增加第二个连接变量。
4. 如果界面有 ORM 选项，选择 Prisma。复制完整 PostgreSQL URL，保留 `sslmode=require` 等 TLS 参数。可以设置 `connect_timeout=15`、`connection_limit=5` 来适应冷启动和小型演示实例。

连接 URL 含有数据库密码，只粘贴到 Render API 的 Environment 中，不要提交到 Git 或发送到聊天里。

## 恢复 Render API

1. 打开 Render 的 **repocoach-api → Environment**，将 `DATABASE_URL` 替换成新 Neon URL。
2. 保留 `WEB_ORIGIN=https://repocoach-web.onrender.com`、`COOKIE_SECURE=true`、`COOKIE_SAME_SITE=none`，以及已有模型和邮件配置。
3. 选择 **Save and deploy**，用已有构建部署新的环境变量；也可以选择 **Save, rebuild, and deploy** 重新构建。不要只执行使用旧环境变量的 Restart。
4. 查看日志。现有 API Dockerfile 会先执行 `prisma migrate deploy`，在新库创建当前部署版本的表，然后启动 NestJS。新数据库无需执行 `migrate dev`、`db push` 或手工建表。
5. 等待 API 显示 Live。如果 API 本身也明确显示 **Suspended by Render**，需另外读取该服务的暂停原因；数据库恢复并不保证解除服务的独立暂停。

恢复已有部署版本不需要先发布本地 Agent 升级改动。后续升级应一起部署 API 和前端，因为提交答案的 API 合约增加了 `questionId`。

## 验收

1. 打开 [API 健康检查](https://repocoach-api.onrender.com/api/v1/health)，确认返回 `200` 和 `status: "ok"`。Render 免费 API 的首次唤醒可能需要约一分钟。
2. 打开 [前端](https://repocoach-web.onrender.com/)，重新注册一个演示账号。空库不存在原来的账号，原账号登录失败属于预期。
3. 若当前部署要求邮箱验证，完成原有验证码流程。数据库迁移不会修复独立的邮件服务配置问题。
4. 导入公开仓库，提交一题，确认报告中有记录；刷新或重新登录后确认记录仍在。

`/health` 目前仅检查 API 能响应，登录和保存训练记录才覆盖数据库操作。

## 本地准备与验证

仓库中 `npm run test:integration` 在一个随机命名的独立 PostgreSQL schema 内应用全部迁移，验证重复部署迁移、JSON 会话快照、真实事务回滚、并发提交和恢复读取。必须显式设置 `TEST_DATABASE_URL`；它不默认使用可能指向生产环境的 `DATABASE_URL`。

```powershell
# 使用本地 Docker PostgreSQL 测试，不修改线上数据库。
$env:TEST_DATABASE_URL = 'postgresql://repocoach:repocoach@localhost:5432/repocoach?schema=public'
npm run test:integration
Remove-Item Env:TEST_DATABASE_URL
```

上线代码后，可在可信环境中设置 `DATABASE_URL` 并执行 `npm run db:check`，只读检查连接、应用表结构和迁移状态。该命令不打印连接密码，也不自动迁移或删除数据。

## 免费计划的边界

Neon 免费计划仍有存储、计算时长和网络传输额度，不能承诺无限免费或永远可用。以控制台显示的当前额度为准，并定期导出需要保留的数据。Render 前后端的免费实例额度和冷启动限制继续适用；Neon 数据库迁移不改变这些限制。

参考：[Neon 计划](https://neon.com/docs/introduction/plans)、[Neon 与 Prisma](https://neon.com/docs/guides/prisma)、[Render 免费数据库到期规则](https://render.com/docs/free#free-postgres)、[Render 重启与环境变量](https://render.com/docs/deploys#restarting-a-service)。
