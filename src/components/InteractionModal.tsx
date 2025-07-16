import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import axios from 'axios';
import { toast } from 'react-hot-toast';

interface InteractionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  referralSourceId?: string;
  interactionId?: string;
  defaultValues?: {
    referralSourceId?: string;
    type?: string;
    date?: string;
    notes?: string;
    outcome?: string;
  };
}

interface InteractionForm {
  referralSourceId: string;
  type: string;
  date: string;
  notes: string;
  outcome: string;
}

const INTERACTION_TYPES = [
  'CALL',
  'EMAIL',
  'MEETING',
  'VISIT',
  'REFERRAL',
  'OTHER'
];

export default function InteractionModal({
  isOpen,
  onClose,
  onSuccess,
  referralSourceId,
  interactionId,
  defaultValues
}: InteractionModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referralSources, setReferralSources] = useState<Array<{ id: string; name: string }>>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setValue
  } = useForm<InteractionForm>();

  useEffect(() => {
    // Fetch referral sources if no specific ID is provided
    if (!referralSourceId) {
      const fetchReferralSources = async () => {
        try {
          const { data } = await axios.get('/api/referral-sources');
          setReferralSources(data);
        } catch (error) {
          console.error('Error fetching referral sources:', error);
          toast.error('Failed to load referral sources');
        }
      };

      fetchReferralSources();
    }
  }, [referralSourceId]);

  useEffect(() => {
    // If interaction ID is provided, fetch the interaction details
    if (interactionId) {
      const fetchInteraction = async () => {
        try {
          const { data } = await axios.get(`/api/interactions/${interactionId}`);
          
          // Format date for input field (YYYY-MM-DD)
          const date = new Date(data.date);
          const formattedDate = date.toISOString().split('T')[0];
          
          // Set form values
          setValue('referralSourceId', data.referralSourceId);
          setValue('type', data.type);
          setValue('date', formattedDate);
          setValue('notes', data.notes || '');
          setValue('outcome', data.outcome || '');
        } catch (error) {
          console.error('Error fetching interaction:', error);
          toast.error('Failed to load interaction details');
        }
      };

      fetchInteraction();
    } else if (defaultValues) {
      // Set default values if provided
      if (defaultValues.referralSourceId) {
        setValue('referralSourceId', defaultValues.referralSourceId);
      }
      if (defaultValues.type) {
        setValue('type', defaultValues.type);
      }
      if (defaultValues.date) {
        setValue('date', defaultValues.date);
      }
      if (defaultValues.notes) {
        setValue('notes', defaultValues.notes);
      }
      if (defaultValues.outcome) {
        setValue('outcome', defaultValues.outcome);
      }
    } else if (referralSourceId) {
      // Set the referral source ID if provided
      setValue('referralSourceId', referralSourceId);
      
      // Set today's date as default
      const today = new Date().toISOString().split('T')[0];
      setValue('date', today);
    }
  }, [interactionId, defaultValues, referralSourceId, setValue]);

  const onSubmit = async (data: InteractionForm) => {
    setIsSubmitting(true);
    
    try {
      if (interactionId) {
        // Update existing interaction
        await axios.put(`/api/interactions/${interactionId}`, data);
        toast.success('Interaction updated successfully');
      } else {
        // Create new interaction
        await axios.post('/api/interactions', data);
        toast.success('Interaction added successfully');
      }
      
      // Reset form and close modal
      reset();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving interaction:', error);
      toast.error('Failed to save interaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={handleClose}>
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
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="absolute right-0 top-0 hidden pr-4 pt-4 sm:block">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    onClick={handleClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
                <div>
                  <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
                    {interactionId ? 'Edit Interaction' : 'Add Interaction'}
                  </Dialog.Title>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4">
                  {!referralSourceId && (
                    <div>
                      <label htmlFor="referralSourceId" className="block text-sm font-medium leading-6 text-gray-900">
                        Referral Source
                      </label>
                      <div className="mt-2">
                        <select
                          id="referralSourceId"
                          {...register('referralSourceId', { required: 'Referral source is required' })}
                          className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                        >
                          <option value="">Select a referral source</option>
                          {referralSources.map((source) => (
                            <option key={source.id} value={source.id}>
                              {source.name}
                            </option>
                          ))}
                        </select>
                        {errors.referralSourceId && (
                          <p className="mt-1 text-sm text-red-600">{errors.referralSourceId.message}</p>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="type" className="block text-sm font-medium leading-6 text-gray-900">
                      Interaction Type
                    </label>
                    <div className="mt-2">
                      <select
                        id="type"
                        {...register('type', { required: 'Interaction type is required' })}
                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                      >
                        <option value="">Select an interaction type</option>
                        {INTERACTION_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type.charAt(0) + type.slice(1).toLowerCase()}
                          </option>
                        ))}
                      </select>
                      {errors.type && (
                        <p className="mt-1 text-sm text-red-600">{errors.type.message}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="date" className="block text-sm font-medium leading-6 text-gray-900">
                      Date
                    </label>
                    <div className="mt-2">
                      <input
                        type="date"
                        id="date"
                        {...register('date', { required: 'Date is required' })}
                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                      />
                      {errors.date && (
                        <p className="mt-1 text-sm text-red-600">{errors.date.message}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="notes" className="block text-sm font-medium leading-6 text-gray-900">
                      Notes
                    </label>
                    <div className="mt-2">
                      <textarea
                        id="notes"
                        rows={3}
                        {...register('notes')}
                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="outcome" className="block text-sm font-medium leading-6 text-gray-900">
                      Outcome
                    </label>
                    <div className="mt-2">
                      <input
                        type="text"
                        id="outcome"
                        {...register('outcome')}
                        className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                      />
                    </div>
                  </div>

                  <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2 disabled:bg-indigo-300"
                    >
                      {isSubmitting ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={handleClose}
                      className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
} 