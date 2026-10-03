-- The BLK Shelf: run in the EXISTING catalog/auth Supabase project as its owner.
-- These names do not replace or modify the website's catalog tables/views.
begin;

create or replace function public.blk_shelf_sentence_count(p_text text)
returns integer language plpgsql immutable set search_path = '' as $$
declare v_text text; v_count integer;
begin
  v_text := pg_catalog.btrim(coalesce(p_text, ''));
  v_text := pg_catalog.regexp_replace(v_text, '\.{2,}', '…', 'g');
  v_text := pg_catalog.regexp_replace(v_text, '\m(Mr|Mrs|Ms|Dr|Prof|Jr|Sr|St|vs|etc)\.', '\1·', 'gi');
  v_text := pg_catalog.regexp_replace(v_text, '\me\.g\.', 'e·g·', 'gi');
  v_text := pg_catalog.regexp_replace(v_text, '\mi\.e\.', 'i·e·', 'gi');
  v_text := pg_catalog.regexp_replace(v_text, '([0-9])\.(?=[0-9])', '\1·', 'g');
  v_text := pg_catalog.regexp_replace(v_text, '\m([A-Z])\.(?=\s+[A-Z][a-z])', '\1·', 'g');
  select pg_catalog.count(*)::integer into v_count
    from pg_catalog.regexp_matches(v_text, '[^.!?]+[.!?]+', 'g') as sentences(parts)
    where parts[1] ~ '[[:alnum:]]';
  return v_count;
end $$;

