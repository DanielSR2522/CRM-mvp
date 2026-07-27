-- =====================================================================================
-- SmarTrack CRM — Lead to Client Conversion RPC Function
-- File:    migration_convert_lead_to_client.sql
--
-- WHAT THIS MIGRATION DOES:
--   Creates a secure PostgreSQL RPC function `convert_lead_to_client` that atomically:
--   1. Validates auth.uid() and agent ownership of the lead.
--   2. Locks the lead row with SELECT ... FOR UPDATE to prevent concurrent conversions.
--   3. Verifies the lead is not already converted.
--   4. Either links an existing client owned by the agent OR creates a new client.
--   5. Updates the lead: status = 'converted', converted_client_id, converted_at = now(),
--      last_activity_at = now(), updated_at = now().
--   6. Returns the client ID.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.convert_lead_to_client(
    p_lead_id UUID,
    p_existing_client_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_agent_id UUID;
    v_lead public.leads%ROWTYPE;
    v_target_client_id UUID;
    v_full_name TEXT;
    v_full_address TEXT;
BEGIN
    -- 1. Validate authenticated user
    v_agent_id := auth.uid();
    IF v_agent_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    -- 2. Fetch and lock lead row with FOR UPDATE to prevent race conditions
    SELECT * INTO v_lead
    FROM public.leads
    WHERE id = p_lead_id AND agent_id = v_agent_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lead not found or access denied.';
    END IF;

    -- 3. Reject if already converted
    IF v_lead.status = 'converted' OR v_lead.converted_client_id IS NOT NULL THEN
        RAISE EXCEPTION 'Lead is already converted.';
    END IF;

    -- 4. Process target client (existing OR new)
    IF p_existing_client_id IS NOT NULL THEN
        -- Verify existing client belongs to the same agent
        SELECT id INTO v_target_client_id
        FROM public.clients
        WHERE id = p_existing_client_id AND agent_id = v_agent_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Existing client not found or unauthorized.';
        END IF;
    ELSE
        -- Construct full_name and address from lead details
        v_full_name := trim(concat(v_lead.first_name, ' ', v_lead.last_name));
        
        v_full_address := COALESCE(v_lead.address, '');
        IF v_lead.city IS NOT NULL AND trim(v_lead.city) <> '' THEN
            IF length(v_full_address) > 0 THEN v_full_address := v_full_address || ', '; END IF;
            v_full_address := v_full_address || trim(v_lead.city);
        END IF;
        IF v_lead.state IS NOT NULL AND trim(v_lead.state) <> '' THEN
            IF length(v_full_address) > 0 THEN v_full_address := v_full_address || ', '; END IF;
            v_full_address := v_full_address || trim(v_lead.state);
        END IF;
        IF v_lead.zip_code IS NOT NULL AND trim(v_lead.zip_code) <> '' THEN
            IF length(v_full_address) > 0 THEN v_full_address := v_full_address || ' '; END IF;
            v_full_address := v_full_address || trim(v_lead.zip_code);
        END IF;

        -- Create new client record
        INSERT INTO public.clients (
            agent_id,
            full_name,
            email,
            phone,
            address,
            created_at,
            updated_at
        ) VALUES (
            v_agent_id,
            v_full_name,
            LOWER(v_lead.email),
            v_lead.phone,
            NULLIF(trim(v_full_address), ''),
            now(),
            now()
        )
        RETURNING id INTO v_target_client_id;
    END IF;

    -- 5. Update lead atomically to converted state
    UPDATE public.leads
    SET
        status = 'converted',
        converted_client_id = v_target_client_id,
        converted_at = now(),
        last_activity_at = now(),
        updated_at = now()
    WHERE id = p_lead_id AND agent_id = v_agent_id;

    RETURN v_target_client_id;
END;
$$;

-- Security permissions
REVOKE ALL ON FUNCTION public.convert_lead_to_client(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_client(UUID, UUID) TO authenticated;
