import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET all clinic locations
export async function GET() {
  try {
    const clinicLocations = await prisma.clinicLocation.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        _count: {
          select: { referralSources: true }
        }
      }
    });

    return NextResponse.json(clinicLocations);
  } catch (error) {
    console.error('Error fetching clinic locations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinic locations' },
      { status: 500 }
    );
  }
}

// POST - Create new clinic location
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    // Validate required fields
    if (!data.name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // Check if name already exists
    const existing = await prisma.clinicLocation.findUnique({
      where: { name: data.name }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A clinic location with this name already exists' },
        { status: 400 }
      );
    }

    const clinicLocation = await prisma.clinicLocation.create({
      data: {
        name: data.name,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zipCode: data.zipCode || null,
        phoneNumber: data.phoneNumber || null,
        faxNumber: data.faxNumber || null,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
    });

    return NextResponse.json(clinicLocation, { status: 201 });
  } catch (error) {
    console.error('Error creating clinic location:', error);
    return NextResponse.json(
      { error: 'Failed to create clinic location' },
      { status: 500 }
    );
  }
}
