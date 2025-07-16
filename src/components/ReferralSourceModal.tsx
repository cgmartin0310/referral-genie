'use client';

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import axios from 'axios';
import { toast } from 'react-hot-toast';

interface ReferralSourceFormData {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  clinicLocation: string;
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

const CLINIC_LOCATIONS = [
  'Jacksonville',
  'Wilmington',
  'Beulaville',
  'Goldsboro',
  'Nashville'
];

interface ReferralSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReferralSourceModal({ isOpen, onClose, onSuccess }: ReferralSourceModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
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
      clinicLocation: '',
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
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-3xl sm:p-6">
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
                <div>
                  <div className="mt-3 text-center sm:mt-0 sm:text-left">
                    <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
                      Add New Referral Source
                    </Dialog.Title>
                    
                    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-6">
                      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-6">
                        <div className="sm:col-span-3">
                          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                            Name *
                          </label>
                          <div className="mt-1">
                            <input
                              type="text"
                              id="name"
                              {...register('name', { required: 'Name is required' })}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
                          </div>
                        </div>

                        <div className="sm:col-span-3">
                          <label htmlFor="clinicLocation" className="block text-sm font-medium text-gray-700">
                            Clinic Location
                          </label>
                          <div className="mt-1">
                            <select
                              id="clinicLocation"
                              {...register('clinicLocation')}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            >
                              <option value="">Select a location</option>
                              {CLINIC_LOCATIONS.map(location => (
                                <option key={location} value={location}>{location}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="sm:col-span-6">
                          <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                            Address
                          </label>
                          <div className="mt-1">
                            <input
                              type="text"
                              id="address"
                              {...register('address')}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                            City
                          </label>
                          <div className="mt-1">
                            <input
                              type="text"
                              id="city"
                              {...register('city')}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <label htmlFor="state" className="block text-sm font-medium text-gray-700">
                            State
                          </label>
                          <div className="mt-1">
                            <input
                              type="text"
                              id="state"
                              {...register('state')}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700">
                            ZIP / Postal
                          </label>
                          <div className="mt-1">
                            <input
                              type="text"
                              id="zipCode"
                              {...register('zipCode')}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-3">
                          <label htmlFor="contactPerson" className="block text-sm font-medium text-gray-700">
                            Contact Person
                          </label>
                          <div className="mt-1">
                            <input
                              type="text"
                              id="contactPerson"
                              {...register('contactPerson')}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-3">
                          <label htmlFor="contactTitle" className="block text-sm font-medium text-gray-700">
                            Contact Title
                          </label>
                          <div className="mt-1">
                            <input
                              type="text"
                              id="contactTitle"
                              {...register('contactTitle')}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-3">
                          <label htmlFor="faxNumber" className="block text-sm font-medium text-gray-700">
                            Fax Number
                          </label>
                          <div className="mt-1">
                            <input
                              type="text"
                              id="faxNumber"
                              {...register('faxNumber')}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-3">
                          <label htmlFor="npiNumber" className="block text-sm font-medium text-gray-700">
                            NPI Number
                          </label>
                          <div className="mt-1">
                            <input
                              type="text"
                              id="npiNumber"
                              {...register('npiNumber')}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-3">
                          <label htmlFor="contactPhone" className="block text-sm font-medium text-gray-700">
                            Phone
                          </label>
                          <div className="mt-1">
                            <input
                              type="text"
                              id="contactPhone"
                              {...register('contactPhone')}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-3">
                          <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-700">
                            Email
                          </label>
                          <div className="mt-1">
                            <input
                              type="email"
                              id="contactEmail"
                              {...register('contactEmail')}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-3">
                          <label htmlFor="expectedMonthlyReferrals" className="block text-sm font-medium text-gray-700">
                            Expected Monthly Referrals
                          </label>
                          <div className="mt-1">
                            <input
                              type="number"
                              id="expectedMonthlyReferrals"
                              min="0"
                              {...register('expectedMonthlyReferrals', {
                                valueAsNumber: true,
                                setValueAs: v => v === '' ? null : parseInt(v, 10)
                              })}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-3">
                          <label htmlFor="numberOfProviders" className="block text-sm font-medium text-gray-700">
                            Number of Providers
                          </label>
                          <div className="mt-1">
                            <input
                              type="number"
                              id="numberOfProviders"
                              min="0"
                              {...register('numberOfProviders', {
                                valueAsNumber: true,
                                setValueAs: v => v === '' ? null : parseInt(v, 10)
                              })}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-3">
                          <label htmlFor="website" className="block text-sm font-medium text-gray-700">
                            Website
                          </label>
                          <div className="mt-1">
                            <input
                              type="text"
                              id="website"
                              {...register('website')}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-6">
                          <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                            Notes
                          </label>
                          <div className="mt-1">
                            <textarea
                              id="notes"
                              rows={3}
                              {...register('notes')}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 sm:mt-6 sm:flex sm:flex-row-reverse">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:ml-3 sm:w-auto disabled:bg-indigo-300"
                        >
                          {isSubmitting ? 'Saving...' : 'Save'}
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