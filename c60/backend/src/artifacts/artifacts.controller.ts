import { Controller, Get, Param } from '@nestjs/common';
import { ArtifactsService } from './artifacts.service';
import { Artifact } from './artifact.interface';

@Controller('artifacts')
export class ArtifactsController {
  constructor(private readonly artifactsService: ArtifactsService) {}

  @Get()
  findAll(): Artifact[] {
    return this.artifactsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Artifact {
    return this.artifactsService.findOne(id);
  }
}
