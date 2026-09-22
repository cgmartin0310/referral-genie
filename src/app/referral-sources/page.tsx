'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import MainLayout from '../../components/layout/MainLayout';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/20/solid';
import ReferralSourceModal from '../../components/ReferralSourceModal';
import { sourceMatchesClinicFilter } from '@/lib/referral-sources/clinic-filter';

interface ReferralSource {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  clinicLocationId: string | null;
  clinicLocation: {
    id: string;
    name: string;
  } | null;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  faxNumber: string | null;
  npiNumber: string | null;
  website: string | null;
  expectedMonthlyReferrals: number | null;
  numberOfProviders: number | null;
  sourceType: string | null;
  countyName: string | null;
  countyFips: string | null;
  placesMatchStatus: string | null;
  likelyDuplicate: boolean;
  reviewCount: number | null;
  businessStatus: string | null;
  rating: number | null;
  createdAt: string;
  category: { id: string; name: string } | null;
}

interface ClinicOption {
  id: string;
  name: string;
  marketCounties?: { fips: string }[];
}

type SortField = 'name' | 'clinicLocation' | 'address' | 'expectedMonthlyReferrals' | 'numberOfProviders';
type SortDirection = 'asc' | 'desc';

export default function ReferralSourcesPage() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [clinicLocationFilter, setClinicLocationFilter] = useState<string>('');
  const [countyFilter, setCountyFilter] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const { data: referralSources, isLoading, refetch } = useQuery({
    queryKey: ['referral-sources'],
    queryFn: async () => {
      try {
        const { data } = await axios.get('/api/referral-sources');
        return data;
      } catch (error) {
        console.error('Error fetching referral sources:', error);
        toast.error('Failed to load referral sources');
        return [];
      }
    },
  });

  const { data: clinics } = useQuery({
    queryKey: ['clinic-locations'],
    queryFn: async () => {
      const { data } = await axios.get('/api/clinic-locations');
      return data as ClinicOption[];
    },
  });

  const clinicOptions = useMemo(() => {
    const byId = new Map<string, string>();
    clinics?.forEach((clinic) => byId.set(clinic.id, clinic.name));
    referralSources?.forEach((source: ReferralSource) => {
      if (source.clinicLocation) {
        byId.set(source.clinicLocation.id, source.clinicLocation.name);
      }
    });
    return Array.from(byId.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [clinics, referralSources]);

  const marketFipsByClinic = useMemo(() => {
    const map = new Map<string, string[]>();
    clinics?.forEach((clinic) => {
      map.set(
        clinic.id,
        (clinic.marketCounties ?? []).map((county) => county.fips).filter(Boolean),
      );
    });
    return map;
  }, [clinics]);

  const countyNames = useMemo(() => {
    if (!referralSources) return [];
    const names = new Set<string>();
    referralSources.forEach((source: ReferralSource) => {
      if (source.countyName) names.add(source.countyName);
    });
    return Array.from(names).sort();
  }, [referralSources]);

  const filteredAndSortedReferralSources = useMemo(() => {
    if (!referralSources) return [];

    let result = [...referralSources];
    if (clinicLocationFilter) {
      const marketFips = marketFipsByClinic.get(clinicLocationFilter) ?? [];
      result = result.filter((source: ReferralSource) =>
        sourceMatchesClinicFilter(
          { clinicLocationId: source.clinicLocationId, countyFips: source.countyFips },
          clinicLocationFilter,
          marketFips,
        ),
      );
    }
    if (countyFilter) {
      result = result.filter((source: ReferralSource) => source.countyName === countyFilter);
    }

    result.sort((a: ReferralSource, b: ReferralSource) => {
      let valA;
      let valB;

      switch (sortField) {
        case 'name':
          valA = a.name || '';
          valB = b.name || '';
          break;
        case 'clinicLocation':
          valA = a.clinicLocation?.name || '';
          valB = b.clinicLocation?.name || '';
          break;
        case 'address':
          valA = (a.address ? (a.city ? `${a.address}, ${a.city}` : a.address) : '') || '';
          valB = (b.address ? (b.city ? `${b.address}, ${b.city}` : b.address) : '') || '';
          break;
        case 'expectedMonthlyReferrals':
          valA = a.expectedMonthlyReferrals || 0;
          valB = b.expectedMonthlyReferrals || 0;
          break;
        case 'numberOfProviders':
          valA = a.numberOfProviders || 0;
          valB = b.numberOfProviders || 0;
          break;
        default:
          valA = a.name || '';
          valB = b.name || '';
      }

      if (sortDirection === 'asc') {
        return valA > valB ? 1 : valA < valB ? -1 : 0;
      }
      return valA < valB ? 1 : valA > valB ? -1 : 0;
    });

    return result;
  }, [referralSources, clinicLocationFilter, countyFilter, sortField, sortDirection, marketFipsByClinic]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc'
      ? <ChevronUpIcon className="h-4 w-4 inline-block ml-1" />
      : <ChevronDownIcon className="h-4 w-4 inline-block ml-1" />;
  };

  const handleAddReferralSource = () => {
    setIsAddModalOpen(true);
  };

  const handleModalClose = () => {
    setIsAddModalOpen(false);
  };

  const handleModalSuccess = () => {
    refetch();
  };

  const filteredClinicName = clinicLocationFilter
    ? clinicOptions.find(([id]) => id === clinicLocationFilter)?.[1]
    : null;

  return (
    <MainLayout>
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-base font-semibold leading-6 text-gray-900">
            Referral Sources
          </h1>
          <p className="mt-2 text-sm text-gray-700">
            Sources pulled for a clinic&apos;s market (pediatrics and PCP from NPI) show here with clinic, county,
            and Places status. Filter by clinic to see that market&apos;s list.
          </p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          <button
            type="button"
            onClick={handleAddReferralSource}
            className="block rounded-md bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Add Referral Source
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-4">
        <div className="sm:w-64">
          <label htmlFor="clinicLocationFilter" className="block text-sm font-medium text-gray-700">
            Filter by clinic
          </label>
          <select
            id="clinicLocationFilter"
            value={clinicLocationFilter}
            onChange={(e) => setClinicLocationFilter(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">All clinics</option>
            {clinicOptions.map(([locationId, locationName]) => (
              <option key={locationId} value={locationId}>
                {locationName}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:w-64">
          <label htmlFor="countyFilter" className="block text-sm font-medium text-gray-700">
            Filter by county
          </label>
          <select
            id="countyFilter"
            value={countyFilter}
            onChange={(e) => setCountyFilter(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">All counties</option>
            {countyNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            {isLoading ? (
              <div className="text-center py-4">Loading...</div>
            ) : filteredAndSortedReferralSources?.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                No referral sources yet.{' '}
                <a href="/clinic-locations" className="font-medium text-indigo-600 hover:text-indigo-500">
                  Add a clinic
                </a>
                , pick its counties, then pull referral sources from the clinic page.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-300">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0 cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('name')}
                    >
                      <span className="group inline-flex">
                        Name
                        {renderSortIcon('name')}
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('clinicLocation')}
                    >
                      <span className="group inline-flex">
                        Clinic
                        {renderSortIcon('clinicLocation')}
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('address')}
                    >
                      <span className="group inline-flex">
                        Address
                        {renderSortIcon('address')}
                      </span>
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Source type
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      County
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Places
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      <span className="group inline-flex">
                        Fax
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('expectedMonthlyReferrals')}
                    >
                      <span className="group inline-flex">
                        Expected Monthly Referrals
                        {renderSortIcon('expectedMonthlyReferrals')}
                      </span>
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 cursor-pointer hover:bg-gray-50"
                      onClick={() => handleSort('numberOfProviders')}
                    >
                      <span className="group inline-flex">
                        Number of Providers
                        {renderSortIcon('numberOfProviders')}
                      </span>
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredAndSortedReferralSources?.map((source: ReferralSource) => (
                    <tr key={source.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-0">
                        <a href={`/referral-sources/${source.id}`} className="text-indigo-600 hover:text-indigo-900">
                          {source.name}
                        </a>
                        {source.npiNumber && (
                          <div className="text-xs font-normal text-gray-500">NPI {source.npiNumber}</div>
                        )}
                        {source.likelyDuplicate && (
                          <div className="text-xs font-normal text-amber-700">Possible duplicate</div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {source.clinicLocation?.name ||
                          (clinicLocationFilter && filteredClinicName && !source.clinicLocationId
                            ? filteredClinicName
                            : 'Not specified')}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {source.address
                          ? (source.city ? `${source.address}, ${source.city}` : source.address)
                          : 'Not specified'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {source.category?.name || source.sourceType || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {source.countyName || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {source.placesMatchStatus === 'matched'
                          ? `Matched${source.rating != null ? ` ${source.rating}` : ''}${source.reviewCount != null ? ` (${source.reviewCount})` : ''}`
                          : source.placesMatchStatus === 'unmatched'
                            ? 'Unmatched'
                            : source.placesMatchStatus === 'quarantined'
                              ? 'Quarantined'
                              : source.placesMatchStatus === 'pending'
                                ? 'Pending'
                                : '—'}
                        {source.businessStatus ? ` · ${source.businessStatus}` : ''}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {source.faxNumber || 'Not specified'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {source.expectedMonthlyReferrals ?? 'N/A'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {source.numberOfProviders ?? 'N/A'}
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                        <a href={`/referral-sources/${source.id}/edit`} className="text-indigo-600 hover:text-indigo-900">
                          Edit<span className="sr-only">, {source.name}</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <ReferralSourceModal
        isOpen={isAddModalOpen}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
      />
    </MainLayout>
  );
}
