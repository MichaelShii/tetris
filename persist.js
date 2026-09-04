/* ============================================================================
 * persist.js — Tetris 应用层统一持久化基础设施（v2.6）
 *
 * 职责：把「最高分」与「音量/静音/幽灵块/BGM/踢墙/暂存/预览队列/操作区背景」八设置持久化到 localStorage。
 *   - createStorage(): localStorage 能力探测 → 不可用自动降级为内存 Map，绝不 throw
 *   - createPersistence(): 返回 load() / saveHighScore(n) / saveSettings(s) / dispose()
 *   - sanitize(value, schema): 纯函数清洗，highScore 非负整数、volume 收敛 0~1 浮点、
 *     其余布尔设置走白名单
 *
 * 设计要点（TECHNICAL v2.6）：
 *   1) 独立 UMD 模块，浏览器挂 window.TetrisPersist，Node/CommonJS 同挂 module.exports。
 *   2) 单键带版本 JSON 承载全部数据（TETRIS_PERSIST_KEY）；坏 JSON → 清键回默认，绝不 throw。
 *   3) 存储能力探测与 sanitize 是单一事实来源，ui.js 只消费 load/save*，杜绝散落 setItem。
 *   4) 全部 try/catch 兜底，任何异常都返回安全默认，保证引擎 game/audio 零污染。
 *   5) 装配序最前（audio.js 之前，见 index.html）：独立性最强、ui 装配前已就绪。
 *   6) 本文件纯逻辑无 DOM，可被 Node scripts/verify-persist.cjs 直接 require 单测。
 *
 * v2.6（对照实验 branch feat/persistence-localStorage2）：new file，纯新增。
 * ============================================================================
 */
