import express from 'express';
import cors from 'cors';
import screenings from './routes/screenings';
import zcodes from './routes/zcodes';
import evidence from './routes/evidence';
import ai from './routes/ai';
import scenarios from './routes/scenarios';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/screenings', screenings);
app.use('/api/zcodes', zcodes);
app.use('/api/evidence', evidence);
app.use('/api/ai', ai);
app.use('/api/scenarios', scenarios);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err?.status === 'number' ? err.status : 400;
  const message = err instanceof Error ? err.message : 'Unknown error';
  if (err instanceof Error && 'issues' in err) {
    console.error('[app] request validation error', err);
  }
  res.status(status).json({ error: message });
});

export default app;
