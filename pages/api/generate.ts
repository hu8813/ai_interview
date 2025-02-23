export const config = {
  runtime: "edge",
};

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 5000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class StreamError extends Error {
  constructor(message: string, public readonly status: number = 500) {
    super(message);
    this.name = 'StreamError';
  }
}

async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  retries = MAX_RETRIES, 
  delay = INITIAL_RETRY_DELAY
): Promise<Response> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new StreamError(`HTTP error! status: ${response.status} ${errorText}`, response.status);
    }

    return response;
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying request. Attempts remaining: ${retries}`);
      const nextDelay = Math.min(delay * 2, MAX_RETRY_DELAY);
      await sleep(delay);
      return fetchWithRetry(url, options, retries - 1, nextDelay);
    }
    throw error;
  }
}

function createParser() {
  let buffer = '';
  const decoder = new TextDecoder();
  
  return function parse(chunk: Uint8Array) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    const result: string[] = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;
      
      if (trimmedLine.startsWith('data: ')) {
        try {
          const data = JSON.parse(trimmedLine.slice(6));
          if (data.choices?.[0]?.delta?.content) {
            result.push(data.choices[0].delta.content);
          }
        } catch (e) {
          console.warn('Parse error for line:', trimmedLine);
        }
      }
    }
    
    return result;
  };
}

const handler = async (req: Request): Promise<Response> => {
  try {
    const { prompt } = (await req.json()) as {
      prompt?: string;
    };

    if (!prompt) {
      throw new StreamError('No prompt in the request', 400);
    }

    const payload = {
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
      messages: [
        {
          role: "system",
          content:
            "You are a tech hiring manager. You are to only provide feedback on the interview candidate's transcript. If it is not relevant and does not answer the question, make sure to say that. Do not be overly verbose and focus on the candidate's response.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      max_tokens: 1500,
      stream: true,
      n: 1,
    };

    const response = await fetchWithRetry(
      `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': process.env.AZURE_OPENAI_API_KEY!,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(payload),
      }
    );

    const parser = createParser();
    const encoder = new TextEncoder();

    const transformStream = new TransformStream({
      transform(chunk: Uint8Array, controller) {
        try {
          if (chunk.length === 0) return;
          
          const parsed = parser(chunk);
          for (const text of parsed) {
            controller.enqueue(encoder.encode(text));
          }
        } catch (error) {
          console.error('Transform error:', error);
          controller.error(error);
        }
      }
    });

    return new Response(
      response.body?.pipeThrough(transformStream),
      {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Content-Type-Options': 'nosniff',
          'Transfer-Encoding': 'chunked',
        },
      }
    );

  } catch (error) {
    console.error("Error in handler:", error);
    
    const statusCode = error instanceof StreamError ? error.status : 500;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({ 
        error: "Error generating response", 
        details: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      { 
        status: statusCode,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        }
      }
    );
  }
};

export default handler;