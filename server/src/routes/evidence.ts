import { Router } from 'express';
import { streamEvidencePDF } from '../services/pdf';

const r = Router();

r.post('/pdf', async (req, res) => {
  const pack = req.body; // Demo mode: client passes the pack structure directly
  streamEvidencePDF(res, pack);
});

export default r;
