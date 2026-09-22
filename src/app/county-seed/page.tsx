'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import SetupSteps from '@/components/setup/SetupSteps';
import PullEnrichPanel from '@/components/setup/PullEnrichPanel';
import type { MarketCountyView } from '@/lib/geo/market-view';

interface ClinicOption {
  id: string;
  name: string;
  marketCounties?: MarketCountyView[];
}

export default function PullSourcesPage() {
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [clinicId, setClinicId] = useState('');
  const [loading, setLoading] = useState(true);
  const [pullProgress, setPullProgress] = useState({ anyPastNppes: false, anyCompleted: false });

  useEffect(() => {
    let cancelled = false;
    axios
      .get('/api/clinic-locations')
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as ClinicOption[];
        setClinics(rows);
        const withMarket = rows.find((clinic) => (clinic.marketCounties?.length ?? 0) > 0);
        setClinicId((withMarket ?? rows[0])?.id ?? '');
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load clinics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clinic = clinics.find((item) => item.id === clinicId) ?? null;
  const counties = clinic?.marketCounties ?? [];
  const step = !clinic ? 1 : counties.length === 0 ? 2 : pullProgress.anyCompleted ? 5 : pullProgress.anyPastNppes ? 4 : 3;

  return (
    <MainLayout>
      <div className="max-w-3xl">
        <p className="text-sm font-medium text-indigo-600">Steps 3 and 4</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Pull referral sources</h1>
        <p className="mt-2 text-sm text-gray-600">
          After a clinic has counties, pull pediatricians and primary care physicians, then enrich matches with Google Places.
        </p>
        <div className="mt-6">
          <SetupSteps current={step} />
        </div>

        {loading ? (
          <div className="mt-8 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600"></div>
          </div>
        ) : clinics.length === 0 ? (
          <div className="mt-6 bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900">Add a clinic first</h2>
            <p className="mt-2 text-sm text-gray-600">Referral sources are pulled for a clinic&apos;s counties.</p>
            <Link
              href="/clinic-locations"
              className="mt-4 inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Add a clinic
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="bg-white shadow rounded-lg p-6">
              <label htmlFor="clinic" className="block text-sm font-medium text-gray-700">
                Clinic
              </label>
              <select
                id="clinic"
                value={clinicId}
                onChange={(event) => {
                  setPullProgress({ anyPastNppes: false, anyCompleted: false });
                  setClinicId(event.target.value);
                }}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                {clinics.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {clinic && counties.length === 0 && (
                <p className="mt-3 text-sm text-gray-600">
                  This clinic has no counties yet.{' '}
                  <Link href={`/clinic-locations/${clinic.id}#market`} className="font-medium text-indigo-600 hover:text-indigo-500">
                    Pick counties
                  </Link>
                  .
                </p>
              )}
              {clinic && counties.length > 0 && (
                <p className="mt-3 text-sm text-gray-600">
                  <Link href={`/clinic-locations/${clinic.id}#market`} className="font-medium text-indigo-600 hover:text-indigo-500">
                    Edit counties
                  </Link>
                </p>
              )}
            </div>
            {clinic && <PullEnrichPanel key={clinic.id} counties={counties} onProgress={setPullProgress} />}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
