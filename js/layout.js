import { config } from './config.js'

const LINKS = [
  ['index.html', 'Início'],
  ['catalogo.html', 'Catálogo'],
  ['sobre.html', 'Sobre'],
  ['contato.html', 'Contato'],
]

function currentFile() {
  const file = location.pathname.split('/').pop()
  return file === '' ? 'index.html' : file
}

function headerHtml() {
  const here = currentFile()
  const links = LINKS.map(
    ([href, label]) =>
      `<a href="${href}"${href === here ? ' aria-current="page"' : ''}>${label}</a>`,
  ).join('')
  return `
    <div class="container">
      <div class="site-header__bar">
        <a href="index.html" class="brand" aria-label="Entre Mãos Crochê, página inicial">
          <span class="brand__name">Entre Mãos</span>
          <span class="brand__sub">CROCHÊ</span>
        </a>
        <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="menu-principal">Menu</button>
      </div>
      <nav id="menu-principal" class="site-nav" aria-label="Principal">${links}</nav>
    </div>`
}

function footerHtml() {
  const links = LINKS.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('')
  return `
    <div class="container">
      <div class="site-footer__grid">
        <div>
          <h2>Entre Mãos Crochê</h2>
          <p>Peças de crochê feitas à mão, uma de cada vez. Encomendas e dúvidas pelo Instagram.</p>
        </div>
        <div>
          <h2>Navegue</h2>
          <ul>${links}</ul>
        </div>
        <div>
          <h2>Redes sociais</h2>
          <ul>
            <li><a href="${config.instagramUrl}" target="_blank" rel="noopener noreferrer">Instagram ${config.instagramHandle}</a></li>
          </ul>
        </div>
      </div>
          <p class="site-footer__legal">© ${new Date().getFullYear()} Entre Mãos Crochê. Todas as peças são feitas à mão. · <a href="${config.adminPath}" rel="nofollow">Área restrita</a></p>
    </div>`
}

function init() {
  const header = document.getElementById('site-header')
  const footer = document.getElementById('site-footer')
  if (header) {
    header.className = 'site-header'
    header.innerHTML = headerHtml()
    const toggle = header.querySelector('.nav-toggle')
    const nav = header.querySelector('.site-nav')
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open')
      toggle.setAttribute('aria-expanded', String(open))
      toggle.textContent = open ? 'Fechar' : 'Menu'
    })
  }
  if (footer) {
    footer.className = 'site-footer'
    footer.innerHTML = footerHtml()
  }
  document.querySelectorAll('[data-instagram]').forEach((a) => {
    a.href = config.instagramUrl
  })
}

init()
