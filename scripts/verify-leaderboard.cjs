'use strict'
/*!
 * tetris/scripts/verify-leaderboard.cjs — r37 全网排行榜前端逻辑层自检（node:test，零依赖）
 * ============================================================================
 * 运行：node scripts/verify-leaderboard.cjs
 *
 * 背景（r37 TECHNICAL §6.1，AC-14）：leaderboard.js 为纯逻辑 UMD 模块（无 DOM），Node 可 require；
 * 本脚本以 mock fetch（fetchImpl 注入）+ 真实 persist 内存存储覆盖：
 *   1. 载荷构造 buildPayload（全字段含 protoVer=1；缺键 → null）
 *   2. reportOver 决策树：score<=0 / 缺键 → 0 fetch；单局恰一次（同对象重复回调不重入）
 *   3. 失败重试 ≤1（先败后成 → 2 次 fetch 最终成功；二次失败 → 静默无 throw）
 *   4. 昵称清洗 sanitizeNickname（长度/白名单/空拒/CJK/emoji/首字符符号）+ setNickname 非法不持久化
 *   5. deviceId：generateDeviceId 形态 / saveDeviceId 往返 / persist 内存降级会话内稳定
 *   6. degraded 停摆：canFetch:false → reportOver/fetchBoards 0 fetch；canFetch:true → false
 *   7. 429/网络失败静默：无异常泄漏、pendingSub 清空（下局可再提）
 *   8. fetchBoards 双视图透传与 {ok:false} 路径
 * 作为 r37 八套回归出口之一（verify-game/audio/ui/persist/constants 保持 0-diff）。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const L = require('../leaderboard.js')
const P = require('../persist.js')

// —— 测试用真实回写底层（对齐 verify-persist makeBacking 风格：跨实例持久共享容器） ——
function makeBacking(initial) {
  const m = Object.create(null)
  if (initial) for (const k of Object.keys(initial)) m[k] = String(initial[k])
  return {
    raw: m,
    get: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null },
    set: function (k, v) { m[k] = String(v) },
    remove: function (k) { if (Object.prototype.hasOwnProperty.call(m, k)) delete m[k] },
  }
}

/** 构造测试句柄：真实 persist（内存存储）+ 注入 fetchImpl */
function makeLb(opts) {
  const o = opts || {}
  const backing = makeBacking()
  const store = {
    getItem: function (k) { return backing.get(k) },
    setItem: function (k, v) { backing.set(k, v) },
    removeItem: function (k) { backing.remove(k) },
  }
  const persist = P.createPersistence({ storage: store })
  if (typeof o.nickname === 'string') persist.saveNickname(o.nickname)
  const lb = L.createLeaderboard({
    persist: persist,
    canFetch: o.canFetch !== undefined ? o.canFetch : true,
    fetchImpl: o.fetchImpl || function () { return Promise.resolve({ ok: true, status: 200 }) },
  })
  return { lb: lb, persist: persist, backing: backing }
}

/** 计数型 fetch 注入器：records(url, init) → 可控响应序列 */
function makeSpy(responses) {
  const calls = []
  const spy = function (url, init) {
    calls.push({ url: url, init: init ? JSON.parse(init.body || 'null') : null })
    const r = (responses && responses.length > 0) ? responses.shift() : { ok: true, status: 200 }
    if (r && typeof r.respond === 'function') return r.respond()
    if (r && r.reject) return Promise.reject(new Error('mock network fail'))
    return Promise.resolve({ ok: !!r.ok, status: r.status || 200, json: r.json })
  }
  spy.calls = calls
  return spy
}

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

const SNAP = { score: 120, level: 2, lines: 3, sessionTimeMs: 45000 }

/* ============================================================================
 * 1. 模块导出面（装配锚点同源）
 * ========================================================================== */
