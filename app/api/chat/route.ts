import { GoogleGenAI } from '@google/genai';
import { fallbackHandbookTree } from '@/lib/handbook';
import { flattenToSections, findRelevantSections } from '@/lib/search';

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const allSections = flattenToSections(fallbackHandbookTree);

const SYSTEM_INSTRUCTION = `You are the Fine Airport Parking AI Assistant. Your goal is to answer employee questions accurately and professionally based ONLY on the provided handbook text.

STRICT RULES:
1. Only answer based on the provided handbook text. Each message includes freshly retrieved "Relevant Handbook Sections" - always prioritize these over prior conversation context.
2. If the user switches topics (e.g., from bereavement to PTO), answer the NEW topic using the newly provided handbook sections. Do not carry over assumptions from the previous topic.
3. If the answer is not in the provided text, say: 'I cannot find that specific policy in the handbook. Please contact HR for clarification.'
4. Use a helpful, corporate tone.
5. Do not make up policies or benefits.
6. Never use the em dash (—) in your responses. Use a standard hyphen (-) if needed.
7. At the end of your response, you MUST provide the source heading in this exact format: [[SOURCE: Heading Name]].`;

type SessionEntry = {
  history: { role: 'user' | 'model'; parts: { text: string }[] }[];
  timeout: ReturnType<typeof setTimeout>;
  turnCount: number;
};

const sessions = new Map<string, SessionEntry>();
const MAX_SESSIONS = 100;
const MAX_TURNS = 20;
const SESSION_TTL = 10 * 60 * 1000;

function getOrCreateSession(sessionId: string): SessionEntry {
  let entry = sessions.get(sessionId);
  if (entry) {
    clearTimeout(entry.timeout);
    entry.timeout = setTimeout(() => sessions.delete(sessionId), SESSION_TTL);
    return entry;
  }

  if (sessions.size >= MAX_SESSIONS) {
    const oldestKey = sessions.keys().next().value;
    if (oldestKey) {
      const old = sessions.get(oldestKey);
      if (old) clearTimeout(old.timeout);
      sessions.delete(oldestKey);
    }
  }

  entry = {
    history: [],
    timeout: setTimeout(() => sessions.delete(sessionId), SESSION_TTL),
    turnCount: 0,
  };
  sessions.set(sessionId, entry);
  return entry;
}

export async function POST(request: Request) {
  if (!ai) {
    return Response.json(
      { error: 'The AI Assistant is not configured. Please ensure the Gemini API key is set.' },
      { status: 500 }
    );
  }

  let body: { message?: string; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { message, sessionId } = body;
  if (!message || typeof message !== 'string' || !sessionId || typeof sessionId !== 'string') {
    return Response.json({ error: 'Missing message or sessionId' }, { status: 400 });
  }

  let session = getOrCreateSession(sessionId);

  if (session.turnCount >= MAX_TURNS) {
    clearTimeout(session.timeout);
    sessions.delete(sessionId);
    session = getOrCreateSession(sessionId);
  }

  const relevantSections = findRelevantSections(message, allSections);
  const contextText = relevantSections
    .map(s => `Heading: ${s.path}\nContent: ${s.content}`)
    .join('\n\n');

  const contextualPrompt = `Relevant Handbook Sections:\n${contextText}\n\nUser Question: ${message}`;

  // Store only the raw user question in history (not the bulky context)
  session.history.push({ role: 'user', parts: [{ text: message }] });
  session.turnCount++;

  // Build the contents array: past history + current turn with context injected
  const contents = [
    ...session.history.slice(0, -1),
    { role: 'user' as const, parts: [{ text: contextualPrompt }] },
  ];

  try {
    const stream = await ai.models.generateContentStream({
      model: 'gemini-3.1-flash-lite-preview',
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    const encoder = new TextEncoder();
    let fullResponse = '';

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.text;
            if (text) {
              fullResponse += text;
              controller.enqueue(encoder.encode(text));
            }
          }
          session.history.push({ role: 'model', parts: [{ text: fullResponse }] });
          controller.close();
        } catch (err: any) {
          if (fullResponse) {
            session.history.push({ role: 'model', parts: [{ text: fullResponse }] });
          }
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (err: any) {
    session.history.pop();
    session.turnCount--;

    const errMessage = err?.message || 'Unknown error';
    if (errMessage.includes('429') || errMessage.includes('RESOURCE_EXHAUSTED')) {
      return Response.json(
        { error: 'The assistant is temporarily busy. Please wait a moment and try again.' },
        { status: 429 }
      );
    }
    console.error('Gemini API error:', errMessage);
    return Response.json(
      { error: 'Something went wrong. Please try your question again.' },
      { status: 500 }
    );
  }
}
