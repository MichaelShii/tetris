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
  '#global-stats','#gs-hi-value','#gs-placed-value','#gs-lines-value','#gs-time-value','#gs-games-value'] // r34：全局统计面板六锚点（ui.js must()×5 + 容器）
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

console.log('== 5. 自包含（AC-08） ==')
const all = html + fs.readFileSync(path.join(root, 'ui.js'),'utf8') + fs.readFileSync(path.join(root, 'game.js'),'utf8') + fs.readFileSync(path.join(root, 'audio.js'),'utf8') + fs.readFileSync(path.join(root, 'persist.js'),'utf8') + css
if (/https?:\/\//.test(all)) bad('发现 http(s) 引用'); else ok('无 http(s) 引用')
for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
  if (m[1].startsWith('//') || (m[1].startsWith('/') && !m[1].startsWith('./'))) bad('外部/绝对引用 ' + m[1])
  else ok('本地引用 ' + m[1])
}

console.log('== 6. index.html 引入顺序（persist.js → audio.js → game.js → ui.js → createUI） ==')
// 注：createUI 亦出现在脚本注释中（< ui.js 标签前），装配调用取最后一次出现（内联装配根）
const pi = html.indexOf('persist.js'), ai = html.indexOf('audio.js'), gi = html.indexOf('game.js'), ui = html.indexOf('ui.js'), ci = html.lastIndexOf('createUI')
if (pi !== -1 && ai !== -1 && gi !== -1 && ui !== -1 && pi < ai && ai < gi && gi < ui && ui < ci) ok('顺序正确: persist.js → audio.js → game.js → ui.js → createUI'); else bad('脚本顺序/装配调用异常（应 persist.js 最前）')

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
