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
  if (defKeys === eventKeys && defKeys === 'clear,gameOver,hardDrop,levelUp,move,rotate,softDrop') ok('SFX_DEFS 键与 SFX_EVENTS 一致（7 事件）')
  else bad('SFX_DEFS/ SFX_EVENTS 事件集不一致：' + defKeys + ' vs ' + eventKeys)
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
  '#bgm-control','#btn-bgm'] // v2.5：背景音乐 BGM 开关（AC-15）
for (const s of sel) {
  if (s.includes(' ')) {
    const [pid, cls] = s.split(' ')
    const block = html.match(new RegExp('id="' + pid.slice(1) + '"[^>]*>([\\s\\S]*?)</div>'))
    if (block && block[1].includes(cls.split('.').pop())) ok(s); else bad('MISSING selector ' + s)
  } else if (new RegExp('id="' + s.slice(1) + '"').test(html)) ok(s); else bad('MISSING ' + s)
}

console.log('== 4. ui.js 依赖的 CSS 类钩子在 style.css 中 ==')
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8')
for (const hook of ['is-flashing','is-open','is-showing','is-pulsing','is-gameover','[data-status','[data-state','key-hints__row','stat__value','btn--primary','btn--secondary','#feedback-toast','#overlay-card']) {
  if (css.includes(hook)) ok(hook); else bad('MISSING css hook ' + hook)
}

console.log('== 5. 自包含（AC-08） ==')
const all = html + fs.readFileSync(path.join(root, 'ui.js'),'utf8') + fs.readFileSync(path.join(root, 'game.js'),'utf8') + fs.readFileSync(path.join(root, 'audio.js'),'utf8') + css
if (/https?:\/\//.test(all)) bad('发现 http(s) 引用'); else ok('无 http(s) 引用')
for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
  if (m[1].startsWith('//') || (m[1].startsWith('/') && !m[1].startsWith('./'))) bad('外部/绝对引用 ' + m[1])
  else ok('本地引用 ' + m[1])
}

console.log('== 6. index.html 引入顺序（audio.js → game.js → ui.js → createUI） ==')
const ai = html.indexOf('audio.js'), gi = html.indexOf('game.js'), ui = html.indexOf('ui.js'), ci = html.indexOf('createUI')
if (ai !== -1 && gi !== -1 && ui !== -1 && ai < gi && gi < ui && ui < ci) ok('顺序正确: audio.js → game.js → ui.js → createUI'); else bad('脚本顺序/装配调用异常')

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
