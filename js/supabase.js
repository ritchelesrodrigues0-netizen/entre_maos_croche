import { config, isConfigured } from './config.js'

let clientPromise = null

/**
 * Carrega a biblioteca do Supabase só quando ela é necessária e cria o cliente
 * com a chave pública. Sem configuração, devolve null e o site mostra avisos.
 */
export function getClient() {
  if (!isConfigured()) return Promise.resolve(null)
  if (!clientPromise) {
    clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm').then(
      ({ createClient }) =>
        createClient(config.supabaseUrl.trim(), config.supabaseAnonKey.trim(), {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        }),
    )
    clientPromise.catch(() => {
      clientPromise = null // permite tentar de novo se a internet falhou
    })
  }
  return clientPromise
}

export async function requireClient() {
  const client = await getClient()
  if (!client) throw new Error('O Supabase ainda não foi configurado. Preencha js/config.js.')
  return client
}

/** Endereço público de uma foto guardada no Storage. */
export function publicImageUrl(path) {
  if (!path) return ''
  const base = config.supabaseUrl.trim().replace(/\/$/, '')
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `${base}/storage/v1/object/public/${config.imageBucket}/${encoded}`
}
