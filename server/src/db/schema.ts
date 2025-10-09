import { pgTable, uuid, text, jsonb, timestamp, integer } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  role: text('role').notNull(),
  name: text('name'),
});

export const members = pgTable('members', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  firstName: text('first_name'),
  lastName: text('last_name'),
  dob: text('dob'),
});

export const consents = pgTable('consents', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  memberId: uuid('member_id').notNull().references(() => members.id),
  scope: text('scope').notNull(),
  collectedAt: timestamp('collected_at', { withTimezone: true }).defaultNow(),
  source: text('source'),
  evidence: jsonb('evidence'),
});

export const screenings = pgTable('screenings', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  memberId: uuid('member_id').notNull().references(() => members.id),
  domain: text('domain').notNull(),
  instrument: text('instrument').default('HungerVitalSign'),
  responses: jsonb('responses').notNull(),
  note: text('note'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  memberId: uuid('member_id').notNull().references(() => members.id),
  orgName: text('org_name').notNull(),
  service: text('service').notNull(),
  status: text('status').notNull().default('sent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const outcomes = pgTable('outcomes', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  referralId: uuid('referral_id').notNull().references(() => referrals.id),
  result: text('result').notNull(),
  note: text('note'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow(),
});

export const zcodeSuggestions = pgTable('zcode_suggestions', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  memberId: uuid('member_id').notNull().references(() => members.id),
  screeningId: uuid('screening_id').notNull().references(() => screenings.id),
  suggestions: jsonb('suggestions').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const zcodeFinal = pgTable('zcode_final', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  memberId: uuid('member_id').notNull().references(() => members.id),
  screeningId: uuid('screening_id').notNull().references(() => screenings.id),
  codes: jsonb('codes').$type<string[]>().notNull(),
  rationale: text('rationale'),
  reviewerId: uuid('reviewer_id').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow(),
});

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  actorId: uuid('actor_id'),
  entity: text('entity').notNull(),
  entityId: uuid('entity_id').notNull(),
  action: text('action').notNull(),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const aiDetections = pgTable('ai_detections', {
  id: uuid('id').primaryKey(),
  scenarioId: text('scenario_id').notNull(),
  scenarioName: text('scenario_name').notNull(),
  memberId: text('member_id').notNull(),
  memberName: text('member_name'),
  issues: jsonb('issues').notNull(),
  narrative: text('narrative'),
  revenue: jsonb('revenue'),
  compliance: jsonb('compliance'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const calls = pgTable('calls', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  memberId: uuid('member_id').notNull().references(() => members.id),
  direction: text('direction').notNull().default('outbound'),
  fromNumber: text('from_number'),
  toNumber: text('to_number'),
  status: text('status').notNull().default('initiated'),
  twilioCallSid: text('twilio_call_sid'),
  metadata: jsonb('metadata'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds'),
  summaryEmailSentAt: timestamp('summary_email_sent_at', { withTimezone: true }),
  lastDetectionId: uuid('last_detection_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const callTranscripts = pgTable('call_transcripts', {
  id: uuid('id').primaryKey(),
  callId: uuid('call_id')
    .notNull()
    .references(() => calls.id, { onDelete: 'cascade' }),
  messages: jsonb('messages').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const callDetections = pgTable('call_detections', {
  id: uuid('id').primaryKey(),
  callId: uuid('call_id')
    .notNull()
    .references(() => calls.id, { onDelete: 'cascade' }),
  engine: text('engine'),
  issues: jsonb('issues').notNull(),
  documentation: jsonb('documentation'),
  revenue: jsonb('revenue'),
  compliance: jsonb('compliance'),
  narrative: text('narrative'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
