-- =====================================================================
-- Entre Mãos Crochê — estrutura inicial do banco, segurança (RLS) e imagens
-- Execute este arquivo inteiro uma única vez no SQL Editor do Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Administradores autorizados
--    Estar logado NÃO torna ninguém administrador. Só quem está nesta
--    tabela tem permissão. A tabela só pode ser alterada pelo SQL Editor
--    (ou pela chave de serviço), nunca pelo navegador.
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Cada usuário logado pode apenas verificar se ELE MESMO está na lista.
drop policy if exists "admins: ler o proprio registro" on public.admins;
create policy "admins: ler o proprio registro"
  on public.admins for select
  to authenticated
  using (user_id = auth.uid());

-- Nenhuma política de insert/update/delete: ninguém consegue se promover.
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

-- Função usada por todas as políticas. SECURITY DEFINER para conseguir
-- consultar a tabela com segurança; search_path fixo evita sequestro de função.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Produtos
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(btrim(title)) between 2 and 120),
  description   text not null default '' check (char_length(description) <= 4000),
  price         numeric(10, 2) check (price is null or price >= 0),
  category      text not null default 'Outros' check (char_length(btrim(category)) between 1 and 60),
  stock_status  text not null default 'disponivel'
                check (stock_status in ('disponivel', 'sob_encomenda', 'esgotado')),
  is_published  boolean not null default false,
  is_featured   boolean not null default false,
  -- Caminhos dos arquivos no Storage (a primeira é a foto principal).
  images        text[] not null default '{}' check (cardinality(images) <= 8),
  instagram_url text check (
    instagram_url is null
    or instagram_url ~* '^https://(www\.)?instagram\.com/[A-Za-z0-9._/?=&%-]+$'
  ),
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists products_published_idx
  on public.products (is_published, created_at desc);

-- Atualiza updated_at automaticamente.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Segurança de linha (RLS) dos produtos
-- ---------------------------------------------------------------------
alter table public.products enable row level security;

drop policy if exists "products: visitantes leem publicados" on public.products;
create policy "products: visitantes leem publicados"
  on public.products for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "products: admin le tudo" on public.products;
create policy "products: admin le tudo"
  on public.products for select
  to authenticated
  using (public.is_admin());

drop policy if exists "products: admin cria" on public.products;
create policy "products: admin cria"
  on public.products for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "products: admin edita" on public.products;
create policy "products: admin edita"
  on public.products for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "products: admin exclui" on public.products;
create policy "products: admin exclui"
  on public.products for delete
  to authenticated
  using (public.is_admin());

revoke all on public.products from anon, authenticated;
grant select on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;

-- ---------------------------------------------------------------------
-- 4. Armazenamento das fotos (Supabase Storage)
--    Bucket público para leitura (as fotos aparecem no catálogo),
--    mas só administradoras autorizadas podem enviar, trocar ou apagar.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880, -- 5 MB por arquivo
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "imagens: admin le" on storage.objects;
create policy "imagens: admin le"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "imagens: admin envia" on storage.objects;
create policy "imagens: admin envia"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "imagens: admin atualiza" on storage.objects;
create policy "imagens: admin atualiza"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "imagens: admin apaga" on storage.objects;
create policy "imagens: admin apaga"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
