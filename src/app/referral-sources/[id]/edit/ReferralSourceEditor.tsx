'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../../components/layout/MainLayout';
import { useForm } from 'react-hook-form';

interface ClinicLocation {
  id: string;
  name: string;
  isActive: boolean;
}

interface ReferralSourceForm {
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

// Client component that receives the id as a prop
export default function ReferralSourceEditor({ id }: { id: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [clinicLocations, setClinicLocations] = useState<ClinicLocation[]>([]);
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReferralSourceForm>();

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch both referral source and clinic locations in parallel
        const [sourceResponse, locationsResponse] = await Promise.all([
          axios.get(`/api/referral-sources/${id}`),
          axios.get('/api/clinic-locations')
        ]);
        
        const data = sourceResponse.data;
        const locations = locationsResponse.data.filter((loc: ClinicLocation) => loc.isActive);
        setClinicLocations(locations);
        
        // Initialize form with data from API
        reset({
          name: data.name || '',
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          zipCode: data.zipCode || '',
          clinicLocationId: data.clinicLocationId || data.clinicLocation?.id || '',
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
        console.error('Error fetching data:', error);
        toast.error('Failed to load referral source');
        router.push('/referral-sources');
      }
    };

    fetchData();
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
    if (!confirm('Are you sure you want to delete this referral source? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    
    try {
      await axios.delete(`/api/referral-sources/${id}`);
      toast.success('Referral source deleted successfully');
      router.push('/referral-sources');
    } catch (error) {
      console.error('Error deleting referral source:', error);
      toast.error('Failed to delete referral source');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center">
          <div className="sm:flex-auto">
            <h1 className="text-2xl font-semibold leading-6 text-gray-900">Edit Referral Source</h1>
            <p className="mt-2 text-sm text-gray-700">
              Update the information for this referral source.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-8">
          <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl md:col-span-2">
            <div className="px-4 py-6 sm:p-8">
              <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
                {/* Basic Information */}
                <div className="col-span-full">
                  <h2 className="text-lg font-medium leading-6 text-gray-900">Basic Information</h2>
                </div>

                <div className="sm:col-span-4">
                  <label htmlFor="name" className="block text-sm font-medium leading-6 text-gray-900">
                    Name
                  </label>
                  <div className="mt-2">
                    <input
                      type="text"
                      {...register('name', { required: 'Name is required' })}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                    {errors.name && (
                      <p className="mt-2 text-sm text-red-600">{errors.name.message}</p>
                    )}
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="clinicLocationId" className="block text-sm font-medium leading-6 text-gray-900">
                    Clinic Location
                  </label>
                  <div className="mt-2">
                    <select
                      id="clinicLocationId"
                      {...register('clinicLocationId')}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:max-w-xs sm:text-sm sm:leading-6"
                    >
                      <option value="">Select a location</option>
                      {clinicLocations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="col-span-full">
                  <h2 className="text-lg font-medium leading-6 text-gray-900">Contact Information</h2>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="contactPerson" className="block text-sm font-medium leading-6 text-gray-900">
                    Contact Person
                  </label>
                  <div className="mt-2">
                    <input
                      type="text"
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
                      {...register('contactTitle')}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="contactPhone" className="block text-sm font-medium leading-6 text-gray-900">
                    Contact Phone
                  </label>
                  <div className="mt-2">
                    <input
                      type="tel"
                      {...register('contactPhone')}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="contactEmail" className="block text-sm font-medium leading-6 text-gray-900">
                    Contact Email
                  </label>
                  <div className="mt-2">
                    <input
                      type="email"
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
                      type="tel"
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
                      {...register('npiNumber')}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                  </div>
                </div>

                {/* Address Information */}
                <div className="col-span-full">
                  <h2 className="text-lg font-medium leading-6 text-gray-900">Address Information</h2>
                </div>

                <div className="col-span-full">
                  <label htmlFor="address" className="block text-sm font-medium leading-6 text-gray-900">
                    Street Address
                  </label>
                  <div className="mt-2">
                    <input
                      type="text"
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
                      {...register('state')}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="zipCode" className="block text-sm font-medium leading-6 text-gray-900">
                    ZIP Code
                  </label>
                  <div className="mt-2">
                    <input
                      type="text"
                      {...register('zipCode')}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                  </div>
                </div>

                {/* Additional Information */}
                <div className="col-span-full">
                  <h2 className="text-lg font-medium leading-6 text-gray-900">Additional Information</h2>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="website" className="block text-sm font-medium leading-6 text-gray-900">
                    Website
                  </label>
                  <div className="mt-2">
                    <input
                      type="url"
                      {...register('website')}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="expectedMonthlyReferrals" className="block text-sm font-medium leading-6 text-gray-900">
                    Expected Monthly Referrals
                  </label>
                  <div className="mt-2">
                    <input
                      type="number"
                      {...register('expectedMonthlyReferrals', { 
                        setValueAs: (value) => value === '' ? null : parseInt(value, 10)
                      })}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="numberOfProviders" className="block text-sm font-medium leading-6 text-gray-900">
                    Number of Providers
                  </label>
                  <div className="mt-2">
                    <input
                      type="number"
                      {...register('numberOfProviders', { 
                        setValueAs: (value) => value === '' ? null : parseInt(value, 10)
                      })}
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
                      {...register('notes')}
                      rows={4}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between gap-x-6 border-t border-gray-900/10 px-4 py-4 sm:px-8">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-sm font-semibold text-red-600 hover:text-red-500 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
              <div className="flex gap-x-6">
                <button
                  type="button"
                  onClick={() => router.push('/referral-sources')}
                  className="text-sm font-semibold leading-6 text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}