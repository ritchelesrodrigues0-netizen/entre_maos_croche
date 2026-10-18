export const STOCK_LABELS = {
  disponivel: 'Disponível',
  sob_encomenda: 'Sob encomenda',
  esgotado: 'Esgotado',
}

export const SUGGESTED_CATEGORIES = [
  'Amigurumis',
  'Bolsas',
  'Roupas',
  'Casa e decoração',
  'Acessórios',
  'Bebês',
  'Outros',
]

/** Escapa texto antes de colocá-lo em HTML (evita injeção de código). */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatPrice(value) {
  if (value === null || value === undefined || value === '') return null
  return brl.format(Number(value))
}

/** "1.234,50" ou "45" -> número. Vazio -> null. Inválido -> NaN. */
export function parsePrice(raw) {
  const text = String(raw ?? '').trim().replace(/[R$\s]/g, '')
  if (text === '') return null
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN
}

export function priceToInput(value) {
  return value === null || value === undefined ? '' : String(value).replace('.', ',')
}

const INSTAGRAM_URL = /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._/?=&%-]+$/i
export function isValidInstagramUrl(value) {
  return INSTAGRAM_URL.test(String(value).trim())
}

export function statusBadge(status) {
  return `<span class="badge badge--${esc(status)}">${esc(STOCK_LABELS[status] ?? status)}</span>`
}

export const $ = (selector, root = document) => root.querySelector(selector)
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]
