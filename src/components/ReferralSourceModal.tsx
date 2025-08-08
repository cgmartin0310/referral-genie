'use client';

import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import axios from 'axios';
import { toast } from 'react-hot-toast';

interface ClinicLocation {
  id: string;
  name: string;
  isActive: boolean;
}

interface ReferralSourceFormData {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  clinicLocationId: string;
  contactPerson: string;
  contactTitle: string;
  contactPhone: string;
  contactEmail: string;
  faxNumber: string;
  npiNumber: string;
  website: string;
  notes: string;
  expectedMonthlyReferrals: number | null;
  numberOfProviders: number | null;
}

interface ReferralSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReferralSourceModal({ isOpen, onClose, onSuccess }: ReferralSourceModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clinicLocations, setClinicLocations] = useState<ClinicLocation[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReferralSourceFormData>({
    defaultValues: {
      name: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      clinicLocationId: '',
      contactPerson: '',
      contactTitle: '',
      contactPhone: '',
      contactEmail: '',
      faxNumber: '',
      npiNumber: '',
      website: '',
      notes: '',
      expectedMonthlyReferrals: null,
      numberOfProviders: null
    }
  });

  // Fetch clinic locations when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchClinicLocations();
    }
  }, [isOpen]);

  const fetchClinicLocations = async () => {
    setIsLoadingLocations(true);
    try {
      const response = await axios.get('/api/clinic-locations');
      // Only show active locations
      setClinicLocations(response.data.filter((loc: ClinicLocation) => loc.isActive));
    } catch (error) {
      console.error('Error fetching clinic locations:', error);
      toast.error('Failed to load clinic locations');
    } finally {
      setIsLoadingLocations(false);
    }
  };

  const onSubmit = async (data: ReferralSourceFormData) => {
    setIsSubmitting(true);
    
    try {
      await axios.post('/api/referral-sources', data);
      toast.success('Referral source created successfully');
      reset();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error creating referral source:', error);
      toast.error('Failed to create referral source');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl sm:p-6">
                <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                    <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
                      Add New Referral Source
                    </Dialog.Title>
                    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-6">
                      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                        <div className="col-span-2">
                          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                            Name
                          </label>
                          <input
                            type="text"
                            {...register('name', { required: 'Name is required' })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                          {errors.name && (
                            <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="clinicLocationId" className="block text-sm font-medium text-gray-700">
                            Clinic Location
                          </label>
                          {isLoadingLocations ? (
                            <div className="mt-1 block w-full rounded-md border-gray-300 bg-gray-50 px-3 py-2 text-sm">
                              Loading locations...
                            </div>
                          ) : (
                            <select
                              id="clinicLocationId"
                              {...register('clinicLocationId')}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            >
                              <option value="">Select a location</option>
                              {clinicLocations.map((location) => (
                                <option key={location.id} value={location.id}>
                                  {location.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <div>
                          <label htmlFor="contactPerson" className="block text-sm font-medium text-gray-700">
                            Contact Person
                          </label>
                          <input
                            type="text"
                            {...register('contactPerson')}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                        </div>

                        <div>
                          <label htmlFor="contactTitle" className="block text-sm font-medium text-gray-700">
                            Contact Title
                          </label>
                          <input
                            type="text"
                            {...register('contactTitle')}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                        </div>

                        <div>
                          <label htmlFor="contactPhone" className="block text-sm font-medium text-gray-700">
                            Contact Phone
                          </label>
                          <input
                            type="tel"
                            {...register('contactPhone')}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                        </div>

                        <div>
                          <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-700">
                            Contact Email
                          </label>
                          <input
                            type="email"
                            {...register('contactEmail')}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                        </div>

                        <div>
                          <label htmlFor="faxNumber" className="block text-sm font-medium text-gray-700">
                            Fax Number
                          </label>
                          <input
                            type="tel"
                            {...register('faxNumber')}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                        </div>

                        <div>
                          <label htmlFor="npiNumber" className="block text-sm font-medium text-gray-700">
                            NPI Number
                          </label>
                          <input
                            type="text"
                            {...register('npiNumber')}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                        </div>

                        <div className="col-span-2">
                          <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                            Address
                          </label>
                          <input
                            type="text"
                            {...register('address')}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                        </div>

                        <div>
                          <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                            City
                          </label>
                          <input
                            type="text"
                            {...register('city')}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                        </div>

                        <div>
                          <label htmlFor="state" className="block text-sm font-medium text-gray-700">
                            State
                          </label>
                          <input
                            type="text"
                            {...register('state')}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                        </div>

                        <div>
                          <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700">
                            ZIP Code
                          </label>
                          <input
                            type="text"
                            {...register('zipCode')}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                        </div>

                        <div>
                          <label htmlFor="website" className="block text-sm font-medium text-gray-700">
                            Website
                          </label>
                          <input
                            type="url"
                            {...register('website')}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                        </div>

                        <div>
                          <label htmlFor="expectedMonthlyReferrals" className="block text-sm font-medium text-gray-700">
                            Expected Monthly Referrals
                          </label>
                          <input
                            type="number"
                            {...register('expectedMonthlyReferrals', { 
                              setValueAs: (value) => value === '' ? null : parseInt(value, 10)
                            })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            placeholder="0"
                          />
                        </div>

                        <div>
                          <label htmlFor="numberOfProviders" className="block text-sm font-medium text-gray-700">
                            Number of Providers
                          </label>
                          <input
                            type="number"
                            {...register('numberOfProviders', { 
                              setValueAs: (value) => value === '' ? null : parseInt(value, 10)
                            })}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            placeholder="0"
                          />
                        </div>

                        <div className="col-span-2">
                          <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                            Notes
                          </label>
                          <textarea
                            {...register('notes')}
                            rows={3}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          />
                        </div>
                      </div>

                      <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:ml-3 sm:w-auto disabled:opacity-50"
                        >
                          {isSubmitting ? 'Creating...' : 'Create'}
                        </button>
                        <button
                          type="button"
                          className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                          onClick={onClose}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}