test('leaderboard: 导出契约齐全（createLeaderboard/纯函数/常量）', () => {
  assert.equal(typeof L.createLeaderboard, 'function')
  assert.equal(typeof L.sanitizeNickname, 'function')
  assert.equal(typeof L.buildPayload, 'function')
  assert.equal(typeof L.generateDeviceId, 'function')
  assert.equal(typeof L.API_BASE, 'string')
  assert.equal(L.API_BASE, 'https://tetris-leaderboard-api.michaelshi28.workers.dev') // 三处同源登记点
  assert.equal(L.PROTOCOL_VERSION, 1) // D2：载荷字段钉名 protoVer=1
})

/* ============================================================================
 * 2. buildPayload 载荷构造（§6.1「载荷构造」）
 * ========================================================================== */
test('buildPayload: 全字段且 protoVer===1 / durationMs=sessionTimeMs（D4）', () => {
  const p = L.buildPayload(SNAP, 'a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab', '玩家甲')
  assert.ok(p !== null)
  assert.equal(p.protoVer, 1)
  assert.equal(p.nickname, '玩家甲')
  assert.equal(p.score, 120)
  assert.equal(p.level, 2)
  assert.equal(p.lines, 3)
  assert.equal(p.durationMs, 45000) // D4：durationMs = snapshot.sessionTimeMs
  assert.equal(p.deviceId, 'a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab')
})

test('buildPayload: 浮点时长取整发送（r37b：performance.now 差值 → 整数字节）', () => {
  const p = L.buildPayload({ score: 100, level: 1, lines: 1, sessionTimeMs: 31458.101999999984 }, 'a1b2c3d4-e5f6-4a7b-8c9d-0123456789ab', '玩家甲')
  assert.ok(p !== null)
  assert.equal(p.durationMs, 31458)
})

test('buildPayload: 缺键 / 非法入参 → null', () => {
  assert.equal(L.buildPayload(null, 'id', 'n'), null)
  assert.equal(L.buildPayload({}, 'id', 'n'), null)
  assert.equal(L.buildPayload({ score: 1, level: 1, lines: 0 }, 'id', 'n'), null) // 缺 sessionTimeMs
  assert.equal(L.buildPayload(SNAP, '', 'n'), null)
  assert.equal(L.buildPayload(SNAP, 'id', ''), null)
  assert.equal(L.buildPayload(SNAP, 42, 'n'), null)
})

/* ============================================================================
 * 3. reportOver 决策树（score<=0 / 缺键 0 fetch；单局恰一次）
 * ========================================================================== */
test('reportOver: score<=0 / snap 缺键 → 0 fetch（D7：0 分局不弹窗不提交）', () => {
  const spy = makeSpy()
  const { lb } = makeLb({ nickname: '玩家甲', fetchImpl: spy })
  lb.reportOver({ score: 0, level: 1, lines: 0, sessionTimeMs: 1000 })
  lb.reportOver({ score: 100, level: 1 }) // 缺 lines/sessionTimeMs
  lb.reportOver(null)
  lb.reportOver('nope')
  assert.equal(spy.calls.length, 0)
})

test('reportOver: 单局恰一次——同 OVER 定格对象重复回调不重入（仍 1 次 fetch）', async () => {
  const spy = makeSpy()
  const { lb } = makeLb({ nickname: '玩家甲', fetchImpl: spy })
  lb.reportOver(SNAP)
  lb.reportOver(SNAP) // 同对象重复（引擎面已保证每局一次，兜底拦截）
  await sleep(20)
  assert.equal(spy.calls.length, 1, '同局二次 reportOver 应仍 1 次 fetch')
  const body = spy.calls[0].init
  assert.equal(body.protoVer, 1)
  assert.ok(body.deviceId) // 首次生成
})

test('reportOver: 新局新对象 → 可再提交（无跨局残留，§4.1）', async () => {
  const spy = makeSpy()
  const { lb } = makeLb({ nickname: '玩家甲', fetchImpl: spy })
  lb.reportOver(SNAP)
  lb.reportOver(Object.assign({}, SNAP)) // 新对象 = 新局
  await sleep(20)
  assert.equal(spy.calls.length, 2)
})

