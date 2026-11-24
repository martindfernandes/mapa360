-- Mapa 360 DEV: Administrador Master por empresa e proteção de vínculos.
ALTER TABLE public.m360_company_members
  ADD COLUMN IF NOT EXISTS is_master_admin boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS m360_company_members_one_master_per_company
  ON public.m360_company_members(company_id) WHERE is_master_admin=true;

CREATE OR REPLACE FUNCTION public.issue_m360_member_password_reset(p_company_id uuid,p_actor_user_id uuid,p_target_user_id uuid,p_token_hash text)
RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,public,private,auth,pg_temp AS $$
BEGIN
 IF p_token_hash !~ '^[0-9a-f]{64}$' OR p_actor_user_id=p_target_user_id THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.m360_company_members WHERE company_id=p_company_id AND user_id=p_actor_user_id AND role='admin' AND status='active') THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.m360_company_members WHERE company_id=p_company_id AND user_id=p_target_user_id AND status='active') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM private.m360_platform_roles WHERE user_id=p_target_user_id AND role='platform_admin' AND is_active=true) THEN RETURN false; END IF;
 UPDATE private.m360_member_password_resets SET consumed_at=now() WHERE target_user_id=p_target_user_id AND consumed_at IS NULL;
 INSERT INTO private.m360_member_password_resets(token_hash,company_id,target_user_id,requested_by,expires_at) VALUES(p_token_hash,p_company_id,p_target_user_id,p_actor_user_id,now()+interval '30 minutes');
 INSERT INTO private.m360_member_security_events(company_id,actor_user_id,target_user_id,event_type) VALUES(p_company_id,p_actor_user_id,p_target_user_id,'password_reset_requested');
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.issue_m360_member_password_reset(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_m360_member_password_reset(uuid,uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.manage_m360_company_member(p_company_id uuid,p_user_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_member public.m360_company_members%ROWTYPE; v_active_admins integer;
BEGIN
 IF p_company_id IS NULL OR p_user_id IS NULL THEN RAISE EXCEPTION 'invalid_member' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text,1));
 SELECT * INTO v_member FROM public.m360_company_members WHERE company_id=p_company_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'member_not_found' USING ERRCODE='P0002'; END IF;
 IF v_member.is_master_admin THEN RAISE EXCEPTION 'master_admin_protected' USING ERRCODE='P0001'; END IF;
 SELECT count(*) INTO v_active_admins FROM public.m360_company_members WHERE company_id=p_company_id AND role='admin' AND status='active';
 IF p_action IN ('promote','transfer') THEN
  IF v_member.status<>'active' THEN RAISE EXCEPTION 'member_blocked' USING ERRCODE='P0001'; END IF;
  UPDATE public.m360_company_members SET role='admin' WHERE company_id=p_company_id AND user_id=p_user_id;
 ELSIF p_action='demote' THEN
  IF v_member.role='admin' AND v_member.status='active' AND v_active_admins<=1 THEN RAISE EXCEPTION 'last_active_admin' USING ERRCODE='P0001'; END IF;
  UPDATE public.m360_company_members SET role='member' WHERE company_id=p_company_id AND user_id=p_user_id;
 ELSIF p_action='remove' THEN
  IF v_member.role='admin' AND v_member.status='active' AND v_active_admins<=1 THEN RAISE EXCEPTION 'last_active_admin' USING ERRCODE='P0001'; END IF;
  DELETE FROM public.m360_company_members WHERE company_id=p_company_id AND user_id=p_user_id;
 ELSIF p_action='block' THEN
  IF v_member.status='active' AND v_member.role='admin' AND v_active_admins<=1 THEN RAISE EXCEPTION 'last_active_admin' USING ERRCODE='P0001'; END IF;
  UPDATE public.m360_company_members SET status='blocked' WHERE company_id=p_company_id AND user_id=p_user_id;
 ELSIF p_action='unblock' THEN
  UPDATE public.m360_company_members SET status='active' WHERE company_id=p_company_id AND user_id=p_user_id;
 ELSE RAISE EXCEPTION 'invalid_action' USING ERRCODE='22023';
 END IF;
 RETURN jsonb_build_object('ok',true,'action',p_action);
END; $$;
REVOKE ALL ON FUNCTION public.manage_m360_company_member(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_m360_company_member(uuid,uuid,text) TO service_role;

ALTER TABLE private.m360_platform_roles ADD COLUMN IF NOT EXISTS is_platform_owner boolean NOT NULL DEFAULT false;
UPDATE private.m360_platform_roles SET is_platform_owner=true WHERE role='platform_admin' AND is_active=true
AND (SELECT count(*) FROM private.m360_platform_roles WHERE role='platform_admin' AND is_active=true)=1;

CREATE OR REPLACE FUNCTION public.manage_m360_company_master_admin(p_company_id uuid,p_user_id uuid,p_actor_user_id uuid,p_action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,auth,pg_temp AS $
DECLARE v_member public.m360_company_members%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.m360_platform_roles WHERE user_id=p_actor_user_id AND role='platform_admin' AND is_active=true AND is_platform_owner=true) THEN RAISE EXCEPTION 'platform_owner_required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text,1));
 SELECT * INTO v_member FROM public.m360_company_members WHERE company_id=p_company_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'member_not_found' USING ERRCODE='P0002'; END IF;
 IF p_action='appoint' THEN
  IF v_member.status<>'active' OR v_member.role<>'admin' THEN RAISE EXCEPTION 'master_must_be_active_admin' USING ERRCODE='P0001'; END IF;
  UPDATE public.m360_company_members SET is_master_admin=false WHERE company_id=p_company_id AND is_master_admin=true;
  UPDATE public.m360_company_members SET is_master_admin=true WHERE company_id=p_company_id AND user_id=p_user_id;
 ELSIF p_action='remove' THEN
  IF NOT v_member.is_master_admin THEN RAISE EXCEPTION 'not_master_admin' USING ERRCODE='P0001'; END IF;
  DELETE FROM public.m360_company_members WHERE company_id=p_company_id AND user_id=p_user_id;
 ELSE RAISE EXCEPTION 'invalid_master_action' USING ERRCODE='22023';
 END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.manage_m360_company_master_admin(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_m360_company_master_admin(uuid,uuid,uuid,text) TO service_role;
