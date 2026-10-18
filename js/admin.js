import { config, isConfigured } from './config.js'
import { getClient, publicImageUrl } from './supabase.js'
import {
  createProduct,
  deleteProduct,
  duplicateProduct,
  fetchAllProducts,
  fetchProductById,
  setPublished,
  updateProduct,
} from './products.js'
import { prepareImage, removeImages, uploadImage, validateImageFile } from './images.js'
import {
  $,
  $$,
  STOCK_LABELS,
  SUGGESTED_CATEGORIES,
  esc,
  formatPrice,
  isValidInstagramUrl,
  parsePrice,
  priceToInput,
  statusBadge,
} from './util.js'

const app = document.getElementById('app')
const state = { client: null, session: null, isAdmin: false, recovery: false }
let cleanup = null // libera pré-visualizações ao sair da tela de formulário
let loginMode = 'entrar' // 'entrar' | 'recuperar'
let loginNotice = null

/* ---------------------------------------------------------------------
   Avisos e confirmação
--------------------------------------------------------------------- */
function toast(message, kind = 'info') {
  const box = document.getElementById('toasts')
  const item = document.createElement('div')
  item.className = `toast toast--${kind}`
  item.textContent = message
  box.appendChild(item)
  setTimeout(() => item.remove(), 5000)
}

function confirmDialog({ title, message, confirmLabel }) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('confirm')
    const ok = document.getElementById('confirm-ok')
    const cancel = document.getElementById('confirm-cancel')
    document.getElementById('confirm-title').textContent = title
    document.getElementById('confirm-message').textContent = message
    ok.textContent = confirmLabel
    const done = (value) => {
      ok.removeEventListener('click', onOk)
      cancel.removeEventListener('click', onCancel)
      dialog.removeEventListener('cancel', onCancel)
      if (dialog.open) dialog.close()
      resolve(value)
    }
    const onOk = () => done(true)
    const onCancel = (e) => {
      if (e) e.preventDefault()
      done(false)
    }
    ok.addEventListener('click', onOk)
    cancel.addEventListener('click', onCancel)
    dialog.addEventListener('cancel', onCancel)
    dialog.showModal()
    cancel.focus()
  })
}

/** Vai para outra tela: troca o # e, se já estava nele, só redesenha. */
function go(hash) {
  if (location.hash === hash) route()
  else location.hash = hash
}

function authError(message) {
  const m = String(message || '').toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Este e-mail ainda não foi confirmado no Supabase.'
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Sem conexão com o servidor. Verifique sua internet.'
  }
  if (m.includes('password') && m.includes('characters')) return 'A senha precisa ter pelo menos 8 caracteres.'
  return 'Não foi possível concluir. Tente novamente.'
}

/* ---------------------------------------------------------------------
   Estrutura comum do painel
--------------------------------------------------------------------- */
function shell(active, inner) {
  app.innerHTML = `
    <div class="admin-body">
      <header class="admin-top">
        <div class="container">
          <div class="admin-top__bar">
            <a href="#/painel" class="admin-top__brand">Entre Mãos Crochê<small>Painel da loja</small></a>
          </div>
          <nav class="admin-nav" aria-label="Painel">
            <a href="#/painel" ${active === 'painel' ? 'aria-current="page"' : ''}>Painel</a>
            <a href="#/novo" ${active === 'novo' ? 'aria-current="page"' : ''}>Adicionar produto</a>
            <a href="../index.html" target="_blank" rel="noopener noreferrer">Ver o site</a>
            <button type="button" id="btn-sair">Sair</button>
          </nav>
        </div>
      </header>
      <main class="admin-main"><div class="container">${inner}</div></main>
    </div>`
  $('#btn-sair').addEventListener('click', signOut)
}

function loading(text) {
  return `<div class="loading-block" role="status"><span class="spinner" aria-hidden="true"></span> ${esc(text)}</div>`
}

function errorBlock(message) {
  return `<div class="notice notice--error" role="alert"><p>${esc(message)}</p>
    <button type="button" class="btn btn--small" data-retry>Tentar novamente</button></div>`
}

