<template>
  <div>
    <div ref="container" />
    <div v-if="failed" role="alert" class="text-sm text-red-600">
      Verification could not complete.
      <button type="button" class="underline" @click="reset">Retry verification</button>
    </div>
  </div>
</template>

<script setup>
import { loadTurnstile } from '~/lib/turnstile'

const props = defineProps({
  sitekey: { type: String, required: true },
  theme: { type: String, default: 'light' },
  language: { type: String, default: 'auto' }
})
const emit = defineEmits(['verify', 'expired'])
const supportedLanguages = ['ar', 'bg', 'zh', 'hr', 'cs', 'da', 'nl', 'en', 'fa', 'fi', 'fr', 'de', 'el', 'he', 'hi', 'hu', 'id', 'it', 'ja', 'ko', 'lt', 'ms', 'nb', 'pl', 'pt', 'ro', 'ru', 'sr', 'sk', 'sl', 'es', 'sv', 'tl', 'th', 'tr', 'uk', 'vi']
const container = ref(null)
const failed = ref(false)
let turnstileApi
let widgetId = null
let renderVersion = 0

function removeWidget() {
  if (widgetId !== null) {
    turnstileApi.remove(widgetId)
    widgetId = null
  }
}

function renderWidget() {
  const version = ++renderVersion
  failed.value = false
  emit('expired')
  removeWidget()

  return loadTurnstile().then(turnstile => {
    if (version !== renderVersion || !container.value) return
    turnstileApi = turnstile
    widgetId = turnstile.render(container.value, {
      sitekey: props.sitekey,
      theme: props.theme,
      language: supportedLanguages.includes(props.language) ? props.language : 'auto',
      action: 'form_submit',
      'response-field': false,
      callback: token => {
        failed.value = false
        emit('verify', token)
      },
      'expired-callback': () => emit('expired'),
      'timeout-callback': () => emit('expired'),
      'error-callback': () => {
        failed.value = true
        emit('expired')
        return true
      }
    })
  }).catch(() => {
    if (version === renderVersion) failed.value = true
  })
}

function reset() {
  emit('expired')
  failed.value = false
  if (widgetId !== null) turnstileApi.reset(widgetId)
  else renderWidget()
}

onMounted(renderWidget)
watch(() => [props.sitekey, props.theme, props.language], renderWidget)
onBeforeUnmount(() => {
  renderVersion++
  emit('expired')
  removeWidget()
})
defineExpose({ reset })
</script>
