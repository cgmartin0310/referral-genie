'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@headlessui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import type { PracticeView } from '@/lib/practices/present';

interface Values {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  faxNumber: string;
  website: string;
}

function valuesOf(practice: PracticeView): Values {
  return {
    name: practice.name,
    address: practice.address ?? '',
    city: practice.city ?? '',
    state: practice.state ?? '',
    zipCode: practice.zipCode ?? '',
    phone: practice.phone ?? '',
    faxNumber: practice.faxNumber ?? '',
    website: practice.website ?? '',
  };
}

function Field({
  id,
  label,
  value,
  onChange,
  required,
  className,
}: {
  id: keyof Values;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={`edit-practice-${id}`} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={`edit-practice-${id}`}
        type="text"
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-green-600 focus:ring-green-600"
      />
    </div>
  );
}

/** Edit a referral source. What a person changes here, later pulls leave alone. */
export default function EditPracticeModal({ practice, onClose }: { practice: PracticeView | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Values | null>(null);
  useEffect(() => setValues(practice ? valuesOf(practice) : null), [practice]);
  const set = (key: keyof Values) => (value: string) => setValues((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = useMutation({
    mutationFn: async () => (await axios.patch(`/api/practices/${practice?.id}`, values)).data,
    onSuccess: () => {
      toast.success('Saved');
      queryClient.invalidateQueries({ queryKey: ['practices'] });
      onClose();
    },
    onError: (error: unknown) => {
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast.error(message || 'Could not save');
    },
  });

  return (
    <Dialog open={Boolean(practice && values)} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <Dialog.Title as="h3" className="text-lg font-semibold text-gray-900">
            Edit referral source
          </Dialog.Title>
          <p className="mt-1 text-sm text-gray-500">Your changes stay when the county is pulled again.</p>
          {values && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
              className="mt-4 grid grid-cols-6 gap-3"
            >
              <Field id="name" label="Name" value={values.name} onChange={set('name')} required className="col-span-6" />
              <Field id="address" label="Street address" value={values.address} onChange={set('address')} className="col-span-6" />
              <Field id="city" label="City" value={values.city} onChange={set('city')} className="col-span-3" />
              <Field id="state" label="State" value={values.state} onChange={set('state')} className="col-span-1" />
              <Field id="zipCode" label="ZIP" value={values.zipCode} onChange={set('zipCode')} className="col-span-2" />
              <Field id="phone" label="Phone" value={values.phone} onChange={set('phone')} className="col-span-3" />
              <Field id="faxNumber" label="Fax" value={values.faxNumber} onChange={set('faxNumber')} className="col-span-3" />
              <Field id="website" label="Website" value={values.website} onChange={set('website')} className="col-span-6" />
              <div className="col-span-6 mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={save.isPending || !values.name.trim()}
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-500 disabled:opacity-50"
                >
                  {save.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
