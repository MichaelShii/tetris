/* ============================================================================
 * persist.js — Tetris 应用层统一持久化基础设施（v2.6）
 *
 * 职责：把「最高分」与「音量/静音/幽灵块/BGM」四设置持久化到 localStorage。
 *   - createStorage(): localStorage 能力探测 → 不可用自动降级为内存 Map，绝不 throw
 *   - createPersistence(): 返回 load() / saveHighScore(n) / saveSettings(s) / dispose()
 *   - sanitize(value, schema): 纯函数清洗，highScore 非负整数、volume 收敛 0~1 浮点、
 *     其余三设置布尔白名单
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

    // 最高分默认 0（无历史时 HUD 显示 0，后续调用 saveHighScore 只增不减）
    const DEFAULT_HIGH_SCORE = 0
    // 四设置布尔白名单默认值（对齐 ui.js 现状：音量→audio 用 0~1，此处存布尔开关语义见说明）
    const DEFAULT_VOLUME = 0.8
    const DEFAULT_SETTINGS = {
      volume: DEFAULT_VOLUME,
      muted: false,
      ghostEnabled: true,
      bgmEnabled: false, // v2.4 信息面板 BGM 开关默认关（AC-BGM）
    }

    /* ======================================================================
     * 2. 纯函数 sanitize(value, schema) — 永不 throw
     * ==================================================================== */

    /**
     * 清洗单值。schema 形如：
     *   { type: 'integer', min: 0, max: Infinity, def: 0 }   // 非负整数（最高分）
     *   { type: 'float', min: 0, max: 1, def: 0.8 }           // 收敛浮点（音量），超界收敛上界
     *   { type: 'boolean', def: true }                        // 布尔白名单（其余三设置）
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

      return def
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
        const settings = obj && obj.settings && typeof obj.settings === 'object' ? obj.settings : {}
        return {
          highScore: highScore,
          settings: {
            volume: sanitize(settings.volume, { type: 'float', min: 0, max: 1, def: DEFAULT_SETTINGS.volume }),
            muted: sanitize(settings.muted, { type: 'boolean', def: DEFAULT_SETTINGS.muted }),
            ghostEnabled: sanitize(settings.ghostEnabled, { type: 'boolean', def: DEFAULT_SETTINGS.ghostEnabled }),
            bgmEnabled: sanitize(settings.bgmEnabled, { type: 'boolean', def: DEFAULT_SETTINGS.bgmEnabled }),
          },
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
            settings: {
              volume: state.settings.volume,
              muted: state.settings.muted,
              ghostEnabled: state.settings.ghostEnabled,
              bgmEnabled: state.settings.bgmEnabled,
            },
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
        // 保留已读设置，仅覆写最高分（避免刷新设置字段）
        const merged = {
          highScore: next,
          settings: current.settings,
        }
        return commit(merged)
      }

      /**
       * saveSettings(s) — 布尔白名单清洗后写回全部四设置。
       * @returns {boolean} 是否成功写盘
       */
      function saveSettings(s) {
        if (disposed) return false
        const clean = readState({ settings: s && typeof s === 'object' ? s : {} })
        const current = load()
        const merged = {
          highScore: current.highScore,
          settings: clean.settings,
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
      sanitize: sanitize,
      createStorage: createStorage,
      createPersistence: createPersistence,
    }
  }
)