create table if not exists public.blk_shelf_reader_shelves (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null check (char_length(btrim(book_id)) between 1 and 160),
  status text not null default 'Want to Read' check (status in ('Want to Read','Reading','Finished','Favorites')),
  favorite boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
create table if not exists public.blk_shelf_reader_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40 and display_name !~ '[[:cntrl:]]'),
  updated_at timestamptz not null default now()
);
create table if not exists public.blk_shelf_reader_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null check (char_length(btrim(book_id)) between 1 and 160),
  id uuid not null default gen_random_uuid() unique,
  rating integer not null check (rating between 1 and 5),
  review text not null default '' check (char_length(review) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id),
  constraint blk_shelf_low_rating_review check (rating > 3 or public.blk_shelf_sentence_count(review) >= 2)
);
create index if not exists blk_shelf_reviews_book_date on public.blk_shelf_reader_reviews (book_id, updated_at desc, id);
create table if not exists public.blk_shelf_reader_favorite_authors (
  user_id uuid not null references auth.users(id) on delete cascade,
  author_id text not null check (char_length(btrim(author_id)) between 1 and 160),
  created_at timestamptz not null default now(),
  primary key (user_id, author_id)
);
create table if not exists public.blk_shelf_reader_dismissed_releases (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null check (char_length(btrim(book_id)) between 1 and 160),
  dismissed_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

alter table public.blk_shelf_reader_shelves enable row level security;
alter table public.blk_shelf_reader_profiles enable row level security;
alter table public.blk_shelf_reader_reviews enable row level security;
alter table public.blk_shelf_reader_favorite_authors enable row level security;
alter table public.blk_shelf_reader_dismissed_releases enable row level security;

drop policy if exists reader_owns_shelf on public.blk_shelf_reader_shelves;
create policy reader_owns_shelf on public.blk_shelf_reader_shelves for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists reader_owns_profile on public.blk_shelf_reader_profiles;
create policy reader_owns_profile on public.blk_shelf_reader_profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists reader_owns_reviews on public.blk_shelf_reader_reviews;
create policy reader_owns_reviews on public.blk_shelf_reader_reviews for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists reader_owns_authors on public.blk_shelf_reader_favorite_authors;
create policy reader_owns_authors on public.blk_shelf_reader_favorite_authors for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists reader_owns_dismissals on public.blk_shelf_reader_dismissed_releases;
create policy reader_owns_dismissals on public.blk_shelf_reader_dismissed_releases for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.blk_shelf_reader_shelves, public.blk_shelf_reader_profiles,
  public.blk_shelf_reader_reviews, public.blk_shelf_reader_favorite_authors,
  public.blk_shelf_reader_dismissed_releases from anon, authenticated;
grant select, insert, update, delete on public.blk_shelf_reader_shelves,
  public.blk_shelf_reader_profiles, public.blk_shelf_reader_favorite_authors,
  public.blk_shelf_reader_dismissed_releases to authenticated;
-- Reviews are written through the validated RPC; readers may read/delete their own.
grant select, delete on public.blk_shelf_reader_reviews to authenticated;

create or replace function public.blk_shelf_set_book(p_book_id text, p_status text default null, p_favorite boolean default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Log in to save books.'; end if;
  if p_book_id is null or char_length(btrim(p_book_id)) not between 1 and 160
    or (p_status is not null and p_status not in ('Want to Read','Reading','Finished','Favorites'))
    or (p_status is null and p_favorite is null) then raise exception 'Choose a valid book and shelf.'; end if;
  insert into public.blk_shelf_reader_shelves as saved (user_id, book_id, status, favorite, updated_at)
  values (v_user, btrim(p_book_id), case when p_status = 'Favorites' then 'Want to Read' else coalesce(p_status,'Want to Read') end,
    case when p_status = 'Favorites' then true else coalesce(p_favorite,false) end, now())
  on conflict (user_id, book_id) do update set
    status = case when p_status is not null then excluded.status when saved.status = 'Favorites' then 'Want to Read' else saved.status end,
    favorite = case when p_status = 'Favorites' then true when p_favorite is not null then p_favorite when saved.status = 'Favorites' then true else saved.favorite end,
    updated_at = excluded.updated_at;
end $$;

create or replace function public.blk_shelf_import_books(p_items jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_item jsonb;
begin
  if auth.uid() is null then raise exception 'Log in to save books.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Provide shelf items.'; end if;
  if jsonb_array_length(p_items) not between 1 and 500 then raise exception 'Provide 1 to 500 shelf items.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item->'bookId') <> 'string' or jsonb_typeof(v_item->'status') <> 'string'
      or v_item->>'status' is null then raise exception 'Choose a valid book and shelf.'; end if;
    perform public.blk_shelf_set_book(v_item->>'bookId', v_item->>'status', null);
  end loop;
end $$;

create or replace function public.blk_shelf_set_review(p_book_id text, p_rating integer, p_review text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Log in to rate or review books.'; end if;
  if p_book_id is null or char_length(btrim(p_book_id)) not between 1 and 160 then raise exception 'Choose a valid book.'; end if;
  if not exists (select 1 from public.public_library_books where "Book_ID"::text = btrim(p_book_id)) then raise exception 'This book is not available on The BLK Shelf.'; end if;
  insert into public.blk_shelf_reader_reviews as saved (user_id,book_id,rating,review,created_at,updated_at)
  values (v_user,btrim(p_book_id),p_rating,btrim(coalesce(p_review,'')),now(),now())
  on conflict (user_id,book_id) do update set rating = excluded.rating, review = excluded.review, updated_at = excluded.updated_at;
end $$;

create or replace function public.blk_shelf_get_profile(p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null then raise exception 'Log in to see your profile.'; end if;
  select jsonb_build_object(
    'displayName', coalesce((select display_name from public.blk_shelf_reader_profiles where user_id = v_user), ''),
    'reviewCount', (select count(*) from public.blk_shelf_reader_reviews where user_id = v_user),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'bookId',r.book_id,'rating',r.rating,'review',r.review,'updatedAt',r.updated_at) order by r.updated_at desc,r.id)
      from (select * from public.blk_shelf_reader_reviews where user_id = v_user order by updated_at desc,id limit 50 offset greatest(0,least(coalesce(p_offset,0),100000))) r), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- Public endpoint returns only review text, rating, public name, ID and timestamp.
-- Private account IDs/emails, other users' shelves, and signup names are not returned.
create or replace function public.blk_shelf_book_reviews(p_book_id text, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if p_book_id is null or char_length(btrim(p_book_id)) not between 1 and 160 then raise exception 'Choose a valid book.'; end if;
  select jsonb_build_object(
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'rating',r.rating,'review',r.review,'displayName',coalesce(nullif(p.display_name,''),'Reader'),'updatedAt',r.updated_at) order by r.updated_at desc,r.id)
      from (select * from public.blk_shelf_reader_reviews where book_id = btrim(p_book_id) order by updated_at desc,id limit 50 offset greatest(0,least(coalesce(p_offset,0),100000))) r
      left join public.blk_shelf_reader_profiles p on p.user_id = r.user_id), '[]'::jsonb),
    'count', (select count(*) from public.blk_shelf_reader_reviews where book_id = btrim(p_book_id)),
    'average', coalesce((select avg(rating) from public.blk_shelf_reader_reviews where book_id = btrim(p_book_id)),0),
    'mine', (select jsonb_build_object('id',r.id,'rating',r.rating,'review',r.review,'displayName',coalesce(nullif(p.display_name,''),'Reader'),'updatedAt',r.updated_at)
      from public.blk_shelf_reader_reviews r left join public.blk_shelf_reader_profiles p on p.user_id = r.user_id
      where r.user_id = v_user and r.book_id = btrim(p_book_id)),
    'displayName', coalesce((select nullif(display_name,'') from public.blk_shelf_reader_profiles where user_id = v_user),'Reader')
  ) into v_result;
  return v_result;
end $$;

revoke all on function public.blk_shelf_sentence_count(text) from public;
revoke all on function public.blk_shelf_set_book(text,text,boolean) from public;
revoke all on function public.blk_shelf_import_books(jsonb) from public;
revoke all on function public.blk_shelf_set_review(text,integer,text) from public;
revoke all on function public.blk_shelf_get_profile(integer) from public;
revoke all on function public.blk_shelf_book_reviews(text,integer) from public;
grant execute on function public.blk_shelf_sentence_count(text), public.blk_shelf_set_book(text,text,boolean),
  public.blk_shelf_import_books(jsonb), public.blk_shelf_set_review(text,integer,text), public.blk_shelf_get_profile(integer) to authenticated;
grant execute on function public.blk_shelf_book_reviews(text,integer) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
