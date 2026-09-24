import prisma from './prisma';
import { CATALOG_ORGANIZATION_ID } from './org';
import { allowListCodes, cleanCatalogGroups, type TaxonomyGroup } from './nppes/taxonomies';

/** The specialties the shared catalog pulls, as Paragon set them (the defaults until then). */
export async function loadCatalogGroups(): Promise<TaxonomyGroup[]> {
  const row = await prisma.catalogSettings.findUnique({ where: { organizationId: CATALOG_ORGANIZATION_ID } });
  return cleanCatalogGroups(row?.enabledGroups ?? null);
}

export async function saveCatalogGroups(value: unknown): Promise<TaxonomyGroup[]> {
  const enabledGroups = cleanCatalogGroups(value);
  await prisma.catalogSettings.upsert({
    where: { organizationId: CATALOG_ORGANIZATION_ID },
    create: { organizationId: CATALOG_ORGANIZATION_ID, enabledGroups },
    update: { enabledGroups },
  });
  return enabledGroups;
}

/** The NPI taxonomy codes the pull keeps right now. */
export async function pulledCodes(): Promise<Set<string>> {
  return allowListCodes(await loadCatalogGroups());
}
