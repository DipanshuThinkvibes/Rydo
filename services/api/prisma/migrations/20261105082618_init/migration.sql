-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'LEFT');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('ORG_ADMIN', 'HR_ADMIN', 'OPS_ADMIN', 'RIDER', 'DRIVER');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('MOBILE', 'WEB');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "PlaceLabel" AS ENUM ('HOME', 'OFFICE', 'OTHER');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('MANUAL', 'AUTO_TEAM');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('CAR', 'BIKE');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('DRIVING_LICENSE', 'VEHICLE_RC');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RideDirection" AS ENUM ('TO_OFFICE', 'TO_HOME', 'OTHER');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('SCHEDULED', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StopType" AS ENUM ('PICKUP', 'DROP', 'WAYPOINT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'BOARDED', 'NO_SHOW', 'CANCELLED_BY_RIDER', 'CANCELLED_BY_DRIVER', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'MATCHED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CommuteDayStatus" AS ENUM ('OFFICE', 'WFH', 'LEAVE');

-- CreateEnum
CREATE TYPE "RideEventType" AS ENUM ('STARTED', 'ARRIVED_AT_PICKUP', 'PIN_VERIFIED', 'NO_SHOW', 'LONG_STOP', 'LONG_STOP_OK', 'OFF_ROUTE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "SosStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "IssueCategory" AS ENUM ('UNSAFE_DRIVING', 'HARASSMENT', 'LATE_OR_NO_SHOW', 'ROUTE', 'COST', 'APP_BUG', 'OTHER');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email_domains" TEXT[],
    "logo_key" TEXT,
    "status" "OrgStatus" NOT NULL DEFAULT 'PENDING',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "location" geography(Point,4326) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "photo_key" TEXT,
    "gender" "Gender" NOT NULL DEFAULT 'UNDISCLOSED',
    "password_hash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admins" (
    "user_id" UUID NOT NULL,
    "role" "PlatformRole" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("user_id","role")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client" "ClientType" NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "department_id" UUID,
    "employee_code" TEXT,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ,
    "reliability_score" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_roles" (
    "membership_id" UUID NOT NULL,
    "role" "OrgRole" NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("membership_id","role")
);

-- CreateTable
CREATE TABLE "saved_places" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "label" "PlaceLabel" NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "location" geography(Point,4326) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "relation" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "organization_id" UUID NOT NULL,
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "driver_profiles" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'PENDING',
    "approval_mode" "ApprovalMode" NOT NULL DEFAULT 'MANUAL',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "driver_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "driver_profile_id" UUID NOT NULL,
    "type" "VehicleType" NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "plate_number" TEXT NOT NULL,
    "seat_capacity" INTEGER NOT NULL,
    "has_ac" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "driver_profile_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "kind" "DocumentKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "number" TEXT,
    "expires_at" DATE,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "driver_membership_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "origin_label" TEXT NOT NULL,
    "origin" geography(Point,4326) NOT NULL,
    "destination_label" TEXT NOT NULL,
    "destination" geography(Point,4326) NOT NULL,
    "depart_time" TIME NOT NULL,
    "return_time" TIME,
    "days_of_week" INTEGER[],
    "one_off_date" DATE,
    "seats" INTEGER NOT NULL,
    "women_only" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ride_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rides" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ride_plan_id" UUID,
    "driver_membership_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "direction" "RideDirection" NOT NULL,
    "origin_label" TEXT NOT NULL,
    "origin" geography(Point,4326) NOT NULL,
    "destination_label" TEXT NOT NULL,
    "destination" geography(Point,4326) NOT NULL,
    "route_line" geography(LineString,4326),
    "distance_meters" INTEGER,
    "duration_seconds" INTEGER,
    "depart_at" TIMESTAMPTZ NOT NULL,
    "seats_total" INTEGER NOT NULL,
    "seats_booked" INTEGER NOT NULL DEFAULT 0,
    "women_only" BOOLEAN NOT NULL DEFAULT false,
    "status" "RideStatus" NOT NULL DEFAULT 'SCHEDULED',
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_stops" (
    "id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" "StopType" NOT NULL,
    "booking_id" UUID,
    "label" TEXT NOT NULL,
    "location" geography(Point,4326) NOT NULL,
    "planned_at" TIMESTAMPTZ,
    "arrived_at" TIMESTAMPTZ,

    CONSTRAINT "ride_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "rider_membership_id" UUID NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "pickup_label" TEXT NOT NULL,
    "pickup" geography(Point,4326) NOT NULL,
    "drop_label" TEXT NOT NULL,
    "drop" geography(Point,4326) NOT NULL,
    "match_score" INTEGER,
    "match_reasons" JSONB,
    "auto_rematch" BOOLEAN NOT NULL DEFAULT true,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ NOT NULL,
    "decided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "rider_membership_id" UUID NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "pickup_label" TEXT NOT NULL,
    "pickup" geography(Point,4326) NOT NULL,
    "drop_label" TEXT NOT NULL,
    "drop" geography(Point,4326) NOT NULL,
    "pin" CHAR(4) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "boarded_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "late_cancel" BOOLEAN NOT NULL DEFAULT false,
    "cost_share_est" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "rider_membership_id" UUID NOT NULL,
    "criteria" JSONB NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "notified_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "rater_membership_id" UUID NOT NULL,
    "ratee_membership_id" UUID NOT NULL,
    "stars" INTEGER NOT NULL,
    "tags" TEXT[],
    "comment" VARCHAR(280),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferred_drivers" (
    "rider_membership_id" UUID NOT NULL,
    "driver_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preferred_drivers_pkey" PRIMARY KEY ("rider_membership_id","driver_membership_id")
);

-- CreateTable
CREATE TABLE "commute_days" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "CommuteDayStatus" NOT NULL DEFAULT 'OFFICE',
    "to_office_time" TIME,
    "to_home_time" TIME,
    "auto_book" BOOLEAN NOT NULL DEFAULT true,
    "to_office_booking_id" UUID,
    "to_home_booking_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "commute_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_locations" (
    "id" BIGSERIAL NOT NULL,
    "ride_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,
    "location" geography(Point,4326) NOT NULL,
    "accuracy_m" DOUBLE PRECISION,
    "speed_mps" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,

    CONSTRAINT "vehicle_locations_pkey" PRIMARY KEY ("id","recorded_at")
);

