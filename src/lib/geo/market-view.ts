export interface MarketCountyView {
  id?: string;
  fips: string;
  name: string;
  state: string;
  pullReady: boolean;
  seedCountyId: string | null;
}
