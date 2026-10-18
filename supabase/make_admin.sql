-- =====================================================================
-- Transformar a SUA conta em administradora
-- ---------------------------------------------------------------------
-- Antes: crie o usuário em Authentication > Users > Add user
--        (marque "Auto Confirm User").
-- Depois: troque o e-mail abaixo pelo e-mail que você cadastrou e execute
--         este arquivo no SQL Editor do Supabase.
-- NÃO guarde senhas neste arquivo.
-- =====================================================================

insert into public.admins (user_id)
select id
from auth.users
where email = 'TROQUE-PELO-SEU-EMAIL@exemplo.com'
on conflict (user_id) do nothing;

-- Conferir (deve listar 1 linha):
select u.email, a.created_at
from public.admins a
join auth.users u on u.id = a.user_id;