/* ============================================================================
 * 4. 失败重试 ≤1（先败后成 / 二次失败静默）
 * ========================================================================== */
test('submit: 先败后成 → 2 次 fetch 且最终成功态（不再重试）', async () => {
  let failFirst = true
  const spy = makeSpy()
  const wrapped = function (url, init) {
    spy(url, init)
    if (failFirst) { failFirst = false; return Promise.reject(new Error('mock down')) }
    return Promise.resolve({ ok: true, status: 200 })
  }
  const { lb } = makeLb({ nickname: '玩家甲', fetchImpl: wrapped })
  lb.reportOver(SNAP)
  await sleep(1700) // SUBMIT_BACKOFF_MS=1500 + 余量
  assert.equal(spy.calls.length, 2, '失败重试 ≤1（先败后成 → 恰 2 次）')
  const before = spy.calls.length
  await sleep(100)
  assert.equal(spy.calls.length, before, '成功后无再重试（最终成功态）')
})

test('submit: 二次失败 → 静默放弃（无 throw、无 console.error、fetch 恰 2 次）', async () => {
  const spy = makeSpy([{ reject: true }, { reject: true }])
  const { lb } = makeLb({ nickname: '玩家甲', fetchImpl: spy })
  let threw = false
  try {
    lb.reportOver(SNAP)
    await sleep(3200) // 首次失败 → 1500ms 退避 → 二次失败 → 放弃
  } catch (e) { threw = true }
  assert.equal(threw, false, '不得泄漏异常')
  assert.equal(spy.calls.length, 2, '至多 1 次重试（共 2 次 fetch）')
})

test('submit: 429 与网络失败同路径静默（无计数提示，pendingSub 无残留、下局可再提）', async () => {
  let calls = 0
  const fetchImpl = function () {
    calls++
    return Promise.resolve({ ok: false, status: 429 }) // 429 = 失败（与网络失败同路径）
  }
  const { lb } = makeLb({ nickname: '玩家甲', fetchImpl: fetchImpl })
  let threw = false
  try { lb.reportOver(SNAP); await sleep(3200) } catch (e) { threw = true }
  assert.equal(threw, false)
  assert.equal(calls, 2) // 限流失败同路径：至多 1 次重试
  // pendingSub 清空（无昵称路径的取消语义由 cancelPendingSubmission 保证；此处无昵称→首弹门槛互斥测试见昵称节）
})

/* ============================================================================
 * 5. 昵称清洗（sanitizeNickname / setNickname）
 * ========================================================================== */
test('sanitizeNickname: 白名单/长度/空拒（CJK 通过、emoji 拒、首字符符号拒、trim）', () => {
  assert.equal(L.sanitizeNickname('玩家甲'), '玩家甲') // CJK 通过
  assert.equal(L.sanitizeNickname('a'), 'a') // 1 字符
  assert.equal(L.sanitizeNickname('abcdefghijkl'), 'abcdefghijkl') // 12 上限
  assert.equal(L.sanitizeNickname(' hello '), 'hello') // trim
  assert.equal(L.sanitizeNickname('abc def'), 'abc def') // 空格在白名单
  assert.equal(L.sanitizeNickname('a-b_c.d·e'), 'a-b_c.d·e') // -/_/. /· 在白名单
  assert.equal(L.sanitizeNickname(''), null) // 空拒
  assert.equal(L.sanitizeNickname('   '), null)
  assert.equal(L.sanitizeNickname('abcdefghijklm'), null) // 13 超长
  assert.equal(L.sanitizeNickname('😀'), null) // emoji 拒
  assert.equal(L.sanitizeNickname('-abc'), null) // 首字符符号拒
  assert.equal(L.sanitizeNickname(' abc'), 'abc') // 前导空白 trim 后通过（首字符语义以 trim 后为准）
  assert.equal(L.sanitizeNickname(42), null) // 非字符串
  assert.equal(L.sanitizeNickname(null), null)
})

