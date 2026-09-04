// smoke.mjs — worker 冒烟（Node ≥18，无任何依赖）：mock KV + 真实 Request/Response
// 运行：node test/smoke.mjs （退出码 0=全绿）
// 覆盖：CORS 三态（放行/拒绝/Origin:null）、提交与上榜、昵称洗白、分数上界、限流、匿名化、404/405

import { handleRequest, ALLOWED_ORIGIN, RATE_LIMITS } from '../src/index.js'
import { isoWeekKey, dedupeSort } from '../src/store.js'
import { cleanNickname, checkPlausibility, maxScoreCeiling, minMsToReachLevel } from '../src/validate.js'

let pass = 0
let fail = 0
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  [' + extra + ']' : '')) }
}

/** 内存 KV mock（形状与 Workers KV 一致：get/put，put 支持 expirationTtl） */
function mockEnv() {
  const map = new Map()
  return {
    LEADERBOARD: {
      async get(k) { return map.has(k) ? map.get(k).value : null },
      async put(k, value, opts) { map.set(k, { value: String(value), ttl: (opts && opts.expirationTtl) || 0 }) },
      _map: map,
    },
  }
}

const post = (env, body, headers = {}) => {
  const h = { 'Content-Type': 'application/json', ...headers }
  return handleRequest(new Request('https://api.local/api/score', { method: 'POST', headers: h, body: JSON.stringify(body) }), env)
}
const getBoard = (env, headers = {}) =>
  handleRequest(new Request('https://api.local/api/leaderboard', { method: 'GET', headers }), env)

const VALID = {
  nickname: '阿伟',
  score: 12340,
  level: 3,
  lines: 24,
  durationMs: 180_000,
  deviceId: 'aaaaaaaa-1111-2222-3333-444444444444',
  protoVer: 1,
}

console.log('== 0. 纯函数（validate.js 等价断言） ==')
ok('cleanNickname 合法昵称通过', cleanNickname(' 阿伟  ') === '阿伟')
ok('cleanNickname 拒绝超长(13)', cleanNickname('一二三四五六七八九十一二三') === null)
ok('cleanNickname 拒绝非法字符(<script>)', cleanNickname('<script>') === null)
ok('minMsToReachLevel 单调不减', minMsToReachLevel(5) > minMsToReachLevel(3))
ok('合理分数通过', checkPlausibility({ score: 1000, level: 1, lines: 0, durationMs: 60_000 }).plausible)
ok('虚构高分被拒', checkPlausibility({ score: maxScoreCeiling(10_000) * 2, level: 50, lines: 0, durationMs: 10_000 }).reasons.includes('score_above_ceiling'))
ok('等级不可达被标记', checkPlausibility({ score: 100, level: 80, lines: 0, durationMs: 10_000 }).reasons.includes('level_unreachable'))
ok('isoWeekKey 形如 YYYY-Www', /^\d{4}-W\d{2}$/.test(isoWeekKey()))
ok('dedupeSort 同设备留高分', dedupeSort([{ deviceId: 'a', score: 1 }, { deviceId: 'a', score: 2 }]).length === 1)

console.log('== 1. CORS 三态 ==')
{
  const env = mockEnv()
  const allowed = await getBoard(env, { Origin: ALLOWED_ORIGIN })
  ok('白名单源 200 + ACAO', allowed.status === 200 && allowed.headers.get('Access-Control-Allow-Origin') === ALLOWED_ORIGIN)

  const evil = await getBoard(env, { Origin: 'https://evil.example' })
  ok('其它源 403 且无 ACAO', evil.status === 403 && evil.headers.get('Access-Control-Allow-Origin') === null)

  const nullOrigin = await getBoard(env, { Origin: 'null' })
  ok('Origin:null (file://) 403 且无 ACAO', nullOrigin.status === 403 && nullOrigin.headers.get('Access-Control-Allow-Origin') === null)

  const preflight = await handleRequest(
    new Request('https://api.local/api/score', { method: 'OPTIONS', headers: { Origin: ALLOWED_ORIGIN, 'Access-Control-Request-Method': 'POST' } }),
    env,
  )
  ok('预检 204 + 允许方法', preflight.status === 204 && (preflight.headers.get('Access-Control-Allow-Methods') || '').includes('POST'))
}

