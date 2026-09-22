-- Referral categories for nurse practitioners and physician assistants pulled
-- from NPI. In rural counties they are often the only pediatric providers.
INSERT INTO "ReferralCategory" ("id", "name", "description", "organizationId", "createdAt", "updatedAt")
VALUES
  ('cat_pediatric_np', 'Pediatric Nurse Practitioner', 'Nurse practitioner, pediatrics (NPI taxonomy 363LP0200X)', 'org_default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat_pcp_np_pa', 'PCP - Nurse Practitioner / PA', 'Family, primary care, adult, and gerontology nurse practitioners and physician assistants', 'org_default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