/* ---------------------------------------------------------------------
   Autenticação (Supabase Auth). A autorização vem do banco: is_admin().
--------------------------------------------------------------------- */
async function refreshAdmin() {
  state.isAdmin = false
  if (!state.client || !state.session) return
  const { data, error } = await state.client.rpc('is_admin')
  state.isAdmin = !error && data === true
}

async function signOut() {
  if (state.client) await state.client.auth.signOut()
  state.session = null
  state.isAdmin = false
  state.recovery = false
  loginMode = 'entrar'
  go('#/entrar')
}

function renderLogin() {
  const recover = loginMode === 'recuperar'
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-card__logo"><img src="../assets/logo.png" alt="Entre Mãos Crochê" width="150" height="120"></div>
        <h1>${recover ? 'Recuperar senha' : 'Entrar no painel'}</h1>
        ${
          !isConfigured()
            ? '<div class="notice notice--warn" role="alert">O Supabase ainda não foi configurado. Preencha o arquivo js/config.js conforme o guia (README) para ativar o login.</div>'
            : ''
        }
        ${loginNotice ? `<div class="notice ${loginNotice.kind === 'ok' ? 'notice--ok' : 'notice--error'}" role="alert">${esc(loginNotice.text)}</div>` : ''}
        <form id="login-form" novalidate>
          <div class="field">
            <label for="email">E-mail</label>
            <input id="email" type="email" autocomplete="username" inputmode="email">
          </div>
          ${
            recover
              ? ''
              : `<div class="field">
                  <label for="senha">Senha</label>
                  <input id="senha" type="password" autocomplete="current-password">
                </div>`
          }
          <div id="login-msg"></div>
          <button type="submit" class="btn" style="width:100%" ${isConfigured() ? '' : 'disabled'}>${recover ? 'Enviar link' : 'Entrar'}</button>
        </form>
        <div class="auth-links">
          <button type="button" class="link-button" id="toggle-mode">${recover ? 'Voltar para o login' : 'Esqueci minha senha'}</button>
          <div><a href="../index.html">Voltar ao site</a></div>
        </div>
      </div>
    </div>`
  loginNotice = null

  const msg = $('#login-msg')
  const showMsg = (text, kind) => {
    msg.innerHTML = `<div class="notice ${kind === 'ok' ? 'notice--ok' : 'notice--error'}" role="alert">${esc(text)}</div>`
  }

  $('#toggle-mode').addEventListener('click', () => {
    loginMode = recover ? 'entrar' : 'recuperar'
    renderLogin()
  })

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    msg.innerHTML = ''
    const email = $('#email').value.trim()
    if (!email) return showMsg('Informe o seu e-mail.', 'error')
    const button = $('#login-form button[type="submit"]')

    if (recover) {
      button.disabled = true
      button.textContent = 'Aguarde…'
      const { error } = await state.client.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}${location.pathname}`,
      })
      button.disabled = false
      button.textContent = 'Enviar link'
      if (error) showMsg(authError(error.message), 'error')
      else showMsg('Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.', 'ok')
      return
    }

    const password = $('#senha').value
    if (!password) return showMsg('Informe a sua senha.', 'error')
    button.disabled = true
    button.textContent = 'Aguarde…'
    const { data, error } = await state.client.auth.signInWithPassword({ email, password })
    if (error) {
      button.disabled = false
      button.textContent = 'Entrar'
      return showMsg(authError(error.message), 'error')
    }
    state.session = data.session
    await refreshAdmin()
    go('#/painel')
  })
}

