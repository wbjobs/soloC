import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { FormsService } from './forms.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole, FormComponent } from '../common/interfaces';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('表单管理')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('forms')
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DESIGNER)
  create(
    @Body()
    body: {
      name: string;
      description: string;
      components: FormComponent[];
    },
    @CurrentUser() user: any,
  ) {
    return this.formsService.create(
      body.name,
      body.description,
      body.components,
      user.userId,
    );
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.formsService.findAll(user.role);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.formsService.findOne(id, user.role);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.DESIGNER)
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name: string;
      description: string;
      components: FormComponent[];
      permissions?: any;
    },
    @CurrentUser() user: any,
  ) {
    return this.formsService.update(
      id,
      body.name,
      body.description,
      body.components,
      body.permissions,
      user.role,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.DESIGNER)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.formsService.remove(id, user.role);
  }
}
