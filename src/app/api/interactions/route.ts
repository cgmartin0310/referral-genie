import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';
import { executeWithRetry } from '../../../lib/db-helpers';

// GET all interactions
export async function GET(request: NextRequest) {
  try {
    // Check for query parameters
    const searchParams = request.nextUrl.searchParams;
    const referralSourceId = searchParams.get('referralSourceId');

    // Build the where clause based on query parameters
    const where: any = {};
    if (referralSourceId) {
      where.referralSourceId = referralSourceId;
    }

    // Get all interactions
    const interactions = await executeWithRetry(() =>
      prisma.interaction.findMany({
        where,
        include: {
          referralSource: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          date: 'desc',
        },
      })
    );

    return NextResponse.json(interactions);
  } catch (error) {
    console.error('Error fetching interactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interactions' },
      { status: 500 }
    );
  }
}

// POST a new interaction
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    // Validate required fields
    if (!data.referralSourceId) {
      return NextResponse.json(
        { error: 'Referral source ID is required' },
        { status: 400 }
      );
    }

    if (!data.type) {
      return NextResponse.json(
        { error: 'Interaction type is required' },
        { status: 400 }
      );
    }

    if (!data.date) {
      return NextResponse.json(
        { error: 'Interaction date is required' },
        { status: 400 }
      );
    }

    // Create the interaction
    const interaction = await executeWithRetry(() =>
      prisma.interaction.create({
        data: {
          referralSourceId: data.referralSourceId,
          type: data.type,
          date: new Date(data.date),
          notes: data.notes || null,
          outcome: data.outcome || null,
        },
        include: {
          referralSource: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })
    );

    return NextResponse.json(interaction);
  } catch (error) {
    console.error('Error creating interaction:', error);
    return NextResponse.json(
      { error: 'Failed to create interaction' },
      { status: 500 }
    );
  }
} 