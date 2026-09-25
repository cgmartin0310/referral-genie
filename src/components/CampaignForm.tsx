'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { CAMPAIGN_TYPES } from '../lib/constants';
import { formatDateForInput } from '../lib/utils';
import type { Audience } from '../lib/campaigns/audience';
import { OUTREACH_TIERS, TIER_INFO, type OutreachTier } from '../lib/referral-list/tiers';

function formatFax(value: string): string {
  const digits = value.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return value;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

interface ReferralSource {
  id: string;
  name: string;
  faxNumber: string | null;
  contactPerson: string | null;
  clinicLocationId: string | null;
  clinicLocation: {
    id: string;
    name: string;
  } | null;
}

interface CampaignFormProps {
  campaignId?: string;
  defaultValues?: {
    name: string;
    description: string;
    startDate: string;
    endDate: string | null;
    status: string;
    type: string;
    content: string;
    documentUrl: string | null;
    documentName: string | null;
  };
  selectedReferralSources?: ReferralSource[];
  /** Clinic whose referral list is the audience. */
  audienceClinicId?: string | null;
  /** Tiers on that list to fax; empty means everyone but Not a fit. */
  audienceTiers?: string[];
}

export default function CampaignForm({ 
  campaignId, 
  defaultValues,
  selectedReferralSources = [],
  audienceClinicId: initialAudienceClinicId = null,
  audienceTiers: initialAudienceTiers = [],
}: CampaignFormProps) {
  const router = useRouter();
  const isEditMode = !!campaignId;
  
  const [isLoading, setIsLoading] = useState(false);
  const [referralSources, setReferralSources] = useState<ReferralSource[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(
    selectedReferralSources.map(source => source.id)
  );
  
  const [file, setFile] = useState<File | null>(null);
  const [uploadedDocument, setUploadedDocument] = useState<{
    url: string;
    name: string;
  } | null>(defaultValues?.documentUrl ? {
    url: defaultValues.documentUrl,
    name: defaultValues.documentName || 'Uploaded document'
  } : null);
  
  const [filterClinicLocation, setFilterClinicLocation] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Audience: a clinic's referral list, previewed as the pages it will send.
  const [clinics, setClinics] = useState<{ id: string; name: string }[]>([]);
  const [audienceClinicId, setAudienceClinicId] = useState<string>(initialAudienceClinicId ?? '');
  // Which tiers to fax. All three checked is the whole list (Not a fit never is).
  const [tiers, setTiers] = useState<OutreachTier[]>(() => {
    const chosen = OUTREACH_TIERS.filter((tier) => initialAudienceTiers.includes(tier));
    return chosen.length > 0 ? chosen : [...OUTREACH_TIERS];
  });
  const tierParam = tiers.length === OUTREACH_TIERS.length ? [] : tiers;
  const [audience, setAudience] = useState<Audience | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  // The per-source picker stays for campaigns that were built with it.
  const showLegacySources = isEditMode && selectedReferralSources.length > 0;

  useEffect(() => {
    axios
      .get('/api/clinic-locations')
      .then(({ data }) => setClinics(data.map((clinic: { id: string; name: string }) => ({ id: clinic.id, name: clinic.name }))))
      .catch(() => toast.error('Failed to load clinics'));
  }, []);

  useEffect(() => {
    if (!audienceClinicId) {
      setAudience(null);
      return;
    }
    let cancelled = false;
    setAudienceLoading(true);
    axios
      .get<Audience>('/api/campaigns/audience', { params: { clinicId: audienceClinicId, tiers: tierParam.join(',') || undefined } })
      .then(({ data }) => {
        if (!cancelled) setAudience(data);
      })
      .catch(() => toast.error('Failed to load the audience'))
      .finally(() => {
        if (!cancelled) setAudienceLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceClinicId, tierParam.join(',')]);
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm({
    defaultValues: defaultValues || {
      name: '',
      description: '',
      startDate: formatDateForInput(new Date()),
      endDate: '',
      status: 'DRAFT',
      type: 'FAX',
      content: ''
    }
  });
  
  const campaignType = watch('type');
  
  const uniqueClinicLocations = Array.from(
    new Map(
      referralSources
        .filter(source => source.clinicLocation)
        .map(source => [source.clinicLocation!.id, source.clinicLocation!.name])
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));
  
  // Fetch all referral sources
  useEffect(() => {
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
  }, []);
  
  // Filtered referral sources based on search and clinic location
  const filteredReferralSources = referralSources.filter(source => {
    // Filter by clinic location if selected
    if (filterClinicLocation && source.clinicLocation?.id !== filterClinicLocation) {
      return false;
    }
    
    // Filter by search query if provided
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        source.name.toLowerCase().includes(query) || 
        (source.contactPerson && source.contactPerson.toLowerCase().includes(query))
      );
    }
    
    return true;
  });
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    setFile(selectedFile);
    
    // Auto-upload the file when selected
    await handleFileUpload(selectedFile);
  };
  
  const handleFileUpload = async (fileToUpload: File) => {
    try {
      setIsLoading(true);
      
      const formData = new FormData();
      formData.append('file', fileToUpload);
      
      const { data } = await axios.post('/api/upload', formData);
      
      setUploadedDocument({
        url: data.url,
        name: data.originalName
      });
      
      toast.success('Document uploaded successfully');
    } catch (error) {
      console.error('Error uploading file:', error);
      const message = axios.isAxiosError(error) ? error.response?.data?.error : null;
      toast.error(message || 'Failed to upload document');
    } finally {
      setIsLoading(false);
    }
  };
  
  const toggleReferralSource = (id: string) => {
    setSelectedSourceIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(sourceId => sourceId !== id);
      } else {
        return [...prev, id];
      }
    });
  };
  
  const onSubmit = async (data: any) => {
    if (campaignType === 'FAX' && !uploadedDocument) {
      toast.error('Please upload a document for the fax campaign');
      return;
    }
    
    if (!audienceClinicId && selectedSourceIds.length === 0) {
      toast.error('Choose the clinic whose referral list this campaign goes to');
      return;
    }
    
    const payload = {
      ...data,
      documentUrl: uploadedDocument?.url || null,
      documentName: uploadedDocument?.name || null,
      referralSourceIds: selectedSourceIds,
      audienceClinicId: audienceClinicId || null,
      audienceTiers: tierParam,
    };
    
    setIsLoading(true);
    
    try {
      if (isEditMode) {
        await axios.put(`/api/campaigns/${campaignId}`, payload);
        toast.success('Campaign updated successfully');
      } else {
        await axios.post('/api/campaigns', payload);
        toast.success('Campaign created successfully');
      }
      
      router.push('/campaigns');
    } catch (error) {
      console.error('Error saving campaign:', error);
      toast.error('Failed to save campaign');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl md:col-span-2">
        <div className="px-4 py-6 sm:p-8">
          <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6">
            <div className="sm:col-span-4">
              <label htmlFor="name" className="block text-sm font-medium leading-6 text-gray-900">
                Campaign Name
              </label>
              <div className="mt-2">
                <input
                  type="text"
                  id="name"
                  {...register('name', { required: 'Campaign name is required' })}
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                />
                {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message as string}</p>}
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="type" className="block text-sm font-medium leading-6 text-gray-900">
                Campaign Type
              </label>
              <div className="mt-2">
                <select
                  id="type"
                  {...register('type', { required: 'Campaign type is required' })}
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                >
                  {CAMPAIGN_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
                {errors.type && <p className="mt-1 text-sm text-red-600">{errors.type.message as string}</p>}
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="status" className="block text-sm font-medium leading-6 text-gray-900">
                Status
              </label>
              <div className="mt-2">
                <select
                  id="status"
                  {...register('status')}
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="startDate" className="block text-sm font-medium leading-6 text-gray-900">
                Start Date
              </label>
              <div className="mt-2">
                <input
                  type="date"
                  id="startDate"
                  {...register('startDate', { required: 'Start date is required' })}
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                />
                {errors.startDate && <p className="mt-1 text-sm text-red-600">{errors.startDate.message as string}</p>}
              </div>
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="endDate" className="block text-sm font-medium leading-6 text-gray-900">
                End Date
              </label>
              <div className="mt-2">
                <input
                  type="date"
                  id="endDate"
                  {...register('endDate')}
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                />
              </div>
            </div>

            <div className="col-span-full">
              <label htmlFor="description" className="block text-sm font-medium leading-6 text-gray-900">
                Description
              </label>
              <div className="mt-2">
                <textarea
                  id="description"
                  rows={3}
                  {...register('description')}
                  className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                />
              </div>
            </div>

            {campaignType === 'FAX' && (
              <div className="col-span-full">
                <label className="block text-sm font-medium leading-6 text-gray-900">
                  Fax Document
                </label>
                <div className="mt-2 space-y-3">
                  {uploadedDocument ? (
                    <div className="flex items-center space-x-2 p-2 bg-gray-50 rounded-md border border-gray-200">
                      <span className="text-sm text-gray-700">{uploadedDocument.name}</span>
                      <a 
                        href={uploadedDocument.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-600 hover:text-indigo-900"
                      >
                        View
                      </a>
                      <button
                        type="button"
                        onClick={() => setUploadedDocument(null)}
                        className="text-xs text-red-600 hover:text-red-900"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-full">
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <svg className="w-8 h-8 mb-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                          </svg>
                          <p className="mb-2 text-sm text-gray-500">
                            <span className="font-semibold">Click to upload</span> or drag and drop
                          </p>
                          <p className="text-xs text-gray-500">PDF (max. 10MB). The opt-out line from Settings is added to every page.</p>
                        </div>
                        <input 
                          id="dropzone-file" 
                          type="file" 
                          className="hidden" 
                          accept=".pdf,application/pdf" 
                          onChange={handleFileChange}
                          disabled={isLoading}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {campaignType !== 'FAX' && (
              <div className="col-span-full">
                <label htmlFor="content" className="block text-sm font-medium leading-6 text-gray-900">
                  Campaign Content
                </label>
                <div className="mt-2">
                  <textarea
                    id="content"
                    rows={6}
                    {...register('content')}
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    placeholder="Enter the campaign content or message..."
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl md:col-span-2">
        <div className="px-4 py-6 sm:p-8">
          <h3 className="text-base font-semibold leading-6 text-gray-900">Audience</h3>
          <p className="mt-1 text-sm text-gray-500">
            This campaign goes to a clinic’s referral list. Everyone at a practice who shares a fax machine gets one
            page; a provider with their own line gets their own.
          </p>
          <div className="mt-4 max-w-sm">
            <label htmlFor="audienceClinicId" className="block text-sm font-medium text-gray-700">
              Clinic
            </label>
            <select
              id="audienceClinicId"
              value={audienceClinicId}
              onChange={(e) => setAudienceClinicId(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-600 focus:ring-green-600 sm:text-sm"
            >
              <option value="">Choose a clinic…</option>
              {clinics.map((clinic) => (
                <option key={clinic.id} value={clinic.id}>
                  {clinic.name}
                </option>
              ))}
            </select>
          </div>

          {audienceClinicId && (
            <fieldset className="mt-4">
              <legend className="block text-sm font-medium text-gray-700">Who on the list</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {OUTREACH_TIERS.map((tier) => (
                  <label key={tier} className="flex items-center gap-2 text-sm text-gray-700" title={TIER_INFO[tier].outreach}>
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      checked={tiers.includes(tier)}
                      onChange={() => setTiers((current) => {
                        const next = current.includes(tier) ? current.filter((item) => item !== tier) : [...current, tier];
                        return next.length === 0 ? current : OUTREACH_TIERS.filter((item) => next.includes(item));
                      })}
                    />
                    {TIER_INFO[tier].label}
                    {tier === 'cold' && <span className="text-xs text-gray-500">(and not yet scored)</span>}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">Practices scored Not a fit are never faxed.</p>
            </fieldset>
          )}

          {audienceClinicId && (audienceLoading ? (
            <p className="mt-4 text-sm text-gray-500">Building the send list…</p>
          ) : audience && (
            <div className="mt-5">
              <dl className="grid grid-cols-3 gap-4">
                {[
                  ['Practices', audience.practices],
                  ['Providers', audience.providers],
                  ['Pages to send', audience.targets.length],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border border-gray-200 px-4 py-3">
                    <dt className="text-xs font-medium text-gray-500">{label}</dt>
                    <dd className="mt-1 text-xl font-semibold text-gray-900">{value}</dd>
                  </div>
                ))}
              </dl>

              {audience.fellBack > 0 && (
                <p className="mt-3 text-sm text-amber-700">
                  {audience.fellBack} provider{audience.fellBack === 1 ? ' was' : 's were'} set to their own fax line but
                  have none on file, so their page goes to the office.
                </p>
              )}
              {(audience.optedOut?.length ?? 0) > 0 && (
                <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  <p className="font-medium">Opted out of faxes — will be skipped</p>
                  <p className="mt-1">{audience.optedOut?.map((row) => row.practiceName).join(', ')}</p>
                </div>
              )}
              {audience.unreachable.length > 0 && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <p className="font-medium">No fax on file — will be skipped</p>
                  <ul className="mt-1 list-disc pl-5">
                    {audience.unreachable.map((row) => (
                      <li key={row.practiceId}>
                        {row.practiceName}
                        {row.providerNames.length > 0 && ` (${row.providerNames.join(', ')})`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {audience.targets.length === 0 ? (
                <p className="mt-4 text-sm text-gray-600">
                  This clinic has no practices with a fax on its referral list yet. Add practices under Our Clinics.
                </p>
              ) : (
                <ul className="mt-4 max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
                  {audience.targets.map((target) => (
                    <li key={`${target.practiceId}-${target.faxNumber}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{target.toName}</p>
                        <p className="truncate text-xs text-gray-500">
                          {target.level === 'provider'
                            ? `Own line · ${target.practiceName}`
                            : target.providerNames.length > 0
                              ? `${target.providerNames.length} provider${target.providerNames.length === 1 ? '' : 's'} · ${target.providerNames.join(', ')}`
                              : 'Practice office'}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-gray-700">{formatFax(target.faxNumber)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {showLegacySources && (
      <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl md:col-span-2">
        <div className="px-4 py-6 sm:p-8">
          <div>
            <h3 className="text-base font-semibold leading-6 text-gray-900 mb-4">
              Individual sources
            </h3>
            
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="sm:w-1/2">
                <label htmlFor="searchQuery" className="block text-sm font-medium text-gray-700">
                  Search
                </label>
                <input
                  type="text"
                  id="searchQuery"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or contact"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
              </div>
              
              <div className="sm:w-1/2">
                <label htmlFor="filterClinicLocation" className="block text-sm font-medium text-gray-700">
                  Clinic Location
                </label>
                <select
                  id="filterClinicLocation"
                  value={filterClinicLocation}
                  onChange={(e) => setFilterClinicLocation(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                  <option value="">All Locations</option>
                  {uniqueClinicLocations.map(([locationId, locationName]) => (
                    <option key={locationId} value={locationId}>
                      {locationName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selected count and bulk selection */}
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm text-gray-500">
                {selectedSourceIds.length} of {filteredReferralSources.length} selected
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedSourceIds(filteredReferralSources.map(source => source.id))}
                  className="text-sm text-indigo-600 hover:text-indigo-900"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSourceIds([])}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="border-t border-gray-200 max-h-96 overflow-y-auto">
              <div className="divide-y divide-gray-200">
                {filteredReferralSources.length === 0 ? (
                  <div className="py-4 text-center text-gray-500">
                    No referral sources found
                  </div>
                ) : (
                  filteredReferralSources.map((source) => (
                    <div 
                      key={source.id} 
                      className={`relative flex items-start py-4 px-2 ${
                        selectedSourceIds.includes(source.id) ? 'bg-indigo-50' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center">
                          <input
                            id={`source-${source.id}`}
                            name={`source-${source.id}`}
                            type="checkbox"
                            checked={selectedSourceIds.includes(source.id)}
                            onChange={() => toggleReferralSource(source.id)}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">
                              {source.name}
                            </p>
                            <div className="text-xs text-gray-500">
                              {source.contactPerson && (
                                <span className="block">Contact: {source.contactPerson}</span>
                              )}
                              {source.faxNumber && (
                                <span className="block">Fax: {source.faxNumber}</span>
                              )}
                              {source.clinicLocation && (
                                <span className="block">Location: {source.clinicLocation.name}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      <div className="flex items-center justify-end gap-x-6">
        <button
          type="button"
          onClick={() => router.push('/campaigns')}
          className="text-sm font-semibold leading-6 text-gray-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:bg-indigo-300"
        >
          {isLoading ? 'Saving...' : (isEditMode ? 'Update Campaign' : 'Create Campaign')}
        </button>
      </div>
    </form>
  );
} 