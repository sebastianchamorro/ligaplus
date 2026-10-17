function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function usePushSubscription(leagueId: string) {
  const supported = computed(
    () => import.meta.client && 'serviceWorker' in navigator && 'PushManager' in window
  )
  const subscribed = ref(false)
  const loading = ref(false)

  async function checkStatus() {
    if (!supported.value) return
    const registration = await navigator.serviceWorker.getRegistration()
    const existing = await registration?.pushManager.getSubscription()
    subscribed.value = !!existing
  }

  if (import.meta.client) onMounted(checkStatus)

  async function subscribe() {
    if (!supported.value) {
      alert('Tu navegador no soporta notificaciones push.')
      return
    }
    loading.value = true
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return

      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const config = useRuntimeConfig()
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.public.vapidPublicKey as string)
      })

      await $fetch('/api/push/subscribe', {
        method: 'POST',
        body: { league_id: leagueId, subscription: subscription.toJSON() }
      })
      subscribed.value = true
    } catch (err: any) {
      alert(err?.message || 'No se pudo activar las notificaciones.')
    } finally {
      loading.value = false
    }
  }

  async function unsubscribe() {
    const registration = await navigator.serviceWorker.getRegistration()
    const existing = await registration?.pushManager.getSubscription()
    if (existing) {
      await $fetch('/api/push/unsubscribe', { method: 'POST', body: { endpoint: existing.endpoint } })
      await existing.unsubscribe()
    }
    subscribed.value = false
  }

  return { supported, subscribed, loading, subscribe, unsubscribe }
}