function renderNotAdmin() {
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <h1>Acesso não autorizado</h1>
        <p>Esta conta não tem permissão de administradora.</p>
        <button type="button" class="btn" id="sair-na">Sair</button>
      </div>
    </div>`
  $('#sair-na').addEventListener('click', signOut)
}

function renderReset() {
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <h1>Criar nova senha</h1>
        <form id="reset-form" novalidate>
          <div class="field">
            <label for="nova">Nova senha</label>
            <input id="nova" type="password" autocomplete="new-password">
            <span class="hint">Mínimo de 8 caracteres.</span>
          </div>
          <div class="field">
            <label for="confirma">Repita a nova senha</label>
            <input id="confirma" type="password" autocomplete="new-password">
          </div>
          <div id="reset-msg"></div>
          <button type="submit" class="btn" style="width:100%">Salvar nova senha</button>
        </form>
      </div>
    </div>`
  const msg = $('#reset-msg')
  const show = (text, kind) => {
    msg.innerHTML = `<div class="notice ${kind === 'ok' ? 'notice--ok' : 'notice--error'}" role="alert">${esc(text)}</div>`
  }
  $('#reset-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const pass = $('#nova').value
    if (pass.length < 8) return show('A senha precisa ter pelo menos 8 caracteres.', 'error')
    if (pass !== $('#confirma').value) return show('As senhas não são iguais.', 'error')
    const { error } = await state.client.auth.updateUser({ password: pass })
    if (error) return show(authError(error.message), 'error')
    state.recovery = false
    show('Senha atualizada. Entrando no painel…', 'ok')
    await refreshAdmin()
    setTimeout(() => go('#/painel'), 1200)
  })
}

/* ---------------------------------------------------------------------
   Painel: resumo, busca, filtros e lista
--------------------------------------------------------------------- */
const filters = { search: '', category: '', state: '' }

async function renderDashboard() {
  shell(
    'painel',
    `<div class="admin-title"><h1>Painel</h1><a href="#/novo" class="btn">Adicionar produto</a></div>
     <div id="dash">${loading('Carregando produtos…')}</div>`,
  )
  const dash = $('#dash')
  let products
  try {
    products = await fetchAllProducts()
  } catch (error) {
    dash.innerHTML = errorBlock(`Não foi possível carregar os produtos. ${error.message}`)
    $('[data-retry]', dash).addEventListener('click', renderDashboard)
    return
  }
  drawDashboard(dash, products)
}

