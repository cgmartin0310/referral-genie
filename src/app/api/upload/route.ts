import { NextRequest, NextResponse } from 'next/server';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { FaxDocumentError, MAX_FAX_DOCUMENT_BYTES, saveFaxDocument } from '@/lib/fax/documents';

// A campaign's fax document. It is kept in the database, not on the server's
// disk, which is wiped on every deploy.
export async function POST(request: NextRequest) {
  try {
    const tenant = await currentTenant();
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_FAX_DOCUMENT_BYTES) {
      return NextResponse.json({ error: 'The file is larger than 10MB.' }, { status: 400 });
    }
    const saved = await saveFaxDocument(tenant.organizationId, file.name, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ success: true, url: saved.url, originalName: file.name });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    if (error instanceof FaxDocumentError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
