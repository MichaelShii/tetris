# tetris-leaderboard-api — 全网排行榜 Worker（Phase 1 折中校验版）

俄罗斯方块 全网排行榜 API：Cloudflare Workers + KV（免费档）。
前端（gh-pages）通过 `leaderboard.js` 调用，详见产品根 `docs/teamflow/architecture/ARCHITECTURE.md` §4（API 契约）。

## 目录

- `src/index.js` — Worker 入口：路由 `/api/score`(POST) / `/api/leaderboard`(GET)、CORS 门控、错误信封
- `src/validate.js` — 载荷解析、昵称清洗白名单、分数合理性上界（纯函数）
- `src/store.js` — KV：设备存档 + 总榜/周榜（ISO 周）、去重、Top20
- `src/rate-limit.js` — KV 计数限流（TTL 滑窗）
- `test/smoke.mjs` — Node ≥18 冒烟（mock KV，无网络、无依赖）

## 部署

```bash
npx wrangler login                  # 首次
npx wrangler kv namespace create LEADERBOARD   # 创建 KV 命名空间，把 id 填入 wrangler.toml
npx wrangler deploy
```

部署后的默认 workers.dev 域名：`https://tetris-leaderboard-api.<你的账号>.workers.dev`。
**注意**：前端 `leaderboard.js` 的 `API_BASE` 常量、assembly-check 白名单、本 README 三处需保持同一域名；CORS 白名单仅 `https://michaelshii.github.io`（`ALLOWED_ORIGIN`）。

## 本地调试与测试

```bash
npx wrangler dev              # 本地调试（--local 使用本地 KV 模拟）
node test/smoke.mjs           # 冒烟测试（Node ≥18，退出码 0 = 全绿）
```

## 接口速查

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/score` | 提交成绩；载荷 `{nickname, score, level, lines, durationMs, deviceId, protoVer}`；被拒码 `invalid_nickname / implausible_score / rate_limited(429) / bad_request` |
| GET | `/api/leaderboard` | 一次返回 `{all, week}` 双视图 Top20 + `proto`(协议版本号，Phase 2 重放校验扩展点) |
| OPTIONS | 任意 | CORS 预检（仅白名单源 204） |

- **CORS**：仅放行 `https://michaelshii.github.io`；`Origin: null`（file://）与其它源 403 且不回 ACAO。
- **限流**：每设备 20 次 / 10 分钟；每 IP 60 次 / 10 分钟（KV 计数，读改写非原子——Phase 1 折中校验已知边界）。
- **合理性**：等级可达性（`minMsToReachLevel`）+ 理论得分上界（`maxScoreCeiling × 1.05`）；Phase 2 再做服务端重放整局验分（`protoVer` 预留）。
- **去重**：同设备 `entry:<deviceId>` 只保留最高分，更低分仅计限流不上榜（`improved:false`）。