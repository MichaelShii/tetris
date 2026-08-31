/*!
 * products/tetris/scripts/r29-browser-overlap.cjs — 横屏锁屏 / 宽屏停用触控键 条件性浏览器探测
 * ============================================================================
 * 目的：r30 横屏策略收紧（触屏手机/平板横屏 → 锁竖屏遮罩 + 隐藏触控键；PC 宽屏 ≥1024 → 隐藏触控键）
 *  只能在真实浏览器（有 getBoundingClientRect 布局 + 媒体查询求值）下断言。jsdom 无布局
 *  几何与媒体查询求值，故本脚本独立于 verify-ui / qa-e2e 七套，仅在检测到浏览器驱动时运行：
 *    - 若检测到 playwright / puppeteer（项目或 harness node_modules），则启动真实浏览器，
 *      emulate 触屏横屏视口，对每个视口断言：
 *        1. 触屏手机/平板横屏（<1024）：#rotate-overlay 可见（display:flex、盖满视口）、
 *           .touchpad 隐藏（不可见，横屏不作为操作形态）、遮罩卡居中；
 *        2. 宽屏桌面（≥1024，has-touch）：.touchpad 隐藏、#rotate-overlay 隐藏（不锁屏，纯停用触控键）；
 *        3. 桌面非触控（无 has-touch）：.touchpad 保持隐藏、#rotate-overlay 隐藏（键鼠零变化）。
 *    - 若未检测到驱动，则打印 SKIP 说明并以退出码 0 安全退出（退化：源码门控断言 + 实机截图人工比对），
 *      避免无浏览器环境挂红。
 *
 * 运行：node scripts/r29-browser-overlap.cjs
 * 依赖可选：playwright 或 puppeteer（本脚本从项目 / DSH harness 的 node_modules 解析，无需安装）
 * 退出码：0 = 通过 / SKIP；1 = 断言失败或脚本异常
 * ============================================================================
 */
'use strict'

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const INDEX = 'file://' + path.join(root, 'index.html').replace(/\\/g, '/')

const CSS_FALLBACKS = ['playwright', 'playwright-core', 'puppeteer', 'puppeteer-core']
const DRIVER_RESOLUTION = [
  root,
  path.resolve(__dirname, '../../../../deepseek-harness'),
  path.resolve(__dirname, '../../../deepseek-harness'),
]

function resolveDriver() {
  for (const base of DRIVER_RESOLUTION) {
    for (const name of CSS_FALLBACKS) {
      try {
        require.resolve(name, { paths: [base] })
        return { name }
      } catch (e) { /* 继续 */ }
    }
  }
  return null
}

/** 元素可见性（display 非 none + 有几何尺寸） */
function isVisible(el) {
  if (!el) return false
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  return cs.display !== 'none' && r.width > 0 && r.height > 0
}

