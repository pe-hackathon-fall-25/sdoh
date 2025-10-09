import { randomUUID } from 'crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { tenants, users, members, consents, calls, callTranscripts } from './schema';
import { env } from '../env';

(async () => {
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool);
  const tenantId = env.TENANT_ID;
  await db.insert(tenants).values({ id: tenantId, name: 'Demo Tenant' }).onConflictDoNothing();
  const userId = randomUUID();
  await db.insert(users).values({ id: userId, tenantId, role: 'reviewer', name: 'Reviewer Rita' }).onConflictDoNothing();
  const memberId = randomUUID();
  await db.insert(members).values({ id: memberId, tenantId, firstName: 'Alex', lastName: 'Rivera', dob: '1952-03-14' });
  const consentId = randomUUID();
  await db.insert(consents).values({ id: consentId, tenantId, memberId, scope: 'sdoh_evidence', source: 'verbal', evidence: { agent: 'staff-1' } });

  const callId = randomUUID();
  const callStarted = new Date('2025-01-17T15:03:00Z');
  const callEnded = new Date('2025-01-17T15:05:30Z');
  const transcriptSample = [
    {
      speaker: 'navigator',
      text: 'Hola Alex, thanks for picking up. We are checking in about groceries and your SNAP renewal.',
      language: 'es',
      timestamp: '2025-01-17T15:03:00Z',
    },
    {
      speaker: 'member',
      text: 'Yeah it has been rough. The food bank is the only place I eat lately and sometimes they close early.',
      language: 'en',
      timestamp: '2025-01-17T15:03:27Z',
    },
    {
      speaker: 'member',
      text: 'Mi nevera está vacía casi siempre y me salto comidas.',
      language: 'es',
      timestamp: '2025-01-17T15:03:48Z',
    },
    {
      speaker: 'navigator',
      text: 'We can escalate the emergency pantry delivery. Did the utility company restore your electricity yet?',
      language: 'en',
      timestamp: '2025-01-17T15:04:03Z',
    },
    {
      speaker: 'member',
      text: 'No, my electricity got shut off on Tuesday and they said it might take a week unless I pay everything.',
      language: 'en',
      timestamp: '2025-01-17T15:04:18Z',
    },
  ];

  await db
    .insert(calls)
    .values({
      id: callId,
      tenantId,
      memberId,
      direction: 'outbound',
      fromNumber: '+18005550100',
      toNumber: '+15555551212',
      status: 'completed',
      startedAt: callStarted,
      endedAt: callEnded,
      durationSeconds: Math.floor((callEnded.getTime() - callStarted.getTime()) / 1000),
      metadata: { seed: true },
    })
    .onConflictDoNothing();

  await db
    .insert(callTranscripts)
    .values({
      id: randomUUID(),
      callId,
      messages: transcriptSample as any,
      createdAt: callStarted,
      updatedAt: callEnded,
    })
    .onConflictDoNothing();

  console.log({ tenantId, userId, memberId, consentId });
  process.exit(0);
})();
