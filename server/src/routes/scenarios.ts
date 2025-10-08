import { Router } from 'express';
import { z } from 'zod';
import {
  processCareCoordinationCall,
  processSmsScreening,
  processEhrIntake,
  processMonitoringCheckIn,
  processCareTeamAlert,
  processPopulationHealth,
  processPostDischarge,
} from '../services/scenarioPipeline';

const r = Router();

const messageSchema = z.object({
  speaker: z.string(),
  text: z.string(),
  language: z.string().optional(),
  timestamp: z.string().optional(),
});

r.post('/care-coordination-call', async (req, res, next) => {
  try {
    const body = z
      .object({
        memberId: z.string(),
        caseManagerEmail: z.string().email(),
        workerName: z.string().optional(),
        workerEmail: z.string().email().optional(),
        encounterId: z.string().optional(),
        context: z
          .object({
            encounterId: z.string().optional(),
            careTeam: z.array(z.string()).optional(),
            requiredScreenings: z.number().optional(),
            completedScreenings: z.number().optional(),
            monthlyGoal: z.number().optional(),
          })
          .optional(),
        transcript: z.array(messageSchema),
      })
      .parse(req.body);

    const result = await processCareCoordinationCall(body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

r.post('/sms-screening', async (req, res, next) => {
  try {
    const body = z
      .object({
        memberId: z.string(),
        outreachPrompt: z.string(),
        memberReply: z.string(),
        memberPhone: z.string(),
        coordinatorEmail: z.string().email(),
        fromNumber: z.string().optional(),
      })
      .parse(req.body);

    const result = await processSmsScreening(body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

r.post('/ehr-intake', async (req, res, next) => {
  try {
    const body = z
      .object({
        memberId: z.string(),
        encounterId: z.string().optional(),
        responses: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
        additionalNote: z.string().optional(),
        destinationEmail: z.string().email(),
      })
      .parse(req.body);

    const result = await processEhrIntake(body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

r.post('/monitoring', async (req, res, next) => {
  try {
    const body = z
      .object({
        memberId: z.string(),
        checkInId: z.string().optional(),
        responses: z
          .array(
            z.object({
              prompt: z.string(),
              reply: z.string(),
              channel: z.enum(['voice', 'sms']),
              timestamp: z.string().optional(),
            })
          )
          .default([]),
        notifyEmails: z.array(z.string().email()).nonempty(),
      })
      .parse(req.body);

    const result = await processMonitoringCheckIn(body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

r.post('/care-team-alert', async (req, res, next) => {
  try {
    const body = z
      .object({
        memberId: z.string(),
        transcript: z.array(messageSchema),
        dashboardUrl: z.string().url().optional(),
        notifyEmails: z.array(z.string().email()).nonempty(),
      })
      .parse(req.body);

    const result = await processCareTeamAlert(body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

r.post('/population-health', async (req, res, next) => {
  try {
    const body = z
      .object({
        tenantId: z.string().optional(),
        cohort: z
          .array(
            z.object({
              memberId: z.string(),
              transcript: z.array(messageSchema),
              context: z
                .object({
                  encounterId: z.string().optional(),
                  careTeam: z.array(z.string()).optional(),
                  requiredScreenings: z.number().optional(),
                  completedScreenings: z.number().optional(),
                  monthlyGoal: z.number().optional(),
                })
                .optional(),
            })
          )
          .nonempty(),
      })
      .parse(req.body);

    const result = await processPopulationHealth(body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

r.post('/post-discharge', async (req, res, next) => {
  try {
    const body = z
      .object({
        memberId: z.string(),
        memberPhone: z.string(),
        careTeamEmail: z.string().email(),
        encounterId: z.string().optional(),
        dischargeSummary: z.string().optional(),
        memberReply: z.string(),
        fromNumber: z.string().optional(),
      })
      .parse(req.body);

    const result = await processPostDischarge(body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default r;
