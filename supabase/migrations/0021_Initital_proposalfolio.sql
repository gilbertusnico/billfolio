-- 1. Enable UUID Extension (jika belum aktif)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUM TYPES untuk Status Proposal
DO $$ BEGIN
    CREATE TYPE proposal_status AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'PAID', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. PROPOSALS TABLE
CREATE TABLE IF NOT EXISTS public.proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    token UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(), -- Public Access Token untuk Klien
    title VARCHAR(200) NOT NULL,
    client_name VARCHAR(100) NOT NULL,
    client_company VARCHAR(100),
    client_email VARCHAR(100) NOT NULL,
    client_whatsapp VARCHAR(20),
    project_summary TEXT,
    base_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    dp_percentage INT NOT NULL DEFAULT 50, -- e.g. 50%
    status proposal_status DEFAULT 'DRAFT',
    
    -- Client Response Fields (Diisi saat Klien Approve)
    total_amount DECIMAL(12, 2) DEFAULT 0.00,
    dp_amount DECIMAL(12, 2) DEFAULT 0.00,
    client_signature_url TEXT,
    approved_at TIMESTAMPTZ,
    client_ip VARCHAR(45),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PROPOSAL ADD-ONS TABLE
CREATE TABLE IF NOT EXISTS public.proposal_addons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    is_required BOOLEAN DEFAULT FALSE,       -- Item wajib vs add-on opsional
    is_selected BOOLEAN DEFAULT FALSE,       -- Pilihan klien
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PROPOSAL MILESTONES TABLE (Project Roadmap)
CREATE TABLE IF NOT EXISTS public.proposal_milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RLS POLICIES (Row Level Security)
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_milestones ENABLE ROW LEVEL SECURITY;

-- Policy Agency (Full Access milik sendiri)
CREATE POLICY "Agencies can manage own proposals" ON public.proposals
    FOR ALL USING (auth.uid() = agency_id);

-- Policy Public/Client (Read & Update via Token)
CREATE POLICY "Public can view proposal via token" ON public.proposals
    FOR SELECT USING (true);

CREATE POLICY "Public can update proposal via token" ON public.proposals
    FOR UPDATE USING (true);

CREATE POLICY "Public can view addons" ON public.proposal_addons
    FOR SELECT USING (true);

CREATE POLICY "Public can view milestones" ON public.proposal_milestones
    FOR SELECT USING (true);