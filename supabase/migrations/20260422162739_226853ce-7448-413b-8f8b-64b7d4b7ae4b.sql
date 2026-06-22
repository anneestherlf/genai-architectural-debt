
drop policy "Anyone authenticated can create company" on public.companies;

create policy "Users without company can create one" on public.companies for insert
  to authenticated
  with check (
    not exists (select 1 from public.profiles where id = auth.uid() and company_id is not null)
  );
