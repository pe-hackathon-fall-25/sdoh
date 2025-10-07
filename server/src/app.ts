import express from 'express';
import cors from 'cors';
import screenings from './routes/screenings';
import zcodes from './routes/zcodes';
import evidence from './routes/evidence';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/screenings', screenings);
app.use('/api/zcodes', zcodes);
app.use('/api/evidence', evidence);

export default app;
