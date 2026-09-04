/* ============================================================================
 * leaderboard.js — Tetris 全网排行榜前端纯逻辑层（r37 Phase 1）
 *
 * 职责：匿名全网榜的前端逻辑中枢（无 DOM，DOM 组件工厂归 ui.js）——
 *   1. 设备身份：generateDeviceId() UUID v4 生成 + persist.saveDeviceId 持久化（AC-4）
 *   2. OVER 提交决策树 reportOver(snap)：score<=0/缺键/degraded 短路；无昵称→首弹门槛
 *      （onNeedNickname 恰一次）；有昵称→POST /api/score（buildPayload → fetch）
 *   3. degraded 能力探测降级：协议非 http/https 或 fetch 不可用 → true，全部动作短路、
 *      0 次 fetch、不 throw（AC-8：file:// 双击离线无入口）
 *   4. 拉榜 fetchBoards()：GET /api/leaderboard 双视图（all/week Top20）原样透传
 *   5. 失败静默：无 toast、无 console.error；POST 失败最多 1 次退避重试后放弃（AC-3）
 *
 * 规约契约（r37 TECH D2/D3/D4，双端同规）：
 *   - 载荷字段钉名 protoVer=1（worker parseSubmit 已按此落地，防双名漂移）
 *   - durationMs = snapshot.sessionTimeMs（暂停不计、OVER 定格，与全局统计同引擎事实）
 *   - 昵称白名单以 worker 正则为准：trim 后 1–12，首字符 [\p{L}\p{N}]、
 *     后续 [\p{L}\p{N} _\-·.]（含 CJK 任意文种）——下方 NICKNAME_RE 与 persist 逐字同式
 *
 * 依赖：persist 句柄（load/saveDeviceId/saveNickname）可选传入；纯逻辑 Node 可 require。
 * ============================================================================
 */
