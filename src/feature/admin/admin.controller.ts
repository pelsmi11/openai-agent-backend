import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Get,
  Query,
} from '@nestjs/common';
import { AdminService } from './admin.service.js';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('personal-info')
  async createPersonalInfo(
    @Body('content') content: string,
    @Body('category') category: string,
  ) {
    if (!content || !category) {
      throw new HttpException(
        'content and category are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.adminService.createPersonalInfo(content, category);
  }

  @Get('search-personal-info')
  async searchPersonalInfo(
    @Query('q') q: string,
    @Query('count') count?: string,
    @Query('threshold') threshold?: string,
  ) {
    // count y threshold son opcionales y vienen como string
    const matchCount = count ? parseInt(count, 10) : 3;
    const matchThreshold = threshold ? parseFloat(threshold) : 0.2;
    return this.adminService.findSimilarPersonalInfo(
      q,
      matchCount,
      matchThreshold,
    );
  }
}
