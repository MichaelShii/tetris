'use strict'
/*!
 * tetris/scripts/verify-audio.cjs — audio.js 合成音效引擎自检（node:test，零依赖）
 * ============================================================================
 * 运行：node scripts/verify-audio.cjs
 *
 * 覆盖（TECHNICAL §7.2）：
 *   1. 导出与顶层零 DOM/Audio 副作用（Node require 安全）
 *   2. SFX_DEFS 结构：7 键齐全（与 game.js 导出的 SFX_EVENTS 集合一致）、字段完整
 *   3. 可区分性（AC-09.1 自动化）：基频排序相邻差值 ≥ 50Hz、波形 ≥ 3 种、时长两两不同
 *   4. 音量/静音（AC-10.3/4）：默认 80%、clamp、静音主增益置 0、关闭恢复
 *   5. 并发上限（AC-09.8）：≤ 4，超出丢弃（单音/多音两路）
 *   6. unlock 语义（AC-09.6）：解锁前不建 ctx、play 无副作用；解锁后创建并 resume；幂等
 *   7. 降级（AC-09.7）：createContext 抛错/返回 null/缺 createGain → isAvailable=false，全 no-op 0 报错
 *   8. dispose：活动 voice 全部 stop、ctx.close、幂等
 *   9. BGM（v2.5，AC-15）：BGM_DEFS 结构 + startBgm/stopBgm/isBgmPlaying 接口；默认关不发声；
 *      启动合成 non-silent、可启动/停止（stop 停全部 voice、幂等、可重开）；并发（独立 voice 池不争抢
 *      SFX MAX_VOICES）；降级（startBgm/stopBgm/dispose 0 报错无声）；dispose 清理无泄漏
 * 使用注入的假 AudioContext（opts.createContext），无需真实 Web Audio。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const A = require('../audio.js')
const G = require('../game.js')

/* ---------- 工具：假 AudioContext（记录创建/停止/关闭，驱动 onended） ---------- */

function makeFakeGain(initial) {
  return {
    nodeType: 'gain',
    gain: {
      value: initial,
      setValueAtTime: function (v) { this.value = v },
      linearRampToValueAtTime: function (v) { this.value = v },
      exponentialRampToValueAtTime: function (v) { this.value = v },
    },
    connect: function () {},
    disconnect: function () {},
  }
}

/**
 * @param {{suspended?: boolean}} [opts] suspended=false 时 state 直接 running（resume 不被调用）
 */
function makeFakeContext(opts) {
  opts = opts || {}
  const allGains = [] // createGain 全量（[0] 即主增益 masterGain）
  const allOscillators = [] // createOscillator 全量
  const liveOscillators = [] // 已 start 未 stop（并发/清理断言）
  const stats = { gains: 0, oscillators: 0, stops: 0, closes: 0, resumes: 0 }
  const ctx = {
    state: opts.suspended === false ? 'running' : 'suspended',
    destination: { nodeType: 'destination' },
    currentTime: 0,
    createGain: function () {
      const g = makeFakeGain(0)
      allGains.push(g)
      stats.gains++
      return g
    },
    createOscillator: function () {
      const osc = {
        nodeType: 'oscillator',
        type: 'sine',
        frequency: {
          value: 440,
          setValueAtTime: function (v) { this.value = v },
          exponentialRampToValueAtTime: function (v) { this.value = v },
        },
        onended: null,
        connect: function () {},
        disconnect: function () {},
        start: function () { liveOscillators.push(osc) },
        // 真实 Web Audio 语义：stop(t) 是「调度未来停止」，此刻不结束、不触发 onended
        stop: function () { stats.stops++ },
        // 测试辅助：模拟时间推进到自然结束（移除发声列表 + 触发 onended 驱动引擎清理）
        simulateEnd: function () {
          const i = liveOscillators.indexOf(osc)
          if (i !== -1) liveOscillators.splice(i, 1)
          if (typeof osc.onended === 'function') osc.onended()
        },
      }
      allOscillators.push(osc)
      stats.oscillators++
      return osc
    },
    resume: function () {
      stats.resumes++
      ctx.state = 'running'
      return Promise.resolve()
    },
    close: function () {
      stats.closes++
      ctx.state = 'closed'
      return Promise.resolve()
    },
  }
  return { ctx: ctx, allGains: allGains, allOscillators: allOscillators, liveOscillators: liveOscillators, stats: stats }
}

