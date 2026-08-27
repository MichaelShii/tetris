/*!
 * tetris/audio.js — Web Audio API 合成音效引擎（v2.0 音效系统）
 * ============================================================================
 * 任务：T-B audio.js 合成引擎（对应任务卡「音效引擎 sound.js」）
 * 依据：PRD §5.2（音效规格，AC-09/AC-10）/ TECHNICAL §2.2（权威参数表）、§3.1（接口契约）
 *
 * 对外契约（浏览器）：window.TetrisAudio；Node/CommonJS 下同时 module.exports。
 *   - 零外部音频文件（AC-09.5）：7 类事件音效全部由 OscillatorNode + GainNode
 *     包络实时合成，项目内不存在 .mp3/.wav/.ogg/.m4a 与 <audio>/<source> 元素。
 *   - 顶层零 DOM/Audio 副作用（Node 可 require）：AudioContext 惰性初始化——首次
 *     unlock()（宿主在首次用户交互时调用）才触碰 Web Audio（AC-09.6 自动播放策略）。
 *   - 不依赖任何 UI 元素 ID、不绑定任何事件（解锁/按键监听由宿主 ui.js 负责）。
 *
 * SfxEngine（工厂 + 闭包，不用 class；AGENTS.md §4 风格；TECHNICAL §3.1）：
 *   unlock()     首次用户交互时调用：创建并 resume AudioContext（幂等，懒创建）
 *   play(name)   同步调度合成；未解锁/不可用/静音/超并发 → 静默 no-op（0 报错）
 *   setVolume(v) clamp [0,1]，即时生效（下一次 play 即用新值，AC-10.4）
 *   getVolume() / setMuted(m) / isMuted() / isAvailable() / dispose()
 *
 * 发声职责唯一（TECHNICAL §1.1）：本文件是唯一触碰 Web Audio API 的模块；
 * game.js 只发事件名（onSfx），ui.js 只做接线与控件。
 * ============================================================================
 */
