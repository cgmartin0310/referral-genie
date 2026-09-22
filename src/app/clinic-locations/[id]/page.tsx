'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Dialog } from '@headlessui/react';
import MainLayout from '@/components/layout/MainLayout';
import ClinicFormFields, { clinicToForm, type ClinicFormValues } from '@/components/clinic/ClinicFormFields';
import SetupSteps from '@/components/setup/SetupSteps';
import CountyMarketPicker from '@/components/setup/CountyMarketPicker';
import PullEnrichPanel from '@/components/setup/PullEnrichPanel';
import ResearchPanel from '@/components/setup/ResearchPanel';
import type { MarketCountyView } from '@/lib/geo/market-view';

interface ClinicLocation {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phoneNumber: string | null;
  faxNumber: string | null;
  isActive: boolean;
  marketCounties: MarketCountyView[];
}

function addressLine(clinic: ClinicLocation): string {
  const cityLine = [clinic.city, clinic.state].filter(Boolean).join(', ');
  const cityZip = [cityLine, clinic.zipCode].filter(Boolean).join(' ');
  const line = [clinic.address, cityZip].filter(Boolean).join(', ');
  return line || 'Address not added yet';
}

export default function ClinicSetupPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<ClinicFormValues | null>(null);
  const [pullProgress, setPullProgress] = useState({ anyPastNppes: false, anyCompleted: false });
  const [researchDone, setResearchDone] = useState(false);

  const { data: clinic, isLoading, isError } = useQuery<ClinicLocation>({
    queryKey: ['clinic-location', id],
    queryFn: async () => {
      const { data } = await axios.get(`/api/clinic-locations/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ClinicFormValues) => {
      const response = await axios.put(`/api/clinic-locations/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinic-location', id] });
      queryClient.invalidateQueries({ queryKey: ['clinic-locations'] });
      toast.success('Clinic updated');
      setEditing(false);
    },
    onError: (error: unknown) => {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast.error(message || 'Failed to update clinic');
    },
  });

  const counties = clinic?.marketCounties ?? [];
  const step = counties.length === 0
    ? 2
    : researchDone
      ? 6
      : pullProgress.anyCompleted
        ? 5
        : pullProgress.anyPastNppes
          ? 4
          : 3;

  const clinicReady = Boolean(clinic);
  useEffect(() => {
    if (!clinicReady) return;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    document.getElementById(hash)?.scrollIntoView();
  }, [clinicReady, id]);

  return (
    <MainLayout>
      <div className="mb-6">
        <Link href="/clinic-locations" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
          All clinics
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">{clinic?.name ?? 'Clinic'}</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          Pick the counties this clinic serves, pull pediatric and primary care referral sources, enrich them with Google Places, then research missing contact details.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600"></div>
        </div>
      ) : isError || !clinic ? (
        <div className="bg-white shadow rounded-lg p-6">
          <p className="text-sm text-gray-700">This clinic could not be loaded.</p>
          <Link href="/clinic-locations" className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">
            Back to clinics
          </Link>
        </div>
      ) : (
        <div className="max-w-3xl space-y-6">
          <SetupSteps current={step} />

          <section className="bg-white shadow rounded-lg p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-gray-900">{clinic.name}</h2>
                <p className="mt-1 text-sm text-gray-600">{addressLine(clinic)}</p>
                <p className="mt-1 text-sm text-gray-600">Phone: {clinic.phoneNumber || 'Not added'}</p>
                <p className="mt-1 text-sm text-gray-600">Fax: {clinic.faxNumber || 'Not added'}</p>
                {!clinic.isActive && <p className="mt-2 text-xs font-medium text-gray-500">Inactive</p>}
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormData(clinicToForm(clinic));
                  setEditing(true);
                }}
                className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Edit clinic
              </button>
            </div>
          </section>

          <CountyMarketPicker
            clinicId={clinic.id}
            saved={counties}
            onSaved={(next) => {
              queryClient.setQueryData<ClinicLocation>(['clinic-location', id], (current) =>
                current ? { ...current, marketCounties: next } : current,
              );
              queryClient.invalidateQueries({ queryKey: ['clinic-locations'] });
              if (next.length > 0) {
                document.getElementById('sources')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}
          />

          <PullEnrichPanel clinicId={clinic.id} counties={counties} onProgress={setPullProgress} />
          {counties.length > 0 && (
            <ResearchPanel
              clinicId={clinic.id}
              refreshToken={`${pullProgress.anyPastNppes}-${pullProgress.anyCompleted}`}
              onProgress={({ completed }) => setResearchDone(completed)}
            />
          )}
        </div>
      )}

      <Dialog open={editing} onClose={() => setEditing(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
              Edit clinic
            </Dialog.Title>
            {formData && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  updateMutation.mutate(formData);
                }}
                className="mt-4"
              >
                <ClinicFormFields values={formData} onChange={setFormData} idPrefix="edit-" />
                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="inline-flex justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save clinic'}
                  </button>
                </div>
              </form>
            )}
          </Dialog.Panel>
        </div>
      </Dialog>
    </MainLayout>
  );
}
