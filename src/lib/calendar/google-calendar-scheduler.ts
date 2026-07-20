import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import { CONFIG } from '../../utils/constants/config.js';
import type {
  CalendarScheduler,
  CreateMeetingParams,
  CreateMeetingResult,
} from './calendar-scheduler.js';

export class GoogleCalendarScheduler implements CalendarScheduler {
  private readonly calendar = google.calendar({
    version: 'v3',
    auth: new google.auth.JWT({
      email: CONFIG.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: CONFIG.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    }),
  });

  async createMeeting({
    summary,
    description,
    startISO,
    endISO,
    attendeeEmail,
  }: CreateMeetingParams): Promise<CreateMeetingResult> {
    const { data } = await this.calendar.events.insert({
      calendarId: CONFIG.GOOGLE_CALENDAR_ID,
      sendUpdates: 'all',
      conferenceDataVersion: 1,
      requestBody: {
        summary,
        description,
        start: { dateTime: startISO },
        end: { dateTime: endISO },
        attendees: [{ email: attendeeEmail }],
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    });

    return {
      eventLink: data.htmlLink ?? '',
      meetLink: data.hangoutLink ?? undefined,
    };
  }
}