function drawDashboard(dash, products) {
  const published = products.filter((p) => p.is_published).length
  const categories = [...new Set(products.map((p) => p.category))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  )
  let busyId = null

  dash.innerHTML = `
    <div class="stats" aria-label="Resumo dos produtos">
      <div class="stat"><strong>${products.length}</strong><span>Cadastrados</span></div>
      <div class="stat"><strong>${published}</strong><span>Publicados</span></div>
      <div class="stat"><strong>${products.length - published}</strong><span>Rascunhos</span></div>
    </div>
    <div class="toolbar">
      <div class="field" style="margin-bottom:0">
        <label for="busca" class="sr-only">Buscar por nome</label>
        <input id="busca" type="search" placeholder="Buscar por nome" value="${esc(filters.search)}">
      </div>
      <div class="field" style="margin-bottom:0">
        <label for="f-cat" class="sr-only">Filtrar por categoria</label>
        <select id="f-cat">
          <option value="">Todas as categorias</option>
          ${categories.map((c) => `<option value="${esc(c)}" ${c === filters.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="margin-bottom:0">
        <label for="f-state" class="sr-only">Filtrar por estado de publicação</label>
        <select id="f-state">
          <option value="">Todos os estados</option>
          <option value="published" ${filters.state === 'published' ? 'selected' : ''}>Publicados</option>
          <option value="draft" ${filters.state === 'draft' ? 'selected' : ''}>Rascunhos</option>
        </select>
      </div>
    </div>
    <div id="lista"></div>`

  const list = $('#lista', dash)

  function drawList() {
    if (products.length === 0) {
      list.innerHTML = `<div class="empty"><h3>Nenhuma peça cadastrada ainda</h3>
        <p>Cadastre a primeira peça para ela aparecer no catálogo.</p>
        <a href="#/novo" class="btn">Adicionar produto</a></div>`
      return
    }
    const term = filters.search.trim().toLowerCase()
    const visible = products.filter((p) => {
      if (term && !p.title.toLowerCase().includes(term)) return false
      if (filters.category && p.category !== filters.category) return false
      if (filters.state === 'published' && !p.is_published) return false
      if (filters.state === 'draft' && p.is_published) return false
      return true
    })
    if (visible.length === 0) {
      list.innerHTML = '<div class="empty"><h3>Nada encontrado</h3><p>Ajuste a busca ou os filtros.</p></div>'
      return
    }
    list.innerHTML = `<ul class="admin-list" style="list-style:none;margin:0;padding:0">${visible
      .map((p) => {
        const price = formatPrice(p.price)
        const busy = busyId === p.id ? 'disabled' : ''
        return `
        <li class="admin-item">
          <div class="admin-item__thumb">${
            p.images[0]
              ? `<img src="${esc(publicImageUrl(p.images[0]))}" alt="Miniatura de ${esc(p.title)}" loading="lazy">`
              : '<div class="placeholder-img">Sem foto</div>'
          }</div>
          <div>
            <h2 class="admin-item__title">${esc(p.title)}</h2>
            <div class="admin-item__meta"><span>${esc(p.category)}</span>${price ? `<span>· ${esc(price)}</span>` : ''}</div>
            <div class="admin-item__meta">
              <span class="badge ${p.is_published ? 'badge--live' : 'badge--draft'}">${p.is_published ? 'Publicado' : 'Rascunho'}</span>
              ${statusBadge(p.stock_status)}
              ${p.is_featured ? '<span class="badge badge--star">Destaque</span>' : ''}
            </div>
          </div>
          <div class="admin-item__actions">
            <a href="#/editar/${esc(p.id)}" class="btn btn--small btn--ghost">Editar</a>
            <button type="button" class="btn btn--small" data-act="toggle" data-id="${esc(p.id)}" ${busy}>${p.is_published ? 'Retirar do site' : 'Publicar'}</button>
            <button type="button" class="btn btn--small btn--ghost" data-act="dup" data-id="${esc(p.id)}" ${busy}>Duplicar</button>
            <button type="button" class="btn btn--small btn--ghost" data-act="del" data-id="${esc(p.id)}" ${busy}>Excluir</button>
          </div>
        </li>`
      })
      .join('')}</ul>`
  }
  drawList()

  $('#busca', dash).addEventListener('input', (e) => {
    filters.search = e.target.value
    drawList()
  })
  $('#f-cat', dash).addEventListener('change', (e) => {
    filters.category = e.target.value
    drawList()
  })
  $('#f-state', dash).addEventListener('change', (e) => {
    filters.state = e.target.value
    drawList()
  })

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]')
    if (!btn) return
    const product = products.find((p) => p.id === btn.dataset.id)
    if (!product) return
    const act = btn.dataset.act

    if (act === 'toggle') {
      busyId = product.id
      drawList()
      try {
        await setPublished(product.id, !product.is_published)
        product.is_published = !product.is_published
        toast(product.is_published ? 'Peça publicada no site.' : 'Peça retirada do site.', 'ok')
      } catch (error) {
        toast(error.message, 'error')
      }
      busyId = null
      drawDashboard(dash, products)
    }

    if (act === 'dup') {
      busyId = product.id
      drawList()
      try {
        const copy = await duplicateProduct(product)
        toast('Cópia criada como rascunho.', 'ok')
        go(`#/editar/${copy.id}`)
      } catch (error) {
        toast(error.message, 'error')
        busyId = null
        drawList()
      }
    }

    if (act === 'del') {
      const yes = await confirmDialog({
        title: 'Excluir esta peça?',
        message: `"${product.title}" e as fotos dela serão apagadas definitivamente. Esta ação não pode ser desfeita.`,
        confirmLabel: 'Excluir definitivamente',
      })
      if (!yes) return
      busyId = product.id
      drawList()
      try {
        await deleteProduct(product)
        products.splice(products.indexOf(product), 1)
        toast('Peça excluída.', 'ok')
      } catch (error) {
        toast(error.message, 'error')
      }
      busyId = null
      drawDashboard(dash, products)
    }
  })
}

