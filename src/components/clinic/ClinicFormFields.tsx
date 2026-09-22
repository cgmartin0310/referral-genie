'use client';

export interface ClinicFormValues {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber: string;
  faxNumber: string;
  isActive: boolean;
}

export function emptyClinicForm(): ClinicFormValues {
  return {
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    phoneNumber: '',
    faxNumber: '',
    isActive: true,
  };
}

export function clinicToForm(clinic: {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phoneNumber: string | null;
  faxNumber: string | null;
  isActive: boolean;
}): ClinicFormValues {
  return {
    name: clinic.name,
    address: clinic.address || '',
    city: clinic.city || '',
    state: clinic.state || '',
    zipCode: clinic.zipCode || '',
    phoneNumber: clinic.phoneNumber || '',
    faxNumber: clinic.faxNumber || '',
    isActive: clinic.isActive,
  };
}

const inputClass =
  'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm';

export default function ClinicFormFields({
  values,
  onChange,
  idPrefix = '',
}: {
  values: ClinicFormValues;
  onChange: (values: ClinicFormValues) => void;
  idPrefix?: string;
}) {
  const id = (name: string) => `${idPrefix}${name}`;
  const set = (patch: Partial<ClinicFormValues>) => onChange({ ...values, ...patch });

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={id('name')} className="block text-sm font-medium text-gray-700">
          Clinic name *
        </label>
        <input
          type="text"
          id={id('name')}
          required
          value={values.name}
          onChange={(event) => set({ name: event.target.value })}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-500">The clinic site. Counties are chosen in the next step.</p>
      </div>

      <div>
        <label htmlFor={id('address')} className="block text-sm font-medium text-gray-700">
          Street address
        </label>
        <input
          type="text"
          id={id('address')}
          value={values.address}
          onChange={(event) => set({ address: event.target.value })}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={id('city')} className="block text-sm font-medium text-gray-700">
            City
          </label>
          <input
            type="text"
            id={id('city')}
            value={values.city}
            onChange={(event) => set({ city: event.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={id('state')} className="block text-sm font-medium text-gray-700">
            State
          </label>
          <input
            type="text"
            id={id('state')}
            value={values.state}
            onChange={(event) => set({ state: event.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor={id('zipCode')} className="block text-sm font-medium text-gray-700">
          ZIP code
        </label>
        <input
          type="text"
          id={id('zipCode')}
          value={values.zipCode}
          onChange={(event) => set({ zipCode: event.target.value })}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={id('phoneNumber')} className="block text-sm font-medium text-gray-700">
          Phone
        </label>
        <input
          type="tel"
          id={id('phoneNumber')}
          value={values.phoneNumber}
          onChange={(event) => set({ phoneNumber: event.target.value })}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={id('faxNumber')} className="block text-sm font-medium text-gray-700">
          Fax
        </label>
        <input
          type="tel"
          id={id('faxNumber')}
          value={values.faxNumber}
          onChange={(event) => set({ faxNumber: event.target.value })}
          className={inputClass}
        />
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id={id('isActive')}
          checked={values.isActive}
          onChange={(event) => set({ isActive: event.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <label htmlFor={id('isActive')} className="ml-2 block text-sm text-gray-900">
          Active
        </label>
      </div>
    </div>
  );
}
