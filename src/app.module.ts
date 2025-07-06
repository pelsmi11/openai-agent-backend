import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AdminModule } from './feature/admin/admin.module.js';
import { BookingModule } from './feature/booking/booking.module.js';

@Module({
  imports: [ConfigModule.forRoot(), BookingModule, AdminModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
