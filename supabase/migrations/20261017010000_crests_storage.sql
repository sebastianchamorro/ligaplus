-- Bucket público para escudos de clubes y de ligas. Las subidas se hacen siempre desde
-- un server route (service_role), nunca directo desde el cliente, así que no hace falta
-- una policy de insert para anon/authenticated todavía - sólo lectura pública.
insert into storage.buckets (id, name, public)
values ('crests', 'crests', true)
on conflict (id) do nothing;

create policy "Public read access for crests"
on storage.objects for select
using (bucket_id = 'crests');
