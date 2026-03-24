# Chatbot Performance Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce chatbot response latency by ~90% through keyword-based section filtering, server-side API route, and chat session management.

**Architecture:** Client sends questions to a Next.js API route. The route filters the handbook to the top 5 relevant sections using keyword matching, sends those to Gemini via a cached chat session, and streams the response back. No new dependencies.

**Tech Stack:** Next.js 15 (API routes), @google/genai SDK, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-24-chatbot-performance-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `lib/search.ts` | Keyword relevance filter + synonym map |
| Create | `app/api/chat/route.ts` | Server-side Gemini API route with session management |
| Modify | `components/SearchExpert.tsx` | Remove Gemini client, use fetch to API route |
| Modify | `app/page.tsx` | Remove `handbookData` prop from SearchExpert |
| Modify | `.env` / `.env.local` | Rename `NEXT_PUBLIC_GEMINI_API_KEY` to `GEMINI_API_KEY` |

---

### Task 1: Create the keyword relevance filter (`lib/search.ts`)

**Files:**
- Create: `lib/search.ts`
- Reference: `lib/handbook.ts` (for `flattenHandbook` and `HandbookNode`)

- [ ] **Step 1: Create `lib/search.ts` with types and synonym map**

```ts
import { flattenHandbook, HandbookNode } from './handbook';

export type HandbookSection = {
  title: string;
  path: string;
  content: string;
};

const SYNONYM_MAP: Record<string, string[]> = {
  fired: ['termination', 'terminate', 'terminated', 'dismissal'],
  quit: ['resignation', 'resign', 'voluntary termination'],
  pto: ['paid time off', 'vacation', 'leave', 'time off', 'personal day'],
  hurt: ['injury', 'workers comp', 'accident', 'incident'],
  pay: ['compensation', 'wages', 'salary', 'payroll', 'paycheck'],
  schedule: ['shift', 'hours', 'work hours', 'overtime'],
  benefits: ['insurance', 'health', 'dental', 'vision', '401k'],
  dress: ['uniform', 'appearance', 'dress code', 'attire'],
  phone: ['cell phone', 'mobile', 'personal device', 'electronic'],
  drug: ['substance', 'alcohol', 'marijuana', 'testing', 'screening'],
  harassment: ['sexual harassment', 'hostile', 'discrimination', 'complaint'],
  parking: ['vehicle', 'lot', 'garage', 'valet'],
  training: ['orientation', 'onboarding', 'introductory'],
  discipline: ['corrective action', 'warning', 'write up', 'writeup'],
  break: ['meal', 'lunch', 'rest period'],
};
```

- [ ] **Step 2: Add the `flattenToSections` helper**

This converts `HandbookNode[]` into `HandbookSection[]`, preserving the leaf node's `title` separately from the breadcrumb `path`.

```ts
export function flattenToSections(nodes: HandbookNode[], pathParts: string[] = []): HandbookSection[] {
  const result: HandbookSection[] = [];
  for (const node of nodes) {
    const currentPath = [...pathParts, node.title];
    if (node.content) {
      result.push({
        title: node.title,
        path: currentPath.join(' > '),
        content: node.content,
      });
    }
    if (node.children) {
      result.push(...flattenToSections(node.children, currentPath));
    }
  }
  return result;
}
```

- [ ] **Step 3: Add the `findRelevantSections` function**

```ts
function expandQueryTerms(query: string): string[] {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const expanded = new Set(terms);
  for (const term of terms) {
    // Check if this term is a key in the synonym map
    if (SYNONYM_MAP[term]) {
      for (const syn of SYNONYM_MAP[term]) {
        expanded.add(syn);
      }
    }
    // Check if this term appears in any synonym list
    for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
      if (synonyms.some(s => s.includes(term) || term.includes(s))) {
        expanded.add(key);
        for (const syn of synonyms) {
          expanded.add(syn);
        }
      }
    }
  }
  return [...expanded];
}

export function findRelevantSections(query: string, sections: HandbookSection[]): HandbookSection[] {
  const terms = expandQueryTerms(query);

  const scored = sections.map(section => {
    const titleLower = section.title.toLowerCase();
    const contentLower = section.content.toLowerCase();
    let score = 0;

    for (const term of terms) {
      if (titleLower.includes(term)) score += 3;
      if (contentLower.includes(term)) score += 1;
    }

    return { section, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const topScore = scored[0]?.score ?? 0;

  // Fallback: if best match is weak, widen the results
  const count = topScore < 2 ? 8 : 5;

  return scored.slice(0, count).filter(s => s.score > 0).map(s => s.section);
}
```

