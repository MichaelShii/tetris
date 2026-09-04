// validate.js — 载荷解析 / 昵称清洗 / 分数合理性校验（纯函数，Node 与 Workers 双端可跑）
// 契约见 ARCHITECTURE §4；数值口径以 PRD/TECHNICAL 为准，其未定处按保守上界处理。

export const PROTO_VER = 1 // 提交协议版本号（Phase 2 服务端重放校验的扩展点：>1 暂拒）

export const MAX_NICKNAME_LEN = 12
// 字符白名单：字母(任意文种 Unicode) / 数字 / 空格 / _ / - / · / .（首字符不允许空白/符号）
const NICKNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _\-·.]{0,11}$/u

export const BOUNDS = {
  score: [0, 1e9],
  level: [1, 999],
  lines: [0, 1e6],
  durationMs: [0, 86_400_000], // 24h 封顶
  protoVer: [1, 99],
}
const DEVICE_ID_RE = /^[A-Za-z0-9-]{8,64}$/

/** 昵称清洗：非字符串 / 超长 / 含白名单外字符 → null */
export function cleanNickname(raw) {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  if (v.length < 1 || v.length > MAX_NICKNAME_LEN) return null
  return NICKNAME_RE.test(v) ? v : null
}

function intIn(value, [lo, hi]) {
  return Number.isInteger(value) && value >= lo && value <= hi
}

/**
 * 解析提交载荷 → { ok:true, value:{...} } | { ok:false, code }
 * value: { nickname, score, level, lines, durationMs, deviceId, protoVer }
 */
export function parseSubmit(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, code: 'bad_request' }
  }
  const nickname = cleanNickname(body.nickname)
  if (nickname === null) return { ok: false, code: 'invalid_nickname' }
  const fields = {
    score: body.score,
    level: body.level,
    lines: body.lines,
    durationMs: body.durationMs,
    protoVer: body.protoVer,
  }
  for (const [k, [lo, hi]] of Object.entries(BOUNDS)) {
    // durationMs 为计时测量值（performance.now 差值，可为小数）：仅要求有限且界内；
    // score/level/lines/protoVer 为计数/版本，仍须整数（r37b 修复：真机时长 31458.10… 曾被整型校验 400 误拒）
    if (k === 'durationMs') {
      if (!Number.isFinite(fields[k]) || fields[k] < lo || fields[k] > hi) return { ok: false, code: 'bad_request' }
      continue
    }
    if (!intIn(fields[k], [lo, hi])) return { ok: false, code: 'bad_request' }
  }
  if (fields.protoVer > PROTO_VER) return { ok: false, code: 'bad_request' } // 预留：Phase 2 前拒绝更高协议
  if (typeof body.deviceId !== 'string' || !DEVICE_ID_RE.test(body.deviceId)) {
    return { ok: false, code: 'bad_request' }
  }
  return {
    ok: true,
    value: {
      nickname,
      score: fields.score,
      level: fields.level,
      lines: fields.lines,
      durationMs: fields.durationMs,
      deviceId: body.deviceId,
      protoVer: fields.protoVer,
    },
  }
}

// ---- 合理性校验（折中版：理论速度上界，异常标记/拒绝由 handler 决定） ----

/** 某等级每秒重力（毫秒/格），与 game.js gravityMs 同式（数值口径以 PRD §5 为准；此处仅作参考导出） */
export function gravityMs(level) {
  return Math.max(100, 1000 * Math.pow(0.85, Math.max(0, level - 1)))
}

/**
 * 每行最快代价（毫秒）：硬降≈瞬落，瓶颈在落定/消行动画 → 取 100ms 常量作**理论速度上界**。
 * 该上界比真人快 10~20 倍，只拦截离谱作弊；精确验分交给 Phase 2 服务端重放（protoVer 预留）。
 * 常量可调（放宽/收紧由 PRD/QA 裁定）。
 */
export const DROP_MS_PER_LINE = 100
export function minMsPerLine(_level) {
  return DROP_MS_PER_LINE
}

/** 升到某等级所需理论最少时长（毫秒）：每级 10 行、每行按最快代价 */
export function minMsToReachLevel(level) {
  let ms = 0
  const cap = Math.min(level, 999)
  for (let lv = 1; lv < cap; lv++) ms += 10 * minMsPerLine(lv)
  if (level > 999) ms += (level - 999) * 10 * minMsPerLine(999)
  return ms
}

/** 时长内理论得分上界：逐级累加「行 × 单行最高 800×level」，24h 封顶、等级 200 封顶 */
export function maxScoreCeiling(durationMs) {
  let remaining = Math.min(durationMs, 24 * 3600 * 1000)
  let level = 1
  let ceiling = 0
  while (remaining > 0 && level < 200) {
    const perLine = minMsPerLine(level)
    const linesNow = Math.min(10, Math.floor(remaining / perLine))
    ceiling += linesNow * 800 * level
    remaining -= linesNow * perLine
    level += 1
  }
  if (remaining > 0) ceiling += Math.floor(remaining / minMsPerLine(200)) * 800 * 200
  return ceiling
}

/** 上界裕量系数：上界本身已极端宽松，仅留 5% 防浮点/取整误伤 */
export const CEILING_HEADROOM = 1.05

/**
 * 合理性检查 → { plausible:boolean, reasons:string[] }
 * ① 等级可达性：durationMs 不足以升到宣称等级 → level_unreachable
 * ② 得分上界：score 超过理论天花板 → score_above_ceiling
 */
export function checkPlausibility({ score, level, lines, durationMs }) {
  const reasons = []
  if (durationMs > 0 && minMsToReachLevel(level) > durationMs) {
    reasons.push('level_unreachable')
  }
  if (score > maxScoreCeiling(durationMs) * CEILING_HEADROOM) {
    reasons.push('score_above_ceiling')
  }
  void lines // 消行数与等级/时长的交叉校验可留 Phase 2 重放（本期不计）
  return { plausible: reasons.length === 0, reasons }
}