-- Gadgets & Getaways: redigerbare tekster. Samme model som mf_texts (mandlige.dk).
-- Udrullet 9. november 2026 på Supabase-projektet Store51 (oevcaujuziyvrqipbuep).
create table if not exists public.gg_texts (
  key text primary key,
  html text not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.gg_texts enable row level security;

create policy "gg_texts laes" on public.gg_texts for select to anon, authenticated using (true);
create policy "gg_texts topadmin skriv" on public.gg_texts for insert to authenticated with check (public.mf_role() = 'topadmin');
create policy "gg_texts topadmin ret" on public.gg_texts for update to authenticated using (public.mf_role() = 'topadmin') with check (public.mf_role() = 'topadmin');
create policy "gg_texts topadmin slet" on public.gg_texts for delete to authenticated using (public.mf_role() = 'topadmin');
