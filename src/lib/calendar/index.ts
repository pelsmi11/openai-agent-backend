import { GoogleCalendarScheduler } from './google-calendar-scheduler.js';
import type { CalendarScheduler } from './calendar-scheduler.js';

export type {
  CalendarScheduler,
  CreateMeetingParams,
  CreateMeetingResult,
} from './calendar-scheduler.js';

export const calendarScheduler: CalendarScheduler = new GoogleCalendarScheduler();
