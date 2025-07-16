import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import CoverSheetForm from './CoverSheetForm';

interface CoverSheetModalProps {
  campaignId: string;
  coverSheetSettings?: {
    coverSheetFromName?: string;
    coverSheetFromNumber?: string;
    coverSheetCompanyInfo?: string;
    coverSheetSubject?: string;
    coverSheetMessage?: string;
    includeCoverSheet?: boolean;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CoverSheetModal({
  campaignId,
  coverSheetSettings,
  isOpen,
  onClose,
  onSuccess
}: CoverSheetModalProps) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
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
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Fax Cover Sheet Settings
                  </Dialog.Title>
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-4">
                  <p className="text-sm text-gray-500">
                    Configure the settings for your fax cover sheet.
                  </p>
                </div>

                <div className="mt-6">
                  <CoverSheetForm
                    campaignId={campaignId}
                    defaultValues={coverSheetSettings}
                    onSuccess={() => {
                      if (onSuccess) {
                        onSuccess();
                      }
                      onClose();
                    }}
                  />
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
} 