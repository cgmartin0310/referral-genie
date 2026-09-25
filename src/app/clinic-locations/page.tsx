'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Link from 'next/link';
import toast from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import ClinicFormFields, { clinicToForm, emptyClinicForm, type ClinicFormValues } from '@/components/clinic/ClinicFormFields';
import { PlusIcon, PencilIcon, TrashIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { Dialog } from '@headlessui/react';
import type { MarketCountyView } from '@/lib/geo/market-view';
import { useTenant } from '@/lib/use-tenant';
import MoveToSubscriber from '@/components/admin/MoveToSubscriber';

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
  marketCounties?: MarketCountyView[];
  _count?: {
    referralSources: number;
  };
  referralList?: { practices: number; providers: number; estimate: { low: number; high: number } };
}

export default function ClinicLocationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me } = useTenant();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<ClinicLocation | null>(null);
  const [formData, setFormData] = useState<ClinicFormValues>(emptyClinicForm());

  const { data: clinicLocations, isLoading } = useQuery<ClinicLocation[]>({
    queryKey: ['clinic-locations'],
    queryFn: async () => {
      const { data } = await axios.get('/api/clinic-locations');
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ClinicFormValues) => {
      const response = await axios.post('/api/clinic-locations', data);
      return response.data as ClinicLocation;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['clinic-locations'] });
      toast.success('Clinic saved. Next, pick the counties it serves.');
      router.push(`/clinic-locations/${created.id}#market`);
    },
    onError: (error: unknown) => {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast.error(message || 'Failed to create clinic');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ClinicFormValues }) => {
      const response = await axios.put(`/api/clinic-locations/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinic-locations'] });
      toast.success('Clinic updated');
      closeModal();
    },
    onError: (error: unknown) => {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast.error(message || 'Failed to update clinic');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`/api/clinic-locations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinic-locations'] });
      toast.success('Clinic deleted');
    },
    onError: (error: unknown) => {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast.error(message || 'Failed to delete clinic');
    },
  });

  const openModal = (location?: ClinicLocation) => {
    if (location) {
      setEditingLocation(location);
      setFormData(clinicToForm(location));
    } else {
      setEditingLocation(null);
      setFormData(emptyClinicForm());
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingLocation(null);
    setFormData(emptyClinicForm());
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (editingLocation) {
      updateMutation.mutate({ id: editingLocation.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this clinic?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <MainLayout>
      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Our Clinics</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-700">
              Your clinic sites. Each one keeps its own referral list, built from the practices under Referral Sources.
            </p>
          </div>
          <div className="flex items-center gap-3">
          {me?.isParagon && <MoveToSubscriber />}
          <button
            onClick={() => openModal()}
            className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
          >
            <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
            Add clinic
          </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : (clinicLocations?.length ?? 0) === 0 ? (
        <div className="bg-white shadow rounded-lg px-6 py-12 text-center">
          <MapPinIcon className="mx-auto h-8 w-8 text-indigo-600" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-gray-900">Add a clinic</h2>
          <p className="mt-2 text-sm text-gray-600">
            Start with the clinic site. You can add more than one, and each clinic gets its own counties.
          </p>
          <button
            onClick={() => openModal()}
            className="mt-6 inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Add clinic
          </button>
        </div>
      ) : (
        <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl">
          <table className="min-w-full divide-y divide-gray-300">
            <thead>
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                  Clinic
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Address
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Phone
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Fax
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Market
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Referral list
                </th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {clinicLocations?.map((location) => {
                const market = location.marketCounties ?? [];
                const marketLabel = market.map((county) => `${county.name}, ${county.state}`).join('; ');
                return (
                  <tr key={location.id}>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                      <div className="flex items-center">
                        <MapPinIcon className="h-5 w-5 text-gray-400 mr-2" />
                        <Link href={`/clinic-locations/${location.id}`} className="hover:text-indigo-600">
                          {location.name}
                        </Link>
                      </div>
                      {!location.isActive && <p className="mt-1 text-xs text-gray-500">Inactive</p>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {location.address && location.city && location.state ? (
                        <div>
                          <div>{location.address}</div>
                          <div>
                            {location.city}, {location.state} {location.zipCode}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Not added</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {location.phoneNumber || <span className="text-gray-400">Not added</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {location.faxNumber || <span className="text-gray-400">Not added</span>}
                    </td>
                    <td className="px-3 py-4 text-sm text-gray-500">
                      <Link
                        href={`/clinic-locations/${location.id}#market`}
                        className="text-indigo-600 hover:text-indigo-500"
                        title={marketLabel}
                      >
                        {market.length === 0 ? 'Pick counties' : marketLabel}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {location.referralList && location.referralList.practices > 0 ? (
                        <Link href={`/clinic-locations/${location.id}`} className="text-gray-900 hover:text-green-700">
                          {location.referralList.practices} practice{location.referralList.practices === 1 ? '' : 's'}
                          {' · '}
                          {location.referralList.providers} provider{location.referralList.providers === 1 ? '' : 's'}
                          <span className="block text-xs text-gray-500">
                            est. {location.referralList.estimate.low}–{location.referralList.estimate.high} / mo
                          </span>
                        </Link>
                      ) : (
                        <Link href={`/referral-sources?clinic=${location.id}`} className="text-green-700 hover:text-green-600">
                          Add practices
                        </Link>
                      )}
                    </td>
                    <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                      <button
                        onClick={() => openModal(location)}
                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                        aria-label={`Edit ${location.name}`}
                      >
                        <PencilIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(location.id)}
                        className="text-red-600 hover:text-red-900"
                        disabled={!!location._count?.referralSources && location._count.referralSources > 0}
                        aria-label={`Delete ${location.name}`}
                      >
                        <TrashIcon
                          className={`h-5 w-5 ${
                            location._count?.referralSources && location._count.referralSources > 0
                              ? 'opacity-50 cursor-not-allowed'
                              : ''
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={isModalOpen} onClose={closeModal} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 text-left align-middle shadow-xl">
            <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
              {editingLocation ? 'Edit clinic' : 'Add clinic'}
            </Dialog.Title>
            <form onSubmit={handleSubmit} className="mt-4">
              <ClinicFormFields values={formData} onChange={setFormData} />
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save clinic'}
                </button>
              </div>
            </form>
          </Dialog.Panel>
        </div>
      </Dialog>
    </MainLayout>
  );
}
