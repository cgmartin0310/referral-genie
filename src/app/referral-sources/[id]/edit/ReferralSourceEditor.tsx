'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../../components/layout/MainLayout';
import { useForm } from 'react-hook-form';

interface ReferralSourceForm {
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

// Client component that receives the id as a prop
export default function ReferralSourceEditor({ id }: { id: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReferralSourceForm>();

  useEffect(() => {
    const fetchReferralSource = async () => {
      try {
        const { data } = await axios.get(`/api/referral-sources/${id}`);
        
        // Initialize form with data from API
        reset({
          name: data.name || '',
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          zipCode: data.zipCode || '',
          clinicLocation: data.clinicLocation || '',
          contactPerson: data.contactPerson || '',
          contactTitle: data.contactTitle || '',
          contactPhone: data.contactPhone || '',
          contactEmail: data.contactEmail || '',
          faxNumber: data.faxNumber || '',
          npiNumber: data.npiNumber || '',
          website: data.website || '',
          notes: data.notes || '',
          expectedMonthlyReferrals: data.expectedMonthlyReferrals || null,
          numberOfProviders: data.numberOfProviders || null,
        });
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching referral source:', error);
        toast.error('Failed to load referral source');
        router.push('/referral-sources');
      }
    };

    fetchReferralSource();
  }, [id, reset, router]);

  const onSubmit = async (data: ReferralSourceForm) => {
    setIsSaving(true);
    
    try {
      await axios.put(`/api/referral-sources/${id}`, data);
      toast.success('Referral source updated successfully');
      router.push('/referral-sources');
    } catch (error) {
      console.error('Error updating referral source:', error);
      toast.error('Failed to update referral source');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this referral source?')) {
      return;
    }
    
    setIsDeleting(true);
    
    try {
      await axios.delete(`/api/referral-sources/${id}`);
      toast.success('Referral source deleted successfully');
      router.push('/referral-sources');
    } catch (error) {
      console.error('Error deleting referral source:', error);
      
      // Show a more descriptive error message
      if (axios.isAxiosError(error) && error.response) {
        const errorDetails = error.response.data?.details || error.response.data?.error || 'Unknown error';
        toast.error(`Failed to delete referral source: ${errorDetails}`);
      } else {
        toast.error('Failed to delete referral source');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
            <p className="mt-3 text-gray-600">Loading...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Edit Referral Source</h1>
          <p className="mt-2 text-sm text-gray-700">
            Update information for this referral source.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/referral-sources')}
          className="mt-3 sm:mt-0 inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-8">
        <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl md:col-span-2">
          <div className="px-4 py-6 sm:p-8">
            <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label htmlFor="name" className="block text-sm font-medium leading-6 text-gray-900">
                  Name
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    id="name"
                    {...register('name', { required: 'Name is required' })}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                  {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="clinicLocation" className="block text-sm font-medium leading-6 text-gray-900">
                  Clinic Location
                </label>
                <div className="mt-2">
                  <select
                    id="clinicLocation"
                    {...register('clinicLocation')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  >
                    <option value="">Select a location</option>
                    {CLINIC_LOCATIONS.map(location => (
                      <option key={location} value={location}>{location}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="sm:col-span-6">
                <label htmlFor="address" className="block text-sm font-medium leading-6 text-gray-900">
                  Address
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    id="address"
                    {...register('address')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="city" className="block text-sm font-medium leading-6 text-gray-900">
                  City
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    id="city"
                    {...register('city')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="state" className="block text-sm font-medium leading-6 text-gray-900">
                  State
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    id="state"
                    {...register('state')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="zipCode" className="block text-sm font-medium leading-6 text-gray-900">
                  ZIP / Postal
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    id="zipCode"
                    {...register('zipCode')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="contactPerson" className="block text-sm font-medium leading-6 text-gray-900">
                  Contact Person
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    id="contactPerson"
                    {...register('contactPerson')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="contactTitle" className="block text-sm font-medium leading-6 text-gray-900">
                  Contact Title
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    id="contactTitle"
                    {...register('contactTitle')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="contactPhone" className="block text-sm font-medium leading-6 text-gray-900">
                  Phone
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    id="contactPhone"
                    {...register('contactPhone')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="contactEmail" className="block text-sm font-medium leading-6 text-gray-900">
                  Email
                </label>
                <div className="mt-2">
                  <input
                    type="email"
                    id="contactEmail"
                    {...register('contactEmail')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="faxNumber" className="block text-sm font-medium leading-6 text-gray-900">
                  Fax Number
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    id="faxNumber"
                    {...register('faxNumber')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="npiNumber" className="block text-sm font-medium leading-6 text-gray-900">
                  NPI Number
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    id="npiNumber"
                    {...register('npiNumber')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="expectedMonthlyReferrals" className="block text-sm font-medium leading-6 text-gray-900">
                  Expected Monthly Referrals
                </label>
                <div className="mt-2">
                  <input
                    type="number"
                    id="expectedMonthlyReferrals"
                    min="0"
                    {...register('expectedMonthlyReferrals', {
                      valueAsNumber: true,
                      setValueAs: v => v === '' ? null : parseInt(v, 10)
                    })}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="numberOfProviders" className="block text-sm font-medium leading-6 text-gray-900">
                  Number of Providers
                </label>
                <div className="mt-2">
                  <input
                    type="number"
                    id="numberOfProviders"
                    min="0"
                    {...register('numberOfProviders', {
                      valueAsNumber: true,
                      setValueAs: v => v === '' ? null : parseInt(v, 10)
                    })}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="website" className="block text-sm font-medium leading-6 text-gray-900">
                  Website
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    id="website"
                    {...register('website')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>

              <div className="col-span-full">
                <label htmlFor="notes" className="block text-sm font-medium leading-6 text-gray-900">
                  Notes
                </label>
                <div className="mt-2">
                  <textarea
                    id="notes"
                    rows={4}
                    {...register('notes')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-4 sm:px-8 border-t border-gray-100">
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:bg-red-300"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-indigo-300"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </MainLayout>
  );
} 