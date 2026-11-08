import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import Turnstile from '~/components/forms/heavy/components/Turnstile.vue'
import CaptchaInput from '~/components/forms/heavy/components/CaptchaInput.vue'
import { loadTurnstile } from '~/lib/turnstile'

vi.mock('~/lib/turnstile', () => ({ loadTurnstile: vi.fn() }))
mockNuxtImport('useFeatureFlag', () => () => 'test-site-key')
enableAutoUnmount(afterEach)

type WidgetOptions = {
  callback: (token: string) => void
  'expired-callback': () => void
  'timeout-callback': () => void
  'error-callback': () => boolean
}
const render = vi.fn((_element: HTMLElement, _options: WidgetOptions) => 'widget-id')
const reset = vi.fn()
const remove = vi.fn()
const api = { render, reset, remove }
function options(): WidgetOptions {
  const call = render.mock.lastCall
  if (!call) throw new Error('Widget was not rendered')
  return call[1]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadTurnstile).mockResolvedValue(api)
})


describe('Turnstile', () => {
  it.each(['bn', 'ca', 'ur'])('falls back to browser language for unsupported form language %s', async language => {
    mount(Turnstile, { props: { sitekey: 'test-site-key', language } })
    await flushPromises()
    expect(render).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ language: 'auto' }))
  })

  it('renders explicitly with the submission action and sends verified tokens to the form', async () => {
    const form = { 'cf-turnstile-response': null, errors: { has: () => false } }
    const wrapper = mount(CaptchaInput, {
      props: { provider: 'turnstile', form, language: 'en' },
      global: { stubs: { HasError: true } }
    })
    await flushPromises()
    expect(render).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      sitekey: 'test-site-key', action: 'form_submit', 'response-field': false
    }))
    options().callback('verified-token')
    expect(form['cf-turnstile-response']).toBe('verified-token')
    options()['expired-callback']()
    expect(form['cf-turnstile-response']).toBeNull()
    options().callback('new-token')
    wrapper.vm.reset()
    expect(form['cf-turnstile-response']).toBeNull()
    expect(reset).toHaveBeenCalledWith('widget-id')
  })

  it('clears the token on errors and lets the visitor retry', async () => {
    const wrapper = mount(Turnstile, { props: { sitekey: 'test-site-key' } })
    await flushPromises()
    options().callback('verified-token')
    options()['error-callback']()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.emitted('expired')).toHaveLength(2)
    await wrapper.get('button').trigger('click')
    expect(reset).toHaveBeenCalledWith('widget-id')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('removes its widget and clears the token when leaving the page', async () => {
    const onExpired = vi.fn()
    const wrapper = mount(Turnstile, { props: { sitekey: 'test-site-key', onExpired } })
    await flushPromises()
    options().callback('verified-token')
    wrapper.unmount()
    expect(remove).toHaveBeenCalledWith('widget-id')
    expect(onExpired).toHaveBeenCalledTimes(2)
  })

  it('does not render after unmounting while the shared script is loading', async () => {
    let finish: (value: typeof api) => void = () => { throw new Error('Not loading') }
    vi.mocked(loadTurnstile).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const wrapper = mount(Turnstile, { props: { sitekey: 'test-site-key' } })
    wrapper.unmount()
    finish(api)
    await flushPromises()
    expect(render).not.toHaveBeenCalled()
  })

  it('can retry loading a blocked script', async () => {
    vi.mocked(loadTurnstile).mockRejectedValueOnce(new Error('Blocked'))
    const wrapper = mount(Turnstile, { props: { sitekey: 'test-site-key' } })
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(render).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
