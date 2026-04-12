
-- Create user_identities table
CREATE TABLE public.user_identities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fingerprint TEXT,
  email TEXT,
  phone TEXT,
  external_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;

-- Create sessions table
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_identity_id UUID REFERENCES public.user_identities(id),
  ip TEXT,
  user_agent TEXT,
  referrer TEXT,
  url TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Create events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT,
  event_name TEXT NOT NULL,
  source TEXT,
  session_id UUID REFERENCES public.sessions(id),
  user_identity_id UUID REFERENCES public.user_identities(id),
  ip TEXT,
  user_agent TEXT,
  referrer TEXT,
  url TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  value NUMERIC,
  currency TEXT,
  cookies JSONB,
  properties JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX idx_events_event_name ON public.events(event_name);
CREATE INDEX idx_events_event_id ON public.events(event_id);
CREATE INDEX idx_events_session_id ON public.events(session_id);
CREATE INDEX idx_events_created_at ON public.events(created_at);
CREATE INDEX idx_sessions_user_identity_id ON public.sessions(user_identity_id);
CREATE INDEX idx_user_identities_fingerprint ON public.user_identities(fingerprint);
CREATE INDEX idx_user_identities_email ON public.user_identities(email);

-- No public access policies — only service_role can access these tables
-- The edge function uses SUPABASE_SERVICE_ROLE_KEY to write data

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_user_identities_updated_at
BEFORE UPDATE ON public.user_identities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
