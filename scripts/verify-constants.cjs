'use strict'
/*!
 * tetris/scripts/verify-constants.cjs — 工程自检：模块 VERSION 常量一致性（node:test，零依赖）
 * ============================================================================
 * 运行：node scripts/verify-constants.cjs
 *
 * 背景（tech 技术驱动改造）：三模块头部 VERSION 为版本单一事实来源，但此前无脚本
 * 兜底校验，历史出现过版本未同步（如 OBS-11-3：VERSION 未升 2.1.0）。本脚本把
 * 「三模块 VERSION 一致 + 与文档 TECHNICAL §2.2 记录一致」固化为可回归断言：
 *   1. game.js / ui.js / audio.js 三模块导出的 VERSION 均 === '2.2.0'，且三者彼此相等；
 *   2. 该版本与 docs/technical/TECHNICAL.md §2.2「存储与版本」所记录的版本一致
 *      （防止升级时「代码已升但文档未同步」或反之的漂移）。
 * 仅新增本自检脚本，不改任何既有代码/行为/UI/AC；不参与游戏运行时路径。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// 单一事实来源：目标版本（三模块 + TECHNICAL §2.2 均应等于此值）
const EXPECTED_VERSION = '2.2.0'
const TECH_FILE = path.join(__dirname, '..', 'docs', 'technical', 'TECHNICAL.md')

// Node 下 require 三模块零 DOM/Audio 副作用（既有 verify-ui.cjs §2 已证明）
const G = require('../game.js')
const U = require('../ui.js')
const A = require('../audio.js')

test(`VERSION: 三模块头部均 === '${EXPECTED_VERSION}' 且彼此一致`, () => {
  assert.equal(typeof G.VERSION, 'string')
  assert.equal(typeof U.VERSION, 'string')
  assert.equal(typeof A.VERSION, 'string')
  assert.equal(G.VERSION, EXPECTED_VERSION, 'game.js VERSION 应为 ' + EXPECTED_VERSION)
  assert.equal(U.VERSION, EXPECTED_VERSION, 'ui.js VERSION 应为 ' + EXPECTED_VERSION)
  assert.equal(A.VERSION, EXPECTED_VERSION, 'audio.js VERSION 应为 ' + EXPECTED_VERSION)
  // 三者完全一致（防单模块漏升）
  assert.equal(G.VERSION, U.VERSION)
  assert.equal(G.VERSION, A.VERSION)
})

test('VERSION: 与 docs/technical/TECHNICAL.md §2.2 记录一致（文档-代码不漂移）', () => {
  const src = fs.readFileSync(TECH_FILE, 'utf8')
  // 定位 §2.2「存储与版本」小节（### 2.2 起，至下一个同/更高级标题止）
  const start = src.indexOf('### 2.2')
  assert.notEqual(start, -1, 'TECHNICAL.md 应存在「### 2.2」小节')
  const section = src.slice(start)
  const endMatch = section.slice(5).match(/^#{2,4} /m) // 后续标题（### / ####）
  const sectionText = endMatch ? section.slice(0, endMatch.index + 5) : section
  // §2.2 必须记录与代码一致的目标版本（形如 `'2.2.0'`）
  assert.ok(
    sectionText.includes(EXPECTED_VERSION),
    `TECHNICAL §2.2 应记录版本 ${EXPECTED_VERSION}，实际为：\n${sectionText}`
  )
})
