
-- Enum de roles
create type public.app_role as enum ('admin', 'manager', 'employee');

-- Companies
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  full_name text not null default '',
  email text not null,
  created_at timestamptz not null default now()
);

-- User roles (separate table - SECURITY)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, company_id, role)
);

-- Tracks
create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Modules
create table public.modules (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  title text not null,
  content text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Quiz questions
create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  question text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option int not null check (correct_option between 0 and 3),
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- Enrollments
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, track_id)
);

-- Module progress
create table public.module_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  unique (user_id, module_id)
);

-- Quiz attempts
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  score int not null,
  total int not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);

-- Security definer functions
create or replace function public.has_role(_user_id uuid, _company_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and company_id = _company_id and role = _role
  )
$$;

create or replace function public.is_company_staff(_user_id uuid, _company_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and company_id = _company_id and role in ('admin','manager')
  )
$$;

create or replace function public.get_user_company(_user_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select company_id from public.profiles where id = _user_id
$$;

-- Trigger to create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enable RLS
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.tracks enable row level security;
alter table public.modules enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.enrollments enable row level security;
alter table public.module_progress enable row level security;
alter table public.quiz_attempts enable row level security;

-- Companies policies
create policy "Users can view their company" on public.companies for select
  using (id = public.get_user_company(auth.uid()));
create policy "Anyone authenticated can create company" on public.companies for insert
  to authenticated with check (true);
create policy "Admins can update company" on public.companies for update
  using (public.has_role(auth.uid(), id, 'admin'));

-- Profiles policies
create policy "Users can view profiles in their company" on public.profiles for select
  using (company_id = public.get_user_company(auth.uid()) or id = auth.uid());
create policy "Users can update own profile" on public.profiles for update
  using (id = auth.uid());
create policy "Users can insert own profile" on public.profiles for insert
  with check (id = auth.uid());

-- User roles policies
create policy "Users view roles in their company" on public.user_roles for select
  using (company_id = public.get_user_company(auth.uid()) or user_id = auth.uid());
create policy "Admins manage roles" on public.user_roles for insert
  with check (public.has_role(auth.uid(), company_id, 'admin'));
create policy "Allow first admin self-assignment" on public.user_roles for insert
  with check (
    user_id = auth.uid()
    and not exists (select 1 from public.user_roles where company_id = user_roles.company_id)
  );
create policy "Admins delete roles" on public.user_roles for delete
  using (public.has_role(auth.uid(), company_id, 'admin'));

-- Tracks policies
create policy "Company members view tracks" on public.tracks for select
  using (
    public.is_company_staff(auth.uid(), company_id)
    or exists (select 1 from public.enrollments where track_id = tracks.id and user_id = auth.uid())
  );
create policy "Staff create tracks" on public.tracks for insert
  with check (public.is_company_staff(auth.uid(), company_id));
create policy "Staff update tracks" on public.tracks for update
  using (public.is_company_staff(auth.uid(), company_id));
create policy "Staff delete tracks" on public.tracks for delete
  using (public.is_company_staff(auth.uid(), company_id));

-- Modules policies
create policy "View modules of accessible tracks" on public.modules for select
  using (
    exists (
      select 1 from public.tracks t
      where t.id = modules.track_id
      and (
        public.is_company_staff(auth.uid(), t.company_id)
        or exists (select 1 from public.enrollments where track_id = t.id and user_id = auth.uid())
      )
    )
  );
create policy "Staff manage modules" on public.modules for all
  using (
    exists (
      select 1 from public.tracks t
      where t.id = modules.track_id and public.is_company_staff(auth.uid(), t.company_id)
    )
  )
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = modules.track_id and public.is_company_staff(auth.uid(), t.company_id)
    )
  );

-- Quiz policies
create policy "View quiz of accessible modules" on public.quiz_questions for select
  using (
    exists (
      select 1 from public.modules m join public.tracks t on t.id = m.track_id
      where m.id = quiz_questions.module_id
      and (
        public.is_company_staff(auth.uid(), t.company_id)
        or exists (select 1 from public.enrollments where track_id = t.id and user_id = auth.uid())
      )
    )
  );
create policy "Staff manage quiz" on public.quiz_questions for all
  using (
    exists (
      select 1 from public.modules m join public.tracks t on t.id = m.track_id
      where m.id = quiz_questions.module_id and public.is_company_staff(auth.uid(), t.company_id)
    )
  )
  with check (
    exists (
      select 1 from public.modules m join public.tracks t on t.id = m.track_id
      where m.id = quiz_questions.module_id and public.is_company_staff(auth.uid(), t.company_id)
    )
  );

-- Enrollments policies
create policy "View own or staff enrollments" on public.enrollments for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.tracks t
      where t.id = enrollments.track_id and public.is_company_staff(auth.uid(), t.company_id)
    )
  );
create policy "Staff manage enrollments" on public.enrollments for insert
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = enrollments.track_id and public.is_company_staff(auth.uid(), t.company_id)
    )
  );
create policy "Staff delete enrollments" on public.enrollments for delete
  using (
    exists (
      select 1 from public.tracks t
      where t.id = enrollments.track_id and public.is_company_staff(auth.uid(), t.company_id)
    )
  );

-- Module progress policies
create policy "View own or staff progress" on public.module_progress for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.modules m join public.tracks t on t.id = m.track_id
      where m.id = module_progress.module_id and public.is_company_staff(auth.uid(), t.company_id)
    )
  );
create policy "Users insert own progress" on public.module_progress for insert
  with check (user_id = auth.uid());
create policy "Users update own progress" on public.module_progress for update
  using (user_id = auth.uid());

-- Quiz attempts policies
create policy "View own or staff attempts" on public.quiz_attempts for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.modules m join public.tracks t on t.id = m.track_id
      where m.id = quiz_attempts.module_id and public.is_company_staff(auth.uid(), t.company_id)
    )
  );
create policy "Users insert own attempts" on public.quiz_attempts for insert
  with check (user_id = auth.uid());
