import { NextRequest, NextResponse } from 'next/server';
import { getApiLogs } from '@/lib/db';
import { callMeshApi } from '@/lib/mesh';

export async function GET() {
  try {
    const logs = getApiLogs();
    return NextResponse.json(logs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { model, messages, action } = body;

    if (!model || !messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Missing required parameters: model, messages' },
        { status: 400 }
      );
    }

    const responseText = await callMeshApi(
      model,
      messages,
      action || 'Client Request',
      { temperature: body.temperature }
    );

    return NextResponse.json({ content: responseText });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