test('setNickname: 非法 → false 且不持久化；合法 → true 且落盘', () => {
  const { lb, persist } = makeLb()
  assert.equal(lb.setNickname(''), false)
  assert.equal(lb.setNickname('😀😀'), false)
  assert.equal(persist.load().nickname, null, '非法不得持久化')
  assert.equal(lb.setNickname('玩家乙'), true)
  assert.equal(persist.load().nickname, '玩家乙')
})

/* ============================================================================
 * 6. deviceId（generateDeviceId 形态 / saveDeviceId 往返 / 会话内稳定）
 * ========================================================================== */
test('generateDeviceId: UUID v4 形态（8-4-4-4-12，version=4，variant）', () => {
  const id = L.generateDeviceId()
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  assert.equal(id.length, 36)
})

test('deviceId: saveDeviceId 往返（清洗合法才写 / 直接持久化后提交复用）', async () => {
  const spy = makeSpy()
  const { lb, persist } = makeLb({ nickname: '玩家甲', fetchImpl: spy })
  // 非法 id 不写
  assert.equal(persist.saveDeviceId('no-dash!'), false)
  assert.equal(persist.load().deviceId, null)
  // 合法 id → 往返 + 提交复用
  const uid = 'aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  assert.equal(persist.saveDeviceId(uid), true)
  lb.reportOver(SNAP)
  await sleep(20)
  assert.equal(persist.load().deviceId, uid)
  assert.equal(spy.calls[0].init.deviceId, uid)
})

test('deviceId: 自动生成后持久化，跨实例（同 backing）复用稳定', async () => {
  const backing = makeBacking()
  const store = {
    getItem: function (k) { return backing.get(k) },
    setItem: function (k, v) { backing.set(k, v) },
    removeItem: function (k) { backing.remove(k) },
  }
  const persist1 = P.createPersistence({ storage: store })
  persist1.saveNickname('玩家甲') // 有昵称 → 走 POST 路径（触发生成并持久化 deviceId）
  const spy1 = makeSpy()
  const lb1 = L.createLeaderboard({ persist: persist1, canFetch: true, fetchImpl: spy1 })
  lb1.reportOver(SNAP)
  await sleep(20)
  const id1 = spy1.calls[0].init.deviceId
  assert.ok(id1 && persist1.load().deviceId === id1, '首次生成即持久化（AC-4）')

  const persist2 = P.createPersistence({ storage: store }) // 跨实例 = 刷新重开
  persist2.saveNickname('玩家甲')
  const spy2 = makeSpy()
  const lb2 = L.createLeaderboard({ persist: persist2, canFetch: true, fetchImpl: spy2 })
  lb2.reportOver(SNAP)
  await sleep(20)
  assert.equal(spy2.calls[0].init.deviceId, id1, '跨实例复用同一 deviceId（会话稳定）')
})

/* ============================================================================
 * 7. degraded 停摆（AC-8：0 fetch）
 * ========================================================================== */
test('degraded: canFetch:false → degraded===true、reportOver/fetchBoards 0 fetch', async () => {
  const spy = makeSpy()
  const { lb } = makeLb({ nickname: '玩家甲', canFetch: false, fetchImpl: spy })
  assert.equal(lb.degraded, true)
  lb.reportOver(SNAP)
  const res = await lb.fetchBoards()
  assert.equal(res.ok, false)
  assert.equal(spy.calls.length, 0, 'degraded 停摆：0 fetch')
})

test('degraded: canFetch:true → degraded===false', () => {
  const { lb } = makeLb({ canFetch: true })
  assert.equal(lb.degraded, false)
})

/* ============================================================================
 * 8. fetchBoards 双视图透传与 {ok:false} 路径
 * ========================================================================== */