console.log('== 2. 提交与上榜 ==')
{
  const env = mockEnv()
  const r = await post(env, VALID)
  const j = await r.json()
  ok('合法提交 200 + accepted', r.status === 200 && j.ok === true && j.accepted === true && j.improved === true)
  ok('首条 rank=1', j.rank === 1)

  const board = await getBoard(env, { Origin: ALLOWED_ORIGIN })
  const bj = await board.json()
  ok('榜单双视图 + proto', bj.ok && bj.proto === 1 && Array.isArray(bj.all) && Array.isArray(bj.week))
  ok('总榜含该条且匿名化(无 deviceId/ts)', bj.all.length === 1 && bj.all[0].rank === 1 && bj.all[0].nickname === '阿伟' && !('deviceId' in bj.all[0]) && !('ts' in bj.all[0]))
  ok('周榜同含该条（当前 ISO 周）', bj.week.length === 1)

  const dup = await post(env, { ...VALID, score: 500 }) // 同设备更差分
  const dj = await dup.json()
  ok('同设备更差分 improved:false 且不上榜', dup.status === 200 && dj.improved === false)

  const better = await post(env, { ...VALID, score: 99999 })
  const bj2 = await (await getBoard(env, { Origin: ALLOWED_ORIGIN })).json()
  ok('同设备更高分替换上榜', better.status === 200 && bj2.all.length === 1 && bj2.all[0].score === 99999)
}

console.log('== 3. 清洗 / 上界拒绝 ==')
{
  const env = mockEnv()
  const badNick = await post(env, { ...VALID, nickname: '<script>alert(1)</script>' })
  ok('非法昵称 400 invalid_nickname', badNick.status === 400 && (await badNick.json()).error.code === 'invalid_nickname')

  const implausible = await post(env, { ...VALID, score: 999_999_999, level: 50, durationMs: 1000 })
  ok('虚构分 400 implausible_score', implausible.status === 400 && (await implausible.json()).error.code === 'implausible_score')

  // r37b：真实对局时长是 performance.now 浮点差值——必须放行，否则真机提交全被 400 误拒
  const floatMs = await post(env, { ...VALID, score: 100, level: 1, lines: 1, durationMs: 31458.101999999984 })
  ok('小数时长 200（浮点测量值放行，r37b）', floatMs.status === 200)

  // 计数/版本域仍须整数：小数分不得通过
  const floatScore = await post(env, { ...VALID, score: 123.5 })
  ok('小数分数仍 400 bad_request（计数域须整数）', floatScore.status === 400 && (await floatScore.json()).error.code === 'bad_request')

  const badProto = await post(env, { ...VALID, protoVer: 2 })
  ok('protoVer=2 暂拒(Phase2 预留)', badProto.status === 400)
}

console.log('== 4. 限流（每设备 20/10min） ==')
{
  const env = mockEnv()
  const limit = RATE_LIMITS.device.limit
  let last = null
  for (let i = 0; i < limit; i++) last = await post(env, VALID)
  ok('第 ' + limit + ' 次仍通过', last.status === 200)
  const blocked = await post(env, VALID)
  ok('第 ' + (limit + 1) + ' 次 429 rate_limited + Retry-After', blocked.status === 429 && (await blocked.json()).error.code === 'rate_limited' && blocked.headers.get('Retry-After') === String(RATE_LIMITS.device.windowSecs))
}

console.log('== 4b. 限流（每 IP 60/10min，需 CF-Connecting-IP；逐次独立 deviceId 隔离设备维） ==')
{
  const env = mockEnv()
  const limit = RATE_LIMITS.ip.limit
  const IP = '203.0.113.9'
  let last = null
  for (let i = 0; i < limit; i++) last = await post(env, { ...VALID, deviceId: 'ip-test-' + String(i).padStart(3, '0') }, { 'CF-Connecting-IP': IP })
  ok('第 ' + limit + ' 次 IP 维度仍通过', last.status === 200)
  const blocked = await post(env, { ...VALID, deviceId: 'ip-test-extra' }, { 'CF-Connecting-IP': IP })
  ok('第 ' + (limit + 1) + ' 次 IP 429 + Retry-After', blocked.status === 429 && blocked.headers.get('Retry-After') === String(RATE_LIMITS.ip.windowSecs))
}

console.log('== 5. 路由兜底 ==')
{
  const env = mockEnv()
  const notFound = await handleRequest(new Request('https://api.local/api/nope', { method: 'GET' }), env)
  ok('未知路径 404', notFound.status === 404)
  const methodErr = await handleRequest(new Request('https://api.local/api/score', { method: 'GET' }), env)
  ok('/api/score GET 405', methodErr.status === 405)
}

console.log(fail === 0 ? `\nALL PASSED (${pass})` : `\n${fail} FAILED / ${pass} passed`)
process.exit(fail === 0 ? 0 : 1)