/** 注入式引擎：返回 { engine, fake, factoryCalls }；factoryCalls 计数 createContext 调用 */
function makeEngine(fake, ctxOpts) {
  const meta = { calls: 0 }
  const factory = function () {
    meta.calls++
    return fake.ctx
  }
  const engine = A.createSfxEngine({ createContext: factory })
  return { engine: engine, fake: fake, meta: meta }
}

/** 权威 7 事件名（TECHNICAL §2.1；game.js 的 SFX_EVENTS 落地后自动交叉核对） */
function expectedSfxEvents() {
  return Array.isArray(G.SFX_EVENTS) && G.SFX_EVENTS.length === 7
    ? G.SFX_EVENTS.slice()
    : ['move', 'rotate', 'softDrop', 'hardDrop', 'clear', 'levelUp', 'gameOver']
}

/* ---------- 1. 导出与顶层副作用 ---------- */

test('exports: 模块导出齐全，Node 加载零 DOM/Audio 副作用（TECHNICAL §3.1）', () => {
  assert.equal(typeof A.createSfxEngine, 'function')
  assert.equal(typeof A.SFX_DEFS, 'object')
  assert.equal(A.DEFAULT_VOLUME, 0.8) // AC-10.4 默认 80%
  assert.equal(A.VOLUME_STEP, 0.1) // 步进 ≤ 10%
  assert.equal(A.MAX_VOICES, 4) // 并发上限 AC-09.8
  // require 后全局未被污染（顶层不应触碰 window/document/AudioContext）
  assert.equal(typeof globalThis.window, 'undefined')
  assert.equal(typeof globalThis.document, 'undefined')
})

/* ---------- 2. SFX_DEFS 结构（TECHNICAL §7.2.1） ---------- */

test('SFX_DEFS: 7 键与权威事件集一致，字段完整合法', () => {
  const expected = expectedSfxEvents()
  const keys = Object.keys(A.SFX_DEFS)
  assert.equal(keys.length, 7)
  assert.deepEqual([...keys].sort(), expected.slice().sort(), '与 SFX_EVENTS 集合一致')
  const waveforms = ['sine', 'square', 'triangle', 'sawtooth']
  for (const name of expected) {
    const d = A.SFX_DEFS[name]
    assert.ok(d, name + ' 有定义')
    assert.ok(waveforms.includes(d.waveform), name + ' 波形合法')
    assert.ok(d.freq > 0 && d.freq < 20000, name + ' 基频合法')
    assert.ok(d.duration > 0 && d.duration <= 1, name + ' 时长合法(≤1s)')
    assert.ok(d.attack >= 0 && d.decay >= 0, name + ' 包络非负')
    assert.ok(d.peak > 0 && d.peak <= 1, name + ' 峰值增益 (0,1]')
  }
})

test('SFX_DEFS: 包络自洽（单音 duration=attack+decay；多音每音=attack+decay）', () => {
  for (const name of Object.keys(A.SFX_DEFS)) {
    const d = A.SFX_DEFS[name]
    const noteCount = d.notes && d.notes > 1 ? d.notes : Array.isArray(d.arpeggio) ? d.arpeggio.length : 1
    const perNote = d.duration / noteCount
    assert.ok(
      Math.abs(d.attack + d.decay - perNote) < 1e-3,
      name + ' attack+decay ≈ 每音时长（' + d.attack + '+' + d.decay + ' vs ' + perNote + '）'
    )
  }
})

/* ---------- 3. 可区分性（AC-09.1 自动化） ---------- */