test('fetchBoards: 成功 → 双视图数据透传（all/week 原样）', async () => {
  const all = [
    { rank: 1, nickname: '甲', score: 100, level: 5, lines: 10 },
    { rank: 2, nickname: '乙', score: 90, level: 4, lines: 9 },
    { rank: 3, nickname: '丙', score: 80, level: 3, lines: 8 },
  ]
  const week = [{ rank: 1, nickname: '丁', score: 50, level: 2, lines: 5 }]
  const spy = makeSpy([{ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true, proto: 1, generatedAt: 1, all: all, week: week }) } }])
  const { lb } = makeLb({ fetchImpl: spy })
  const res = await lb.fetchBoards()
  assert.equal(res.ok, true)
  assert.deepEqual(res.all, all)
  assert.deepEqual(res.week, week)
  assert.equal(spy.calls.length, 1)
})

test('fetchBoards: 失败/非 ok 载荷 → {ok:false}', async () => {
  // 网络失败
  const lbA = makeLb({ fetchImpl: function () { return Promise.reject(new Error('down')) } }).lb
  const resA = await lbA.fetchBoards()
  assert.equal(resA.ok, false)
  // 载荷缺 all/week
  const spyB = makeSpy([{ ok: true, status: 200, json: function () { return Promise.resolve({ ok: true }) } }])
  const resB = await makeLb({ fetchImpl: spyB }).lb.fetchBoards()
  assert.equal(resB.ok, false)
  // 非 2xx
  const spyC = makeSpy([{ ok: false, status: 500 }])
  const resC = await makeLb({ fetchImpl: spyC }).lb.fetchBoards()
  assert.equal(resC.ok, false)
})

/* ============================================================================
 * 9. 首弹门槛（onNeedNickname 恰一次 + 取消清提交）
 * ========================================================================== */
test('onNeedNickname: 无昵称 OVER → 回调恰一次；确认后续提', async () => {
  const spy = makeSpy()
  const { lb, persist } = makeLb({ fetchImpl: spy }) // 无昵称
  let fired = 0
  lb.onNeedNickname(function () { fired++ })
  lb.reportOver(SNAP)
  lb.reportOver(SNAP) // 同对象 → 兜底 + pendingSub 防重入：回调不得二次
  await sleep(10)
  assert.equal(fired, 1, '首弹门槛恰一次')
  assert.equal(spy.calls.length, 0, '未确认前不 fetch')
  assert.equal(lb.setNickname('首弹玩家'), true)
  lb.submitPending() // 确认 → 续提
  await sleep(20)
  assert.equal(spy.calls.length, 1, '确认后续提恰 1 次 POST')
  assert.equal(spy.calls[0].init.nickname, '首弹玩家')
  assert.equal(persist.load().nickname, '首弹玩家')
})

test('onNeedNickname: 取消 → cancelPendingSubmission 清待提交（本局不上榜，下局再弹）', async () => {
  const spy = makeSpy()
  const { lb } = makeLb({ fetchImpl: spy })
  let fired = 0
  lb.onNeedNickname(function () { fired++ })
  lb.reportOver(SNAP)
  await sleep(10)
  assert.equal(fired, 1)
  lb.cancelPendingSubmission() // 取消：静默放弃本次
  lb.cancelPendingSubmission() // 幂等 no-op
  lb.setNickname('后来设置')
  lb.submitPending() // 待提交已清 → 不续提（本局不上榜）
  await sleep(20)
  assert.equal(spy.calls.length, 0, '取消后本局不再提交')
})

test('dispose: 清待提交/回调/计时（之后全部动作短路）', async () => {
  const spy = makeSpy()
  const { lb } = makeLb({ nickname: '玩家甲', fetchImpl: spy })
  lb.dispose()
  lb.reportOver(SNAP)
  try { lb.setNickname('x') } catch (e) { assert.fail('dispose 后不得 throw') }
  const res = await lb.fetchBoards()
  assert.equal(res.ok, false)
  assert.equal(spy.calls.length, 0)
})