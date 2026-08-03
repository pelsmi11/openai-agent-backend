# openai-agent-backend

Backend en Node.js/TypeScript para "Hector", un agente que responde preguntas sobre la experiencia laboral y el perfil profesional de Héctor usando búsqueda semántica estructurada sobre Postgres (`pgvector`).

## Qué hace hoy

- **`POST /admin/personal-info`**: guarda un texto (con su categoría) sobre Héctor. Se genera un embedding vía el Vercel AI Gateway y se guarda en la tabla `personal_info` (columna `vector`).
- **`GET /admin/search-personal-info`**: búsqueda semántica directa sobre esa tabla (útil para probar la búsqueda sin pasar por el agente).
- **`POST /booking/ask-to-hector`**: clasifica la intención, descompone preguntas compuestas y busca evidencia independiente para cada parte. La agenda solo se activa ante una solicitud explícita.
  - Body: `{ "message": string, "conversationId"?: string }` (`message` admite 1–2000 caracteres y `conversationId` debe ser UUID).
  - Conserva `reply` y `conversationId`; también devuelve `answerParts` con estado y claims, y `sources` con ID, categoría, similitud y las subpreguntas relacionadas.
  - `POST /booking/ask-to-hector/stream` conserva eventos `{ token }`; el evento final incluye `answerParts` y `sources`.

## Cómo correrlo

```bash
pnpm install
cp .env.example .env   # completar las variables necesarias
pnpm dev                # tsx watch — desarrollo
pnpm build && pnpm start  # compila a dist/ y corre el build
```

## Variables de entorno

Ver `.env.example` para la lista completa. Resumen de qué es cada grupo:

- `DATABASE_URL` — Postgres (pgvector para la búsqueda semántica, y también donde LangGraph guarda el historial de conversación vía `PostgresSaver`, en tablas propias que crea solo al arrancar).
- `AI_GATEWAY_API_KEY`, `AI_GATEWAY_CHAT_MODEL`, `AI_GATEWAY_EMBEDDING_MODEL`, `AI_GATEWAY_BASE_URL` — modelo de chat y de embeddings, servidos por el [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) (endpoint compatible con la API de OpenAI). Cambiar de modelo o de proveedor es cambiar estas variables, no código. Defaults: `openai/gpt-4o-mini` para chat y `openai/text-embedding-3-small` para embeddings (el más barato del catálogo que no requiere migrar la columna `VECTOR(1536)` existente).
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — correo de confirmación de la reunión, mandado desde el dominio propio verificado en Resend (`RESEND_FROM_EMAIL` tiene que ser una dirección de ese dominio, ej. `hector@hectormartinezmoreira.com`).
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID` — service account de Google Cloud con acceso al Google Calendar de Héctor (compartir el calendario con el email de la service account, permiso "Hacer cambios en los eventos"). `GOOGLE_CALENDAR_ID` es el email/calendario de Héctor.

## Base de datos

`sql/tables_agent.sql` es la fuente de verdad del esquema propio del proyecto. La búsqueda usa distancia coseno con un índice HNSW `vector_cosine_ops` y `search_personal_info(query_embedding, min_similarity, match_count)`. La migración incremental está en `sql/migrations/001_cosine_similarity_search.sql`; debe ejecutarse fuera de una transacción por el uso de `CONCURRENTLY`.

## Arquitectura del agente

- **Orquestación**: LangGraph.js (`src/feature/booking/agent-graph.ts`). El flujo clasifica la intención y, para perfil profesional, descompone → recupera en paralelo con `Send` → sintetiza → valida fuentes. Las preguntas sin evidencia se marcan `not_documented`. Las reuniones conservan su tool existente, pero solo ante intención explícita.
- **Persistencia**: `PostgresSaver` de LangGraph, sobre el mismo `DATABASE_URL`. El `conversationId` que devuelve `POST /booking/ask-to-hector` es el `thread_id` del grafo.
- **Tools** (`src/feature/booking/agent-tools.ts`): `searchPersonalInfo` (RAG sobre `personal_info`) y `scheduleMeeting` (agenda + email; solo se llama cuando el modelo ya tiene el email y el horario, se los pide al usuario en texto si faltan). El evento de Calendar se crea sin agregar al interesado como *attendee* — una service account no puede invitar asistentes sin Domain-Wide Delegation (solo existe en Google Workspace, no en un Gmail personal), así que el aviso a esa persona va únicamente por Resend (con el link de Meet incluido en el correo).
- **Patrón Adapter**: `EmailSender` (`src/lib/email/`) y `CalendarScheduler` (`src/lib/calendar/`) son interfaces propias; `ResendEmailSender` y `GoogleCalendarScheduler` son sus implementaciones concretas. Las tools dependen de la interfaz, no del SDK de cada proveedor — cambiar de proveedor de correo o de calendario es escribir una clase nueva, no tocar las tools. El modelo de IA no tiene un adapter propio: el Vercel AI Gateway ya cumple ese rol (cambiar de proveedor/modelo es cambiar una variable de entorno), y `ChatOpenAI`/`OpenAIEmbeddings` de `@langchain/openai` (apuntando al Gateway) ya son en sí mismas clases adapter de LangChain.

## Despliegue

Sin definir todavía (no es Vercel).

## Verificación y evaluaciones

```bash
pnpm test                 # unitarias y contrato HTTP/SSE
pnpm test:integration     # controladores HTTP/SSE
pnpm eval:calibrate       # barre similitud 0.50–0.90 y genera calibration-report.json
pnpm dev                  # backend en localhost:3000
pnpm eval:rag             # 40 casos fijos contra el backend local
pnpm build
```

La calibración actual seleccionó `min_similarity = 0.625` con `recall@5 >= 0.90`. Cuando el camino estricto no encuentra respuesta, el agente realiza una única recuperación acotada hasta `0.50`, con filtros por categoría, y vuelve a validar que cada claim esté respaldado.
