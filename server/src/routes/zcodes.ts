import { Router } from 'express';
import { suggestZCodes } from '../services/aiSuggest';
import { screenings, zcodeFinal, zcodeSuggestions } from '../db/schema';
import { db } from '../util/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const r = Router();

r.post('/suggest', async (req, res, next) => {
  try {
    const { screeningId } = req.body;
    const s = (await db.select().from(screenings).where(eq(screenings.id, screeningId))).at(0);
    if (!s) return res.status(404).json({ error: 'screening not found' });
    const suggestions = suggestZCodes({ note: s.note || undefined, responses: s.responses as any });
    const id = randomUUID();
    await db.insert(zcodeSuggestions).values({ id, tenantId: s.tenantId, memberId: s.memberId, screeningId, suggestions: suggestions as any });
    res.json({ suggestions });
  } catch (e) { next(e); }
});

r.post('/finalize', async (req, res, next) => {
  try {
    const { screeningId, acceptedCodes, rationale } = req.body as { screeningId: string, acceptedCodes: string[], rationale?: string };
    const s = (await db.select().from(screenings).where(eq(screenings.id, screeningId))).at(0);
    if (!s) return res.status(404).json({ error: 'screening not found' });
    const id = randomUUID();
    await db.insert(zcodeFinal).values({ id, tenantId: s.tenantId, memberId: s.memberId, screeningId, codes: acceptedCodes as any, rationale });
    res.json({ zcodeFinalId: id });
  } catch (e) { next(e); }
});

export default r;
