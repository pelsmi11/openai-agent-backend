import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { pgPool } from '../../lib/pg/client.js';
import { getEmbedding } from './openai-embedding.util.js';
import { EMBEDDING_SEARCH_DEFAULTS } from '../../utils/constants/dafultvalues.js';
import { calendarScheduler } from '../../lib/calendar/index.js';
import { emailSender } from '../../lib/email/index.js';
import { CONFIG } from '../../utils/constants/config.js';

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

function formatMeetingDate(date: Date): string {
  const formatted = date.toLocaleString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
  return `${formatted} (UTC)`;
}

// Brand palette pulled from hectormartinezmoreira.com's own CSS custom properties
// (--color-ui-primary/black/gray-*) and theme-color meta tag, so the email matches the site.
const BRAND = {
  primary: '#e15b5d',
  black: '#191923',
  gray200: '#fcf7ff',
  gray400: '#ecebf3',
  font: "Raleway, Arial, sans-serif",
};

// Site's own favicon mark (safari-pinned-tab.svg), recolored to BRAND.primary and inlined as a
// data URI so it renders without depending on the site being reachable from the email client.
const LEAF_ICON_DATA_URI =
  'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBzdGFuZGFsb25lPSJubyI/Pgo8IURPQ1RZUEUgc3ZnIFBVQkxJQyAiLS8vVzNDLy9EVEQgU1ZHIDIwMDEwOTA0Ly9FTiIKICJodHRwOi8vd3d3LnczLm9yZy9UUi8yMDAxL1JFQy1TVkctMjAwMTA5MDQvRFREL3N2ZzEwLmR0ZCI+CjxzdmcgdmVyc2lvbj0iMS4wIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciCiB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCA0OTIuMDAwMDAwIDQ5Mi4wMDAwMDAiCiBwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJ4TWlkWU1pZCBtZWV0Ij4KPG1ldGFkYXRhPgpDcmVhdGVkIGJ5IHBvdHJhY2UgMS4xNCwgd3JpdHRlbiBieSBQZXRlciBTZWxpbmdlciAyMDAxLTIwMTcKPC9tZXRhZGF0YT4KPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMC4wMDAwMDAsNDkyLjAwMDAwMCkgc2NhbGUoMC4xMDAwMDAsLTAuMTAwMDAwKSIKZmlsbD0iI2UxNWI1ZCIgc3Ryb2tlPSJub25lIj4KPHBhdGggZD0iTTMzNzkgMzY0NSBjLTMxOSAtNTAgLTU3NSAtMTczIC03NzkgLTM3NSAtOTggLTk4IC0xNjggLTE5MSAtMjIxCi0yOTcgbC0zOCAtNzUgMzUgLTYyIGMxMDkgLTE4OSAyMDQgLTQxNyAyMDQgLTQ5MCAwIC0yNSA3IC0xNSAzNSA1MyAxOSA0NiAzNgo4NiAzOSA4OCAyIDIgLTUgMzYgLTE1IDc2IC0zMiAxMjUgLTQzIDI2NCAtMjkgMzU0IDcgNDMgMTMgOTggMTEgMTIyIC0yIDQ5CjExIDcxIDQ0IDcxIDI1IDAgNTUgLTI5IDU1IC01MiAwIC0xOSAtMzIgLTQ4IC01MiAtNDggLTM4IDAgLTUxIC0yMTAgLTIyCi0zNjEgMjIgLTExNyAyNyAtMTIzIDU3IC02MyA0MCA3OSAxMTQgMTcwIDE4NyAyMzEgNzEgNTggMTcyIDE4NCAyMzQgMjkwIDMxCjU0IDM1IDY3IDMwIDEwNiAtNiAzOSAtNCA0NiAxNSA1NyAyNyAxNCA1OCA1IDcyIC0yMSAxNSAtMjggMiAtNTkgLTI5IC03MAotMTkgLTcgLTM4IC0zMSAtNjMgLTc3IC0yMSAtMzcgLTYxIC05OCAtOTAgLTEzNyAtNTIgLTY5IC0yMDIgLTMyNSAtMTk0IC0zMzMKNyAtOCAxNTUgMjggMjE0IDUyIDEwNyA0MyAxODQgMTA2IDE3NSAxNDIgLTEzIDUwIDQ4IDg4IDg0IDUyIDI4IC0yOCAyIC04OAotMzggLTg4IC0xMCAwIC0zNiAtMTYgLTU3IC0zNSAtNzcgLTcxIC0yNjEgLTE0NSAtMzYwIC0xNDUgLTMxIDAgLTM2IC00IC01NwotNTMgLTU4IC0xMzAgLTEwNSAtMzM1IC0xMjAgLTUyMiAtNiAtNjkgLTYgLTY5IDEwIC00MCA5IDE3IDI2IDQxIDM4IDU0IDY4Cjc1IDI3OCAyMDMgNTAxIDMwNSBsMTQwIDYzIDM4IDEzNCBjNDYgMTY0IDEwMSA0MzIgMTIxIDU5NSAxOSAxNTMgMzEgNDA1IDIyCjQ2NyBsLTcgNDcgLTUyIC0xIGMtMjkgLTEgLTkxIC03IC0xMzggLTE0eiIvPgo8cGF0aCBkPSJNMTM5MiAzMzg1IGMtMTQzIC0xOTkgLTI0MiAtNDE2IC0yOTggLTY1NSAtMzQgLTE0NCAtNDMgLTM3MyAtMjAKLTUxNSA0MiAtMjU0IDE1OSAtNDkwIDMyMyAtNjUyIDE0OSAtMTQ2IDI5NiAtMjE1IDQ4OCAtMjI3IDEyNiAtOSAyOTEgLTM0CjM1MiAtNTUgbDUyIC0xOCAtMTI0IDEyOCBjLTExOCAxMjIgLTI0NCAyOTIgLTI5MSAzOTIgLTE4IDM3IC0xOCAzNyAtNzkgMzcKLTEwOCAwIC0yMjAgNDQgLTMxOSAxMjUgLTM1IDI4IC02MSA0MiAtNzEgMzkgLTIxIC05IC01NSAyNCAtNTUgNTIgMCAzMyA0Mgo1OSA2OSA0NCAyMiAtMTEgMzcgLTUyIDI3IC02OSAtNyAtMTEgOTYgLTkwIDE1NiAtMTE5IDU2IC0yNyAxNTIgLTUyIDIwMSAtNTIKMzMgMCAzOCAzIDMyIDE4IC0zOSA5NCAtODUgMjI4IC05NiAyNzYgLTEwIDQ1IC0xOCA2MCAtMzMgNjQgLTEyIDMgLTYwIDI1Ci0xMDcgNDkgLTk2IDQ3IC0xNzEgMTA5IC0yMDkgMTcxIC0xNCAyMyAtMzUgNDMgLTQ4IDQ3IC00MiAxMCAtNDkgNzUgLTEwIDk2CjQ1IDI0IDg4IC0yMiA2OCAtNzIgLTEyIC0yNyAtMTAgLTMzIDI0IC03NiA1NyAtNzMgMTU5IC0xNDQgMjU5IC0xNzkgbDM5IC0xNAotNyA3MyBjLTMgMzkgLTExIDk4IC0xNyAxMzEgLTcgMzggLTkgMTMyIC01IDI2OCA2IDIwMiA2IDIxMSAtMTQgMjM4IC0yNiAzNAotMTggNjcgMTggNzYgMzUgOSA1NyAtNyA2MSAtNDQgMiAtMjIgLTIgLTM0IC0xNiAtNDEgLTE3IC05IC0yMCAtMjggLTI2IC0yMTgKLTYgLTE3OSAtNSAtMjE4IDEwIC0yNzYgMTYgLTY3IDEzMiAtMzE5IDE1MiAtMzMxIDMyIC0xOSAxMTggMTUwIDE0NiAyODYgMTYKNzYgMTYgNzggLTQgOTggLTI2IDI2IC0yNSA1MiAwIDc1IDE2IDE1IDI2IDE3IDQ4IDkgMzQgLTEyIDQzIC02NCAxNSAtODYgLTEyCi04IC0yNCAtNDMgLTM2IC0xMDMgLTIwIC05OSAtNTkgLTE5MyAtMTEyIC0yNjcgLTE5IC0yNiAtMzUgLTUxIC0zNSAtNTQgMAotMjIgMTk3IC0zMjMgMjEyIC0zMjQgMTMgMCA3OSAxMTIgMTAzIDE3NCAxMyAzNSAyOSA5NCAzNiAxMzAgMTAgNTggOSA2OSAtNQo4NSAtMjIgMjQgLTIwIDY4IDMgODEgMjggMTQgMzggMTMgNjEgLTEwIDI2IC0yNiAyNSAtNDYgLTMgLTczIC0xNiAtMTYgLTI2Ci00MyAtMzUgLTk0IC0xNiAtOTYgLTQ1IC0xNzEgLTk4IC0yNTAgLTQxIC02MSAtNDMgLTY4IC0zMCAtODggMzkgLTYwIDI2MwotMjY1IDI4OSAtMjY1IDIzIDAgNjYgMjQ2IDc0IDQyNSAxNSAzNjIgLTc0IDY5NCAtMjY0IDk3OSAtMTUzIDIyOSAtNDQyIDQ3NQotNjkzIDU4OSAtMTEzIDUxIC05OSA1MyAtMTU4IC0yOHoiLz4KPHBhdGggZD0iTTMzNjkgMjIzMCBjLTE4OCAtMjEgLTMyNyAtODIgLTQ1MCAtMTk4IC03OCAtNzMgLTE2MiAtMTg3IC0yMTMKLTI4OSAtNDcgLTk0IC0xMjAgLTM2MyAtOTkgLTM2MyAxNCAwIDI2MSAxMjUgMzIxIDE2MiBsNTMgMzMgMyA4MSBjMiA3MSA3IDkxCjQxIDE2MCAyMiA0NSAzNyA5MSAzNiAxMDcgLTIgMTUgMyAzNSA5IDQzIDI3IDMxIDkwIDYgOTAgLTM2IDAgLTI1IC0yNyAtNTAKLTU0IC01MCAtMTcgMCAtMzAgLTEzIC01MCAtNTAgLTQ0IC04MiAtNjkgLTIzOSAtMzUgLTIyOCAzNiAxMiAyNzkgMTk5IDM0OAoyNjggNDcgNDcgMTE2IDEwNSAxNTMgMTI5IDQxIDI3IDY5IDUzIDcyIDY3IDEyIDQ3IDgxIDUzIDkyIDkgMTMgLTUzIC0yMyAtODgKLTY3IC02NSAtMzYgMjAgLTEzNyAtNTkgLTMxMyAtMjQ0IC0xNTAgLTE1NyAtMTU1IC0xNjQgLTEyOSAtMTY5IDQ1IC05IDEzNAoxMiAxOTggNDYgNDcgMjUgNjEgMzggNjMgNTggNyA2MiA4NCA3OSA5OCAyMiAxMCAtMzcgLTcgLTU3IC01MiAtNjMgLTIxIC0zCi01OSAtMTcgLTg0IC0zMiAtNjcgLTM5IC0xNTMgLTYxIC0yMjAgLTU1IGwtNTYgNSAtODQgLTc1IGMtNDcgLTQyIC0xMzAgLTExMQotMTg1IC0xNTUgLTU1IC00NCAtMTA0IC04NCAtMTEwIC04OSAtMTIgLTEyIDEwOCAtMyAyMzQgMTggMjYwIDQyIDQ3MyAxNjMKNjMyIDM2MCAxMDYgMTMyIDE5NiAzMjUgMjMxIDQ5MyA2IDMzIDEwIDYyIDcgNjUgLTEwIDkgLTIwMSAzMyAtMzA0IDM4IC01NSAzCi0xMzQgMSAtMTc2IC0zeiIvPgo8L2c+Cjwvc3ZnPgo=';