test('AC-09.1: 基频排序相邻差值 ≥ 50Hz，且波形/时长双通道可区分', () => {
  const freqs = Object.keys(A.SFX_DEFS).map((n) => A.SFX_DEFS[n].freq).sort((a, b) => a - b)
  assert.deepEqual(freqs, [98, 165, 220, 380, 440, 523, 660], '基频集合钉死')
  for (let i = 1; i < freqs.length; i++) {
    const diff = freqs[i] - freqs[i - 1]
    assert.ok(diff >= 50, '相邻基频差 ≥ 50Hz：' + freqs[i - 1] + '→' + freqs[i] + ' = ' + diff)
  }
  const waveforms = new Set(Object.keys(A.SFX_DEFS).map((n) => A.SFX_DEFS[n].waveform))
  assert.ok(waveforms.size >= 3, '波形种类 ≥ 3（实际 ' + waveforms.size + '）')
  const durations = Object.keys(A.SFX_DEFS).map((n) => A.SFX_DEFS[n].duration)
  assert.equal(new Set(durations).size, 7, '7 类时长两两不同')
})

test('AC-09.2: 单事件音符数（move/softDrop 等单音；clear 双响 2；levelUp 琶音 3）', () => {
  assert.equal(A.SFX_DEFS.clear.notes, 2)
  assert.deepEqual(A.SFX_DEFS.levelUp.arpeggio, [523, 659, 784])
  assert.equal(A.SFX_DEFS.move.notes, undefined)
  assert.equal(A.SFX_DEFS.hardDrop.freqEnd, 55)
  assert.equal(A.SFX_DEFS.gameOver.freqEnd, 190)
})

/* ---------- 4. 音量 / 静音（AC-10.3/4） ---------- */

test('音量: 默认 80%、clamp [0,1]、即时生效（AC-10.4）', () => {
  const { engine, fake } = makeEngine(makeFakeContext())
  assert.equal(engine.getVolume(), 0.8) // 默认
  engine.unlock()
  const master = fake.allGains[0]
  assert.equal(master.gain.value, 0.8, '解锁后主增益 = 默认音量')
  engine.setVolume(0.5)
  assert.equal(engine.getVolume(), 0.5)
  assert.equal(master.gain.value, 0.5, 'setVolume 即时写主增益')
  engine.setVolume(2) // clamp 上界
  assert.equal(engine.getVolume(), 1)
  assert.equal(master.gain.value, 1)
  engine.setVolume(-0.5) // clamp 下界
  assert.equal(engine.getVolume(), 0)
  assert.equal(master.gain.value, 0)
  engine.setVolume(0.9)
  assert.equal(engine.getVolume(), 0.9)
  engine.setVolume('0.3') // 非法输入忽略
  assert.equal(engine.getVolume(), 0.9)
  engine.setVolume(Number.NaN)
  assert.equal(engine.getVolume(), 0.9)
})

test('静音: muted 标志 + 主增益置 0，关闭立即恢复（AC-10.3）', () => {
  const { engine, fake } = makeEngine(makeFakeContext())
  engine.unlock()
  const master = fake.allGains[0]
  assert.equal(engine.isMuted(), false)
  engine.setVolume(0.6)
  engine.setMuted(true)
  assert.equal(engine.isMuted(), true)
  assert.equal(master.gain.value, 0, '静音主增益置 0（可编程验证）')
  engine.setMuted(false)
  assert.equal(engine.isMuted(), false)
  assert.equal(master.gain.value, 0.6, '关闭恢复原音量，无需重新 unlock')
})

test('静音短路: muted 时不创建任何音频节点（E-SFX-08 零调度成本）', () => {
  const { engine, fake } = makeEngine(makeFakeContext())
  engine.unlock()
  engine.setMuted(true)
  engine.play('move')
  engine.play('clear')
  engine.play('levelUp')
  assert.equal(fake.stats.oscillators, 0, '静音下 play 短路，0 个振荡器')
  // 对照：音量 0% 不短路（正常调度，增益 0）——E-SFX-10 标志区分
  engine.setMuted(false)
  engine.setVolume(0)
  engine.play('move')
  assert.equal(fake.stats.oscillators, 1, '音量 0% 仍调度（听觉等效但标志不同）')
})

