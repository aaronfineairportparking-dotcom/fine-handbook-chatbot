# Chatbot Performance Optimization — Design Spec

## Problem

The chatbot sends the entire flattened handbook (~120KB+) as context with every single message to Gemini. Combined with no conversation history reuse, no server-side processing, and a new client per request, this results in slow response times and an exposed API key.

## Solution Overview

Four changes, all using existing dependencies (Next.js, @google/genai):

1. **Next.js API Route** — move Gemini calls server-side
2. **Keyword Relevance Filter** — send only the top 5 most relevant sections instead of all ~120KB
3. **Chat Session Management** — maintain conversation history server-side
4. **Client Simplification** — SearchExpert.tsx becomes a thin fetch + stream reader

## Deployment Assumption

This design assumes a single long-lived server process (e.g., `next start` or a container). In-memory session storage will not work in serverless/edge deployments. The project already uses `output: 'standalone'` which aligns with this assumption.

## Architecture

```
User Question
    |
    v
SearchExpert.tsx (client)
    |  POST /api/chat { message, sessionId }
    v
app/api/chat/route.ts (server)
    |
    |--> lib/search.ts: keyword filter (query + synonym map -> top 5 sections)
    |--> Gemini chat session (cached per sessionId)
    |
    v
Streaming response back to client
```

## Section 1: API Route (`app/api/chat/route.ts`)

- New server-side POST route
- `GoogleGenAI` client instantiated once at module level
- API key moves from `NEXT_PUBLIC_GEMINI_API_KEY` to `GEMINI_API_KEY` (server-only)
- Receives `{ message: string, sessionId: string }` from client
- Runs keyword filter, calls Gemini, streams response back via `ReadableStream`
- No new dependencies

### Error Handling

- **400** — missing or invalid `message` or `sessionId` fields
- **500** — Gemini API errors (forwarded as JSON `{ error: string }`)
- **429** — rate limit errors from Gemini, forwarded with a user-friendly message
- If the `GEMINI_API_KEY` env var is missing, return 500 with a configuration error message
- Mid-stream errors: close the stream; client detects incomplete response and shows a generic error

## Section 2: Keyword Relevance Filter (`lib/search.ts`)

### Data Type

Define a `HandbookSection` type for the flattened output:

```ts
type HandbookSection = { title: string; path: string; content: string }
```

This is produced by a modified flatten function that preserves the leaf node's `title` separately from the full breadcrumb `path`. The `title` field is used for 3x-weighted title matching; the `path` is used for source attribution.

### Function Signature

```ts
findRelevantSections(query: string, sections: HandbookSection[]): HandbookSection[]
```

### Scoring

- Tokenize query into lowercase terms
- Expand terms through a synonym map (initial set of ~15 entries covering common HR terms like fired/termination, pto/vacation/leave, hurt/injury/accident, pay/compensation/wages, etc.)
- For each section, score = (title term matches * 3) + (content term matches * 1)
- Return the top 5 sections by score
- **Fallback:** if the highest-scoring section has a score below 2, return the top 8 sections instead

### Synonym Map

The initial map should cover ~15 common HR term groups. It can be expanded over time based on observed queries.

## Section 3: Chat Session Management

- Server-side `Map<string, SessionEntry>` keyed by session ID
- **Limits:** maximum 100 concurrent sessions; if full, evict the oldest session. Maximum 20 conversation turns per session; after that, create a fresh session automatically.
- First message: creates session with system instruction + relevant sections as context
- Follow-up messages: relevant sections for the new query are prepended to the user message (e.g., `"Relevant sections:\n...\n\nUser question: ..."`). The system instruction remains fixed from session creation. This ensures topic-shifting questions get fresh context.
- Sessions expire after 10 minutes of inactivity (matching existing client-side timeout). Simple `setTimeout` per session for cleanup.
- **Expired/missing session:** if a `sessionId` is not found in the map (expired or never existed), silently create a new session. No error returned to client.

## Section 4: Client-Side Changes (`SearchExpert.tsx`)

- Remove `GoogleGenAI` import and all direct Gemini calls
- Remove `handbookContext` useMemo
- Remove `handbookData` prop — handbook data is imported server-side
- `handleSubmit` calls `fetch('/api/chat', ...)` with message + sessionId
- Session ID generated once via `crypto.randomUUID()` on mount, stored in `useRef`
- Reads response as streaming `ReadableStream` to preserve typing UX
- Messages state, UI, source parsing, loading states — unchanged

## Changes to `page.tsx`

- `SearchExpert` props simplify to just `onSourceClick`
- `handbookData` state and the live sync feature remain in `page.tsx` for `ManualExplorer` and `handleSourceClick` — only the prop to `SearchExpert` is removed
- The live sync feature does not affect the chatbot; the chatbot always uses the static `fallbackHandbookTree` imported server-side. This is acceptable because the handbook data is baked into the data files and live sync is a secondary feature.

## Expected Impact

- ~90% reduction in input tokens per request (5 sections vs entire handbook)
- Faster time-to-first-token on every request
- Follow-up questions even faster via session reuse
- API key no longer exposed to browser
- Lower API costs
