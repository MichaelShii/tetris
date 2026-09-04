// index.js — Cloudflare Worker 入口（ESM）：路由分派 / CORS 门控 / 错误信封
// 目录三件套契约见 ARCHITECTURE §3.2 与 §4。部署入口：export default { fetch }

import { parseSubmit, checkPlausibility, PROTO_VER } from './validate.js'
import { addEntry, readBoards } from './store.js'
import { rateLimitHit } from './rate-limit.js'

/** CORS 仅放行 gh-pages 正式域名；Origin:null（file://）与其它 Origin 一律拒绝且不回 ACAO */
export const ALLOWED_ORIGIN = 'https://michaelshii.github.io'

/** Phase 1 折中限流参数（10 分钟滑窗） */
export const RATE_LIMITS = {
  device: { limit: 20, windowSecs: 600 },
  ip: { limit: 60, windowSecs: 600 },
}

function json(status, obj, cors, extra) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(cors || {}),
    ...(extra || {}),
  }
  return new Response(JSON.stringify(obj), { status, headers })
}

function isAllowed(origin) {
  return origin === ALLOWED_ORIGIN
}

export async function handleRequest(request, env) {
  const origin = request.headers.get('Origin')

  // Origin 存在但非白名单（含 'null'）：403 且不带任何 ACAO 头
  if (origin !== null && !isAllowed(origin)) {
    return json(403, { ok: false, error: { code: 'bad_origin', message: 'origin not allowed' } })
  }
  const cors = origin === null ? null : {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  const url = new URL(request.url)
  if (url.pathname === '/api/score' && request.method === 'POST') {
    return submitScore(request, env, cors)
  }
  if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
    return readLeaderboard(env, cors)
  }
  if (url.pathname === '/api/score' || url.pathname === '/api/leaderboard') {
    return json(405, { ok: false, error: { code: 'method_not_allowed', message: 'method not allowed' } }, cors)
  }
  return json(404, { ok: false, error: { code: 'not_found', message: 'no such endpoint' } }, cors)
}

async function submitScore(request, env, cors) {
  let body
  try {
    body = await request.json()
  } catch {
    return json(400, { ok: false, error: { code: 'bad_request', message: 'invalid json body' } }, cors)
  }

  const parsed = parseSubmit(body)
  if (!parsed.ok) {
    return json(400, { ok: false, error: { code: parsed.code, message: 'invalid submission' } }, cors)
  }
  const value = parsed.value

  // 限流：先 IP（缺 CF 头则跳过——本地 dev/curl 场景），后设备
  const ip = request.headers.get('CF-Connecting-IP')
  if (ip && (await rateLimitHit(env, 'ip:' + ip, RATE_LIMITS.ip.windowSecs, RATE_LIMITS.ip.limit))) {
    return json(429, { ok: false, error: { code: 'rate_limited', message: 'too many submissions' } }, cors, { 'Retry-After': String(RATE_LIMITS.ip.windowSecs) })
  }
  if (await rateLimitHit(env, 'dev:' + value.deviceId, RATE_LIMITS.device.windowSecs, RATE_LIMITS.device.limit)) {
    return json(429, { ok: false, error: { code: 'rate_limited', message: 'too many submissions' } }, cors, { 'Retry-After': String(RATE_LIMITS.device.windowSecs) })
  }

  // 合理性校验（折中版，非重放）：不达标即拒绝
  const plaus = checkPlausibility(value)
  if (!plaus.plausible) {
    return json(
      400,
      { ok: false, error: { code: 'implausible_score', message: 'score/level not plausible: ' + plaus.reasons.join(',') } },
      cors,
    )
  }

  const { improved, rank } = await addEntry(env, value)
  return json(200, { ok: true, accepted: true, improved, rank, deviceId: value.deviceId }, cors)
}

async function readLeaderboard(env, cors) {
  const boards = await readBoards(env)
  return json(
    200,
    { ok: true, proto: PROTO_VER, generatedAt: Date.now(), all: boards.all, week: boards.week },
    cors,
  )
}

export default {
  fetch: handleRequest,
}