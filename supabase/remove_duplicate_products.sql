-- Removes duplicate products created by running seed.sql more than once.
-- Keeps the lowest id for each unique product (same name, model, storage,
-- category and price) and deletes the higher-id copies.
-- Safe to run repeatedly.
--
-- Run this in the Supabase dashboard: SQL Editor -> New query -> Run.
-- It is not needed if the duplicate rows have already been deleted.

delete from public.products p
using public.products keep
where keep.id < p.id
  and keep.name = p.name
  and keep.model = p.model
  and coalesce(keep.storage, '') = coalesce(p.storage, '')
  and keep.category = p.category
  and keep.price = p.price;