- [ ] **Step 4: Verify the file compiles**

Run: `npx tsc --noEmit lib/search.ts` or just check for IDE errors.

- [ ] **Step 5: Commit**

```bash
git add lib/search.ts
git commit -m "feat: add keyword relevance filter for handbook sections"
```

---

### Task 2: Create the API route (`app/api/chat/route.ts`)

**Files:**
- Create: `app/api/chat/route.ts`
- Reference: `lib/search.ts`, `lib/handbook.ts`

- [ ] **Step 1: Create the route file with client setup and session management**

```ts
import { GoogleGenAI } from '@google/genai';
import { fallbackHandbookTree } from '@/lib/handbook';
import { flattenToSections, findRelevantSections, HandbookSection } from '@/lib/search';

const apiKey = process.env.GEMINI_API_KEY;

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const allSections = flattenToSections(fallbackHandbookTree);

const SYSTEM_INSTRUCTION = `You are the Fine Airport Parking AI Assistant. Your goal is to answer employee questions accurately and professionally based ONLY on the provided handbook text.

STRICT RULES:
1. Only answer based on the provided handbook text.
2. If the answer is not in the text, say: 'I cannot find that specific policy in the handbook. Please contact HR for clarification.'
3. Use a helpful, corporate tone.
4. Do not make up policies or benefits.
5. Never use the em dash (—) in your responses. Use a standard hyphen (-) if needed.
6. At the end of your response, you MUST provide the source heading in this exact format: [[SOURCE: Heading Name]].`;

type SessionEntry = {
  history: { role: 'user' | 'model'; parts: { text: string }[] }[];
  timeout: ReturnType<typeof setTimeout>;
  turnCount: number;
};

const sessions = new Map<string, SessionEntry>();
const MAX_SESSIONS = 100;
const MAX_TURNS = 20;
const SESSION_TTL = 10 * 60 * 1000; // 10 minutes

function getOrCreateSession(sessionId: string): SessionEntry {
  let entry = sessions.get(sessionId);
  if (entry) {
    clearTimeout(entry.timeout);
    entry.timeout = setTimeout(() => sessions.delete(sessionId), SESSION_TTL);
    return entry;
  }

  // Evict oldest if at capacity
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
```

- [ ] **Step 2: Add the POST handler with streaming**

```ts
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

  // Reset session if turn limit exceeded
  if (session.turnCount >= MAX_TURNS) {
    clearTimeout(session.timeout);
    sessions.delete(sessionId);
    session = getOrCreateSession(sessionId);
  }

  const relevantSections = findRelevantSections(message, allSections);
  const contextText = relevantSections
    .map(s => `Heading: ${s.path}\nContent: ${s.content}`)
    .join('\n\n');

  const userContent = `Relevant Handbook Sections:\n${contextText}\n\nUser Question: ${message}`;

  session.history.push({ role: 'user', parts: [{ text: userContent }] });
  session.turnCount++;

  try {
    const stream = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: session.history,
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
          // Save assistant response to history
          session.history.push({ role: 'model', parts: [{ text: fullResponse }] });
          controller.close();
        } catch (err: any) {
          // Save partial response if any
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
    // Remove the failed user message from history
    session.history.pop();
    session.turnCount--;

    const errMessage = err?.message || 'Unknown error';
    if (errMessage.includes('429') || errMessage.includes('RESOURCE_EXHAUSTED')) {
      return Response.json(
        { error: 'The AI Assistant has reached its rate limit. Please wait a moment and try again.' },
        { status: 429 }
      );
    }
    return Response.json({ error: `AI Error: ${errMessage}` }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify the file compiles**

Check for IDE/TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat: add server-side chat API route with session management"
```

---

### Task 3: Update `SearchExpert.tsx` to use the API route

**Files:**
- Modify: `components/SearchExpert.tsx`

- [ ] **Step 1: Replace imports and remove Gemini-related code**

Remove these imports:
```ts
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { flattenHandbook, HandbookNode } from '@/lib/handbook';
```

Remove the `handbookData` prop and `handbookContext` useMemo. The component signature becomes:

```ts
export function SearchExpert({
  onSourceClick
}: {
  onSourceClick: (source: string) => void
}) {
```

- [ ] **Step 2: Add session ID ref and reset on inactivity**

Add after the existing refs:

```ts
const sessionIdRef = useRef(crypto.randomUUID());
```

Also, inside the existing inactivity timeout callback (the `setTimeout` that resets messages after 10 minutes), add a session ID reset so the server session is not reused with stale history:

```ts
timeout = setTimeout(() => {
  setMessages([initialMessage]);
  sessionIdRef.current = crypto.randomUUID(); // reset server session
}, 10 * 60 * 1000);
```

