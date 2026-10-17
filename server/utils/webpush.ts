import webpush from 'web-push'

let configured = false

export function getWebPush() {
  const config = useRuntimeConfig()
  if (!configured) {
    webpush.setVapidDetails(
      config.vapidSubject as string,
      config.public.vapidPublicKey as string,
      config.vapidPrivateKey as string
    )
    configured = true
  }
  return webpush
}
