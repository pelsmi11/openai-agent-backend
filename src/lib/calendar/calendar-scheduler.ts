export interface CreateMeetingParams {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  attendeeEmail: string;
}

export interface CreateMeetingResult {
  eventLink: string;
  meetLink?: string;
}

/**
 * Adapter interface for scheduling a meeting on a calendar. Code that needs to book a
 * meeting depends on this, not on a specific calendar provider — swapping providers means
 * writing a new implementation of this interface, not touching the callers.
 */
export interface CalendarScheduler {
  createMeeting(params: CreateMeetingParams): Promise<CreateMeetingResult>;
}
