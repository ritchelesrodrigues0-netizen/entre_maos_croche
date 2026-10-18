// =====================================================================
// CONFIGURAÇÃO DO SITE
// Preencha os dois campos do Supabase (veja o README, passo 4).
//
// A chave "anon" é PÚBLICA por natureza: pode ficar neste arquivo.
// A proteção real está nas políticas de segurança (RLS) do banco.
// NUNCA coloque aqui a chave "service_role".
// =====================================================================
export const config = {
  supabaseUrl: 'https://ffspysvhhmtxxbjhnjdy.supabase.co', // ex.: 'https://abcdxyz.supabase.co'
  supabaseAnonKey: 'sb_publishable_5ixOQ5Z5evCa-0s26G9mgg_7vCIuXs_', // chave "anon / publishable" do Supabase

  brandName: 'Entre Mãos Crochê',
  instagramUrl: 'https://www.instagram.com/entremaoscroche/',
  instagramHandle: '@entremaoscroche',

  adminPath: 'admin/index.html',

  imageBucket: 'product-images',
  maxImageBytes: 5 * 1024 * 1024,
  maxImages: 8,
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
}

export function isConfigured() {
  const url = (config.supabaseUrl || '').trim()
  const key = (config.supabaseAnonKey || '').trim()
  return url.startsWith('https://') && key.length > 20
}
