export interface AddressParts {
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  fax: string;
}

export interface TaxonomyHit {
  code: string;
  desc: string | null;
  primary: boolean;
}

export interface RawHit {
  npi: string;
  enumerationType: string;
  name: string;
  status: string | null;
  taxonomies: TaxonomyHit[];
  locations: AddressParts[];
  mailing: AddressParts | null;
}

export interface KeptProvider {
  npi: string;
  name: string;
  enumerationType: string;
  taxonomyCodes: string[];
  primaryTaxonomyCode: string;
  primaryTaxonomyDesc: string | null;
  sourceType: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  fax: string;
  /** The mailing address's fax when mail goes to the practice's own town; else ''. */
  mailingFax: string;
  addressFlags: string[];
  quarantined: boolean;
}