/* ---------- 5. 并发上限（AC-09.8） ---------- */

test('AC-09.8: 单音并发上限 4，第 5 个丢弃', () => {
  const { engine, fake } = makeEngine(makeFakeContext())
  engine.unlock()
  for (let i = 0; i < 5; i++) engine.play('move') // 每次 1 音
  assert.equal(fake.stats.oscillators, 4, '只调度 4 个 voice')
  assert.equal(fake.liveOscillators.length, 4, '4 个 voice 均在发声（未结束）')
})

test('AC-09.8: 多音事件超出部分丢弃（levelUp 琶音第二次只剩 1 音）', () => {
  const { engine, fake } = makeEngine(makeFakeContext())
  engine.unlock()
  engine.play('levelUp') // 3 音 → active 3
  engine.play('levelUp') // 第 1 音 → 4；第 2/3 音丢弃
  assert.equal(fake.stats.oscillators, 4, '3+1=4，超出丢弃')
  assert.equal(fake.liveOscillators.length, 4)
  // clear 双响：active=0 时 2 音全调度
  const { engine: e2, fake: f2 } = makeEngine(makeFakeContext())
  e2.unlock()
  e2.play('clear')
  assert.equal(f2.stats.oscillators, 2, '双响 2 音')
  assert.equal(f2.liveOscillators.length, 2)
})

/* ---------- 6. unlock 语义（AC-09.6） ---------- */

test('unlock: 解锁前不建 ctx、play 无副作用；解锁后创建并 resume；幂等', () => {
  const fake = makeFakeContext({ suspended: true })
  const meta = { calls: 0 }
  const engine = A.createSfxEngine({
    createContext: function () { meta.calls++; return fake.ctx },
  })
  assert.equal(engine.isAvailable(), false, '未解锁不可用')
  engine.play('move')
  engine.play('clear')
  assert.equal(meta.calls, 0, '解锁前不创建 AudioContext（AC-09.6）')
  assert.equal(fake.stats.oscillators, 0, '解锁前 play 无副作用、0 报错')

  engine.unlock()
  assert.equal(meta.calls, 1, '首次 unlock 创建 ctx')
  assert.equal(fake.stats.resumes, 1, 'suspended → resume 一次')
  assert.equal(engine.isAvailable(), true)
  engine.unlock()
  assert.equal(meta.calls, 1, 'unlock 幂等（不重复创建）')
  assert.equal(fake.stats.resumes, 1)

  engine.play('move')
  assert.equal(fake.stats.oscillators, 1, '解锁后 play 正常调度')
})

test('unlock: running 态 ctx 不调用 resume（仅 suspended 需要）', () => {
  const fake = makeFakeContext({ suspended: false })
  const engine = A.createSfxEngine({ createContext: function () { return fake.ctx } })
  engine.unlock()
  assert.equal(fake.stats.resumes, 0, 'state=running 无需 resume')
  assert.equal(engine.isAvailable(), true)
})

test('解锁失败（resume 抛错）静默降级，0 报错', () => {
  const fake = makeFakeContext({ suspended: true })
  fake.ctx.resume = function () { throw new Error('resume denied') }
  const engine = A.createSfxEngine({ createContext: function () { return fake.ctx } })
  engine.unlock() // 不应抛
  assert.equal(engine.isAvailable(), true, 'ctx 已建即可用（resume 失败仅无声，AC-09.6 吞错）')
  engine.play('move') // 不抛
})

/* ---------- 7. 降级（AC-09.7） ---------- */

test('AC-09.7: createContext 抛错 → isAvailable=false，全部方法 no-op 0 报错', () => {
  const engine = A.createSfxEngine({
    createContext: function () { throw new Error('no web audio') },
  })
  assert.doesNotThrow(() => engine.unlock())
  assert.equal(engine.isAvailable(), false)
  assert.doesNotThrow(() => engine.play('move'))
  assert.doesNotThrow(() => engine.setVolume(0.3))
  assert.doesNotThrow(() => engine.setMuted(true))
  assert.doesNotThrow(() => engine.dispose())
})

