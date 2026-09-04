const fs = require('fs')
const path = require('path')
const root = path.join(__dirname, '..')
let fail = 0
const ok = (m) => console.log('  ✓ ' + m)
const bad = (m) => { console.log('  ✗ ' + m); fail++ }

console.log('== 1. game.js 导出面（ui.js 依赖的 API） ==')
const T = require(path.join(root, 'game.js'))
const needApi = ['createGame','createBoard','createQueue','transition','merge','clearLines','SHAPES','COLORS','PHASE_ALIAS','COLS','ROWS','scoreForLines','levelForLines','gravityMs','spawn','rotated','collides','pieceCells','ghostY','SFX_EVENTS','keyAction']
for (const k of needApi) { if (k in T) ok(`TetrisGame.${k}`); else bad(`MISSING TetrisGame.${k}`) }

console.log('== 1b. audio.js 导出面（v2.0 + v2.5 BGM） ==')
const A = require(path.join(root, 'audio.js'))
const needAudio = ['createSfxEngine','SFX_DEFS','BGM_DEFS','DEFAULT_VOLUME','VOLUME_STEP','MAX_VOICES']
for (const k of needAudio) { if (k in A) ok(`TetrisAudio.${k}`); else bad(`MISSING TetrisAudio.${k}`) }
// SFX_DEFS 键与 game.js SFX_EVENTS 集合一致（AC-09 事件契约单一事实来源）
{
  const defKeys = Object.keys(A.SFX_DEFS).sort().join(',')
  const eventKeys = (T.SFX_EVENTS || []).slice().sort().join(',')
  if (defKeys === eventKeys && defKeys === 'clear,gameOver,hardDrop,hold,levelUp,move,rotate,softDrop') ok('SFX_DEFS 键与 SFX_EVENTS 一致（8 事件）')
  else bad('SFX_DEFS/ SFX_EVENTS 事件集不一致：' + defKeys + ' vs ' + eventKeys)
}

console.log('== 1c. persist.js 导出面（v2.6 可选持久化层） ==')
const P = require(path.join(root, 'persist.js'))
const needPersist = ['createStorage','createPersistence','sanitize','TETRIS_PERSIST_KEY','PAYLOAD_VERSION']
for (const k of needPersist) { if (k in P) ok(`TetrisPersist.${k}`); else bad(`MISSING TetrisPersist.${k}`) }
// createPersistence() 契约：load/saveHighScore/saveSettings/dispose（装配/自包含/审计依赖）
{
  const inst = typeof P.createPersistence === 'function' ? P.createPersistence() : null
  const m = inst ? ['load','saveHighScore','saveSettings','saveStats','dispose'].filter((k) => typeof inst[k] !== 'function') : ['createPersistence missing']
  if (m.length === 0) ok('createPersistence() 暴露 load/saveHighScore/saveSettings/saveStats/dispose')
  else bad('TetrisPersist.createPersistence() 契约缺失: ' + m.join(','))
}

console.log('== 2. ui.js 可加载且导出面 ==')
const UI = require(path.join(root, 'ui.js'))
const needUI = ['createUI','createBoardRenderer','createNextWellRenderer','createHud','createOverlay','createFeedback','GHOST']
for (const k of needUI) { if (k in UI) ok(`TetrisUI.${k}`); else bad(`MISSING TetrisUI.${k}`) }

console.log('== 3. ui.js 引用的 DOM 选择器在 index.html 中 ==')
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const sel = ['#board','#next-well','#board-frame','#overlay','#feedback-toast',
  '#stat-score .stat__value','#stat-level .stat__value','#stat-lines .stat__value',
  '#status-dot','#status-text','#btn-start','#btn-pause','#btn-restart',
  '#overlay-title','#overlay-sub','#overlay-btn',
  '#audio-controls','#btn-mute','#btn-vol-down','#btn-vol-up','#vol-value',
  '#ghost-control','#btn-ghost', // v2.3：幽灵块辅助开关（AC-13）
  '#bgm-control','#btn-bgm',   // v2.5：背景音乐 BGM 开关（AC-15）
  '#wallkick-control','#btn-wallkick', // v2.9：踢墙旋转开关（AC-19.7）
  '#hold-well','#hold-control','#btn-hold', // v3.2：Hold 暂存方块预览与开关（AC-23）
  '#preview-queue-control','#btn-preview-queue', // r15：多格预览队列开关（纯显示层）
  '#stat-hi','#hi-score',      // v2.6：HUD 最高分元素（持久化回读钩子，AC-16）
  '#btn-settings','#settings-modal','.settings-modal__card','.settings-modal__close', // v3.0：设置弹层（AC-01~06）
  '#global-stats','#gs-placed-value','#gs-lines-value','#gs-time-value','#gs-games-value'] // r34：全局统计面板五锚点（ui.js must()×4 + 容器；r35 删 #gs-hi-value）
