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
  }: CreateMeetingParams): Promise<CreateMeetingResult> {
    // Note: a service account cannot add attendees to an event without Domain-Wide
    // Delegation, which only exists on Google Workspace — not on a personal Gmail
    // calendar like this one. The attendee is notified via EmailSender instead
    // (see scheduleMeetingTool), the event itself is just created on Hector's calendar.
    //
    // Also skips conferenceData (auto-generated Google Meet link): Calendar API
    // reliably rejects Meet creation requests from a bare service account
    // ("Invalid conference type value") even when it has calendar access — Meet
    // auto-creation needs a real authenticated user (OAuth), not a service account.
    const { data } = await this.calendar.events.insert({
      calendarId: CONFIG.GOOGLE_CALENDAR_ID,
      requestBody: {
        summary,
        description,
        start: { dateTime: startISO },
        end: { dateTime: endISO },
      },
    });

    return {
      eventLink: data.htmlLink ?? '',
    };
  }
}
