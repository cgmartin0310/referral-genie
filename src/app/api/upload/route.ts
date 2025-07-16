import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Get file extension
    const filename = file.name;
    const extension = filename.split('.').pop() || '';
    
    // Create unique filename
    const uniqueFilename = `${uuidv4()}.${extension}`;
    
    // Create a path to save the file
    const uploadsDir = join(process.cwd(), 'public', 'uploads');
    const filePath = join(uploadsDir, uniqueFilename);
    
    // Read file bytes
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Save the file
    await writeFile(filePath, buffer);
    
    // Return the URL path that can be used to access the file
    const fileUrl = `/uploads/${uniqueFilename}`;

    return NextResponse.json({ 
      success: true,
      url: fileUrl,
      originalName: filename
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
} 