import { Injectable } from '@nestjs/common';
import { MAX_SAVED_PLACES, type SavedPlace, type SavedPlaceInput, type SavedPlaceUpdate } from '@rydo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';

type Org = { organizationId: string; membershipId: string };
type Label = SavedPlace['label'];

/**
 * A person's saved addresses (home, office, other) in one company. Rows hang off the membership,
 * so every query here is limited to the caller's own membership (and therefore their company).
 * Each label has at most one default: the app's Home and Office for ride search and the commute planner.
 */
@Injectable()
export class PlacesService {
  constructor(private readonly prisma: PrismaService) {}

  list(org: Org): Promise<SavedPlace[]> {
    return this.prisma.$queryRaw<SavedPlace[]>`
      SELECT id, label::text AS label, name, address, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, is_default AS "isDefault", created_at AS "createdAt"
      FROM saved_places WHERE membership_id = ${org.membershipId}::uuid
      ORDER BY CASE label WHEN 'HOME' THEN 0 WHEN 'OFFICE' THEN 1 ELSE 2 END, is_default DESC, created_at DESC`;
  }

  private async one(org: Org, id: string) {
    const p = (await this.list(org)).find((x) => x.id === id);
    if (!p) throw new AppError('NOT_FOUND', 'Address not found.', 404);
    return p;
  }

  private async hasDefault(org: Org, label: Label) {
    const [r] = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM saved_places WHERE membership_id = ${org.membershipId}::uuid AND label = ${label}::"PlaceLabel" AND is_default`;
    return r.n > 0;
  }

  async create(org: Org, b: SavedPlaceInput) {
    const [c] = await this.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM saved_places WHERE membership_id = ${org.membershipId}::uuid`;
    if (c.n >= MAX_SAVED_PLACES) throw new AppError('CONFLICT', `You can save up to ${MAX_SAVED_PLACES} addresses. Delete one first.`, 409);
    // The first address of a kind becomes its default.
    const makeDefault = b.isDefault === true || !(await this.hasDefault(org, b.label));
    const [row] = await this.prisma.$transaction(async (tx) => {
      if (makeDefault) await tx.$executeRaw`UPDATE saved_places SET is_default = false WHERE membership_id = ${org.membershipId}::uuid AND label = ${b.label}::"PlaceLabel"`;
      return tx.$queryRaw<{ id: string }[]>`
        INSERT INTO saved_places (id, membership_id, label, name, address, location, is_default, created_at)
        VALUES (gen_random_uuid(), ${org.membershipId}::uuid, ${b.label}::"PlaceLabel", ${b.name}, ${b.address}, ST_SetSRID(ST_MakePoint(${b.lng}, ${b.lat}), 4326)::geography, ${makeDefault}, now())
        RETURNING id`;
    });
    return this.one(org, row.id);
  }

  async update(org: Org, id: string, b: SavedPlaceUpdate) {
    const cur = await this.one(org, id);
    const label = b.label ?? cur.label;
    const lat = b.lat ?? cur.lat;
    const lng = b.lng ?? cur.lng;
    await this.prisma.$transaction(async (tx) => {
      if (b.isDefault === true) await tx.$executeRaw`UPDATE saved_places SET is_default = false WHERE membership_id = ${org.membershipId}::uuid AND label = ${label}::"PlaceLabel"`;
      // Moving a default to another kind must not leave two defaults there.
      const keepDefault = b.isDefault ?? (label === cur.label ? cur.isDefault : false);
      await tx.$executeRaw`
        UPDATE saved_places SET label = ${label}::"PlaceLabel", name = ${b.name ?? cur.name}, address = ${b.address ?? cur.address},
          location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, is_default = ${keepDefault}
        WHERE id = ${id}::uuid AND membership_id = ${org.membershipId}::uuid`;
    });
    // A kind that lost its default gets the newest remaining one.
    await this.promoteIfNone(org, cur.label);
    if (label !== cur.label) await this.promoteIfNone(org, label);
    return this.one(org, id);
  }

  async setDefault(org: Org, id: string) {
    return this.update(org, id, { isDefault: true });
  }

  async remove(org: Org, id: string) {
    const cur = await this.one(org, id);
    await this.prisma.$executeRaw`DELETE FROM saved_places WHERE id = ${id}::uuid AND membership_id = ${org.membershipId}::uuid`;
    if (cur.isDefault) await this.promoteIfNone(org, cur.label);
    return this.list(org);
  }

  private async promoteIfNone(org: Org, label: Label) {
    if (await this.hasDefault(org, label)) return;
    await this.prisma.$executeRaw`
      UPDATE saved_places SET is_default = true WHERE id = (
        SELECT id FROM saved_places WHERE membership_id = ${org.membershipId}::uuid AND label = ${label}::"PlaceLabel" ORDER BY created_at DESC LIMIT 1)`;
  }
}
