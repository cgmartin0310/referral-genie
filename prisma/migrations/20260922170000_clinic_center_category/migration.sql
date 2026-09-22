-- Referral category for clinic/center organizations pulled from NPI:
-- primary care clinics, rural health clinics, FQHCs, health departments,
-- multi-specialty groups. These org records name a practice and carry its fax.
INSERT INTO "ReferralCategory" ("id", "name", "description", "organizationId", "createdAt", "updatedAt")
VALUES (
  'cat_clinic_center',
  'Clinic / Health Center',
  'Primary care clinic, rural health clinic, FQHC, health department, or multi-specialty group (NPI organization record)',
  'org_default',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
