import { isConfigured } from './config.js'
import { fetchPublishedProducts } from './products.js'
import { publicImageUrl } from './supabase.js'
import { esc, formatPrice, statusBadge } from './util.js'

function cardHtml(p) {
  const cover = p.images && p.images[0]
  const price = formatPrice(p.price)
  const media = cover
    ? `<img src="${esc(publicImageUrl(cover))}" alt="${esc(p.title)}, peça de crochê" loading="lazy" decoding="async">`
    : '<div class="placeholder-img">Foto em breve</div>'
  return `
    <a class="card" href="produto.html?id=${encodeURIComponent(p.id)}">
      <div class="card__media">${media}${statusBadge(p.stock_status)}</div>
      <div class="card__body">
        <span class="card__category">${esc(p.category)}</span>
        <h3 class="card__title">${esc(p.title)}</h3>
        ${price ? `<span class="card__price">${esc(price)}</span>` : ''}
      </div>
    </a>`
}

/**
 * Mostra o catálogo dentro de `root`.
 * featuredOnly: só os destaques (página inicial). limit: máximo de peças.
 */
export async function renderCatalog(root, { featuredOnly = false, limit = 0 } = {}) {
  root.innerHTML =
    '<div class="loading-block" role="status"><span class="spinner" aria-hidden="true"></span> Carregando as peças…</div>'

  if (!isConfigured()) {
    root.innerHTML = `
      <div class="empty">
        <h3>Catálogo em preparação</h3>
        <p>As peças aparecerão aqui em breve. Enquanto isso, visite nosso Instagram.</p>
      </div>`
    return
  }

  let products
  try {
    products = await fetchPublishedProducts()
  } catch (error) {
    root.innerHTML = `
      <div class="notice notice--error" role="alert">
        <p>Não conseguimos carregar o catálogo agora. ${esc(error.message)}</p>
        <button type="button" class="btn btn--small" data-retry>Tentar novamente</button>
      </div>`
    root.querySelector('[data-retry]').addEventListener('click', () =>
      renderCatalog(root, { featuredOnly, limit }),
    )
    return
  }

  if (products.length === 0) {
    root.innerHTML = `
      <div class="empty">
        <h3>Ainda não há peças publicadas</h3>
        <p>Estamos preparando novidades com muito carinho. Volte em breve ou acompanhe pelo Instagram.</p>
      </div>`
    return
  }

  if (featuredOnly) {
    let list = products.filter((p) => p.is_featured)
    if (limit) list = list.slice(0, limit)
    root.innerHTML =
      list.length === 0
        ? `<div class="empty"><h3>Conheça todas as peças</h3><p><a href="catalogo.html">Ver o catálogo completo</a></p></div>`
        : `<div class="product-grid">${list.map(cardHtml).join('')}</div>`
    return
  }

  const categories = [
    'Todas',
    ...[...new Set(products.map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ]
  let selected = 'Todas'

  function draw() {
    const list = products.filter((p) => selected === 'Todas' || p.category === selected)
    const chips =
      categories.length > 2
        ? `<div class="filters" role="group" aria-label="Filtrar por categoria">
            ${categories
              .map(
                (c) =>
                  `<button type="button" class="chip" data-cat="${esc(c)}" aria-pressed="${c === selected}">${esc(c)}</button>`,
              )
              .join('')}
          </div>`
        : ''
    root.innerHTML =
      chips +
      (list.length === 0
        ? '<div class="empty"><h3>Nenhuma peça nesta categoria</h3><p>Escolha outra categoria para continuar explorando.</p></div>'
        : `<div class="product-grid">${list.map(cardHtml).join('')}</div>`)
    root.querySelectorAll('[data-cat]').forEach((btn) =>
      btn.addEventListener('click', () => {
        selected = btn.dataset.cat
        draw()
      }),
    )
  }
  draw()
}