test('AC-09.7: createContext 返回 null（浏览器无 AudioContext）→ 同降级', () => {
  const engine = A.createSfxEngine({ createContext: function () { return null } })
  assert.doesNotThrow(() => engine.unlock())
  assert.equal(engine.isAvailable(), false)
  assert.doesNotThrow(() => engine.play('hardDrop'))
  assert.doesNotThrow(() => engine.play('gameOver'))
})

test('AC-09.7: Node 环境缺省工厂（无 window）→ 无声降级、0 报错', () => {
  // 本脚本运行于 Node：audio.js 的 defaultCreateContext 探测不到 window.AudioContext
  const engine = A.createSfxEngine()
  assert.doesNotThrow(() => engine.unlock())
  assert.equal(engine.isAvailable(), false)
  assert.doesNotThrow(() => engine.play('move'))
})

test('AC-09.7: 假 ctx 缺 createGain → 建图失败降级，0 报错', () => {
  const fake = makeFakeContext()
  fake.ctx.createGain = function () { throw new Error('no gain') }
  const engine = A.createSfxEngine({ createContext: function () { return fake.ctx } })
  assert.doesNotThrow(() => engine.unlock())
  assert.equal(engine.isAvailable(), false)
  assert.doesNotThrow(() => engine.play('move'))
  assert.doesNotThrow(() => engine.setMuted(true))
})

/* ---------- 8. dispose（AC-05.4 语义扩展 / E-SFX-11） ---------- */

test('dispose: 停掉全部活动 voice、close ctx、幂等、无残留', () => {
  const { engine, fake } = makeEngine(makeFakeContext())
  engine.unlock()
  engine.play('move')
  engine.play('hardDrop')
  engine.play('clear')
  assert.equal(fake.stats.oscillators, 4, '1+1+2 = 4 voice')
  assert.equal(fake.liveOscillators.length, 4)
  const stopsBefore = fake.stats.stops // 播放期引擎对每个 voice 已调度过 stop(t)
  engine.dispose()
  assert.equal(fake.stats.stops - stopsBefore, 4, 'dispose 对全部活动 voice 调用 stop')
  assert.equal(fake.stats.closes, 1, 'ctx.close 被调用')
  assert.equal(engine.isAvailable(), false, 'dispose 后不可用')
  assert.doesNotThrow(() => engine.dispose(), '幂等')
  engine.play('move') // dispose 后 play no-op
  assert.equal(fake.stats.oscillators, 4, 'dispose 后不新建任何节点')
  assert.doesNotThrow(() => engine.setVolume(0.5))
  assert.doesNotThrow(() => engine.setMuted(false))
  assert.equal(fake.stats.closes, 1, '二次 dispose 不重复 close')
})

test('onended 驱动清理: voice 结束后计数递减，可继续调度', () => {
  const { engine, fake } = makeEngine(makeFakeContext())
  engine.unlock()
  for (let i = 0; i < 4; i++) engine.play('move')
  assert.equal(fake.liveOscillators.length, 4)
  // 模拟真实 onended：逐个自然结束 → 引擎清理 → 腾出并发位
  fake.liveOscillators.slice().forEach((osc) => osc.simulateEnd())
  assert.equal(fake.liveOscillators.length, 0)
  engine.play('move')
  assert.equal(fake.stats.oscillators, 5, '结束后的 voice 释放并发位')
  assert.equal(fake.liveOscillators.length, 1)
})

/* ---------- 9. BGM（v2.5，AC-15） ---------- */