(function (root, factory) {
  'use strict'
  const api = factory()
  if (typeof module === 'object' && module !== null && module.exports) module.exports = api
  if (typeof window !== 'undefined' && window !== null) window.TetrisPersist = api
})(
  typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this,
  function () {
    'use strict'

    /* ======================================================================
     * 1. 常量（存储键 / 承载结构，变更单 §3 唯一规格；键名对齐变更单，交由 PM 管理）
     * ==================================================================== */

    const VERSION = '2.6.0'
    // 单键带版本 JSON 承载；版本升级破坏结构时可改 version 触发回默认，兼容留待后续
    const TETRIS_PERSIST_KEY = 'tetris.v2'
    // 负载结构版本（与模块 VERSION 解耦：此值仅标识存储格式，改结构才 +1）
    const PAYLOAD_VERSION = 1

    // r24 操作区背景四皮肤枚举（单一事实来源链：persist ↔ ui.js ↔ index.html radio value，
    // verify-ui 交叉断言防漂移；随 settings 包络持久化，PAYLOAD_VERSION 不变——纯增量向后兼容）
    const DOCK_SKINS = ['glass', 'float', 'fade', 'pod']

    // r31 自定义按键：9 动作固定序（对齐 game.js GAME_BIND_ACTIONS + mute，verify-ui 交叉断言防漂移）
    const KEY_ACTIONS = ['moveLeft', 'moveRight', 'softDrop', 'hardDrop', 'rotate', 'hold', 'togglePause', 'restart', 'mute']
    // 默认键表（单键制一对一；与 game.js DEFAULT_KEYBINDINGS 双声明，verify-ui 交叉断言防漂移；
    // 键名一律小写规范化：箭头 → 'arrowleft' 等、空格保持 ' '）
    const DEFAULT_KEYBINDINGS = {
      moveLeft: 'arrowleft',
      moveRight: 'arrowright',
      softDrop: 'arrowdown',
      hardDrop: ' ',
      rotate: 'arrowup',
      hold: 'c',
      togglePause: 'p',
      restart: 'r',
      mute: 'm',
    }
    // 可绑定键集：单字符可打印（字母/数字/标点/空格）+ 四方向键；其余（Tab/Enter/Escape、
    // 修饰键 Shift/Ctrl/Alt/Meta、CapsLock、F1–F12、NumLock、Insert、PrintScreen 等）黑名单
    const BINDABLE_ARROWS = { arrowleft: true, arrowright: true, arrowup: true, arrowdown: true }
    const FORBIDDEN_KEYS = {
      tab: true, enter: true, escape: true, capslock: true, shift: true, control: true,
      ctrl: true, alt: true, altgraph: true, meta: true, contextmenu: true, numlock: true,
      scrolllock: true, pause: true, insert: true, delete: true, home: true, end: true,
      pageup: true, pagedown: true, backspace: true, printscreen: true,
    }

    // 最高分默认 0（无历史时 HUD 显示 0，后续调用 saveHighScore 只增不减）
    const DEFAULT_HIGH_SCORE = 0
    // r34 全局统计默认值（placed 累计已放置方块 / lines 累计消行 / timeMs 累计时长 ms / games 对局次数；
    // 只增不减随入账递增，累计唯一事实收敛在 persist 层——PRD §1 数据分界②；PAYLOAD_VERSION 不变纯增量）
    const DEFAULT_STATS = { placed: 0, lines: 0, timeMs: 0, games: 0 }
    // 五设置布尔白名单默认值（对齐 ui.js 现状：音量→audio 用 0~1，此处存布尔开关语义见说明）
    const DEFAULT_VOLUME = 0.8
    const DEFAULT_SETTINGS = {
      volume: DEFAULT_VOLUME,
      muted: false,
      ghostEnabled: true,
      bgmEnabled: false, // v2.4 信息面板 BGM 开关默认关（AC-BGM）
      wallKickEnabled: true, // v2.9 信息面板踢墙开关默认开（AC-19.1）
      holdEnabled: true, // v3.2 暂存方块开关默认开（AC-14）
      previewQueueEnabled: true, // v3.2 多格预览队列开关默认开（AC-8）
      dockSkin: 'fade', // r24 操作区背景四皮肤默认 C 渐隐（AC-7/8）
      keybindings: Object.assign({}, DEFAULT_KEYBINDINGS), // r31 自定义按键默认表（settings 纯增量，PAYLOAD_VERSION 不变）
    }

    /* ======================================================================
     * 2. 纯函数 sanitize(value, schema) — 永不 throw
     * ==================================================================== */

    /**
     * 清洗单值。schema 形如：
     *   { type: 'integer', min: 0, max: Infinity, def: 0 }   // 非负整数（最高分）
     *   { type: 'float', min: 0, max: 1, def: 0.8 }           // 收敛浮点（音量），超界收敛上界
     *   { type: 'boolean', def: true }                        // 布尔白名单（其余五设置）
     *   { type: 'string', values: [...], def: 'fade' }        // 字符串枚举白名单（r24 操作区背景）
     * @param {*} value   待清洗值（任意）
     * @param {object} schema  清洗规则
     * @returns {*} 清洗后的安全值（绝不抛异常）
     */
    function sanitize(value, schema) {
      if (!schema || typeof schema !== 'object') return schema && typeof schema.def !== 'undefined' ? schema.def : undefined
      const def = typeof schema.def !== 'undefined' ? schema.def : undefined

      if (schema.type === 'integer') {
        const n = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(n)) return def
        const floor = Math.floor(n)
        const min = typeof schema.min === 'number' ? schema.min : -Infinity
        const max = typeof schema.max === 'number' ? schema.max : Infinity
        if (floor < min) return def
        if (floor > max) return max // 超界 → 收敛到上界（不减分，仍是有效分）
        return floor
      }

      if (schema.type === 'float') {
        const n = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(n)) return def
        const min = typeof schema.min === 'number' ? schema.min : -Infinity
        const max = typeof schema.max === 'number' ? schema.max : Infinity
        if (n < min) return def
        if (n > max) return max // 超界 → 收敛到上界
        return n
      }

      if (schema.type === 'boolean') {
        if (typeof value === 'boolean') return value
        return def // 非布尔 → 回默认（白名单）
      }

      if (schema.type === 'string') {
        // r24：字符串枚举白名单——命中 values 返回原值，非法/缺失 → 回 def（AC-8 非法回退）
        const values = Array.isArray(schema.values) ? schema.values : []
        if (typeof value === 'string' && values.indexOf(value) !== -1) return value
        return def
      }

      return def
    }

    /* ======================================================================
     * 2b. r31 自定义按键：键名规范化 / 可绑定判定 / 9 动作白名单清洗（纯函数，永不 throw）
     * ==================================================================== */

    /**
     * 键名规范化（KeyboardEvent.key → 绑定表小写键名；空格保持 ' '；非字符串/空白 → null）。
     */
    function normalizeKey(key) {
      if (typeof key !== 'string' || key.length === 0) return null
      const s = key === ' ' ? ' ' : key.trim()
      if (s.length === 0) return null
      return s.toLowerCase()
    }

    /**
     * 可绑定键判定：单字符可打印（字母/数字/标点/空格）+ 四方向键准入；
     * 黑名单（Tab/Enter/Escape/修饰键/F1–F12/Insert/PrintScreen 等）与组合键（调用方按
     * e.ctrlKey/altKey/metaKey 拒绝）排除。
     */
    function isBindableKey(key) {
      const s = normalizeKey(key)
      if (s === null) return false
      if (FORBIDDEN_KEYS[s]) return false
      if (/^f\d{1,2}$/.test(s)) return false
      if (s.length === 1) return true
      return BINDABLE_ARROWS[s] === true
    }

    /**
     * 9 动作 keybindings 白名单清洗：非法/缺失回退默认键；后位动作与前者撞键 → 回退默认
     * （一对一保证，冲突由 UI 捕获层前置拦截，此处为持久化兜底）。幂等、永不 throw。
     * @param {*} value 任意输入（settings.keybindings 或用户直接给出的部分表）
     * @returns {object} 9 动作全量表（缺失字段已补默认）
     */
    function sanitizeKeybindings(value) {
      const out = {}
      const src = value && typeof value === 'object' ? value : {}
      const used = {}
      for (let i = 0; i < KEY_ACTIONS.length; i++) {
        const a = KEY_ACTIONS[i]
        const v = src[a]
        const norm = isBindableKey(v) ? normalizeKey(v) : null
        if (norm !== null && !Object.prototype.hasOwnProperty.call(used, norm)) {
          out[a] = norm
          used[norm] = true
        } else {
          out[a] = DEFAULT_KEYBINDINGS[a]
          used[DEFAULT_KEYBINDINGS[a]] = true
        }
      }
      return out
    }

    /* ======================================================================
     * 2c. r37 全网排行榜：设备身份 / 昵称清洗（纯函数，永不 throw）
     *     白名单以 worker 正则为准，双端逐字同规（r37 TECH D3）：
     *       deviceId: ^[A-Za-z0-9-]{8,64}$（UUID v4 形态：32 hex + 4 '-'，与 worker DEVICE_ID_RE 同式）
     *       nickname: trim 后长度 1–12，首字符 [\p{L}\p{N}]、后续 [\p{L}\p{N} _\-·.]（含 CJK 任意文种）
     *     非法 → null（调用方判定）；本文件纯逻辑无 DOM，Node 可直测。
     * ==================================================================== */

    const DEVICE_ID_RE = /^[A-Za-z0-9-]{8,64}$/
    const NICKNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _\-·.]{0,11}$/u

    function sanitizeDeviceId(value) {
      if (typeof value !== 'string') return null
      return DEVICE_ID_RE.test(value) ? value : null
    }

    function sanitizeNickname(value) {
      if (typeof value !== 'string') return null
      const t = value.trim()
      if (t.length === 0 || t.length > 12) return null
      return NICKNAME_RE.test(t) ? t : null
    }

    /* ======================================================================
     * 3. 存储适配器规范化 + createStorage() — 能力探测 + 内存降级，永不 throw
     *
     * 统一存储适配器面（内部契约）：
     *   - get(key): string|null
     *   - set(key, value): void
     *   - remove(key): void
     * 底层真实 Web Storage（localStorage）只有 getItem/setItem/removeItem，
     * 因此任何存储对象在进入应用层前都必须经 toStorageAdapter() 归一化，
     * 杜绝「探测/注入与真实调用面不一致」的适配器漂移（BUG-P1-1 修复）。
     * ==================================================================== */

    // 把任意存储对象归一化为内部 get/set/remove 面：
    //   - 形状 A（真实对象/原生 localStorage）：getItem/setItem/removeItem
    //   - 形状 B（已归一化/内存 Map）：get/set/remove
    function toStorageAdapter(raw) {
      if (!raw || typeof raw !== 'object') {
        return createMemoryMap() // 缺省：内存兜底（永不 throw）
      }
      if (typeof raw.getItem === 'function') {
        return {
          get: function (key) {
            try {
              const v = raw.getItem(key)
              return v === undefined || v === null ? null : String(v)
            } catch (_e) {
              return null
            }
          },
          set: function (key, value) {
            raw.setItem(key, String(value))
          },
          remove: function (key) {
            raw.removeItem(key)
          },
        }
      }
      if (typeof raw.get === 'function') {
        return raw // 已是内部面，原样使用
      }
      return createMemoryMap()
    }

    function createStorage() {
      // 内存 Map 兜底（available=false 时使用；同时作为 get 的缺省读取源）
      let available = false
      let store = null

      // localStorage 能力探测：try setItem/removeItem → catch → available=false
      // 探测与命中后的调用面必须是同一套方法（getItem/setItem/removeItem），经
      // toStorageAdapter 归一化后进入内部契约，防止「探测过、调用炸」的静默失效。
      try {
        const hasLocalStorage =
          typeof window !== 'undefined' &&
          window !== null &&
          typeof window.localStorage !== 'undefined' &&
          window.localStorage !== null
        if (hasLocalStorage) {
          const ls = window.localStorage
          const PROBE = '__tetris_persist_probe__'
          ls.setItem(PROBE, '1')
          const readBack = ls.getItem(PROBE)
          ls.removeItem(PROBE)
          if (readBack === '1') {
            available = true
            store = toStorageAdapter(ls)
          }
        }
      } catch (_e) {
        // 任何访问/写入异常 → 降级内存
        available = false
        store = null
      }

      if (!available) store = createMemoryMap()

      return {
        available: available,
        get: function (key) {
          try {
            const v = store.get(key)
            return v === undefined || v === null ? null : String(v)
          } catch (_e) {
            return null
          }
        },
        set: function (key, value) {
          try {
            store.set(key, String(value))
          } catch (_e) {
            // 写失败静默忽略（保持 available 语义：后续 get 回落内存/默认）
          }
        },
        remove: function (key) {
          try {
            store.remove(key)
          } catch (_e) {
            // 忽略
          }
        },
      }
    }

    // 内存 Map 兜底存储（结构对齐 Storage API 子集）
    function createMemoryMap() {
      const map = Object.create(null)
      return {
        get: function (key) {
          return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null
        },
        set: function (key, value) {
          map[key] = value
        },
        remove: function (key) {
          if (Object.prototype.hasOwnProperty.call(map, key)) delete map[key]
        },
      }
    }

    /* ======================================================================
     * 4. createPersistence() — 应用层边界
     * ==================================================================== */

    /**
     * 创建持久化门面（浏览器/Node 通用）。
     * @param {object} [opts]  { key, storage } 可选注入（测试可换内存 storage）
     * @returns {{
     *   load(): {highScore:number, settings:{volume,muted,ghostEnabled,bgmEnabled}},
     *   saveHighScore(n): boolean,
     *   saveSettings(s): boolean,
     *   dispose(): void
     * }}
     */
    function createPersistence(opts) {
      const opt = opts && typeof opts === 'object' ? opts : {}
      const key = typeof opt.key === 'string' && opt.key ? opt.key : TETRIS_PERSIST_KEY
      // 注入的存储同样归一化到 get/set/remove 面（形状 A getItem/setItem/removeItem
      // 亦接受），确保任意注入（真实 localStorage 形状 / 内存 Map）行为一致（BUG-P1-1）。
      let store = opt.storage ? toStorageAdapter(opt.storage) : createStorage()
      let disposed = false

      // 只增不减缓存：当前已持久化的最高分（内存镜像，写回时取 max）
      let persistedHighScore = DEFAULT_HIGH_SCORE

      /**
       * 把底层字符串解析成内部负载对象；坏 JSON / 结构不符 → 返回 null（交给调用方清键）。
       */
      function decode(raw) {
        if (!raw) return null
        let obj
        try {
          obj = JSON.parse(raw)
        } catch (_e) {
          return null
        }
        if (!obj || typeof obj !== 'object') return null
        if (obj.version !== PAYLOAD_VERSION) return null
        return obj
      }

      /**
       * 从解析后的负载提取清洗后的 state（缺失字段回默认）。
       */
      function readState(obj) {
        const highScore = sanitize(
          obj && obj.highScore,
          { type: 'integer', min: 0, max: Infinity, def: DEFAULT_HIGH_SCORE }
        )
        // r34 全局统计：非负整数白名单清洗（负/NaN/浮点→0 或 floor；缺失/非对象 → 全 0——AC-3 旧数据兼容）
        const st = obj && obj.stats && typeof obj.stats === 'object' ? obj.stats : {}
        const settings = obj && obj.settings && typeof obj.settings === 'object' ? obj.settings : {}
        return {
          highScore: highScore,
          stats: {
            placed: sanitize(st.placed, { type: 'integer', min: 0, max: Infinity, def: DEFAULT_STATS.placed }),
            lines: sanitize(st.lines, { type: 'integer', min: 0, max: Infinity, def: DEFAULT_STATS.lines }),
            timeMs: sanitize(st.timeMs, { type: 'integer', min: 0, max: Infinity, def: DEFAULT_STATS.timeMs }),
            games: sanitize(st.games, { type: 'integer', min: 0, max: Infinity, def: DEFAULT_STATS.games }),
          },
          settings: {
            volume: sanitize(settings.volume, { type: 'float', min: 0, max: 1, def: DEFAULT_SETTINGS.volume }),
            muted: sanitize(settings.muted, { type: 'boolean', def: DEFAULT_SETTINGS.muted }),
            ghostEnabled: sanitize(settings.ghostEnabled, { type: 'boolean', def: DEFAULT_SETTINGS.ghostEnabled }),
            bgmEnabled: sanitize(settings.bgmEnabled, { type: 'boolean', def: DEFAULT_SETTINGS.bgmEnabled }),
            wallKickEnabled: sanitize(settings.wallKickEnabled, { type: 'boolean', def: DEFAULT_SETTINGS.wallKickEnabled }),
            holdEnabled: sanitize(settings.holdEnabled, { type: 'boolean', def: DEFAULT_SETTINGS.holdEnabled }),
            previewQueueEnabled: sanitize(settings.previewQueueEnabled, { type: 'boolean', def: DEFAULT_SETTINGS.previewQueueEnabled }),
            dockSkin: sanitize(settings.dockSkin, { type: 'string', values: DOCK_SKINS, def: DEFAULT_SETTINGS.dockSkin }),
            // r31 自定义按键：9 动作白名单清洗（非法/冲突回退默认；纯增量字段）
            keybindings: sanitizeKeybindings(settings.keybindings),
          },
          // r37 顶层新字段（纯增量，缺失回 null）：deviceId 设备身份 / nickname 昵称缓存
          deviceId: sanitizeDeviceId(obj && obj.deviceId),
          nickname: sanitizeNickname(obj && obj.nickname),
        }
      }

      /**
       * 当前内部负载序列化为字符串（含版本）。失败返回 null。
       */
      function encode(state) {
        try {
          return JSON.stringify({
            version: PAYLOAD_VERSION,
            highScore: state.highScore,
            stats: {
              placed: state.stats.placed,
              lines: state.stats.lines,
              timeMs: state.stats.timeMs,
              games: state.stats.games,
            },
            settings: {
              volume: state.settings.volume,
              muted: state.settings.muted,
              ghostEnabled: state.settings.ghostEnabled,
              bgmEnabled: state.settings.bgmEnabled,
              wallKickEnabled: state.settings.wallKickEnabled,
              holdEnabled: state.settings.holdEnabled,
              previewQueueEnabled: state.settings.previewQueueEnabled,
              dockSkin: state.settings.dockSkin,
              keybindings: sanitizeKeybindings(state.settings.keybindings),
            },
            // r37：顶层纯增量字段（缺失回 null，旧载荷向后兼容）
            deviceId: state.deviceId,
            nickname: state.nickname,
          })
        } catch (_e) {
          return null
        }
      }

      // 写盘（仅内部：合并后写，失败静默）
      function commit(state) {
        const raw = encode(state)
        if (raw === null) return false
        store.set(key, raw)
        return true
      }

      /**
       * load() — 读取并清洗。坏 JSON / 结构不符 → 清键回默认。
       * @returns {{highScore:number, settings:object}}
       */
      function load() {
        if (disposed) return readState(null)
        const raw = store.get(key)
        const obj = decode(raw)
        if (obj === null && raw !== null) {
          // 坏 JSON：清键回默认（remove 容错，绝不 throw）
          store.remove(key)
        }
        const state = readState(obj)
        // 同步内存镜像（下次 saveHighScore 以此为底）
        persistedHighScore = state.highScore
        return state
      }

      /**
       * saveHighScore(n) — 只增不减：写入 max(持久化最高分, sanitize(n))。
       * @returns {boolean} 是否成功写盘（内存降级也称成功——应用层语义一致）
       */
      function saveHighScore(n) {
        if (disposed) return false
        const next = sanitize(n, { type: 'integer', min: 0, max: Infinity, def: persistedHighScore })
        if (next <= persistedHighScore) {
          // 不高不写（只增不减）；但仍返回 true，调用方无需感知跳过
          return true
        }
        persistedHighScore = next
        const current = load()
        // 保留已读设置与全局统计，仅覆写最高分（避免刷新设置/stats 字段——stats 为 r34 单键顶端字段，
        // 若不带入则本写盘会整体覆盖掉已入账的全局统计，AC-2 只增不减语义被破坏）
        const merged = {
          highScore: next,
          stats: current.stats,
          settings: current.settings,
          deviceId: current.deviceId,
          nickname: current.nickname,
        }
        return commit(merged)
      }

      /**
       * saveSettings(s) — 布尔白名单清洗后写回全部设置。
       * @returns {boolean} 是否成功写盘
       */
      function saveSettings(s) {
        if (disposed) return false
        const clean = readState({ settings: s && typeof s === 'object' ? s : {} })
        const current = load()
        const merged = {
          highScore: current.highScore,
          stats: current.stats,
          settings: clean.settings,
          deviceId: current.deviceId,
          nickname: current.nickname,
        }
        return commit(merged)
      }

      /**
       * saveStats(delta) — 全局统计只增不减累加（r34；累计唯一事实在 persist 层）。
       * 每字段 sanitize 非负整数后叠加；空增量快速返回 true 不写盘；内存降级/失败静默成功（与 saveHighScore 同语义）。
       * @param {{placed?:number, lines?:number, timeMs?:number, games?:number}} delta 增量（引擎 onStats 事件载荷透传）
       * @returns {boolean} 写盘成功（含空增量快路径；dispose 后 false）
       */
      function saveStats(delta) {
        if (disposed) return false
        const d = delta && typeof delta === 'object' ? delta : {}
        const add = {
          placed: sanitize(d.placed, { type: 'integer', min: 0, max: Infinity, def: DEFAULT_STATS.placed }),
          lines: sanitize(d.lines, { type: 'integer', min: 0, max: Infinity, def: DEFAULT_STATS.lines }),
          timeMs: sanitize(d.timeMs, { type: 'integer', min: 0, max: Infinity, def: DEFAULT_STATS.timeMs }),
          games: sanitize(d.games, { type: 'integer', min: 0, max: Infinity, def: DEFAULT_STATS.games }),
        }
        if (add.placed === 0 && add.lines === 0 && add.timeMs === 0 && add.games === 0) return true // 空增量：不写盘（幂等快路径）
        const current = load() // 读当前（含旧数据兼容清洗），保持 highScore/settings 原值
        const merged = {
          highScore: current.highScore,
          settings: current.settings,
          deviceId: current.deviceId,
          nickname: current.nickname,
          stats: {
            placed: current.stats.placed + add.placed,
            lines: current.stats.lines + add.lines,
            timeMs: current.stats.timeMs + add.timeMs,
            games: current.stats.games + add.games,
          },
        }
        return commit(merged)
      }

      /**
       * saveDeviceId(id) — r37：设备身份持久化（UUID v4；只在清洗合法时写盘，合并保留其余载荷）。
       * 业务侧禁止裸 setItem/getItem（memory.md 既有约定，AC-4）；清洗非法 → false 不写盘。
       * @returns {boolean} dispose 后 false；清洗非法 false；写盘成功 true（内存降级亦称成功）
       */
      function saveDeviceId(id) {
        if (disposed) return false
        const clean = sanitizeDeviceId(id)
        if (clean === null) return false
        const current = load()
        const merged = {
          highScore: current.highScore,
          stats: current.stats,
          settings: current.settings,
          deviceId: clean,
          nickname: current.nickname,
        }
        return commit(merged)
      }

      /**
       * saveNickname(name) — r37：昵称缓存持久化（白名单清洗同 worker 正则，双端同规）。
       * 只存不校验存在性（空昵称提交由 leaderboard.js 首弹门槛裁决）；清洗非法 → false 不写盘。
       * @returns {boolean} dispose 后 false；清洗非法 false；写盘成功 true
       */
      function saveNickname(name) {
        if (disposed) return false
        const clean = sanitizeNickname(name)
        if (clean === null) return false
        const current = load()
        const merged = {
          highScore: current.highScore,
          stats: current.stats,
          settings: current.settings,
          deviceId: current.deviceId,
          nickname: clean,
        }
        return commit(merged)
      }

      /**
       * dispose() — 释放内部引用（内存降级时清空 Map）。之后 load/save* 不再写盘。
       */
      function dispose() {
        try {
          if (store && typeof store.dispose === 'function') store.dispose()
        } catch (_e) {
          // 忽略
        }
        store = null
        persistedHighScore = DEFAULT_HIGH_SCORE
        disposed = true
      }

      return {
        load: load,
        saveHighScore: saveHighScore,
        saveSettings: saveSettings,
        saveStats: saveStats, // r34：全局统计累加出口（只增不减）
        saveDeviceId: saveDeviceId, // r37：设备身份持久化出口（清洗合法才写）
        saveNickname: saveNickname, // r37：昵称缓存持久化出口（清洗合法才写）
        dispose: dispose,
      }
    }

    /* ======================================================================
     * 5. 对外导出（window.TetrisPersist / module.exports）
     * ==================================================================== */
    return {
      VERSION: VERSION,
      TETRIS_PERSIST_KEY: TETRIS_PERSIST_KEY,
      PAYLOAD_VERSION: PAYLOAD_VERSION,
      DEFAULT_HIGH_SCORE: DEFAULT_HIGH_SCORE,
      DEFAULT_SETTINGS: DEFAULT_SETTINGS,
      // r34 全局统计默认四元组（additive 不升 PAYLOAD_VERSION；与 saveStats/load().stats 配套）
      DEFAULT_STATS: { placed: DEFAULT_STATS.placed, lines: DEFAULT_STATS.lines, timeMs: DEFAULT_STATS.timeMs, games: DEFAULT_STATS.games },
      DOCK_SKINS: DOCK_SKINS,
      // r31 自定义按键契约（键表 / 动作序 / 规范化 / 白名单清洗——与 game.js 双声明由 verify-ui 交叉断言）
      KEY_ACTIONS: KEY_ACTIONS.slice(),
      DEFAULT_KEYBINDINGS: Object.assign({}, DEFAULT_KEYBINDINGS),
      normalizeKey: normalizeKey,
      isBindableKey: isBindableKey,
      sanitizeKeybindings: sanitizeKeybindings,
      sanitize: sanitize,
      // r37：设备身份 / 昵称清洗纯函数（与 worker 正则同式，Node 直测；leaderboard.js 同规双保险）
      sanitizeDeviceId: sanitizeDeviceId,
      sanitizeNickname: sanitizeNickname,
      createStorage: createStorage,
      createPersistence: createPersistence,
    }
  }
)
