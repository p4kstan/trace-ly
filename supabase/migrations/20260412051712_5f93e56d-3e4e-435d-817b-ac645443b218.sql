
-- Add RLS SELECT policies to all event partition tables
-- These tables have RLS enabled but NO policies, meaning all access is denied
-- We add workspace-scoped SELECT policies using is_workspace_member()

CREATE POLICY "evt_part_select" ON public.events_2025_01 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2025_02 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2025_03 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2025_04 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2025_05 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2025_06 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2025_07 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2025_08 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2025_09 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2025_10 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2025_11 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2025_12 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2026_01 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2026_02 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2026_03 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2026_04 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2026_05 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2026_06 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2026_07 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2026_08 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2026_09 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2026_10 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2026_11 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "evt_part_select" ON public.events_2026_12 FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
