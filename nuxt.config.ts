export default defineNuxtConfig({
  devtools: { enabled: true },
  css: ['~/assets/css/main.css', '~/assets/css/extra.css'],
  app: { head: { title: 'Liga Libreña · liga.futbol.app' } },
  compatibilityDate: '2026-10-16',
  modules: ['@nuxtjs/supabase', '@nuxt/icon'],
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    redirect: false
  },
  runtimeConfig: {
    // Sólo server-side (no tiene prefijo "public"): nunca llega al cliente.
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
    vapidSubject: process.env.VAPID_SUBJECT,
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY
    }
  }
})