(function (root, factory) {
  'use strict'
  const api = factory()
  if (typeof module === 'object' && module !== null && module.exports) module.exports = api
  if (typeof window !== 'undefined' && window !== null) window.TetrisAudio = api
})(
  typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this,
  function () {
    'use strict'

    /* ======================================================================
     * 1. 常量（PRD §5.2 / TECHNICAL §2.2 权威参数表，数值单一事实来源）
     * ==================================================================== */

    const VERSION = '2.3.0'

    // 默认音量 80%（AC-10.4）；调节步进 10%（≤10%）；同时发声上限 4（AC-09.8）
    const DEFAULT_VOLUME = 0.8
    const VOLUME_STEP = 0.1
    const MAX_VOICES = 4

    // 单 voice 峰值增益（TECHNICAL §2.2 防削波：0.22 × 4 = 0.88 ≤ 1.0，AC-10.4）
    const VOICE_PEAK = 0.22
    // 指数衰减目标不可为 0（Web Audio 限制），用极小值收尾（TECHNICAL §6.2）
    const ENV_FLOOR = 0.0001
    // 振荡器 stop 尾音（包络结束后的小尾巴，防咔哒截断）
    const STOP_TAIL_S = 0.02

    /**
     * 7 类事件音效定义表（TECHNICAL §2.2 逐字段落盘；verify-audio.cjs 按表断言）：
     *   waveform 波形 | freq 基频 Hz | freqEnd 滑音终频（可选）| duration 总时长 s
     *   attack 起音 s | decay 指数衰减 s | peak 峰值增益 | notes/arpeggio 多音结构（可选）
     * 单音事件（move/rotate/softDrop/hardDrop/gameOver）：duration = attack + decay；
     * 多音事件（clear 双响 2 音 / levelUp 琶音 3 音）：每音时长 = duration / 音数，
     *   每音包络 = attack（起音）+ decay（衰减）。
     *
     * 可区分性证明（AC-09.1）：基频 98/165/220/380/440/523/660 相邻差值
     *   67/55/160/60/83/137 全部 ≥ 50Hz；波形 4 种（square/sine/triangle/sawtooth）
     *   与时长（30~520ms 两两不同）双通道可区分。
     */
    const SFX_DEFS = {
      // 短促「咔哒」：square 220Hz，40ms
      move: { waveform: 'square', freq: 220, duration: 0.04, attack: 0.002, decay: 0.038, peak: VOICE_PEAK },
      // 明亮短音：sine 440Hz，80ms
      rotate: { waveform: 'sine', freq: 440, duration: 0.08, attack: 0.005, decay: 0.075, peak: VOICE_PEAK },
      // 轻点：triangle 165Hz，30ms
      softDrop: { waveform: 'triangle', freq: 165, duration: 0.03, attack: 0.001, decay: 0.029, peak: VOICE_PEAK },
      // 低沉落底：sawtooth 98→55Hz 下滑，70ms
      hardDrop: { waveform: 'sawtooth', freq: 98, freqEnd: 55, duration: 0.07, attack: 0.005, decay: 0.065, peak: VOICE_PEAK },
      // 清脆双响：square 660Hz 两击，140ms
      clear: { waveform: 'square', freq: 660, duration: 0.14, attack: 0.005, decay: 0.065, peak: VOICE_PEAK, notes: 2 },
      // 上行琶音：sine 523→659→784，320ms（逐音起音 8ms）
      levelUp: { waveform: 'sine', freq: 523, arpeggio: [523, 659, 784], duration: 0.32, attack: 0.008, decay: 0.0987, peak: VOICE_PEAK },
      // 长下滑：sawtooth 380→190Hz，520ms
      gameOver: { waveform: 'sawtooth', freq: 380, freqEnd: 190, duration: 0.52, attack: 0.02, decay: 0.5, peak: VOICE_PEAK },
      // 清脆短音：sine 523Hz，180ms（Hold 暂存提示）
      hold: { waveform: 'sine', freq: 523, duration: 0.18, attack: 0.005, decay: 0.175, peak: VOICE_PEAK },
    }

    /** BGM 定义（v2.4：信息面板 BGM 开关）。独立于 SFX_DEFS（SFX 是离散事件、受
     *  assembly-check 7 事件集约束）；BGM 是连续循环旋律。八音盒式低频方波短音，低增益，
     *  经 masterGain 汇入主链路 → 音量/静音控件天然作用其上，互不影响开关状态。
     *  bpm 节拍 | notes 音符序列（freq 频率 / beats 拍数）| waveform | peak 单音峰值 */
    const BGM_DEFS = {
      bpm: 96,
      waveform: 'triangle',
      peak: 0.16,
      notes: [
        { freq: 262, beats: 1 }, // C4
        { freq: 330, beats: 1 }, // E4
        { freq: 392, beats: 1 }, // G4
        { freq: 523, beats: 1 }, // C5
        { freq: 392, beats: 1 }, // G4
        { freq: 330, beats: 1 }, // E4
        { freq: 262, beats: 2 }, // C4（长音作小节谷）
        { freq: 220, beats: 1 }, // A3
        { freq: 262, beats: 1 }, // C4
        { freq: 330, beats: 1 }, // E4
        { freq: 392, beats: 1 }, // G4
        { freq: 330, beats: 1 }, // E4
        { freq: 294, beats: 1 }, // D4
        { freq: 220, beats: 2 }, // A3
      ],
    }

    /* ======================================================================
     * 2. AudioContext 工厂（惰性创建；Safari webkitAudioContext 兜底；可注入测试）
     * ==================================================================== */

    /** 浏览器能力探测（AC-09.7）：window.AudioContext || webkitAudioContext；均缺失 → null */
    function defaultCreateContext() {
      if (typeof window === 'undefined' || window === null) return null
      const Ctor = window.AudioContext || window.webkitAudioContext
      return Ctor ? new Ctor() : null
    }

    /* ======================================================================
     * 3. 会话工厂 createSfxEngine（工厂 + 闭包，不用 class；唯一可变状态持有者）
     * ==================================================================== */

    /**
     * @param {object} [options]
     * @param {() => AudioContextLike} [options.createContext] 测试注入假 AudioContext；
     *        缺省按环境自建（能力探测；创建失败/缺失 → 无声降级，AC-09.7 0 报错）
     */
    function createSfxEngine(options) {
      const opts = options || {}
      const createContext = typeof opts.createContext === 'function' ? opts.createContext : defaultCreateContext

      let ctx = null // AudioContext（unlock 时懒创建）
      let masterGain = null // 主输出增益（volume / muted，AC-10.3 静音双保险）
      let volume = DEFAULT_VOLUME
      let muted = false
      let unlocked = false
      let disposed = false
      const active = new Set() // 活动 voice（{ osc, gain }），onended/dispose 清理（AC-09.8）
      let bgmPlaying = false // BGM 开关态（默认关，AC-14.1：未经交互不出声）
      let bgmInterval = null // BGM 循环调度句柄（setInterval）
      const bgmVoices = new Set() // BGM 专属 voice（独立于 SFX 并发上限，低音量常驻）

      /* ---- 主增益链路：voice 包络 Gain → masterGain → ctx.destination ---- */

      /** 静音语义（AC-10.3）：muted 标志 + 主增益置 0 双保险；关闭立即恢复，无需重新 unlock */
      function applyMasterGain() {
        if (masterGain) masterGain.gain.value = muted ? 0 : volume
      }

      /** 惰性建图（幂等）；返回 false 表示不可用（创建/挂接失败 → 永久无声降级） */
      function buildGraph() {
        if (ctx) return true
        let c = null
        try {
          c = createContext()
        } catch (err) {
          c = null // 创建抛错 → 无声降级（AC-09.7，0 报错）
        }
        if (!c) return false
        ctx = c
        try {
          masterGain = ctx.createGain()
          masterGain.gain.value = muted ? 0 : volume
          masterGain.connect(ctx.destination)
        } catch (err) {
          // 假/降级 ctx 缺 createGain/connect → 视同不可用
          ctx = null
          masterGain = null
          return false
        }
        return true
      }

      /** 解锁 resume（自动播放策略，AC-09.6）：suspended 才 resume，Promise 吞错 */
      function resumeIfSuspended() {
        if (!ctx) return
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          try {
            const p = ctx.resume()
            if (p && typeof p.catch === 'function') p.catch(function () {})
          } catch (err) {
            // 吞错：静默降级
          }
        }
      }

      /* ---- voice 调度 ---- */

      /** 拆解为音符序列（单音 1 个；clear 双响 2 个；levelUp 琶音 3 个），均分 duration */
      function notePlan(def) {
        if (def.notes && def.notes > 1) {
          const step = def.duration / def.notes
          const notes = []
          for (let i = 0; i < def.notes; i++) {
            notes.push({ freq: def.freq, offset: i * step, dur: step })
          }
          return notes
        }
        if (Array.isArray(def.arpeggio) && def.arpeggio.length > 1) {
          const step = def.duration / def.arpeggio.length
          return def.arpeggio.map(function (f, i) {
            return { freq: f, offset: i * step, dur: step }
          })
        }
        return [{ freq: def.freq, freqEnd: def.freqEnd, offset: 0, dur: def.duration }]
      }

      /**
       * 调度一个 voice：OscillatorNode（波形/基频/滑音）+ GainNode 包络（起音→指数衰减）。
       * 超过并发上限（active.size >= MAX_VOICES）→ false 丢弃，不排队（AC-09.8）。
       */
      function scheduleVoice(def, note, startTime) {
        if (active.size >= MAX_VOICES) return false
        if (!ctx || !masterGain) return false
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = def.waveform
        osc.frequency.setValueAtTime(note.freq, startTime)
        if (typeof note.freqEnd === 'number') {
          osc.frequency.exponentialRampToValueAtTime(note.freqEnd, startTime + note.dur)
        }
        // 包络：attack 线性起音 → 指数衰减（exp 目标不可为 0，用 ENV_FLOOR，TECHNICAL §6.2）
        gain.gain.setValueAtTime(0, startTime)
        gain.gain.linearRampToValueAtTime(def.peak, startTime + def.attack)
        gain.gain.exponentialRampToValueAtTime(ENV_FLOOR, startTime + note.dur)
        osc.connect(gain)
        gain.connect(masterGain)

        const entry = { osc: osc, gain: gain }
        active.add(entry)

        /** voice 结束/被停 → 计数递减 + disconnect（防泄漏，AC-09.8）；幂等 */
        function cleanup() {
          if (!active.has(entry)) return
          active.delete(entry)
          try { gain.disconnect() } catch (err) { /* 吞错 */ }
          try { osc.disconnect() } catch (err) { /* 吞错 */ }
        }
        // onended 由真实 AudioContext 触发；假 ctx 测试中由 stop() 驱动
        try { osc.onended = cleanup } catch (err) { /* 只读假对象则依赖 dispose 兜底 */ }

        try {
          osc.start(startTime)
          osc.stop(startTime + note.dur + STOP_TAIL_S)
        } catch (err) {
          cleanup() // 调度失败立即回收，防节点泄漏
        }
        return true
      }

      /* ---- BGM（v2.4：连续合成背景乐） ----
         与 SFX voice 独立：不争抢 MAX_VOICES 并发位（常驻低音量，AC-14.2 不挤占音效）；
         经 BGM gain → masterGain 汇入主链路，故音量/静音控件作用其上，
         但开关态与 mute/volume 互不影响（AC-14.3）。仅解锁/可用时真正发声（AC-14.1）。
         用 setInterval 按节拍逐音调度一次 loop，环绕循环，stop 时拆线。 ---- */

      /** 调度 BGM 的一个音符 voice（独立于 SFX 并发上限；失败静默 no-op） */
      function scheduleBgmNote(freq, peak, attack, dur, t0) {
        if (!ctx || !masterGain) return
        try {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = BGM_DEFS.waveform
          osc.frequency.setValueAtTime(freq, t0)
          gain.gain.setValueAtTime(0, t0)
          gain.gain.linearRampToValueAtTime(peak, t0 + attack)
          gain.gain.exponentialRampToValueAtTime(ENV_FLOOR, t0 + dur)
          osc.connect(gain)
          gain.connect(masterGain)
          const entry = { osc: osc, gain: gain }
          bgmVoices.add(entry)
          function cleanup() {
            if (!bgmVoices.has(entry)) return
            bgmVoices.delete(entry)
            try { gain.disconnect() } catch (err) { /* 吞错 */ }
            try { osc.disconnect() } catch (err) { /* 吞错 */ }
          }
          try { osc.onended = cleanup } catch (err) { /* 只读假对象则依赖 stopBgm/dispose 兜底 */ }
          osc.start(t0)
          osc.stop(t0 + dur + STOP_TAIL_S)
        } catch (err) {
          // 调度失败 → 本轮音符静默跳过（0 报错降级）
        }
      }

      /** 调度整个 BGM loop（按 BGM_DEFS 节拍铺满一条旋律，音间留微小静音谷） */
      function scheduleBgmLoop() {
        if (!ctx || disposed || !bgmPlaying) return
        const beat = 60 / BGM_DEFS.bpm
        let t = Math.max(ctx.currentTime, 0)
        for (const note of BGM_DEFS.notes) {
          const dur = note.beats * beat
          const attack = Math.min(0.02, dur * 0.25)
          scheduleBgmNote(note.freq, BGM_DEFS.peak, attack, dur - 0.02, t)
          t += dur
        }
      }

      /** 开启 BGM：确保已解锁/建图（幂等），随后按节拍循环调度；重复调用 no-op
          不可用（降级）→ 静默 no-op 不置开（AC-09.7/14.1 0 报错） */
      function startBgm() {
        if (disposed || bgmPlaying) return
        if (!unlocked) unlock() // 用户交互后已解锁即直接可用；未解锁则惰性解锁
        if (!ctx || !masterGain) return // 无声降级：不凭空调度、不置开
        bgmPlaying = true
        scheduleBgmLoop()
        const loopMs = BGM_DEFS.notes.reduce(function (a, n) { return a + n.beats }, 0) * (60 / BGM_DEFS.bpm) * 1000
        // 浏览器定时器（ui.js/game.js 既有惯例）；Node 测试环境缺省工厂无声，仅状态切换
        if (typeof setInterval === 'function') {
          bgmInterval = setInterval(scheduleBgmLoop, loopMs)
        } else {
          bgmInterval = null
        }
      }

      /** 停止 BGM：清调度、停掉所有 BG voice 并拆线；可重复调用 */
      function stopBgm() {
        bgmPlaying = false
        if (bgmInterval !== null && typeof clearInterval === 'function') {
          clearInterval(bgmInterval)
        }
        bgmInterval = null
        for (const entry of bgmVoices) {
          try { entry.osc.stop() } catch (err) { /* 已停止 */ }
          try { entry.osc.disconnect() } catch (err) { /* 吞错 */ }
          try { entry.gain.disconnect() } catch (err) { /* 吞错 */ }
        }
        bgmVoices.clear()
      }

      function isBgmPlaying() {
        return bgmPlaying
      }

      /* ---- 公开 API ---- */

      /** 首次用户交互调用：创建并 resume AudioContext（懒创建，幂等；失败 → 永久无声降级） */
      function unlock() {
        if (disposed || unlocked) return
        unlocked = true
        if (buildGraph()) resumeIfSuspended()
      }

      /**
       * 同步调度合成（事件回调内调用，事件→发声 ≤ 50ms，AC-09.4）。
       * 未解锁 / 不可用 / 事件名非法 / 静音 / 超并发 → 静默 no-op（0 报错，AC-09.6/7）。
       */
      function play(name) {
        if (disposed || !unlocked || !ctx || !masterGain) return
        const def = SFX_DEFS[name]
        if (!def) return
        if (muted) return // 静音短路，零调度成本（AC-10.3，E-SFX-08）
        const t0 = ctx.currentTime
        for (const note of notePlan(def)) {
          if (!scheduleVoice(def, note, t0 + note.offset)) break // 超并发 → 丢弃后续音符
        }
      }

      /** 音量 clamp [0,1]；即时生效（AC-10.4）；非法输入忽略保持原值 */
      function setVolume(v) {
        if (typeof v === 'number' && isFinite(v)) {
          volume = Math.min(1, Math.max(0, v))
        }
        applyMasterGain()
      }

      function getVolume() {
        return volume
      }

      /** 静音：muted 标志 + 主增益置 0；关闭立即恢复（无需重新 unlock，AC-10.3） */
      function setMuted(m) {
        muted = !!m
        applyMasterGain()
      }

      function isMuted() {
        return muted
      }

      /** Web Audio 可用性（降级判定，AC-09.7）：引擎当前是否可发声 */
      function isAvailable() {
        return !disposed && unlocked && !!ctx && !!masterGain && ctx.state !== 'closed'
      }

      /** 全清理：停掉全部活动 voice（stop+disconnect）、断开主增益、ctx.close()（幂等，AC-05.4 语义扩展） */
      function dispose() {
        if (disposed) return
        disposed = true
        stopBgm() // BGM 清调度 + 停 voice（幂等）
        for (const entry of active) {
          try { entry.osc.stop() } catch (err) { /* 已停止 */ }
          try { entry.osc.disconnect() } catch (err) { /* 吞错 */ }
          try { entry.gain.disconnect() } catch (err) { /* 吞错 */ }
        }
        active.clear()
        if (ctx) {
          try {
            const p = ctx.close()
            if (p && typeof p.catch === 'function') p.catch(function () {})
          } catch (err) { /* 吞错 */ }
        }
        ctx = null
        masterGain = null
      }

      return {
        unlock: unlock,
        play: play,
        setVolume: setVolume,
        getVolume: getVolume,
        setMuted: setMuted,
        isMuted: isMuted,
        isAvailable: isAvailable,
        startBgm: startBgm, // v2.4：信息面板 BGM 开关
        stopBgm: stopBgm,
        isBgmPlaying: isBgmPlaying,
        dispose: dispose,
      }
    }

    /* ======================================================================
     * 4. 对外导出（window.TetrisAudio / module.exports）
     * ==================================================================== */
    return {
      VERSION: VERSION,
      SFX_DEFS: SFX_DEFS,
      BGM_DEFS: BGM_DEFS, // v2.4：BGM 定义（信息面板开关）
      DEFAULT_VOLUME: DEFAULT_VOLUME,
      VOLUME_STEP: VOLUME_STEP,
      MAX_VOICES: MAX_VOICES,
      createSfxEngine: createSfxEngine,
    }
  }
)
