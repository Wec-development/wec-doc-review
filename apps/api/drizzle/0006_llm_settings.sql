CREATE TYPE "public"."llm_provider" AS ENUM('anthropic', 'openai');--> statement-breakpoint
CREATE TABLE "llm_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"provider" "llm_provider" NOT NULL,
	"model" text NOT NULL,
	"api_key_ciphertext" "bytea" NOT NULL,
	"api_key_iv" "bytea" NOT NULL,
	"api_key_tag" "bytea" NOT NULL,
	"key_version" smallint NOT NULL,
	"key_hint" text NOT NULL,
	"last_verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_settings_single_row" CHECK ("llm_settings"."id" = 1),
	CONSTRAINT "llm_settings_iv_length" CHECK (octet_length("llm_settings"."api_key_iv") = 12),
	CONSTRAINT "llm_settings_tag_length" CHECK (octet_length("llm_settings"."api_key_tag") = 16),
	CONSTRAINT "llm_settings_key_hint_length" CHECK (char_length("llm_settings"."key_hint") <= 4)
);
--> statement-breakpoint
ALTER TABLE "extraction_jobs" ADD COLUMN "provider" "llm_provider";