import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import axios from 'axios';
import { toast } from 'react-hot-toast';

interface CoverSheetFormProps {
  campaignId: string;
  defaultValues?: {
    coverSheetFromName?: string;
    coverSheetFromNumber?: string;
    coverSheetCompanyInfo?: string;
    coverSheetSubject?: string;
    coverSheetMessage?: string;
    includeCoverSheet?: boolean;
  };
  onSuccess?: () => void;
}

export default function CoverSheetForm({ campaignId, defaultValues, onSuccess }: CoverSheetFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      coverSheetFromName: defaultValues?.coverSheetFromName || 'Referral Genie',
      coverSheetFromNumber: defaultValues?.coverSheetFromNumber || '',
      coverSheetCompanyInfo: defaultValues?.coverSheetCompanyInfo || '',
      coverSheetSubject: defaultValues?.coverSheetSubject || 'Referral Information',
      coverSheetMessage: defaultValues?.coverSheetMessage || 'Please see the attached referral information. Thank you for your consideration.',
      includeCoverSheet: defaultValues?.includeCoverSheet !== false, // Default to true if not explicitly set to false
    }
  });
  
  const includeCoverSheet = watch('includeCoverSheet');
  
  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    
    try {
      await axios.patch(`/api/campaigns/${campaignId}/cover-sheet`, data);
      
      toast.success('Cover sheet settings saved successfully!');
      
      if (onSuccess) {
        onSuccess();
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error('Error saving cover sheet settings:', error);
      toast.error('Failed to save cover sheet settings');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center">
          <input
            id="includeCoverSheet"
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
            {...register('includeCoverSheet')}
          />
          <label htmlFor="includeCoverSheet" className="ml-3 block text-sm font-medium leading-6 text-gray-900">
            Include cover sheet
          </label>
        </div>
        
        {includeCoverSheet && (
          <>
            <div>
              <label htmlFor="coverSheetFromName" className="block text-sm font-medium leading-6 text-gray-900">
                From Name
              </label>
              <div className="mt-2">
                <input
                  id="coverSheetFromName"
                  type="text"
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  {...register('coverSheetFromName', { required: includeCoverSheet })}
                />
                {errors.coverSheetFromName && (
                  <p className="mt-1 text-sm text-red-600">From name is required</p>
                )}
              </div>
            </div>
            
            <div>
              <label htmlFor="coverSheetFromNumber" className="block text-sm font-medium leading-6 text-gray-900">
                From Fax Number (for cover sheet display)
              </label>
              <div className="mt-2">
                <input
                  id="coverSheetFromNumber"
                  type="text"
                  placeholder="e.g., 910-375-3031"
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  {...register('coverSheetFromNumber')}
                />
                <p className="mt-1 text-sm text-gray-500">This number will appear on the cover sheet. Faxes are sent via HumbleFax.</p>
              </div>
            </div>
            
            <div>
              <label htmlFor="coverSheetCompanyInfo" className="block text-sm font-medium leading-6 text-gray-900">
                Company Information
              </label>
              <div className="mt-2">
                <input
                  id="coverSheetCompanyInfo"
                  type="text"
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  {...register('coverSheetCompanyInfo')}
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="coverSheetSubject" className="block text-sm font-medium leading-6 text-gray-900">
                Subject
              </label>
              <div className="mt-2">
                <input
                  id="coverSheetSubject"
                  type="text"
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  {...register('coverSheetSubject', { required: includeCoverSheet })}
                />
                {errors.coverSheetSubject && (
                  <p className="mt-1 text-sm text-red-600">Subject is required</p>
                )}
              </div>
            </div>
            
            <div>
              <label htmlFor="coverSheetMessage" className="block text-sm font-medium leading-6 text-gray-900">
                Message
              </label>
              <div className="mt-2">
                <textarea
                  id="coverSheetMessage"
                  rows={4}
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  {...register('coverSheetMessage', { required: includeCoverSheet })}
                />
                {errors.coverSheetMessage && (
                  <p className="mt-1 text-sm text-red-600">Message is required</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="ml-3 inline-flex justify-center rounded-md bg-indigo-600 py-2 px-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-70"
        >
          {isSubmitting ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </form>
  );
} 