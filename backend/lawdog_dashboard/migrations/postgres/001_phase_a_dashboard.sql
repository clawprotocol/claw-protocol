-- LawDog dashboard Phase A — organizations, memberships, agreements, parties.
-- Apply in Supabase SQL editor or via CLAW_DATABASE_URL migration runner.

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user
  ON organization_members (user_id);

CREATE TABLE IF NOT EXISTS agreements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled agreement',
  agreement_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  workspace_archived_at TIMESTAMPTZ,
  review_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agreements_org_updated
  ON agreements (organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agreement_parties (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agreement_id TEXT NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  party_id TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'party',
  email TEXT,
  phone TEXT,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_agreement_parties_agreement
  ON agreement_parties (agreement_id, sort_order);

-- RLS (Phase B auth will use auth.uid(); Phase A backend uses service role).
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_parties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_member_select ON organizations;
CREATE POLICY organizations_member_select ON organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = organizations.id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS organization_members_self_select ON organization_members;
CREATE POLICY organization_members_self_select ON organization_members
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS agreements_org_member_select ON agreements;
CREATE POLICY agreements_org_member_select ON agreements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = agreements.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agreement_parties_org_member_select ON agreement_parties;
CREATE POLICY agreement_parties_org_member_select ON agreement_parties
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM agreements a
      JOIN organization_members om ON om.organization_id = a.organization_id
      WHERE a.id = agreement_parties.agreement_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agreements_org_member_insert ON agreements;
CREATE POLICY agreements_org_member_insert ON agreements
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = agreements.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agreements_org_member_update ON agreements;
CREATE POLICY agreements_org_member_update ON agreements
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = agreements.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agreement_parties_org_member_insert ON agreement_parties;
CREATE POLICY agreement_parties_org_member_insert ON agreement_parties
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM agreements a
      JOIN organization_members om ON om.organization_id = a.organization_id
      WHERE a.id = agreement_parties.agreement_id
        AND om.user_id = auth.uid()
    )
  );
