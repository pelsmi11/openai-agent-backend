# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install         # install deps (pnpm lockfile is present, use pnpm not npm)
pnpm dev             # tsx watch src/index.ts — dev server with auto-restart, runs .ts directly
pnpm build           # tsc — compiles src/**/*.ts to dist/
pnpm start           # node ./dist/index.js — run the compiled build (run `pnpm build` first)
```

There is no lint or test script configured in `package.json`. There is no test framework in this repo — do not assume `npm test` works. `pnpm build` (tsc, `strict: true`) is the closest thing to a correctness check.

Formatting: `.prettierrc` sets `singleQuote: true, trailingComma: all`. No ESLint config is present.

Known environment quirk: `pnpm build`/`pnpm dev`/`pnpm start` go through pnpm's script runner, which does a deps-status check that fails with `ERR_PNPM_IGNORED_BUILDS` because `prisma`'s (and `esbuild`'s) postinstall scripts are ignored by pnpm's default policy. Running those scripts directly (`node ./dist/index.js`, `npx tsx src/index.ts`, `npx tsc`) works fine and is what was used to verify this migration. Resolving it for good means running `pnpm approve-builds` (executes those postinstall scripts) — don't run that without checking with the user first, since it executes third-party install scripts.

## Architecture

Express 5 backend written in **TypeScript** (ESM — `"type": "module"`, `moduleResolution: "NodeNext"`) that exposes a **LangGraph.js** agent ("Hector") backed by pgvector semantic search over a `personal_info` table, with tools to schedule a meeting on Google Calendar and send a confirmation via SendGrid. Source lives entirely under `src/**/*.ts`; relative imports use `.js` extensions even though the files are `.ts` — that's required by NodeNext resolution (it refers to the emitted output), not a mistake.

**Request flow:** `server.ts` mounts feature routers → `*.routes.ts` → `*.controller.ts` (parses/validates req, calls service, shapes res) → `*.service.ts` (business logic, DB/model calls). Each feature lives in `src/feature/<name>/` and follows this three-file split; keep new features consistent with it.

**Features:**
- `admin` — CRUD/search over `personal_info`: `POST /admin/personal-info` creates an entry (embeds `content` and stores it), `GET /admin/search-personal-info` does semantic search.
- `booking` — `POST /booking/ask-to-hector` (`{ message, conversationId? }`) runs the LangGraph agent defined in `agent-graph.ts` and returns `{ reply, conversationId }`. `conversationId` is the graph's `thread_id`; reusing it continues the same conversation (history persisted in Postgres via `PostgresSaver`, survives restarts — not an in-memory `Map`).

**Model layer — Vercel AI Gateway, no adapter of its own:** `src/lib/ai-gateway/models.ts` builds `chatModel` (`ChatOpenAI`) and `embeddingsModel` (`OpenAIEmbeddings`) from `@langchain/openai`, pointed at the Gateway's OpenAI-compatible endpoint (`CONFIG.AI_GATEWAY_BASE_URL`, default `https://ai-gateway.vercel.sh/v1`) with model ids like `openai/gpt-4o-mini` / `openai/text-embedding-3-small` from `CONFIG.AI_GATEWAY_CHAT_MODEL`/`AI_GATEWAY_EMBEDDING_MODEL`. Swapping the model/provider is an env var change, not a code change — there's deliberately no extra abstraction layer on top of these two exports, since the Gateway + LangChain's own provider classes already are that abstraction.

**Adapter pattern for external providers that DO have a hand-written interface:**
- `src/lib/email/` — `EmailSender` interface, `SendGridEmailSender` implementation, `emailSender` singleton exported from `index.ts`.
- `src/lib/calendar/` — `CalendarScheduler` interface, `GoogleCalendarScheduler` implementation (service account JWT auth, auto-creates a Google Meet link via `conferenceData`), `calendarScheduler` singleton exported from `index.ts`.
- Tools and services depend on these interfaces, never on `@sendgrid/mail`/`googleapis` directly — swapping providers means writing a new class, not touching call sites.

**LangGraph agent (`src/feature/booking/agent-graph.ts`):** a minimal 2-node ReAct graph — `agent` node calls `chatModel.bindTools([...])`, conditional edge (`toolsCondition`) routes to a `tools` node (`ToolNode`) when the model requested a tool call, then back to `agent`; otherwise ends. The 5-user-message trigger is **derived** by counting `HumanMessage`s in the current state on each `agent` invocation (no separate counter field to keep in sync) — past that threshold, the node appends an extra system instruction telling the model to proactively offer scheduling a meeting. `setupAgentGraph()` (called once from `server.ts` before `app.listen`) creates `PostgresSaver`'s checkpoint tables (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`) in the same Postgres DB — idempotent, no manual SQL needed.

**Tools (`src/feature/booking/agent-tools.ts`, LangChain `tool()` from `@langchain/core/tools` — note its signature is `tool(func, { name, description, schema })`, positional func first, different from the old `@openai/agents` `tool({ ..., execute })` shape):**
- `searchPersonalInfoTool` — same RAG logic as before (embed via `embeddingsModel` → `match_personal_info` in Postgres → truncate to 10KB).
- `scheduleMeetingTool` — requires `attendee_email`/`start_datetime` (zod), so the model asks the user for them in plain text before it has enough to call the tool; calls `calendarScheduler.createMeeting()` then `emailSender.send()`.

**Database access is raw SQL via `pg.Pool`** (`src/lib/pg/client.ts`, exported as `pgPool`), not an ORM. A `prisma/schema.prisma` and the `prisma` devDependency exist but **Prisma Client is not used anywhere in the app code** — don't assume `PrismaClient` is wired up.

**Semantic search pattern** (used identically in `admin.service.ts` and `agent-tools.ts`): embed text → format as a `'[...]'` pgvector literal string → call the Postgres function `match_personal_info(embedding, match_threshold, match_count)` (defined in `sql/tables_agent.sql`, uses `<=>` cosine/L2 distance via an HNSW index) → truncate/guard results to stay under a 10KB JSON response. Default thresholds live in `src/utils/constants/dafultvalues.ts` (`EMBEDDING_SEARCH_DEFAULTS`) — note the filename typo, that's the real path.

**Config:** all env vars are read once through `CONFIG` in `src/utils/constants/config.ts` (`DATABASE_URL`, `AI_GATEWAY_*`, `SENDGRID_*`, `GOOGLE_*`, `JWT_SECRET`, `PORT`, `NODE_ENV` — no `OPENAI_API_KEY` anymore, the raw `openai` package and `@openai/agents` were both removed in favor of the Gateway + LangGraph). Use `CONFIG.X`, not `process.env.X` directly, in app code. `pgPool` auto-disables SSL cert verification when `DATABASE_URL` contains `neon.tech`.

**Agent instructions are in Spanish** in `agent-graph.ts` — the DB `content`/`category` data and target users are Spanish-speaking; keep that in mind when touching prompts or responses.

## Database

Schema/migrations are not managed through Prisma in practice — `sql/tables_agent.sql` is the source of truth for the app's own DB objects: the `personal_info` table (with `pgvector` `VECTOR(1536)` column, HNSW index) and the `match_personal_info(query_embedding, match_threshold, match_count)` SQL function that both features query through `pgPool`. The `checkpoint*` tables in the same database belong to LangGraph's `PostgresSaver` and are managed by it, not by app migrations.