-- CreateTable
CREATE TABLE "ride_events" (
    "id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "booking_id" UUID,
    "type" "RideEventType" NOT NULL,
    "data" JSONB,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "sender_membership_id" UUID NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sos_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ride_id" UUID NOT NULL,
    "raised_by_membership_id" UUID NOT NULL,
    "location" geography(Point,4326),
    "status" "SosStatus" NOT NULL DEFAULT 'ACTIVE',
    "acknowledged_by_id" UUID,
    "acknowledged_at" TIMESTAMPTZ,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sos_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_reports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "reporter_membership_id" UUID NOT NULL,
    "ride_id" UUID,
    "against_membership_id" UUID,
    "category" "IssueCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to_id" UUID,
    "resolution" TEXT,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "issue_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "organization_id" UUID,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "offices_organization_id_idx" ON "offices"("organization_id");

-- CreateIndex
CREATE INDEX "offices_location_idx" ON "offices" USING GIST ("location");

-- CreateIndex
CREATE UNIQUE INDEX "departments_organization_id_name_key" ON "departments"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "otp_codes_email_created_at_idx" ON "otp_codes"("email", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");

-- CreateIndex
CREATE INDEX "memberships_organization_id_status_idx" ON "memberships"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "saved_places_membership_id_idx" ON "saved_places"("membership_id");

-- CreateIndex
CREATE INDEX "emergency_contacts_user_id_idx" ON "emergency_contacts"("user_id");

-- CreateIndex
CREATE INDEX "user_blocks_organization_id_idx" ON "user_blocks"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profiles_membership_id_key" ON "driver_profiles"("membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_organization_id_plate_number_key" ON "vehicles"("organization_id", "plate_number");

-- CreateIndex
CREATE INDEX "documents_organization_id_status_idx" ON "documents"("organization_id", "status");

-- CreateIndex
CREATE INDEX "documents_expires_at_idx" ON "documents"("expires_at");

-- CreateIndex
CREATE INDEX "ride_plans_organization_id_active_idx" ON "ride_plans"("organization_id", "active");

-- CreateIndex
CREATE INDEX "rides_organization_id_depart_at_status_idx" ON "rides"("organization_id", "depart_at", "status");

-- CreateIndex
CREATE INDEX "rides_driver_membership_id_depart_at_idx" ON "rides"("driver_membership_id", "depart_at");

-- CreateIndex
CREATE INDEX "rides_route_line_idx" ON "rides" USING GIST ("route_line");

-- CreateIndex
CREATE INDEX "rides_origin_idx" ON "rides" USING GIST ("origin");

-- CreateIndex
CREATE UNIQUE INDEX "rides_ride_plan_id_depart_at_key" ON "rides"("ride_plan_id", "depart_at");

-- CreateIndex
CREATE UNIQUE INDEX "ride_stops_ride_id_seq_key" ON "ride_stops"("ride_id", "seq");

-- CreateIndex
CREATE INDEX "ride_requests_ride_id_status_idx" ON "ride_requests"("ride_id", "status");

-- CreateIndex
CREATE INDEX "ride_requests_rider_membership_id_status_idx" ON "ride_requests"("rider_membership_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_request_id_key" ON "bookings"("request_id");

-- CreateIndex
CREATE INDEX "bookings_rider_membership_id_status_idx" ON "bookings"("rider_membership_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_ride_id_rider_membership_id_key" ON "bookings"("ride_id", "rider_membership_id");

-- CreateIndex
CREATE INDEX "waitlist_entries_organization_id_status_idx" ON "waitlist_entries"("organization_id", "status");

-- CreateIndex
CREATE INDEX "ratings_ratee_membership_id_idx" ON "ratings"("ratee_membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_ride_id_rater_membership_id_ratee_membership_id_key" ON "ratings"("ride_id", "rater_membership_id", "ratee_membership_id");

-- CreateIndex
CREATE INDEX "commute_days_organization_id_date_idx" ON "commute_days"("organization_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "commute_days_membership_id_date_key" ON "commute_days"("membership_id", "date");

-- CreateIndex
CREATE INDEX "vehicle_locations_ride_id_recorded_at_idx" ON "vehicle_locations"("ride_id", "recorded_at");

-- CreateIndex
CREATE INDEX "ride_events_ride_id_at_idx" ON "ride_events"("ride_id", "at");

-- CreateIndex
CREATE INDEX "messages_ride_id_created_at_idx" ON "messages"("ride_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "sos_events_organization_id_status_idx" ON "sos_events"("organization_id", "status");

-- CreateIndex
CREATE INDEX "issue_reports_organization_id_status_idx" ON "issue_reports"("organization_id", "status");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "offices" ADD CONSTRAINT "offices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_profile_id_fkey" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_driver_profile_id_fkey" FOREIGN KEY ("driver_profile_id") REFERENCES "driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_ride_plan_id_fkey" FOREIGN KEY ("ride_plan_id") REFERENCES "ride_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_stops" ADD CONSTRAINT "ride_stops_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "ride_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rules Prisma cannot express (see docs/phase-0/01-data-model.md section 4)
ALTER TABLE "rides" ADD CONSTRAINT "rides_seats_check" CHECK ("seats_booked" >= 0 AND "seats_booked" <= "seats_total");
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_seats_check" CHECK ("seats" BETWEEN 1 AND 6);
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pin_check" CHECK ("pin" ~ '^[0-9]{4}$');
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_stars_check" CHECK ("stars" BETWEEN 1 AND 5);
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_seat_capacity_check" CHECK ("seat_capacity" BETWEEN 1 AND 6);