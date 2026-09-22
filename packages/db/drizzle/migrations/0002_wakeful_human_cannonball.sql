CREATE TYPE "public"."calendar_event_status" AS ENUM('confirmed', 'cancelled');--> statement-breakpoint
CREATE TABLE "calendar_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text,
	"summary" text NOT NULL,
	"description" text,
	"location" text,
	"start_ms" bigint NOT NULL,
	"end_ms" bigint NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"color" text,
	"status" "calendar_event_status" DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_event_org_start_idx" ON "calendar_event" USING btree ("organization_id","start_ms");--> statement-breakpoint
CREATE INDEX "calendar_event_created_by_idx" ON "calendar_event" USING btree ("created_by");