// r37：全网排行榜装配锚点（ui.js createUI must()×12 清单同源——§3.3；与 index.html 同批交付）
for (const s of ['#lb-settings-group','#lb-nickname-value','#btn-edit-nickname','#btn-open-leaderboard','#leaderboard-modal','#lb-list','#lb-state','#nickname-modal','#nm-input']) {
  sel.push(s)
}
for (const s of sel) {
  if (s.includes(' ')) {
    const [pid, cls] = s.split(' ')
    const block = html.match(new RegExp('id="' + pid.slice(1) + '"[^>]*>([\\s\\S]*?)</div>'))
    if (block && block[1].includes(cls.split('.').pop())) ok(s); else bad('MISSING selector ' + s)
  } else if (s.startsWith('.')) {
    // 类选择器：检查 class 属性中是否包含该类名
    const className = s.slice(1)
    if (new RegExp('class="[^"]*\\b' + className + '\\b[^"]*"').test(html)) ok(s); else bad('MISSING ' + s)
  } else if (new RegExp('id="' + s.slice(1) + '"').test(html)) ok(s); else bad('MISSING ' + s)
}

console.log('== 4. ui.js 依赖的 CSS 类钩子在 style.css 中 ==')
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8')
for (const hook of ['is-flashing','is-open','is-showing','is-pulsing','is-gameover','[data-status','[data-state','key-hints__row','stat__value','btn--primary','btn--secondary','#feedback-toast','#overlay-card']) {
  if (css.includes(hook)) ok(hook); else bad('MISSING css hook ' + hook)
}

console.log('== 5. 自包含（AC-08；r37：追加 leaderboard.js，http(s) 仅 API 域名白名单例外） ==')
const lbSrc = fs.readFileSync(path.join(root, 'leaderboard.js'), 'utf8')
const all = html + fs.readFileSync(path.join(root, 'ui.js'),'utf8') + fs.readFileSync(path.join(root, 'game.js'),'utf8') + fs.readFileSync(path.join(root, 'audio.js'),'utf8') + fs.readFileSync(path.join(root, 'persist.js'),'utf8') + lbSrc + css
// r37（ARCHITECTURE §6.5）：唯一例外 = leaderboard.js API_BASE 域名（白名单负断言，其余 http(s) 仍拒）
const API_HOST = 'leaderboard-api.michaelshi28.workers.dev'
const httpRe = new RegExp('https?://(?!' + escapeRegExp(API_HOST) + ')', 'i')
if (httpRe.test(all)) bad('发现 http(s) 引用（仅 API 域名白名单例外除外）'); else ok('无 http(s) 引用（leaderboard-api 白名单例外）')
for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
  if (m[1].startsWith('//') || (m[1].startsWith('/') && !m[1].startsWith('./'))) bad('外部/绝对引用 ' + m[1])
  else ok('本地引用 ' + m[1])
}
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

console.log('== 6. index.html 引入顺序（persist.js → audio.js → game.js → ui.js → leaderboard.js → createUI） ==')
// 注：createUI 亦出现在脚本注释中（< ui.js 标签前），装配调用取最后一次出现（内联装配根）
const pi = html.indexOf('persist.js'), ai = html.indexOf('audio.js'), gi = html.indexOf('game.js'), ui = html.indexOf('ui.js'), li = html.indexOf('<script src="./leaderboard.js">'), ci = html.lastIndexOf('createUI')
if (pi !== -1 && ai !== -1 && gi !== -1 && ui !== -1 && li !== -1 && pi < ai && ai < gi && gi < ui && ui < li && li < ci) ok('顺序正确: persist.js → audio.js → game.js → ui.js → leaderboard.js → createUI'); else bad('脚本顺序/装配调用异常（应 persist.js 最前、leaderboard.js 在 createUI 之前）')