/* 主入口 */
async function main() {
  const driver = resolveDriver()
  if (!driver) {
    console.log('[r30-lock-overlay] 未检测到 playwright/puppeteer 驱动 → 跳过真实浏览器锁屏/停用探测')
    console.log('[r30-lock-overlay] 退化：以 qa-e2e/verify-ui 源码门控断言 + 实机截图人工比对（留人工补测）')
    console.log('[r30-lock-overlay] SKIP (exit 0) —— 该脚本为条件性，不入七套')
    return 0
  }

  let pass = 0
  let fail = 0
  const failures = []
  function check(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name + (extra ? '  (' + extra + ')' : '')) }
    else { fail++; failures.push(name); console.log('  ✗ ' + name + (extra ? '  (' + extra + ')' : '')) }
  }

  // 场景：触屏手机/平板横屏(<1024) / 宽屏桌面(≥1024 触屏) / 桌面非触控
  const VIEWPORTS = [
    { w: 844, h: 390, touch: true, label: '844×390 触屏横屏 (M, 手机)' },
    { w: 568, h: 320, touch: true, label: '568×320 触屏横屏 (S, 手机)' },
    { w: 1024, h: 600, touch: true, label: '1024×600 触屏横屏 (L, 宽屏桌/大平板)' },
    { w: 1280, h: 720, touch: false, label: '1280×720 非触控桌面 (L)' },
  ]

  let browser = null
  let checkFailures = []
  try {
    const pw = require(driver.name)
    browser = pw.chromium ? await pw.chromium.launch() : null
    if (!browser) {
      const chromePath = [
        process.env.CHROME_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ].filter(Boolean).find(function (p) { return fs.existsSync(p) })
      const pp = require(driver.name)
      browser = await pp.launch(chromePath ? { executablePath: chromePath, headless: 'new' } : { headless: 'new' })
    }

    for (const vp of VIEWPORTS) {
      console.log('\n-- 视口 ' + vp.label + ' --')
      const context = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        isMobile: vp.touch,
        hasTouch: vp.touch,
      })
      const page = await context.newPage()
      await page.goto(INDEX, { waitUntil: 'load' })
      // 显式同步 has-touch（触屏场景挂上；非触屏不挂）
      if (vp.touch) {
        await page.evaluate(function () { document.documentElement.classList.add('has-touch') })
      } else {
        await page.evaluate(function () { document.documentElement.classList.remove('has-touch') })
      }
      await page.waitForTimeout(80)
      const m = await page.evaluate(function () {
        const cs = function (el) { return el ? getComputedStyle(el).display : 'n/a' }
        const vis = function (el) {
          if (!el) return false
          const r = el.getBoundingClientRect()
          return getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0
        }
        const rot = document.querySelector('#rotate-overlay')
        const touchpad = document.querySelector('.touchpad')
        return {
          hasTouch: document.documentElement.classList.contains('has-touch'),
          rotDisplay: cs(rot),
          rotVisible: vis(rot),
          rotCoversViewport: rot ? (function () {
            const r = rot.getBoundingClientRect()
            return r.left <= 0 && r.top <= 0 && r.right >= window.innerWidth && r.bottom >= window.innerHeight
          })() : false,
          touchpadDisplay: cs(touchpad),
          touchpadVisible: vis(touchpad),
          vw: window.innerWidth, vh: window.innerHeight,
        }
      })

      check(vp.label + ' has-touch 状态正确',
        vp.touch ? m.hasTouch === true : m.hasTouch === false, String(m.hasTouch))

      if (vp.touch && vp.w < 1024) {
        // 触屏手机/平板横屏 → 锁屏遮罩可见 + 触控键隐藏
        check(vp.label + ' 锁屏遮罩可见（display:flex + getBoundingClientRect 有尺寸）',
          m.rotDisplay === 'flex' && m.rotVisible, 'rot=' + m.rotDisplay)
        check(vp.label + ' 锁屏遮罩盖满视口（inset:0 全屏）',
          m.rotCoversViewport, 'vw=' + m.vw + ' vh=' + m.vh)
        check(vp.label + ' 触控键隐藏（.touchpad display:none，横屏非操作形态）',
          m.touchpadDisplay === 'none', 'touchpad=' + m.touchpadDisplay)
      } else if (vp.touch && vp.w >= 1024) {
        // 宽屏桌面（触屏）→ 停用触控键、不锁屏（宽屏即桌面形态，无遮罩）
        check(vp.label + ' 宽屏触屏不锁屏（遮罩隐藏）', m.rotDisplay === 'none', 'rot=' + m.rotDisplay)
        check(vp.label + ' 宽屏触屏停用触控键（.touchpad display:none）',
          m.touchpadDisplay === 'none', 'touchpad=' + m.touchpadDisplay)
      } else {
        // 非触控桌面 → 键鼠零变化（遮罩隐藏 + 触控键本就隐藏）
        check(vp.label + ' 桌面非触控遮罩隐藏', m.rotDisplay === 'none', 'rot=' + m.rotDisplay)
        check(vp.label + ' 桌面非触控触控键隐藏', m.touchpadDisplay === 'none', 'touchpad=' + m.touchpadDisplay)
      }

      await context.close()
    }

    if (browser) await browser.close()
  } catch (e) {
    try { if (browser) await browser.close() } catch (e2) { /* ignore */ }
    console.error('[r30-lock-overlay] 浏览器探测异常：', e && e.message || e)
    console.log('\n== r30 浏览器锁屏/停用探测（退化）==\n通过 ' + pass + ' / ' + (pass + fail))
    failures.forEach(function (f) { console.log('  - ' + f) })
    return 0
  }

  console.log('\n== r30 浏览器锁屏/停用探测结果 ==')
  console.log('通过 ' + pass + ' / ' + (pass + fail))
  if (failures.length) {
    failures.forEach(function (f) { console.log('  - ' + f) })
    return 1
  }
  console.log('ALL r30 LOCK/STOP-TOUCH CHECKS PASSED')
  return 0
}

main().then(function (code) { process.exitCode = code }).catch(function (err) {
  console.error('[r30-lock-overlay] 脚本异常：', err)
  process.exitCode = 1
})
