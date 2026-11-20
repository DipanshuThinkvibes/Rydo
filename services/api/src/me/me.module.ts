import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { HighlightsController } from './highlights.controller';
import { SettingsController } from './settings.controller';
import { MeService } from './me.service';

@Module({ controllers: [MeController, SettingsController, HighlightsController], providers: [MeService], exports: [MeService] })
export class MeModule {}