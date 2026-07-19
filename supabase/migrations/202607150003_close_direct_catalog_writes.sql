-- Catalogue writes are RPC-only. RLS alone cannot constrain privileged columns
-- such as publication and review status on a direct PostgREST insert.
revoke insert, delete on table public.products from authenticated;
revoke update (slug, title, description, category, updated_at) on table public.products from authenticated;
revoke insert, update, delete on table public.product_variants from authenticated;
revoke insert on table public.product_evidence from authenticated;

drop policy if exists products_member_write on public.products;
drop policy if exists variants_member_write on public.product_variants;
drop policy if exists evidence_member_submit on public.product_evidence;

-- Reads remain protected by the existing public/member policies. Mutations are
-- now possible only through reviewed security-definer functions that impose
-- statuses and derive identity from auth.uid().