/* ---------------------------------------------------------------------
   Formulário de produto (criar e editar) com upload de fotos
--------------------------------------------------------------------- */
async function renderForm(id) {
  const isEdit = Boolean(id)
  shell(isEdit ? 'editar' : 'novo', loading(isEdit ? 'Carregando a peça…' : 'Abrindo…'))
  const content = $('.admin-main .container')

  let existing = null
  if (isEdit) {
    try {
      existing = await fetchProductById(id)
    } catch (error) {
      content.innerHTML = errorBlock(`Não foi possível carregar a peça. ${error.message}`)
      $('[data-retry]', content).addEventListener('click', () => renderForm(id))
      return
    }
    if (!existing) {
      content.innerHTML = `<div class="empty"><h3>Peça não encontrada</h3><a href="#/painel" class="btn">Voltar ao painel</a></div>`
      return
    }
  }

  const form = {
    title: existing?.title ?? '',
    description: existing?.description ?? '',
    price: priceToInput(existing?.price ?? null),
    category: existing?.category ?? 'Amigurumis',
    stock_status: existing?.stock_status ?? 'disponivel',
    instagram_url: existing?.instagram_url ?? '',
    is_published: existing?.is_published ?? false,
    is_featured: existing?.is_featured ?? false,
  }
  const originalPaths = existing ? [...existing.images] : []
  let photos = originalPaths.map((path, i) => ({
    id: `existing-${i}`,
    kind: 'existing',
    path,
    url: publicImageUrl(path),
  }))
  let photoCounter = 0
  let replaceId = null
  let saving = false

  content.innerHTML = `
    <form id="product-form" novalidate>
      <div class="admin-title">
        <h1>${isEdit ? 'Editar produto' : 'Adicionar produto'}</h1>
        <a href="#/painel" class="btn btn--ghost btn--small">Voltar</a>
      </div>
      <div id="submit-error"></div>

      <section class="form-card" aria-labelledby="sec-fotos">
        <h2 id="sec-fotos">Fotos</h2>
        <div class="uploader__buttons">
          <button type="button" class="btn btn--ghost" id="btn-galeria">Escolher da galeria</button>
          <button type="button" class="btn btn--ghost" id="btn-camera">Tirar foto</button>
        </div>
        <input id="in-galeria" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple tabindex="-1" aria-label="Escolher fotos da galeria">
        <input id="in-camera" class="sr-only" type="file" accept="image/*" capture="environment" tabindex="-1" aria-label="Tirar uma foto com a câmera">
        <input id="in-trocar" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" tabindex="-1" aria-label="Escolher a foto que vai substituir a atual">
        <p style="font-size:.85rem;color:var(--coffee-soft)">Formatos JPG, PNG ou WebP. As fotos são reduzidas automaticamente (máx. 5 MB cada, até ${config.maxImages} fotos). A primeira é a foto principal.</p>
        <div id="photo-status"></div>
        <div id="photo-errors"></div>
        <div id="photo-grid" class="uploader__grid"></div>
        <p class="error-text" data-err="photos" role="alert" hidden style="color:var(--danger);font-weight:600"></p>
      </section>

      <section class="form-card" aria-labelledby="sec-dados">
        <h2 id="sec-dados">Dados da peça</h2>
        <div class="field">
          <label for="title">Nome do produto</label>
          <input id="title" type="text" maxlength="120" value="${esc(form.title)}">
          <span class="error-text" data-err="title" hidden></span>
        </div>
        <div class="field">
          <label for="description">Descrição</label>
          <textarea id="description">${esc(form.description)}</textarea>
          <span class="hint">Medidas, materiais, cores e prazo ajudam quem vai encomendar.</span>
          <span class="error-text" data-err="description" hidden></span>
        </div>
        <div class="form-grid form-grid--2">
          <div class="field">
            <label for="price">Preço em reais (opcional)</label>
            <input id="price" type="text" inputmode="decimal" placeholder="Ex.: 45,90" value="${esc(form.price)}">
            <span class="error-text" data-err="price" hidden></span>
          </div>
          <div class="field">
            <label for="category">Categoria</label>
            <input id="category" type="text" list="categorias" maxlength="60" value="${esc(form.category)}">
            <datalist id="categorias">${SUGGESTED_CATEGORIES.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
            <span class="hint">Escolha uma sugestão ou escreva uma nova categoria.</span>
            <span class="error-text" data-err="category" hidden></span>
          </div>
        </div>
        <div class="field">
          <label for="stock">Situação</label>
          <select id="stock">
            ${Object.entries(STOCK_LABELS)
              .map(([value, label]) => `<option value="${value}" ${value === form.stock_status ? 'selected' : ''}>${label}</option>`)
              .join('')}
          </select>
        </div>
        <div class="field">
          <label for="instagram">Link da publicação no Instagram (opcional)</label>
          <input id="instagram" type="url" inputmode="url" placeholder="https://www.instagram.com/p/..." value="${esc(form.instagram_url)}">
          <span class="hint">Sem link, o botão leva ao perfil ${esc(config.instagramHandle)}.</span>
          <span class="error-text" data-err="instagram_url" hidden></span>
        </div>
      </section>

      <section class="form-card" aria-labelledby="sec-pub">
        <h2 id="sec-pub">Publicação</h2>
        <div class="field">
          <label for="publish">Estado</label>
          <select id="publish">
            <option value="draft" ${form.is_published ? '' : 'selected'}>Rascunho (não aparece no site)</option>
            <option value="published" ${form.is_published ? 'selected' : ''}>Publicado (aparece no catálogo)</option>
          </select>
        </div>
        <label class="check"><input id="featured" type="checkbox" ${form.is_featured ? 'checked' : ''}> Destacar na página inicial</label>
      </section>

      <div class="savebar">
        <p id="progress" role="status" style="flex-basis:100%;margin:0" hidden></p>
        <button type="submit" class="btn" id="btn-salvar">${isEdit ? 'Salvar alterações' : 'Salvar peça'}</button>
        <a href="#/painel" class="btn btn--ghost" id="btn-cancelar">Cancelar</a>
      </div>
    </form>`

  const grid = $('#photo-grid')
  const photoStatus = $('#photo-status')
  const photoErrors = $('#photo-errors')

  cleanup = () => photos.forEach((p) => p.kind === 'new' && URL.revokeObjectURL(p.url))

  function setSaving(value) {
    saving = value
    $$('#product-form input, #product-form select, #product-form textarea, #product-form button').forEach((el) => {
      el.disabled = value
    })
    $('#btn-salvar').textContent = value ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Salvar peça'
    $('#btn-cancelar').setAttribute('aria-disabled', String(value))
  }

  function drawPhotos() {
    grid.innerHTML = photos
      .map(
        (p, i) => `
        <div class="photo">
          <div class="photo__img">
            <img src="${esc(p.url)}" alt="Foto ${i + 1} da peça">
            ${i === 0 ? '<span class="badge badge--live photo__main">Principal</span>' : ''}
          </div>
          <div class="photo__actions">
            ${i !== 0 ? `<button type="button" class="btn btn--ghost" data-photo="main" data-id="${esc(p.id)}">Tornar principal</button>` : ''}
            <button type="button" class="btn btn--ghost" data-photo="replace" data-id="${esc(p.id)}">Trocar</button>
            <button type="button" class="btn btn--ghost" data-photo="remove" data-id="${esc(p.id)}">Remover</button>
          </div>
        </div>`,
      )
      .join('')
    const full = photos.length >= config.maxImages
    $('#btn-galeria').disabled = full
    $('#btn-camera').disabled = full
  }
  drawPhotos()

  async function filesToPhotos(files) {
    const added = []
    const errors = []
    for (const file of files) {
      const check = validateImageFile(file)
      if (!check.ok) {
        errors.push(check.message)
        continue
      }
      try {
        const prepared = await prepareImage(file)
        added.push({ id: `new-${Date.now()}-${photoCounter++}`, kind: 'new', file: prepared, url: URL.createObjectURL(prepared) })
      } catch (error) {
        errors.push(error.message)
      }
    }
    return { added, errors }
  }

  function showPhotoErrors(errors) {
    photoErrors.innerHTML = errors.length
      ? `<div class="notice notice--error" role="alert">${errors.map((e) => `<div>${esc(e)}</div>`).join('')}</div>`
      : ''
  }

  async function withBusy(fn) {
    photoStatus.innerHTML = '<p role="status"><span class="spinner" aria-hidden="true"></span> Preparando as fotos…</p>'
    try {
      await fn()
    } finally {
      photoStatus.innerHTML = ''
    }
  }

  async function addFiles(fileList) {
    if (!fileList || fileList.length === 0) return
    const room = config.maxImages - photos.length
    const files = [...fileList]
    const errors = []
    if (files.length > room) errors.push(`Você pode ter até ${config.maxImages} fotos por peça.`)
    await withBusy(async () => {
      const result = await filesToPhotos(files.slice(0, Math.max(room, 0)))
      errors.push(...result.errors)
      photos = [...photos, ...result.added]
    })
    showPhotoErrors(errors)
    drawPhotos()
  }

  async function replaceFile(fileList) {
    const target = replaceId
    replaceId = null
    if (!fileList || fileList.length === 0 || !target) return
    let errors = []
    await withBusy(async () => {
      const result = await filesToPhotos([fileList[0]])
      errors = result.errors
      const replacement = result.added[0]
      if (replacement) {
        photos = photos.map((p) => {
          if (p.id !== target) return p
          if (p.kind === 'new') URL.revokeObjectURL(p.url)
          return replacement
        })
      }
    })
    showPhotoErrors(errors)
    drawPhotos()
  }

  $('#btn-galeria').addEventListener('click', () => $('#in-galeria').click())
  $('#btn-camera').addEventListener('click', () => $('#in-camera').click())
  for (const [selector, handler] of [
    ['#in-galeria', addFiles],
    ['#in-camera', addFiles],
    ['#in-trocar', replaceFile],
  ]) {
    $(selector).addEventListener('change', (e) => {
      const files = e.target.files
      handler(files).finally(() => {
        e.target.value = ''
      })
    })
  }

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-photo]')
    if (!btn) return
    const photo = photos.find((p) => p.id === btn.dataset.id)
    if (!photo) return
    if (btn.dataset.photo === 'main') photos = [photo, ...photos.filter((p) => p !== photo)]
    if (btn.dataset.photo === 'remove') {
      if (photo.kind === 'new') URL.revokeObjectURL(photo.url)
      photos = photos.filter((p) => p !== photo)
    }
    if (btn.dataset.photo === 'replace') {
      replaceId = photo.id
      $('#in-trocar').click()
      return
    }
    drawPhotos()
  })

  $('#btn-cancelar').addEventListener('click', (e) => {
    if (saving) e.preventDefault()
  })

  function readForm() {
    return {
      title: $('#title').value.trim(),
      description: $('#description').value.trim(),
      price: $('#price').value,
      category: $('#category').value.trim(),
      stock_status: $('#stock').value,
      instagram_url: $('#instagram').value.trim(),
      is_published: $('#publish').value === 'published',
      is_featured: $('#featured').checked,
    }
  }

  function validate(values) {
    const errors = {}
    if (values.title.length < 2) errors.title = 'Informe o nome da peça (mínimo 2 letras).'
    if (values.title.length > 120) errors.title = 'O nome pode ter no máximo 120 caracteres.'
    if (values.description.length > 4000) errors.description = 'A descrição está muito longa.'
    if (!values.category) errors.category = 'Informe a categoria.'
    if (Number.isNaN(parsePrice(values.price))) errors.price = 'Preço inválido. Exemplo: 45,90'
    if (values.instagram_url && !isValidInstagramUrl(values.instagram_url)) {
      errors.instagram_url = 'Use um link do Instagram começando com https://www.instagram.com/'
    }
    if (values.is_published && photos.length === 0) errors.photos = 'Adicione pelo menos uma foto para publicar a peça.'
    return errors
  }

  function showErrors(errors) {
    $$('[data-err]').forEach((el) => {
      const message = errors[el.dataset.err]
      el.textContent = message || ''
      el.hidden = !message
    })
  }

  $('#product-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    if (saving) return
    $('#submit-error').innerHTML = ''
    const values = readForm()
    const errors = validate(values)
    showErrors(errors)
    if (Object.keys(errors).length > 0) {
      toast('Confira os campos destacados.', 'error')
      const first = $('[data-err]:not([hidden])')
      if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }

    setSaving(true)
    const progress = $('#progress')
    const uploaded = []
    try {
      const newCount = photos.filter((p) => p.kind === 'new').length
      let sent = 0
      const finalPaths = []
      progress.hidden = false
      for (const photo of photos) {
        if (photo.kind === 'existing') {
          finalPaths.push(photo.path)
        } else {
          sent += 1
          progress.innerHTML = `<span class="spinner" aria-hidden="true"></span> Enviando foto ${sent} de ${newCount}…`
          const path = await uploadImage(photo.file)
          uploaded.push(path)
          finalPaths.push(path)
        }
      }

      progress.innerHTML = '<span class="spinner" aria-hidden="true"></span> Salvando a peça…'
      const price = parsePrice(values.price)
      const payload = {
        title: values.title,
        description: values.description,
        price,
        category: values.category,
        stock_status: values.stock_status,
        is_published: values.is_published,
        is_featured: values.is_featured,
        images: finalPaths,
        instagram_url: values.instagram_url || null,
      }
      if (isEdit) await updateProduct(id, payload)
      else await createProduct(payload)

      // Só agora apaga do Storage as fotos que foram removidas.
      const removed = originalPaths.filter((p) => !finalPaths.includes(p))
      if (removed.length > 0) await removeImages(removed).catch(() => undefined)

      toast(values.is_published ? 'Peça salva e publicada.' : 'Peça salva como rascunho.', 'ok')
      go('#/painel')
    } catch (error) {
      // Desfaz os envios se o produto não pôde ser salvo.
      await removeImages(uploaded).catch(() => undefined)
      $('#submit-error').innerHTML = `<div class="notice notice--error" role="alert">${esc(error.message || 'Não foi possível salvar a peça.')}</div>`
      toast('Não foi possível salvar.', 'error')
      setSaving(false)
      drawPhotos()
      progress.hidden = true
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  })
}

