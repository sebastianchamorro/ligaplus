-- Web Push: notificar a quien se suscribió cuando un partido de su liga está por
-- arrancar. Sin servicio externo pago - usa el protocolo Web Push estándar
-- (VAPID) contra la infraestructura de push del propio navegador.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Evita mandar el mismo recordatorio dos veces para el mismo partido.
alter table public.matches
  add column reminder_sent_at timestamptz;
