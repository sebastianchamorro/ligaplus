export default defineNuxtConfig({
  devtools: { enabled: true },
  css: ['~/assets/css/main.css', '~/assets/css/extra.css'],
  app: { head: { title: 'Liga Libreña · liga.futbol.app' } },
  compatibilityDate: '2026-10-16',
  modules: ['@nuxtjs/supabase'],
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    redirect: false
  }
})