/* ---------------------------------------------------------------------
   Rotas (usam o # da URL: #/painel, #/novo, #/editar/ID)
--------------------------------------------------------------------- */
function route() {
  if (cleanup) {
    cleanup()
    cleanup = null
  }
  if (!isConfigured() || !state.client) return renderLogin()
  if (state.recovery && state.session) return renderReset()
  if (!state.session) return renderLogin()
  if (!state.isAdmin) return renderNotAdmin()

  const match = location.hash.match(/^#\/([a-z]+)(?:\/([0-9a-f-]{36}))?/i)
  const name = match ? match[1] : 'painel'
  const id = match ? match[2] : undefined

  if (name === 'novo') return renderForm(null)
  if (name === 'editar' && id) return renderForm(id)
  if (name !== 'painel') return go('#/painel')
  renderDashboard()
}

window.addEventListener('hashchange', () => {
  if (state.client) route()
})

async function init() {
  if (!isConfigured()) return renderLogin()

  // Link de recuperação de senha do Supabase chega com "type=recovery" no endereço.
  const params = new URLSearchParams(location.hash.replace(/^#\/?/, ''))
  if (params.get('type') === 'recovery') state.recovery = true
  if (params.get('error_description')) {
    loginNotice = { kind: 'error', text: 'Este link é inválido ou expirou. Peça um novo link na tela de login.' }
  }

  try {
    state.client = await getClient()
  } catch {
    app.innerHTML = `<div class="auth-wrap"><div class="auth-card">
      <h1>Sem conexão</h1>
      <p>Não foi possível carregar o serviço de login. Verifique a internet e tente de novo.</p>
      <button type="button" class="btn" onclick="location.reload()">Tentar novamente</button></div></div>`
    return
  }

  state.client.auth.onAuthStateChange((event, session) => {
    state.session = session
    if (event === 'PASSWORD_RECOVERY') {
      state.recovery = true
      setTimeout(route, 0)
    }
  })

  const { data } = await state.client.auth.getSession()
  state.session = data.session
  await refreshAdmin()
  route()
}

init()
