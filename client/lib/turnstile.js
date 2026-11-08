let scriptPromise

export function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timeout = setTimeout(() => fail(), 15000)

    function cleanup() {
      clearTimeout(timeout)
      delete window.opnformTurnstileLoaded
    }

    function fail() {
      cleanup()
      script.remove()
      reject(new Error('Unable to load Turnstile'))
    }

    window.opnformTurnstileLoaded = () => {
      cleanup()
      if (window.turnstile) resolve(window.turnstile)
      else fail()
    }
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=opnformTurnstileLoaded'
    script.async = true
    script.onerror = fail
    document.head.appendChild(script)
  }).catch(error => {
    scriptPromise = null
    throw error
  })

  return scriptPromise
}
