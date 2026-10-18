import { requireClient } from './supabase.js'
import { copyImage, removeImages } from './images.js'

const COLUMNS =
  'id,title,description,price,category,stock_status,is_published,is_featured,images,instagram_url,created_by,created_at,updated_at'

function friendly(error) {
  if (error.code === '42501') {
    return new Error('Você não tem permissão para fazer isso. Entre novamente como administradora.')
  }
  if (/failed to fetch|network/i.test(error.message || '')) {
    return new Error('Sem conexão com o servidor. Verifique sua internet e tente de novo.')
  }
  return new Error(error.message || 'Algo deu errado.')
}

/** Catálogo público: o banco só devolve produtos publicados (RLS). */
export async function fetchPublishedProducts() {
  const client = await requireClient()
  const { data, error } = await client
    .from('products')
    .select(COLUMNS)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
  if (error) throw friendly(error)
  return data ?? []
}

export async function fetchPublishedProduct(id) {
  const client = await requireClient()
  const { data, error } = await client
    .from('products')
    .select(COLUMNS)
    .eq('id', id)
    .eq('is_published', true)
    .maybeSingle()
  if (error) throw friendly(error)
  return data ?? null
}

/** Painel: administradoras enxergam rascunhos também (política "admin le tudo"). */
export async function fetchAllProducts() {
  const client = await requireClient()
  const { data, error } = await client
    .from('products')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw friendly(error)
  return data ?? []
}

export async function fetchProductById(id) {
  const client = await requireClient()
  const { data, error } = await client.from('products').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw friendly(error)
  return data ?? null
}

export async function createProduct(input) {
  const client = await requireClient()
  const { data, error } = await client.from('products').insert(input).select(COLUMNS).single()
  if (error) throw friendly(error)
  return data
}

export async function updateProduct(id, input) {
  const client = await requireClient()
  const { data, error } = await client
    .from('products')
    .update(input)
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw friendly(error)
  return data
}

export async function setPublished(id, isPublished) {
  await updateProduct(id, { is_published: isPublished })
}

export async function deleteProduct(product) {
  const client = await requireClient()
  const { error } = await client.from('products').delete().eq('id', product.id)
  if (error) throw friendly(error)
  // Só apaga as fotos depois que o produto saiu do banco.
  try {
    await removeImages(product.images)
  } catch {
    // O produto já foi excluído; fotos órfãs não afetam o site.
  }
}

/** Cria uma cópia em rascunho, com cópias próprias das fotos. */
export async function duplicateProduct(product) {
  const copied = []
  try {
    for (const path of product.images) copied.push(await copyImage(path))
    return await createProduct({
      title: `${product.title} (cópia)`.slice(0, 120),
      description: product.description,
      price: product.price,
      category: product.category,
      stock_status: product.stock_status,
      is_published: false,
      is_featured: false,
      images: copied,
      instagram_url: product.instagram_url,
    })
  } catch (error) {
    await removeImages(copied).catch(() => undefined)
    throw error
  }
}
