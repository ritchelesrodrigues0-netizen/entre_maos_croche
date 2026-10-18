import { config, isConfigured } from './config.js'
import { fetchPublishedProduct } from './products.js'
import { publicImageUrl } from './supabase.js'
import { esc, formatPrice, statusBadge } from './util.js'

const root = document.getElementById('produto')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function setMeta(selector, attr, value) {
  const el = document.head.querySelector(selector)
  if (el) el.setAttribute(attr, value)
}

function notFound() {
  document.title = `Peça não encontrada | ${config.brandName}`
  root.innerHTML = `
    <div class="container section">
      <div class="empty">
        <h1>Peça não encontrada</h1>
        <p>Ela pode ter sido retirada do catálogo ou o endereço está incorreto.</p>
        <a href="catalogo.html" class="btn">Voltar ao catálogo</a>
      </div>
    </div>`
}

async function load() {
  const id = new URLSearchParams(location.search).get('id') || ''
  if (!UUID.test(id) || !isConfigured()) return notFound()

  root.innerHTML =
    '<div class="container"><div class="loading-block" role="status"><span class="spinner" aria-hidden="true"></span> Carregando a peça…</div></div>'

  let product
  try {
    product = await fetchPublishedProduct(id)
  } catch (error) {
    root.innerHTML = `
      <div class="container section">
        <div class="notice notice--error" role="alert">
          <p>Não conseguimos carregar esta peça. ${esc(error.message)}</p>
          <button type="button" class="btn btn--small" id="retry">Tentar novamente</button>
        </div>
      </div>`
    document.getElementById('retry').addEventListener('click', load)
    return
  }
  if (!product) return notFound()

  const images = product.images || []
  const price = formatPrice(product.price)
  const soldOut = product.stock_status === 'esgotado'
  const link = product.instagram_url || config.instagramUrl
  const cta = product.stock_status === 'sob_encomenda' ? 'Encomendar pelo Instagram' : 'Consultar pelo Instagram'
  const description = product.description || `${product.title}, peça de crochê feita à mão.`

  document.title = `${product.title} | ${config.brandName}`
  setMeta('meta[name="description"]', 'content', description.slice(0, 155))
  setMeta('meta[property="og:title"]', 'content', document.title)
  setMeta('meta[property="og:description"]', 'content', description.slice(0, 155))
  if (images[0]) {
    const og = document.createElement('meta')
    og.setAttribute('property', 'og:image')
    og.setAttribute('content', publicImageUrl(images[0]))
    document.head.appendChild(og)
  }

  const thumbs =
    images.length > 1
      ? `<div class="gallery__thumbs">${images
          .map(
            (path, i) =>
              `<button type="button" class="gallery__thumb" data-i="${i}" aria-label="Ver foto ${i + 1} de ${images.length}" aria-current="${i === 0}"><img src="${esc(publicImageUrl(path))}" alt="" loading="lazy"></button>`,
          )
          .join('')}</div>`
      : ''

  const action = soldOut
    ? `<button type="button" class="btn" disabled>Esgotado no momento</button>
       <p style="margin-top:1rem">Esta peça já encontrou um lar. <a href="catalogo.html">Veja outras peças</a> ou fale conosco no
       <a href="${esc(config.instagramUrl)}" target="_blank" rel="noopener noreferrer">Instagram</a> para saber de novas versões.</p>`
    : `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${cta}</a>`

  root.innerHTML = `
    <div class="container">
      <nav class="breadcrumb" aria-label="Você está em"><a href="catalogo.html">← Voltar ao catálogo</a></nav>
      <article class="detail">
        <div class="gallery">
          <div class="gallery__main" id="gallery-main">
            ${
              images[0]
                ? `<img src="${esc(publicImageUrl(images[0]))}" alt="${esc(product.title)}, peça de crochê">`
                : '<div class="placeholder-img">Foto em breve</div>'
            }
          </div>
          ${thumbs}
        </div>
        <div>
          <p class="card__category">${esc(product.category)}</p>
          <h1>${esc(product.title)}</h1>
          ${statusBadge(product.stock_status)}
          ${price ? `<p class="detail__price">${esc(price)}</p>` : ''}
          ${product.description ? `<p class="detail__desc">${esc(product.description)}</p>` : ''}
          ${action}
        </div>
      </article>
    </div>`

  const main = document.querySelector('#gallery-main img')
  root.querySelectorAll('.gallery__thumb').forEach((btn) =>
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i)
      if (main) main.src = publicImageUrl(images[i])
      root.querySelectorAll('.gallery__thumb').forEach((b) => b.setAttribute('aria-current', String(b === btn)))
    }),
  )
}

load()
