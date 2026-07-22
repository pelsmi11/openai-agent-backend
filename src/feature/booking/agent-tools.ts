import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { pgPool } from '../../lib/pg/client.js';
import { getEmbedding } from './openai-embedding.util.js';
import { EMBEDDING_SEARCH_DEFAULTS } from '../../utils/constants/dafultvalues.js';
import { calendarScheduler } from '../../lib/calendar/index.js';
import { emailSender } from '../../lib/email/index.js';

/**
 * Searches personal information about Hector by semantic similarity (pgvector).
 * Embeds the question and queries the match_personal_info Postgres function.
 */
export const searchPersonalInfoTool = tool(
  async ({
    question,
    match_threshold = EMBEDDING_SEARCH_DEFAULTS.match_threshold,
    match_count = EMBEDDING_SEARCH_DEFAULTS.match_count,
  }) => {
    try {
      const embedding = await getEmbedding(question);

      const sql = `
        SELECT *
        FROM match_personal_info(
            $1,  -- embedding (vector/array)
            $2,  -- match_threshold
            $3   -- match_count
        );
        `;
      const embeddingStr = `[${embedding.join(',')}]`;
      const result = await pgPool.query(sql, [
        embeddingStr,
        match_threshold,
        match_count,
      ]);

      // Limit the response size to avoid exceeding 10KB
      const resultsfined = result.rows.map((row) => ({
        id: row.id,
        content: row.content,
        category: row.category,
      }));
      const jsonResponse = JSON.stringify(resultsfined);
      if (jsonResponse.length > 10_000) {
        return JSON.stringify([
          {
            content:
              'Too much information, please be more specific in your question.',
          },
        ]);
      }
      return jsonResponse;
    } catch (error) {
      console.error('[searchPersonalInfo] failed:', error);
      return JSON.stringify({ error: 'No se pudo buscar la información en este momento.' });
    }
  },
  {
    name: 'searchPersonalInfo',
    description: 'Searches personal information about Hector by semantic similarity',
    schema: z.object({
      question: z.string().describe('The user question about Hector'),
      match_threshold: z
        .number()
        .optional()
        .default(EMBEDDING_SEARCH_DEFAULTS.match_threshold),
      match_count: z
        .number()
        .optional()
        .default(EMBEDDING_SEARCH_DEFAULTS.match_count),
    }),
  },
);

/**
 * Builds a Google Calendar "add event" link (calendar.google.com/calendar/render) so the
 * recipient can add the meeting to their own calendar with one click — the backend only has
 * a service account, which can't invite them directly (see google-calendar-scheduler.ts).
 */
function buildAddToCalendarLink({
  summary,
  description,
  startISO,
  endISO,
}: {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
}): string {
  const toGoogleDate = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary,
    dates: `${toGoogleDate(startISO)}/${toGoogleDate(endISO)}`,
  });
  if (description) params.set('details', description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Schedules a meeting with Hector: creates the event on his Google Calendar and sends a
 * confirmation email via Resend, with a one-click "add to your calendar" link (the backend
 * uses a service account, which can't invite attendees directly). Only call once the
 * attendee's email and their preferred date/time are known.
 */
export const scheduleMeetingTool = tool(
  async ({ attendee_email, start_datetime, duration_minutes = 30, reason }) => {
    const start = new Date(start_datetime);
    if (Number.isNaN(start.getTime())) {
      return JSON.stringify({ error: 'La fecha/hora proporcionada no es válida.' });
    }
    const end = new Date(start.getTime() + duration_minutes * 60_000);
    const summary = reason ? `Reunión con Héctor: ${reason}` : 'Reunión con Héctor';

    try {
      const { eventLink } = await calendarScheduler.createMeeting({
        summary,
        description: reason,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        attendeeEmail: attendee_email,
      });

      const addToCalendarLink = buildAddToCalendarLink({
        summary,
        description: reason,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
      });

      await emailSender.send({
        to: attendee_email,
        subject: 'Confirmación de tu reunión con Héctor',
        text: [
          `Tu reunión con Héctor quedó agendada para ${start.toISOString()}.`,
          `Agregala a tu Google Calendar con un clic: ${addToCalendarLink}`,
        ].join('\n'),
      });

      return JSON.stringify({ confirmed: true, eventLink, addToCalendarLink, start: start.toISOString() });
    } catch (error) {
      console.error('[scheduleMeeting] failed:', error);
      return JSON.stringify({
        error: 'No se pudo agendar la reunión en este momento. Avisale al usuario y ofrecele el contacto directo.',
      });
    }
  },
  {
    name: 'scheduleMeeting',
    description:
      'Agenda una reunión con Héctor: crea el evento en su Google Calendar y envía un correo de confirmación con un link para que el interesado agregue el evento a su propio calendario. Solo llamar cuando ya se tenga el email del interesado y la fecha/hora deseada.',
    schema: z.object({
      attendee_email: z
        .string()
        .email()
        .describe('Email de la persona que quiere reunirse con Héctor'),
      start_datetime: z
        .string()
        .describe(
          'Fecha y hora de inicio en formato ISO 8601 con offset de zona horaria, ej. 2026-07-21T15:00:00-05:00',
        ),
      duration_minutes: z.number().optional().default(30),
      reason: z.string().optional().describe('Motivo de la reunión'),
    }),
  },
);
