import { addApiLog } from './db';

// Cost per 1M tokens in USD
interface ModelRate {
  input: number;
  output: number;
}

const MODEL_RATES: Record<string, ModelRate> = {
  'openai/gpt-4o': { input: 5.00, output: 15.00 },
  'anthropic/claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'google/gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'meta/llama-3.1-70b-instruct': { input: 0.60, output: 0.60 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
  'deepseek/deepseek-chat': { input: 0.14, output: 0.28 },
  'ai21/jamba-1-5-large-v1': { input: 2.00, output: 8.00 }
};

export async function callMeshApi(
  model: string,
  messages: { role: string; content: string }[],
  action: string,
  options: { response_format?: { type: 'json_object' }; temperature?: number } = {}
): Promise<string> {
  const apiKey = process.env.MESH_API_KEY;
  if (!apiKey) {
    throw new Error('MESH_API_KEY environment variable is not configured');
  }

  const startTime = Date.now();
  const requestPayload = {
    model,
    messages,
    temperature: options.temperature ?? 0.2,
    ...(options.response_format ? { response_format: options.response_format } : {})
  };

  try {
    const response = await fetch('https://api.meshapi.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const text = await response.text();
      let parsedError;
      try {
        parsedError = JSON.parse(text);
      } catch {
        parsedError = text;
      }

      // Log failure
      addApiLog({
        model,
        action: `${action} (Failed)`,
        durationMs,
        requestPayload,
        responsePayload: parsedError,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0
      });

      throw new Error(`Mesh API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    const messageContent = data.choices?.[0]?.message?.content || '';

    // Extract token metrics
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;

    // Calculate cost
    const rates = MODEL_RATES[model] || { input: 1.0, output: 3.0 }; // Default fallbacks
    const cost = ((promptTokens * rates.input) + (completionTokens * rates.output)) / 1_000_000;

    // Log success
    addApiLog({
      model,
      action,
      durationMs,
      requestPayload,
      responsePayload: data,
      promptTokens,
      completionTokens,
      cost
    });

    return messageContent;
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    // Log exception
    addApiLog({
      model,
      action: `${action} (Exception)`,
      durationMs,
      requestPayload,
      responsePayload: { error: error.message || String(error) },
      promptTokens: 0,
      completionTokens: 0,
      cost: 0
    });
    throw error;
  }
}
