import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Auth, type AuthContext } from '../common/request-context';

@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Auth() auth: AuthContext) {
    const items = await this.prisma.notification.findMany({ where: { userId: auth.userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { data: items.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, data: n.data, read: !!n.readAt, createdAt: n.createdAt })), meta: { unread: items.filter((n) => !n.readAt).length } };
  }

  @Post('read')
  @HttpCode(200)
  async readAll(@Auth() auth: AuthContext) {
    const { count } = await this.prisma.notification.updateMany({ where: { userId: auth.userId, readAt: null }, data: { readAt: new Date() } });
    return { data: { marked: count } };
  }
}