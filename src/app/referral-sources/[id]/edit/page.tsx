// This is a Server Component that unwraps the params
import ReferralSourceEditor from './ReferralSourceEditor';
import { Suspense } from 'react';

// In Next.js 15.3.1, we need to make this an async component to resolve params issues
export default async function EditReferralSourcePage({ params }: { params: { id: string } }) {
  // Properly await params in Next.js 15.3.1
  const paramsCopy = await params;
  const id = String(paramsCopy.id);
  
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">Loading...</div>}>
      <ReferralSourceEditorWrapper id={id} />
    </Suspense>
  );
}

// Use a client component to handle the actual data fetching
function ReferralSourceEditorWrapper({ id }: { id: string }) {
  return <ReferralSourceEditor id={id} />;
} 