(function (root, factory) {
  'use strict'
  const api = factory()
  if (typeof module === 'object' && module !== null && module.exports) module.exports = api
  if (typeof window !== 'undefined' && window !== null) window.TetrisLeaderboard = api
})(
  typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this,
  function () {
    'use strict'

    /* ======================================================================
     * 1. 常量（唯一登记点：leaderboard.js 常量 ↔ assembly-check 白名单 ↔ worker README
     *    三处同源，改域名须三处同步——PRD §6 风险④）
     * ==================================================================== */
    const PROTOCOL_VERSION = 1
    const API_BASE = 'https://leaderboard-api.michaelshi28.workers.dev'
    const SUBMIT_BACKOFF_MS = 1500 // POST 失败退避（至多 1 次重试）
    const FETCH_TIMEOUT_MS = 8000 // fetch 超时（AbortController）

    // 昵称白名单（与 persist.sanitizeNickname 逐字同式；独立实现双保险——PRD AC-5「客户端同服务端规则」）
    const NICKNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _\-·.]{0,11}$/u

    /* ======================================================================
     * 2. 纯函数（Node 直测出口）
     * ==================================================================== */

    /**
     * sanitizeNickname(name) — 客户端清洗（D3 同规）：trim → 长度 1–12 → 白名单正则。
     * 非法（空/超长/首字符空白或符号/emoji/控制符）→ null。服务端不剔除只拒，合法字符集逐字同源。
     * @param {*} value 任意输入
     * @returns {string|null} 清洗后的合法昵称或 null
     */
    function sanitizeNickname(value) {
      if (typeof value !== 'string') return null
      const t = value.trim()
      if (t.length === 0 || t.length > 12) return null
      return NICKNAME_RE.test(t) ? t : null
    }

    /**
     * generateDeviceId() — UUID v4 设备身份：crypto.randomUUID() 优先；缺失降级手工 v4
     * （Math.random 随机位拼装，variant/version 位固定），绝不 throw（AC-4）。
     * 形态 `xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx`（36 字符，命中 sanitizeDeviceId 白名单）。
     * @returns {string}
     */
    function generateDeviceId() {
      try {
        if (typeof crypto !== 'undefined' && crypto !== null && typeof crypto.randomUUID === 'function') {
          const u = crypto.randomUUID()
          if (typeof u === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(u)) return u
        }
      } catch (_e) {
        // 降级手工 v4
      }
      const hex = function (n) {
        let s = ''
        for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16)
        return s
      }
      return hex(8) + '-' + hex(4) + '-4' + hex(3) + '-' + '8' + hex(3) + '-' + hex(12)
    }

    /**
     * buildPayload(snap, deviceId, nickname) — 构造 POST /api/score 载荷（字段名钉死）。
     * snap 缺 score/level/lines/sessionTimeMs 任一数值键或 deviceId/nickname 非法 → null。
     * @param {object} snap 引擎 OVER 定格快照（snapshot.sessionTimeMs 为 durationMs 单一事实源，D4）
     * @param {string} deviceId 设备 UUID v4
     * @param {string} nickname 合法昵称（已清洗）
     * @returns {object|null}
     */
    function buildPayload(snap, deviceId, nickname) {
      if (!snap || typeof snap !== 'object') return null
      if (
        typeof snap.score !== 'number' ||
        typeof snap.level !== 'number' ||
        typeof snap.lines !== 'number' ||
        typeof snap.sessionTimeMs !== 'number'
      ) return null
      if (typeof deviceId !== 'string' || !deviceId || typeof nickname !== 'string' || !nickname) return null
      return {
        protoVer: PROTOCOL_VERSION,
        nickname: nickname,
        score: snap.score,
        level: snap.level,
        lines: snap.lines,
        durationMs: snap.sessionTimeMs,
        deviceId: deviceId,
      }
    }

    /* ======================================================================
     * 3. createLeaderboard(opts) — 排行榜逻辑句柄（纯函数/闭包，无 class）
     * ==================================================================== */

    /**
     * createLeaderboard(opts?) → handle
     * opts:
     *   persist?   （r37 可选）应用层持久化句柄 = TetrisPersist.createPersistence()；
     *              提供则启用 deviceId/昵称读写；缺失 → 身份/昵称全部短路（装配根保证与 persist 同生同灭）
     *   canFetch?  显式覆盖环境探测（Node/jsdom 测试注入 true/false 越过协议 + fetch 探测）
     *   fetchImpl? 测试注入 fetch 实现（缺省 = 全局 fetch）
     * handle 导出面（契约钉死，qa-e2e/verify-leaderboard/assembly 锚点同源）：
     *   degraded:boolean / reportOver(snap) / setNickname(name) / submitPending() /
     *   cancelPendingSubmission() / fetchBoards() / onNeedNickname(cb) / dispose()
     */
    function createLeaderboard(opts) {
      const opt = opts && typeof opts === 'object' ? opts : {}
      const persist =
        opt.persist &&
        typeof opt.persist.load === 'function' &&
        typeof opt.persist.saveNickname === 'function' &&
        typeof opt.persist.saveDeviceId === 'function'
          ? opt.persist
          : null
      const fetchImpl = typeof opt.fetchImpl === 'function' ? opt.fetchImpl : (typeof fetch === 'function' ? fetch : null)

      // degraded 判定时点 = 构造期（协议 + fetch 探测；AC-8）。能力探测降级不 throw（persist.js 风格）。
      let degraded = false
      if (opt.canFetch !== undefined) {
        degraded = !opt.canFetch
      } else {
        const proto = typeof location !== 'undefined' && location ? location.protocol : ''
        degraded = !(fetchImpl !== null && (proto === 'http:' || proto === 'https:'))
      }

      let disposed = false
      let pendingSub = null // 待提交快照（首弹门槛持态；单局恰一次兜底）
      let lastOverSnap = null // 单局恰一次：同一 OVER 定格对象重复回调不重入（引擎面已保证每局一次，
      // 此兜底拦截同一快照对象的重复 reportOver；新局新对象 → 天然放行，无跨局残留）
      let needNicknameCb = null
      let deviceIdCache = null
      let retryTimer = null

      function getNickname() {
        if (!persist) return null
        const state = persist.load()
        return state && state.nickname ? state.nickname : null
      }

      function getDeviceId() {
        if (deviceIdCache) return deviceIdCache
        if (!persist) return null
        const state = persist.load()
        if (state && state.deviceId) {
          deviceIdCache = state.deviceId
          return deviceIdCache
        }
        const id = generateDeviceId() // 首次生成即持久化（AC-4）；写盘失败（理论不可达）退会话内内存值
        if (persist.saveDeviceId(id)) deviceIdCache = id
        return id
      }

      /**
       * reportOver(snap) — AC-2 提交决策树（§4.1）：
       *   degraded / 缺键 / score<=0 → 短路；pendingSub 已存在 → 返回（防同局重复入流）；
       *   无昵称 → 首弹门槛（onNeedNickname 恰一次）；有昵称 → 直接 POST。
       * @param {object} snap 引擎 OVER 定格快照（引用即可，内部不再持有）
       */
      function reportOver(snap) {
        if (disposed || degraded) return
        if (!snap || typeof snap !== 'object') return
        if (
          typeof snap.score !== 'number' ||
          typeof snap.level !== 'number' ||
          typeof snap.lines !== 'number' ||
          typeof snap.sessionTimeMs !== 'number'
        ) return
        if (snap.score <= 0) return // D7：0 分局不弹窗不提交
        if (pendingSub !== null) return
        if (snap === lastOverSnap) return // 单局恰一次兜底：同一 OVER 定格对象重复回调不重入
        lastOverSnap = snap
        const nickname = getNickname()
        if (!nickname) {
          pendingSub = snap
          if (typeof needNicknameCb === 'function') needNicknameCb()
          return
        }
        doSubmit(snap, nickname)
      }

      /**
       * setNickname(name) — 客户端清洗（D3）→ 合法则 persist.saveNickname + 返回 true；
       * 非法 → false（不持久化）。仅持久化，不续提——「首弹确认→submitPending / 设置修改→仅持久化」
       * 由调用方（ui.js 组件按打开者区分）驱动（r37 TECH §5#5）。
       * @param {string} name 原始输入
       * @returns {boolean}
       */
      function setNickname(name) {
        if (disposed || degraded || !persist) return false
        const clean = sanitizeNickname(name)
        if (clean === null) return false
        return persist.saveNickname(clean)
      }

      /**
       * submitPending() — 昵称首弹确认后续提：pendingSub 存在且已有合法昵称 → 清待提交并 POST。
       */
      function submitPending() {
        if (disposed || degraded) return
        const s = pendingSub
        if (s === null) return
        const nickname = getNickname()
        if (!nickname) return // 仍无合法昵称（确认被拒）→ 保持待提交，等下次确认
        pendingSub = null
        doSubmit(s, nickname)
      }

      /**
       * cancelPendingSubmission() — 昵称弹窗取消：清待提交（本局不上榜，静默；下局再弹）。
       */
      function cancelPendingSubmission() {
        pendingSub = null
      }

      /* ---- POST 提交（失败静默：最多 1 次退避重试后放弃，无 throw、无 console.error） ---- */
      function doSubmit(snap, nickname) {
        const deviceId = getDeviceId()
        const payload = deviceId !== null ? buildPayload(snap, deviceId, nickname) : null
        if (payload === null) return
        attemptSubmit(payload, 0)
      }

      function attemptSubmit(payload, retries) {
        if (disposed) return
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
        let timer = null
        if (controller !== null && typeof setTimeout === 'function') {
          timer = setTimeout(function () {
            try { controller.abort() } catch (_e) { /* 已 settle 忽略 */ }
          }, FETCH_TIMEOUT_MS)
        }
        const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        if (controller !== null) init.signal = controller.signal

        let settled = false
        function finish(retriesDone) {
          if (disposed) return
          if (retriesDone > 0) return // 二次失败：静默放弃（pendingSub 已清，无残留）
          retryTimer = setTimeout(function () {
            retryTimer = null
            attemptSubmit(payload, 1)
          }, SUBMIT_BACKOFF_MS)
        }

        Promise.resolve()
          .then(function () { return fetchImpl(API_BASE + '/api/score', init) })
          .then(function (resp) {
            const okResp = resp && typeof resp.ok === 'boolean' ? resp.ok : false
            if (!settled) { settled = true; if (timer !== null) clearTimeout(timer); if (!okResp) finish(retries) }
          })
          .catch(function () {
            if (!settled) { settled = true; if (timer !== null) clearTimeout(timer); finish(retries) }
          })
      }

      /**
       * fetchBoards() — GET /api/leaderboard 双视图（all/week Top20，worker 原样透传）。
       * 失败/超时/非 2xx → {ok:false}（面板「暂不可用」）；GET 不受限流。
       * @returns {Promise<{ok:true, all:Array, week:Array} | {ok:false}>}
       */
      function fetchBoards() {
        if (disposed || degraded) return Promise.resolve({ ok: false })
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
        let timer = null
        if (controller !== null && typeof setTimeout === 'function') {
          timer = setTimeout(function () {
            try { controller.abort() } catch (_e) { /* 忽略 */ }
          }, FETCH_TIMEOUT_MS)
        }
        const init = { method: 'GET' }
        if (controller !== null) init.signal = controller.signal
        return new Promise(function (resolve) {
          Promise.resolve()
            .then(function () { return fetchImpl(API_BASE + '/api/leaderboard', init) })
            .then(function (resp) {
              if (!resp || typeof resp.ok !== 'boolean' || !resp.ok || typeof resp.json !== 'function') {
                resolve({ ok: false })
                return
              }
              return resp.json().then(function (data) {
                if (data && data.ok === true && Array.isArray(data.all) && Array.isArray(data.week)) {
                  resolve({ ok: true, all: data.all, week: data.week })
                } else {
                  resolve({ ok: false })
                }
              }).catch(function () { resolve({ ok: false }) })
            })
            .catch(function () { resolve({ ok: false }) })
            .then(function () { if (timer !== null) clearTimeout(timer) })
        })
      }

      /**
       * onNeedNickname(cb) — 首弹门槛回调注册（ui.js 接线时注入；reportOver 内「待提交且无昵称」时调用恰一次）。
       */
      function onNeedNickname(cb) {
        needNicknameCb = typeof cb === 'function' ? cb : null
      }

      /**
       * dispose() — 清 pendingSub / 重试计时 / 回调（对称解绑；之后全部动作短路）。
       */
      function dispose() {
        disposed = true
        pendingSub = null
        lastOverSnap = null
        needNicknameCb = null
        deviceIdCache = null
        if (retryTimer !== null) {
          clearTimeout(retryTimer)
          retryTimer = null
        }
      }

      return {
        degraded: degraded,
        reportOver: reportOver,
        setNickname: setNickname,
        submitPending: submitPending,
        cancelPendingSubmission: cancelPendingSubmission,
        fetchBoards: fetchBoards,
        onNeedNickname: onNeedNickname,
        dispose: dispose,
      }
    }

    /* ======================================================================
     * 4. 对外导出（window.TetrisLeaderboard / module.exports）
     * ==================================================================== */
    return {
      createLeaderboard: createLeaderboard,
      sanitizeNickname: sanitizeNickname,
      buildPayload: buildPayload,
      generateDeviceId: generateDeviceId,
      API_BASE: API_BASE, // 装配锚点/测试登记（与 assembly-check 白名单同源）
      PROTOCOL_VERSION: PROTOCOL_VERSION,
    }
  }
)