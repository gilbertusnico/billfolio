DO $$
DECLARE
  nico_user_id uuid;
  nico_workspace_id uuid;
  legacy_proposal_id uuid;
  match_count integer;
BEGIN
  SELECT COUNT(*), MIN(p.id::text)::uuid
  INTO match_count, nico_user_id
  FROM public.profiles AS p
  WHERE lower(trim(p.username)) = 'nico';

  IF match_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one profile named Nico; found %',
      match_count;
  END IF;

  SELECT COUNT(*), MIN(c.id::text)::uuid
  INTO match_count, nico_workspace_id
  FROM public.companies AS c
  WHERE lower(trim(c.name)) = lower('NICO company')
    AND (
      c.owner_id = nico_user_id
      OR EXISTS (
        SELECT 1
        FROM public.company_members AS cm
        WHERE cm.company_id = c.id
          AND cm.user_id = nico_user_id
      )
    );

  IF match_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one NICO company workspace owned by or shared with Nico; found %',
      match_count;
  END IF;

  SELECT COUNT(*), MIN(p.id::text)::uuid
  INTO match_count, legacy_proposal_id
  FROM public.proposals AS p
  WHERE p.agency_id = nico_user_id;

  IF match_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one proposal created by Nico; found %',
      match_count;
  END IF;

  UPDATE public.proposals
  SET company_id = nico_workspace_id
  WHERE id = legacy_proposal_id
    AND company_id IS DISTINCT FROM nico_workspace_id;
END;
$$;
