import { Controller, Post, Body } from '@nestjs/common';
import { BookingService } from './booking.service.js';

@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post('ask-to-hector')
  async askToHector(@Body('message') message: string) {
    return this.bookingService.askToHector(message);
  }
}
