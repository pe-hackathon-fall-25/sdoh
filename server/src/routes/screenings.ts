import { Router } from 'express';
import { db } from '../util/db';
import { screenings } from '../db/schema';
import { randomUUID } from 'crypto';

const r = Router();

r.post('/', async (req, res, next) => {
  try {
    const id = randomUUID();
    const { memberId, domain, responses, note } = req.body;
    await db.insert(screenings).values({ id, tenantId: req.header('x-tenant-id') || '00000000-0000-0000-0000-000000000001', memberId, domain, responses, note });
    res.json({ screeningId: id });
  } catch (e) { next(e); }
});

export default r;
