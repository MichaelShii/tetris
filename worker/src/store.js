// store.js — KV 存取封装：设备存档 + 总榜/周榜（ISO 周）、去重、Top20
// 键址：entry:<deviceId>             设备最高分存档（同设备只保留最高分）
//       board:all                    总榜（≤ MAX_BOARD）
//       board:week:<ISO周>           周榜（≤ MAX_BOARD）

export const MAX_BOARD = 200
export const TOP_N = 20

/** ISO 8601 周键（UTC，周一始），如 2026-W36 */
export function isoWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - day + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const firstDay = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3)
  const week = 1 + Math.round((date - firstThursday) / (7 * 86400000))
  return date.getUTCFullYear() + '-W' + String(week).padStart(2, '0')
}

async function readBoard(env, key) {
  const raw = await env.LEADERBOARD.get(key)
  if (!raw) return []
  try {
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch {
    return [] // 脏数据自愈：按空榜处理
  }
}

async function writeBoard(env, key, list) {
  await env.LEADERBOARD.put(key, JSON.stringify(list.slice(0, MAX_BOARD)))
}

/** 去重且排序：同设备保留最高分；分数降序、同分早提交在前 */
export function dedupeSort(list) {
  const byId = new Map()
  for (const e of list) {
    const prev = byId.get(e.deviceId)
    if (!prev || e.score > prev.score) byId.set(e.deviceId, e)
  }
  const uniq = [...byId.values()]
  uniq.sort((a, b) => b.score - a.score || a.ts - b.ts)
  return uniq
}

/**
 * 入榜：同设备更高分才生效（improved:false 仅计限流、不上榜）。
 * 返回 { improved, rank }；rank 为总榜名次（1 起）或 null（未进前 200）。
 */
export async function addEntry(env, entry) {
  const devKey = 'entry:' + entry.deviceId
  const prevRaw = await env.LEADERBOARD.get(devKey)
  const prev = prevRaw ? JSON.parse(prevRaw) : null
  if (prev && entry.score <= prev.score) return { improved: false, rank: null }

  await env.LEADERBOARD.put(devKey, JSON.stringify(entry))

  const weekKey = 'board:week:' + isoWeekKey()
  let rank = null
  for (const boardKey of ['board:all', weekKey]) {
    const sorted = dedupeSort((await readBoard(env, boardKey)).concat([entry]))
    await writeBoard(env, boardKey, sorted)
    if (boardKey === 'board:all') {
      const idx = sorted.findIndex((e) => e.deviceId === entry.deviceId)
      rank = idx >= 0 && idx < MAX_BOARD ? idx + 1 : null
    }
  }
  return { improved: true, rank }
}

/** 匿名化榜单元素（对外不暴露 deviceId / ts） */
function publicEntry(e, i) {
  return { rank: i + 1, nickname: e.nickname, score: e.score, level: e.level, lines: e.lines }
}

/** 一次返回总榜 + 周榜双视图（各 Top20） */
export async function readBoards(env) {
  const weekKey = 'board:week:' + isoWeekKey()
  const top = (list) => list.slice(0, TOP_N).map(publicEntry)
  return {
    all: top(await readBoard(env, 'board:all')),
    week: top(await readBoard(env, weekKey)),
  }
}