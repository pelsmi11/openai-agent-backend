# openai-agent-backend

Backend en Node.js/TypeScript para "Hector", un agente que responde preguntas sobre la experiencia laboral y el perfil profesional de Héctor usando búsqueda semántica sobre Postgres (`pgvector`), y que ofrece proactivamente agendar una entrevista cuando la conversación crece.

## Qué hace hoy

- **`POST /admin/personal-info`**: guarda un texto (con su categoría) sobre Héctor. Se genera un embedding vía el Vercel AI Gateway y se guarda en la tabla `personal_info` (columna `vector`).
- **`GET /admin/search-personal-info`**: búsqueda semántica directa sobre esa tabla (útil para probar la búsqueda sin pasar por el agente).
- **`POST /booking/ask-to-hector`**: el agente "Hector" (LangGraph.js) responde preguntas sobre Héctor, y a partir del quinto mensaje del usuario le ofrece contactar a Héctor por una oportunidad laboral. Si acepta, agenda una reunión: crea el evento en el Google Calendar de Héctor (con Google Meet) y manda confirmación por correo desde el dominio propio (Resend).
  - Body: `{ "message": string, "conversationId"?: string }`. La respuesta incluye `conversationId` — reenvialo en los siguientes mensajes para continuar la misma conversación (el historial se persiste en Postgres, sobrevive a un restart del server).

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

`sql/tables_agent.sql` es la fuente de verdad del esquema propio del proyecto: la tabla `personal_info` (con columna `VECTOR(1536)` e índice HNSW) y la función SQL `match_personal_info(query_embedding, match_threshold, match_count)`, que consultan tanto el endpoint de admin como la tool del agente. Las tablas de `checkpoint*` que aparecen en la misma base son de LangGraph (`PostgresSaver`), se crean y manejan solas.

## Arquitectura del agente

- **Orquestación**: LangGraph.js (`src/feature/booking/agent-graph.ts`). Grafo mínimo de 2 nodos tipo ReAct: `agent` (llama al modelo con las tools disponibles) → si pidió usar una tool, pasa por `tools` (`ToolNode`) y vuelve a `agent`; si no, termina. El conteo de mensajes del usuario se cuenta directamente sobre el historial (no hay un contador separado) — al llegar a 5, el nodo `agent` le agrega una instrucción extra al system prompt pidiéndole que ofrezca la reunión.
- **Persistencia**: `PostgresSaver` de LangGraph, sobre el mismo `DATABASE_URL`. El `conversationId` que devuelve `POST /booking/ask-to-hector` es el `thread_id` del grafo.
- **Tools** (`src/feature/booking/agent-tools.ts`): `searchPersonalInfo` (RAG sobre `personal_info`) y `scheduleMeeting` (agenda + email; solo se llama cuando el modelo ya tiene el email y el horario, se los pide al usuario en texto si faltan). El evento de Calendar se crea sin agregar al interesado como *attendee* — una service account no puede invitar asistentes sin Domain-Wide Delegation (solo existe en Google Workspace, no en un Gmail personal), así que el aviso a esa persona va únicamente por Resend (con el link de Meet incluido en el correo).
- **Patrón Adapter**: `EmailSender` (`src/lib/email/`) y `CalendarScheduler` (`src/lib/calendar/`) son interfaces propias; `ResendEmailSender` y `GoogleCalendarScheduler` son sus implementaciones concretas. Las tools dependen de la interfaz, no del SDK de cada proveedor — cambiar de proveedor de correo o de calendario es escribir una clase nueva, no tocar las tools. El modelo de IA no tiene un adapter propio: el Vercel AI Gateway ya cumple ese rol (cambiar de proveedor/modelo es cambiar una variable de entorno), y `ChatOpenAI`/`OpenAIEmbeddings` de `@langchain/openai` (apuntando al Gateway) ya son en sí mismas clases adapter de LangChain.

## Despliegue

Sin definir todavía (no es Vercel).
