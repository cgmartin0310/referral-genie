import { NextRequest, NextResponse } from 'next/server';
import { currentTenant, tenantErrorResponse } from '@/lib/tenant';
import { loadFaxDocument } from '@/lib/fax/documents';

// View a campaign's fax document. Only the subscriber that uploaded it can.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await currentTenant();
    const { id } = await params;
    const document = await loadFaxDocument(id, tenant.organizationId);
    if (!document) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    const fileName = document.name.replace(/["\\\r\n]/g, '');
    return new NextResponse(new Uint8Array(document.bytes), {
      headers: {
        'Content-Type': document.contentType,
        'Content-Length': String(document.size),
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const denied = tenantErrorResponse(error);
    if (denied) return denied;
    console.error('Error loading document:', error);
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
  }
}