- [ ] **Step 3: Replace `handleSubmit` internals**

Replace everything inside the `try` block of `handleSubmit` with:

```ts
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: userMsg,
    sessionId: sessionIdRef.current,
  }),
});

if (!response.ok) {
  const err = await response.json().catch(() => ({ error: 'Unknown error' }));
  throw new Error(err.error || `HTTP ${response.status}`);
}

const reader = response.body?.getReader();
if (!reader) throw new Error('No response stream');

const decoder = new TextDecoder();
let fullText = '';
const aiMsgId = Date.now().toString();

// Add initial empty AI message
setMessages(prev => [...prev, { id: aiMsgId, role: 'ai', content: '' }]);

let isFirstChunk = true;

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  if (isFirstChunk) {
    setIsLoading(false);
    isFirstChunk = false;
  }

  const text = decoder.decode(value, { stream: true });
  fullText += text;

  let displayContent = fullText;
  let source = '';

  const sourceMatch = fullText.match(/\[\[SOURCE:\s*(.*?)\]\]/);
  if (sourceMatch) {
    displayContent = fullText.replace(sourceMatch[0], '').trim();
    source = sourceMatch[1].trim();
  }

  setMessages(prev => prev.map(m =>
    m.id === aiMsgId
      ? { ...m, content: displayContent, source: source || m.source }
      : m
  ));
}
```

- [ ] **Step 4: Simplify error handling in the catch block**

Replace the existing catch block with:

```ts
} catch (error: any) {
  console.error('Error calling chat API:', error);
  const errorMessage = error.message || 'Sorry, I encountered an error while searching the handbook. Please try again.';

  setMessages(prev => [...prev, {
    id: Date.now().toString(),
    role: 'ai',
    content: errorMessage
  }]);
} finally {
  setIsLoading(false);
}
```

- [ ] **Step 5: Remove the `handbookContext` check**

Delete these lines from handleSubmit (they were checking handbook loading, now unnecessary):

```ts
if (!handbookContext || handbookContext.length < 10) {
  throw new Error('HANDBOOK_NOT_LOADED');
}
```

And remove the `MISSING_API_KEY` and `HANDBOOK_NOT_LOADED` error cases from the catch block (API key is now server-side).

- [ ] **Step 6: Commit**

```bash
git add components/SearchExpert.tsx
git commit -m "refactor: SearchExpert uses API route instead of direct Gemini calls"
```

---

### Task 4: Update `page.tsx` and environment variable

**Files:**
- Modify: `app/page.tsx`
- Modify: `.env.local` (or equivalent)

- [ ] **Step 1: Remove `handbookData` prop from SearchExpert in `page.tsx`**

Change line 134 from:
```tsx
<SearchExpert handbookData={handbookData} onSourceClick={handleSourceClick} />
```
to:
```tsx
<SearchExpert onSourceClick={handleSourceClick} />
```

Keep all other `handbookData` state and logic in `page.tsx` — it's still used by `ManualExplorer` and `handleSourceClick`.

- [ ] **Step 2: Remove unused imports**

Remove `HandbookNode` from the import if it's no longer used directly (check — it's used for `manualPath` state type, so it likely stays). Remove `flattenHandbook` if imported.

- [ ] **Step 3: Rename environment variable**

In `.env.local` (or wherever the key is stored), rename:
```
NEXT_PUBLIC_GEMINI_API_KEY=your-key-here
```
to:
```
GEMINI_API_KEY=your-key-here
```

- [ ] **Step 4: Verify the app builds and runs**

```bash
npm run build
npm run dev
```

Test manually:
1. Open the chatbot
2. Ask "What is the drug testing policy?"
3. Verify streaming response appears
4. Ask a follow-up: "What about alcohol?" — should be faster
5. Switch to Manual Explorer — verify it still works

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx .env.local
git commit -m "chore: wire up SearchExpert to API route, move API key server-side"
```

---

### Task 5: Manual smoke test and cleanup

- [ ] **Step 1: Test edge cases**

Try these queries manually:
- Vague query: "What happens if I get hurt?" — should match injury/accident sections
- Synonym test: "Can I get fired?" — should match termination sections
- Cross-cutting: "What are the rules?" — should return widened fallback (8 sections)
- Follow-up in same session: ask two related questions back to back

- [ ] **Step 2: Remove `NEXT_PUBLIC_GEMINI_API_KEY` references**

Search the codebase for any remaining references to the old env var name and remove them.

```bash
grep -r "NEXT_PUBLIC_GEMINI" .
```

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: cleanup old env var references"
```
