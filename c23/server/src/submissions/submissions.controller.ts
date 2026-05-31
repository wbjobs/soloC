import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SubmissionsService } from './submissions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('表单提交')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post(':formId')
  create(
    @Param('formId') formId: string,
    @Body() data: Record<string, any>,
    @CurrentUser() user: any,
  ) {
    return this.submissionsService.create(formId, data, user.userId, user.role);
  }

  @Get('form/:formId')
  findAllByForm(
    @Param('formId') formId: string,
    @CurrentUser() user: any,
  ) {
    return this.submissionsService.findAllByForm(formId, user.role);
  }

  @Get(':id/form/:formId')
  findOne(
    @Param('id') id: string,
    @Param('formId') formId: string,
    @CurrentUser() user: any,
  ) {
    return this.submissionsService.findOne(id, formId, user.role);
  }

  @Get('export/:formId')
  async exportToExcel(
    @Param('formId') formId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const buffer = await this.submissionsService.exportToExcel(formId, user.role);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=form-data-${formId}.xlsx`,
    );
    res.send(buffer);
  }
}