/** Inline-styled HTML (required for email client compatibility) for the confirmation email. */
function buildConfirmationEmailHtml({
  summary,
  formattedDate,
  addToCalendarLink,
  meetUrl,
}: {
  summary: string;
  formattedDate: string;
  addToCalendarLink: string;
  meetUrl?: string;
}): string {
  const button = (href: string, label: string, background: string, color = '#ffffff', border = 'none') => `
    <a href="${href}" style="display:inline-block;padding:11px 23px;margin:6px 8px 0 0;background:${background};color:${color};text-decoration:none;border-radius:6px;font-family:${BRAND.font};font-size:14px;font-weight:700;border:${border};">${label}</a>`;

  return `
  <div style="background:${BRAND.gray200};padding:32px 16px;font-family:${BRAND.font};">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BRAND.gray400};">
      <div style="background:${BRAND.black};padding:24px 32px;">
        <table role="presentation" style="border-collapse:collapse;">
          <tr>
            <td style="padding-right:12px;vertical-align:middle;">
              <img src="${LEAF_ICON_DATA_URI}" width="30" height="30" alt="" style="display:block;">
            </td>
            <td style="vertical-align:middle;">
              <p style="margin:0 0 4px;color:${BRAND.primary};font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Héctor Martínez Moreira</p>
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Reunión confirmada</h1>
            </td>
          </tr>
        </table>
      </div>
      <div style="padding:28px 32px;">
        <p style="margin:0 0 16px;color:${BRAND.black};font-size:15px;">¡Hola! Tu reunión quedó agendada.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;background:${BRAND.gray200};border-radius:8px;">
          <tr>
            <td style="padding:12px 16px 4px;color:${BRAND.black};opacity:0.6;font-size:12px;width:80px;">Motivo</td>
            <td style="padding:12px 16px 4px;color:${BRAND.black};font-size:14px;">${summary}</td>
          </tr>
          <tr>
            <td style="padding:4px 16px 12px;color:${BRAND.black};opacity:0.6;font-size:12px;">Fecha</td>
            <td style="padding:4px 16px 12px;color:${BRAND.black};font-size:14px;">${formattedDate}</td>
          </tr>
        </table>
        <div>
          ${button(addToCalendarLink, '📅 Agregar a mi calendario', BRAND.primary)}
          ${meetUrl ? button(meetUrl, '🎥 Unirme por Google Meet', '#ffffff', BRAND.black, `1px solid ${BRAND.black}`) : ''}
        </div>
        <div style="margin-top:20px;padding:14px 16px;background:${BRAND.gray200};border-radius:8px;">
          <p style="margin:0 0 8px;color:${BRAND.black};opacity:0.6;font-size:11px;">¿No ves los botones? Copiá el link directamente:</p>
          <p style="margin:0 0 4px;color:${BRAND.black};font-size:12px;word-break:break-all;">📅 ${addToCalendarLink}</p>
          ${meetUrl ? `<p style="margin:0;color:${BRAND.black};font-size:12px;word-break:break-all;">🎥 ${meetUrl}</p>` : ''}
        </div>
        <p style="margin:24px 0 0;color:${BRAND.black};opacity:0.5;font-size:12px;">Si no reconocés esta reunión, podés ignorar este correo.</p>
      </div>
    </div>
  </div>`;
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

      const formattedDate = formatMeetingDate(start);
      const emailLines = [
        `Tu reunión con Héctor quedó agendada para ${formattedDate}.`,
        `Agregala a tu Google Calendar con un clic: ${addToCalendarLink}`,
      ];
      if (CONFIG.GOOGLE_MEET_URL) {
        emailLines.push(`Unite por Google Meet: ${CONFIG.GOOGLE_MEET_URL}`);
      }

      await emailSender.send({
        to: attendee_email,
        subject: 'Confirmación de tu reunión con Héctor',
        text: emailLines.join('\n'),
        html: buildConfirmationEmailHtml({
          summary,
          formattedDate,
          addToCalendarLink,
          meetUrl: CONFIG.GOOGLE_MEET_URL || undefined,
        }),
      });

      return JSON.stringify({
        confirmed: true,
        eventLink,
        addToCalendarLink,
        meetUrl: CONFIG.GOOGLE_MEET_URL || undefined,
        start: start.toISOString(),
      });
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
