// rate-limit.js — KV 计数限流（TTL 滑窗；读改写非原子，Phase 1 折中校验已知边界）
// 键址：rl:<bucket> → 计数器（put 时带 expirationTtl 刷新窗口）

/**
 * @param {object} env 含 LEADERBOARD KV 绑定
 * @param {string} bucket 如 'dev:<deviceId>' / 'ip:<ip>'
 * @param {number} windowSeconds 窗口（秒）
 * @param {number} limit 窗口内上限
 * @returns {Promise<boolean>} true = 命中限流
 */
export async function rateLimitHit(env, bucket, windowSeconds, limit) {
  const key = 'rl:' + bucket
  const raw = await env.LEADERBOARD.get(key)
  const count = raw ? parseInt(raw, 10) : 0
  if (count >= limit) return true
  await env.LEADERBOARD.put(key, String(count + 1), { expirationTtl: windowSeconds })
  return false
}