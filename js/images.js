import { config } from './config.js'
import { requireClient } from './supabase.js'

/** Valida formato e tamanho original. Devolve { ok, message }. */
export function validateImageFile(file) {
  if (!config.allowedImageTypes.includes(file.type)) {
    return { ok: false, message: `"${file.name}" não é um formato aceito. Use JPG, PNG ou WebP.` }
  }
  // Fotos de celular são grandes; aceitamos até 25 MB porque reduzimos antes de enviar.
  if (file.size > 25 * 1024 * 1024) {
    return { ok: false, message: `"${file.name}" é muito grande (máximo 25 MB).` }
  }
  return { ok: true }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Não foi possível ler a imagem "${file.name}".`))
    }
    img.src = url
  })
}

/**
 * Reduz a foto para no máximo 1600 px no lado maior e converte para JPEG.
 * Economiza espaço do plano gratuito e deixa o catálogo mais rápido no celular.
 */
export async function prepareImage(file) {
  const check = validateImageFile(file)
  if (!check.ok) throw new Error(check.message)

  const img = await loadImage(file)
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Seu navegador não conseguiu preparar a imagem.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('Não foi possível preparar a imagem para envio.')
  if (blob.size > config.maxImageBytes) {
    throw new Error(`"${file.name}" continua grande demais depois de reduzida (máximo 5 MB).`)
  }
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
}

function newObjectPath() {
  const id =
    window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `products/${id}.jpg`
}

/** Envia uma foto já preparada e devolve o caminho salvo no Storage. */
export async function uploadImage(file) {
  const client = await requireClient()
  const path = newObjectPath()
  const { error } = await client.storage.from(config.imageBucket).upload(path, file, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw new Error(`Falha ao enviar a foto: ${error.message}`)
  return path
}

export async function removeImages(paths) {
  if (!paths || paths.length === 0) return
  const client = await requireClient()
  const { error } = await client.storage.from(config.imageBucket).remove(paths)
  if (error) throw new Error(`Falha ao remover fotos: ${error.message}`)
}

/** Copia uma foto existente (usado ao duplicar um produto). */
export async function copyImage(fromPath) {
  const client = await requireClient()
  const toPath = newObjectPath()
  const { error } = await client.storage.from(config.imageBucket).copy(fromPath, toPath)
  if (error) throw new Error(`Falha ao copiar a foto: ${error.message}`)
  return toPath
}
