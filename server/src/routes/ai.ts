import { Router } from 'express';
import { detectConversation } from '../services/sdohEngine';

const r = Router();

r.post('/detect', async (req, res, next) => {
  try {
    const result = await detectConversation(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default r;