console.log('== 6b. HUD 最高分钩子与 createUI 可选持久化装配（v2.6） ==')
const uiSrc = fs.readFileSync(path.join(root, 'ui.js'), 'utf8')
// index.html 装配根必须把可选 persist 句柄传入 createUI
if (/createUI\(\s*\{\s*persist\s*:/.test(html)) ok('index.html createUI({ persist }) 装配根')
else bad('index.html createUI 未传入可选 persist')
// ui.js createUI 必须消费 #hi-score 钩子（回填最高分；元素缺失则 no-op 向后兼容）
if (/querySelector\(['"]#hi-score['"]\)/.test(uiSrc)) ok('ui.js 回读 #hi-score 钩子')
else bad('ui.js 缺少 #hi-score 回读钩子')
// ui.js 必须存在 createPersistence 句柄的持久化写回（saveHighScore 只增不减 / saveSettings）
if (/persist\.saveHighScore\b/.test(uiSrc) && /persist\.saveSettings\b/.test(uiSrc)) ok('ui.js onSnapshot 只增不减写回 + 设置 saveSettings')
else bad('ui.js 持久化写回点缺失')
if (/persist\.dispose\b/.test(uiSrc)) ok('ui.js dispose 链含 persist.dispose()')
else bad('ui.js dispose 链缺 persist.dispose()')

console.log('== 6c. r37 全网排行榜装配锚点（AC-9：leaderboard.js / persist 增量 / index.html 装配面） ==')
const LB = require(path.join(root, 'leaderboard.js'))
if (typeof LB.createLeaderboard === 'function') ok('leaderboard.js 导出 createLeaderboard（window.TetrisLeaderboard）')
else bad('leaderboard.js MISSING createLeaderboard')
if (/API_BASE\s*=/.test(lbSrc)) ok('leaderboard.js 源码含 API_BASE（单一 API 基址登记点）')
else bad('leaderboard.js 缺 API_BASE 常量')
if (/\bdegraded\b/.test(lbSrc)) ok('leaderboard.js 源码含 degraded 标记（AC-8 停摆可观测）')
else bad('leaderboard.js 缺 degraded 标记')
if (P && typeof P.sanitizeDeviceId === 'function' && typeof P.sanitizeNickname === 'function') ok('persist 导出 sanitizeDeviceId/sanitizeNickname')
else bad('persist 缺 r37 清洗导出')
if (/saveDeviceId\b/.test(fs.readFileSync(path.join(root, 'persist.js'), 'utf8')) && /saveNickname\b/.test(fs.readFileSync(path.join(root, 'persist.js'), 'utf8'))) ok('persist 源码含 saveDeviceId/saveNickname 出口')
else bad('persist 缺 saveDeviceId/saveNickname')
if (/<script src="\.\/leaderboard\.js">/.test(html)) ok('index.html 含 <script src="./leaderboard.js">（本地相对引用）')
else bad('index.html 缺 leaderboard.js 脚本位')
if (/createLeaderboard\(/.test(html)) ok('index.html 含 createLeaderboard 调用（内联装配）')
else bad('index.html 缺 createLeaderboard 调用')
if (/createUI\(\s*\{[\s\S]*leaderboard\s*:/.test(html)) ok('index.html createUI({ leaderboard }) 装配根')
else bad('index.html createUI 未传入 leaderboard 句柄')
if (/onGameOver:\s*function\s*\(\s*score\s*,\s*snap/.test(html)) ok('index.html onGameOver(score, snap) 透传 OVER 快照')
else bad('index.html onGameOver 未透传快照')
if (/leaderboardPanel\.dispose\(\)/.test(uiSrc) && /nicknamePrompt\.dispose\(\)/.test(uiSrc)) ok('ui.js dispose 链含 r37 组件解绑')
else bad('ui.js dispose 链缺 r37 组件解绑')

console.log('== 7. 音频文件审计（v2.0，AC-09.5：0 音频文件 / 无 <audio>/<source> 元素） ==')
function walk(dir, out) {
  out = out || []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
const audioExts = ['.mp3', '.wav', '.ogg', '.m4a']
const audioFiles = walk(root).filter((f) => audioExts.includes(path.extname(f).toLowerCase()))
if (audioFiles.length === 0) ok('产品根目录 0 个音频文件（.mp3/.wav/.ogg/.m4a）')
else bad('发现音频文件: ' + audioFiles.join(', '))
if (/<audio[\s>]|<source[\s>]/i.test(html)) bad('index.html 含 <audio>/<source> 元素')
else ok('index.html 无 <audio>/<source> 元素')

console.log(fail === 0 ? '\nALL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`)
process.exit(fail === 0 ? 0 : 1)
