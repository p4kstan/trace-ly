
-- Deny all public access — only service_role bypasses RLS
CREATE POLICY "Deny all access to events" ON public.events FOR ALL USING (false);
CREATE POLICY "Deny all access to sessions" ON public.sessions FOR ALL USING (false);
CREATE POLICY "Deny all access to user_identities" ON public.user_identities FOR ALL USING (false);