test('BGM: 默认关闭；startBgm 置开并调度、stopBgm 置关并 stop 全部 voice；dispose 兜底', () => {
  const { engine, fake } = makeEngine(makeFakeContext())
  assert.equal(engine.isBgmPlaying(), false, '默认关（AC-15.2）')
  const oscBefore = fake.stats.oscillators
  engine.startBgm()
  assert.equal(engine.isBgmPlaying(), true, 'startBgm 置开')
  assert.ok(fake.stats.oscillators > oscBefore, 'BGM 已实际调度音符 voice（合成 non-silent，AC-15.3）')
  const scheduledVoices = A.BGM_DEFS.notes.length // startBgm 首个 loop 铺满 N 个音符 voice
  const stopsBefore = fake.stats.stops
  engine.startBgm() // 重复调用 no-op（幂等）
  assert.equal(engine.isBgmPlaying(), true)
  engine.stopBgm()
  assert.equal(engine.isBgmPlaying(), false, 'stopBgm 置关')
  assert.ok(fake.stats.stops - stopsBefore >= scheduledVoices, 'stopBgm 对全部 BGM voice 调用 stop')
  // 停止后可重新启动（AC-15.4：关→开可反复）
  engine.startBgm()
  assert.equal(engine.isBgmPlaying(), true, 'stop 后可重开')
  engine.stopBgm()
  assert.equal(engine.isBgmPlaying(), false)
  // dispose 兜底：未 stop 直接 dispose 也停（节点释放）
  const { engine: e2, fake: f2 } = makeEngine(makeFakeContext())
  e2.startBgm()
  assert.equal(e2.isBgmPlaying(), true)
  const stopsBefore2 = f2.stats.stops
  e2.dispose()
  assert.equal(e2.isBgmPlaying(), false, 'dispose 兜底停 BGM')
  assert.ok(f2.stats.stops - stopsBefore2 >= scheduledVoices, 'dispose 停掉全部 BGM voice')
  const oscAfter = f2.stats.oscillators
  e2.startBgm() // dispose 后 startBgm no-op
  assert.equal(f2.stats.oscillators, oscAfter, 'dispose 后不新建任何 BGM 节点（无泄漏，AC-15.12）')
  assert.doesNotThrow(() => e2.dispose(), 'dispose 幂等')
})

test('BGM: 并发——独立 voice 池，不争抢 SFX MAX_VOICES 并发位（AC-15.12）', () => {
  const { engine, fake } = makeEngine(makeFakeContext())
  engine.unlock()
  // 用满 SFX 并发上限 4（AC-09.8）
  for (let i = 0; i < 4; i++) engine.play('move')
  assert.equal(fake.stats.oscillators, 4, 'SFX 并发 4 已占满')
  engine.startBgm() // BGM 应仍能调度（走独立 bgmVoices 池）
  assert.equal(
    fake.stats.oscillators,
    4 + A.BGM_DEFS.notes.length,
    'BGM 不挤占/不受 SFX 并发上限约束，独立 voice 池'
  )
  engine.stopBgm()
})

test('BGM: 未解锁/降级时不报错（0 报错降级，AC-15.10/15.11）', () => {
  const engine = A.createSfxEngine({
    createContext: function () { throw new Error('no web audio') },
  })
  assert.doesNotThrow(() => engine.startBgm())
  assert.doesNotThrow(() => engine.stopBgm())
  assert.equal(engine.isBgmPlaying(), false, '降级时 startBgm 不凭空调度、不置开')
  assert.equal(engine.isAvailable(), false)
})

test('BGM_DEFS: 导出合法（bpm/波形/节拍序列有效）', () => {
  assert.equal(typeof A.BGM_DEFS, 'object')
  assert.ok(A.BGM_DEFS.bpm > 0, 'bpm 合法')
  assert.ok(['sine', 'square', 'triangle', 'sawtooth'].includes(A.BGM_DEFS.waveform), '波形合法')
  assert.ok(Array.isArray(A.BGM_DEFS.notes) && A.BGM_DEFS.notes.length > 0, '有音符序列')
  assert.ok(A.BGM_DEFS.peak > 0 && A.BGM_DEFS.peak <= 1, '峰值增益 (0,1]')
  for (const n of A.BGM_DEFS.notes) {
    assert.ok(n.freq > 0 && n.freq < 20000, '音符基频合法')
    assert.ok(n.beats > 0, '音符拍数合法')
  }
  // BGM 独立于 SFX_DEFS：不进 7 事件集（assembly-check 约束）
  assert.equal(Object.keys(A.SFX_DEFS).length, 7)
})
