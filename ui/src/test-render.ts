/**
 * Minimal test - bypass all frameworks
 * Just: read file → parse → render to DOM
 */

import { html, render } from 'lit-html'
import { readFile } from './api'
import { parseLogFile } from './parser'

export async function testDirectRender(path: string, container: HTMLElement) {
  console.time('TOTAL')

  console.time('1-readFile')
  const result = await readFile(path, 0)
  console.timeEnd('1-readFile')

  if (!result.success || !result.content) {
    container.textContent = 'Failed to read file'
    return
  }

  console.time('2-parseLogFile')
  const parsed = parseLogFile(result.content, result.name || 'test')
  console.timeEnd('2-parseLogFile')

  console.log(`Parsed ${parsed.logs.length} logs`)

  console.time('3-createTemplate')
  const template = html`
    <div style="height: 100%; overflow: auto; font-family: monospace; font-size: 12px;">
      ${parsed.logs.slice(0, 500).map(log => html`
        <div style="padding: 4px 8px; border-bottom: 1px solid #eee;">
          ${log.parsed?.content || log.data}
        </div>
      `)}
    </div>
  `
  console.timeEnd('3-createTemplate')

  console.time('4-render')
  render(template, container)
  console.timeEnd('4-render')

  console.timeEnd('TOTAL')
  console.log('=== RENDER COMPLETE ===')
}

// Expose globally for testing
;(window as any).testDirectRender = testDirectRender
