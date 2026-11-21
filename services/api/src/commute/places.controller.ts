import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { savedPlaceSchema, savedPlaceUpdateSchema, type SavedPlaceInput, type SavedPlaceUpdate } from '@rydo/shared';
import { ZodPipe } from '../common/zod.pipe';
import { Org, type OrgContext } from '../common/request-context';
import { OrgScoped } from '../tenancy/decorators';
import { PlacesService } from './places.service';

/** Saved addresses for the mobile app: list, add, edit, delete, make default (one default home and office). */
@Controller('me/places')
@OrgScoped()
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get()
  async list(@Org() org: OrgContext) {
    return { data: await this.places.list(org) };
  }

  @Post()
  @HttpCode(200)
  async create(@Org() org: OrgContext, @Body(new ZodPipe(savedPlaceSchema)) b: SavedPlaceInput) {
    return { data: await this.places.create(org, b) };
  }

  @Patch(':id')
  async update(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(savedPlaceUpdateSchema)) b: SavedPlaceUpdate) {
    return { data: await this.places.update(org, id, b) };
  }

  @Post(':id/default')
  @HttpCode(200)
  async makeDefault(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.places.setDefault(org, id) };
  }

  @Delete(':id')
  async remove(@Org() org: OrgContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.places.remove(org, id) };
  }
}
