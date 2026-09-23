import { NextRequest, NextResponse } from 'next/server';
import { optOutLine } from '@/lib/fax/opt-out';
import { loadFaxSettings, saveFaxSettings } from '@/lib/fax/settings';

export const dynamic = 'force-dynamic';

/** The sender and opt-out numbers printed on every campaign fax page, and the line they make. */
export async function GET() {
  try {
    const settings = await loadFaxSettings();
    return NextResponse.json({ settings, line: optOutLine(settings) });
  } catch (error) {
    console.error('Error loading fax settings:', error);
    return NextResponse.json({ error: 'Failed to load the fax settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const settings = await saveFaxSettings(await request.json());
    return NextResponse.json({ settings, line: optOutLine(settings) });
  } catch (error) {
    console.error('Error saving fax settings:', error);
    return NextResponse.json({ error: 'Failed to save the fax settings' }, { status: 500 });
  }
}
