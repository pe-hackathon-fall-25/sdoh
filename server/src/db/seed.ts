import { randomUUID } from 'crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { tenants, users, members, consents } from './schema';
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
  console.log({ tenantId, userId, memberId, consentId });
  process.exit(0);
})();
