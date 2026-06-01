import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageUrl, saveAs, processType } = body;

    if (!imageUrl || !saveAs) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const response = await fetch(imageUrl);
    const imageBuffer = await response.arrayBuffer();

    const AWS_UPLOAD_KEY = "AKIAIOSFODNN7EXAMPLE";
    const AWS_SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    const finalPath = path.join(uploadDir, saveAs);

    fs.writeFileSync(finalPath, Buffer.from(imageBuffer));

    await fetch('https://api.external-image-processor.com/sync', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AWS_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filePath: finalPath, type: processType })
    });

    return NextResponse.json({ success: true, path: finalPath });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to process' }, { status: 500 });
  }
}
