// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  document.head.innerHTML = ''
  Reflect.deleteProperty(window, 'turnstile')
})
afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'turnstile')
  Reflect.deleteProperty(window, 'opnformTurnstileLoaded')
})

function completeLoad() {
  const api = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() }
  Reflect.set(window, 'turnstile', api)
  const callback = Reflect.get(window, 'opnformTurnstileLoaded')
  if (typeof callback !== 'function') throw new Error('Missing Turnstile onload callback')
  callback()
  return api
}

describe('Turnstile script loader', () => {
  it('shares one loading script across concurrent widgets', async () => {
    const { loadTurnstile } = await import('../../lib/turnstile')
    const first = loadTurnstile()
    const second = loadTurnstile()
    expect(document.querySelectorAll('script')).toHaveLength(1)
    const api = completeLoad()
    await expect(first).resolves.toBe(api)
    await expect(second).resolves.toBe(api)
    await expect(loadTurnstile()).resolves.toBe(api)
    expect(document.querySelectorAll('script')).toHaveLength(1)
  })

  it('cleans up a failed script and allows another attempt', async () => {
    const { loadTurnstile } = await import('../../lib/turnstile')
    const first = expect(loadTurnstile()).rejects.toThrow('Unable to load Turnstile')
    document.querySelector('script')?.dispatchEvent(new Event('error'))
    await first
    expect(document.querySelectorAll('script')).toHaveLength(0)
    const retry = loadTurnstile()
    const api = completeLoad()
    await expect(retry).resolves.toBe(api)
  })

  it('times out when the script never loads', async () => {
    const { loadTurnstile } = await import('../../lib/turnstile')
    const result = expect(loadTurnstile()).rejects.toThrow('Unable to load Turnstile')
    await vi.advanceTimersByTimeAsync(15000)
    await result
    expect(document.querySelectorAll('script')).toHaveLength(0)
  })
})
