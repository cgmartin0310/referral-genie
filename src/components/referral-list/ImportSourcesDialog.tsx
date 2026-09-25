'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@headlessui/react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

interface Report {
  added: number;
  alreadyListed: number;
  matched: number;
  addedByHand: number;
  scored: number;
  rejected: { line: number; reason: string }[];
}

/**
 * Upload a spreadsheet of referral sources onto a clinic's list. A Location
 * column sends each row to that clinic; a Score column scores it.
 */
export default function ImportSourcesDialog({ open, onClose, clinics, defaultClinicId, onImported }: {
  open: boolean;
  onClose: () => void;
  clinics: { id: string; name: string }[];
  defaultClinicId: string | null;
  onImported: () => void;
}) {
  const [clinicId, setClinicId] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setClinicId(defaultClinicId ?? clinics[0]?.id ?? '');
    setReport(null);
  }, [open, defaultClinicId, clinics]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const { data } = await axios.post<Report>('/api/referral-list/import', { csv: await file.text(), clinicId });
      setReport(data);
      onImported();
    } catch (error) {
      toast.error((axios.isAxiosError(error) ? error.response?.data?.error : null) || 'The upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <Dialog.Title className="text-lg font-medium text-gray-900">Upload a list of referral sources</Dialog.Title>
          <p className="mt-1 text-sm text-gray-600">
            A spreadsheet saved as CSV, one practice or provider per row. Practices in the catalog are matched by NPI, fax,
            phone, or name; the rest are added as your own. A <span className="font-medium">Score</span> column (Trusted, Warm,
            Cold, Not a fit) scores each row.{' '}
            <a href="/api/relationships/template" className="font-medium text-green-700 hover:text-green-600">Download the template</a>.
          </p>
          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Clinic for rows with no Location column</span>
            <select value={clinicId} onChange={(event) => setClinicId(event.target.value)} className="block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-green-500 focus:ring-green-500">
              {clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
            </select>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            disabled={uploading}
            onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file); }}
            className="mt-4 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-green-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-green-500"
          />
          {uploading && <p className="mt-3 text-sm text-gray-500">Uploading…</p>}
          {report && (
            <div className="mt-4 rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <p>
                {report.added} added · {report.alreadyListed} already on the list · {report.matched} found in the catalog ·{' '}
                {report.addedByHand} added as your own · {report.scored} scored
              </p>
              {report.rejected.length > 0 && (
                <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-xs text-red-700">
                  {report.rejected.map((row) => <li key={`${row.line}-${row.reason}`}>Line {row.line}: {row.reason}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className="mt-6 flex justify-end">
            <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Done</button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
