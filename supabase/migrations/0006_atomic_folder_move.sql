-- Fixes a real race condition in folder moves: the previous approach
-- (in src/app/api/folders/[id]/route.ts) read the ancestor chain, checked
-- for a cycle in the API layer, then issued a separate UPDATE — two
-- concurrent moves could each pass the check against pre-move state before
-- either commits, jointly creating a real cycle that would hang
-- /api/tree's recursion forever. This function does the check-and-move as
-- one atomic database operation instead, serialized per workspace via a
-- transaction-scoped advisory lock so two concurrent moves in the same
-- workspace can no longer race each other. Coarse (locks the whole
-- workspace, not just the affected subtree) but folder moves are rare
-- enough that this is proportionate, not a bottleneck.
--
-- SECURITY INVOKER (the default — not specified below) means this runs
-- with the calling role's own privileges, so the existing
-- "folders_owner_all" RLS policy still governs every read/write here
-- exactly as it does for a plain REST call. No new privilege surface.
create function public.move_folder(p_folder_id uuid, p_new_parent_id uuid, p_new_name text default null)
returns public.folders
language plpgsql
as $$
declare
  v_workspace_id uuid;
  v_cursor uuid;
  v_result public.folders;
begin
  select workspace_id into v_workspace_id from public.folders where id = p_folder_id;
  if v_workspace_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_workspace_id::text));

  if p_new_parent_id is not null then
    if p_new_parent_id = p_folder_id then
      raise exception 'cycle' using errcode = 'P0001';
    end if;
    v_cursor := p_new_parent_id;
    while v_cursor is not null loop
      if v_cursor = p_folder_id then
        raise exception 'cycle' using errcode = 'P0001';
      end if;
      select parent_id into v_cursor from public.folders where id = v_cursor;
    end loop;
  end if;

  update public.folders
  set parent_id = p_new_parent_id,
      name = coalesce(p_new_name, name)
  where id = p_folder_id
  returning * into v_result;

  if v_result is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

grant execute on function public.move_folder(uuid, uuid, text) to authenticated;
