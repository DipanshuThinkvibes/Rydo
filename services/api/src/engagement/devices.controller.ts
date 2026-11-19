import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { deviceSchema, type DeviceInput } from '@rydo/shared';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { Auth, type AuthContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const MAX_DEVICES = 10;

/** The mobile app registers its push token after sign-in and removes it on sign-out. Per person, not per company. */
@Controller('me/devices')
export class DevicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(200)
  async register(@Auth() auth: AuthContext, @Body(new ZodPipe(deviceSchema)) b: DeviceInput) {
    // A token belongs to one phone: if it was registered by someone else before, it moves to this person.
    await this.prisma.deviceToken.upsert({
      where: { token: b.token },
      create: { userId: auth.userId, token: b.token, platform: b.platform },
      update: { userId: auth.userId, platform: b.platform, lastSeenAt: new Date() },
    });
    const all = await this.prisma.deviceToken.findMany({ where: { userId: auth.userId }, orderBy: { lastSeenAt: 'desc' }, select: { id: true } });
    if (all.length > MAX_DEVICES) await this.prisma.deviceToken.deleteMany({ where: { id: { in: all.slice(MAX_DEVICES).map((d) => d.id) } } });
    return { data: { registered: true } };
  }

  @Post('remove')
  @HttpCode(200)
  async remove(@Auth() auth: AuthContext, @Body(new ZodPipe(z.object({ token: z.string().min(10).max(4096) }))) b: { token: string }) {
    const { count } = await this.prisma.deviceToken.deleteMany({ where: { token: b.token, userId: auth.userId } });
    return { data: { removed: count } };
  }
}
