import { Module } from '@nestjs/common';
import { BookingService } from './booking.service.js';
import { BookingController } from './booking.controller.js';

@Module({
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingModule {}
