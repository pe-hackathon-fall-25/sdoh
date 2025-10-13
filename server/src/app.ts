import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { Server } from 'http';
import screenings from './routes/screenings';
import zcodes from './routes/zcodes';
import evidence from './routes/evidence';
import ai from './routes/ai';
import scenarios from './routes/scenarios';
import detections from './routes/detections';
import calls from './routes/calls';
import voice from './routes/voice';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';


// import { Server } from 'http';
// import { transcribeAudio } from './transcription';
// import { db } from '../lib/db';
import { calls as c} from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { mergeTranscripts, TranscriptMessage } from './services/transcript';
import { db } from './util/db';
import { Writer } from 'wav';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/screenings', screenings);
app.use('/api/zcodes', zcodes);
app.use('/api/evidence', evidence);
app.use('/api/ai', ai);
app.use('/api/scenarios', scenarios);
app.use('/api/ai/detections', detections);
app.use('/api/calls', calls);
app.use('/api/voice', voice);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err?.status === 'number' ? err.status : 400;
  const message = err instanceof Error ? err.message : 'Unknown error';
  if (err instanceof Error && 'issues' in err) {
    console.error('[app] request validation error', err);
  }
  res.status(status).json({ error: message });
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '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'
});


// Create a temp directory in your project
const TEMP_DIR = path.join(process.cwd(), 'temp');

// Ensure temp directory exists on startup
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  console.log('[transcription] Created temp directory:', TEMP_DIR);
}

export async function transcribeAudio(
  callSid: string,
  audioBuffer: Buffer
): Promise<string> {
  console.log('[transcription] Starting for call:', callSid);
  console.log('[transcription] Audio buffer size:', audioBuffer.length, 'bytes');
  
  try {
    const tempFile = path.join(TEMP_DIR, `audio-${callSid}-${Date.now()}.wav`);
    
    console.log('[transcription] Converting mulaw to WAV...');
    
    // Convert mulaw buffer to WAV file
    await convertMulawToWav(audioBuffer, tempFile);
    
    console.log('[transcription] WAV file created, calling Whisper API...');
    
    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: 'whisper-1',
      language: 'en',
      response_format: 'text',
    });
    
    const transcript = typeof transcription === 'string' 
      ? transcription 
      : transcription.text;
    
    console.log('[transcription] Complete:', transcript.substring(0, 100) + '...');
    
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
      console.log('[transcription] Temp file deleted');
    } catch (err) {
      console.warn('[transcription] Could not delete temp file:', err);
    }
    
    return transcript;
  } catch (error) {
    console.error('[transcription] Error:', error);
    throw error;
  }
}

function convertMulawToWav(mulawBuffer: Buffer, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // WAV file writer configuration for mulaw
    const writer = new Writer({
      sampleRate: 8000,      // Twilio uses 8000 Hz
      channels: 1,           // Mono
      bitDepth: 16,          // 16-bit PCM
    });

    const outputStream = fs.createWriteStream(outputPath);
    
    outputStream.on('finish', () => {
      console.log('[transcription] WAV conversion complete');
      resolve();
    });
    
    outputStream.on('error', (err) => {
      console.error('[transcription] WAV conversion error:', err);
      reject(err);
    });

    // Pipe the writer to file
    writer.pipe(outputStream);
    
    // Convert mulaw to PCM (16-bit linear)
    const pcmBuffer = mulawToPcm(mulawBuffer);
    
    // Write PCM data and end
    writer.write(pcmBuffer);
    writer.end();
  });
}

// mulaw to PCM conversion (standard algorithm)
function mulawToPcm(mulawBuffer: Buffer): Buffer {
  const pcmBuffer = Buffer.alloc(mulawBuffer.length * 2); // 16-bit = 2 bytes per sample
  
  for (let i = 0; i < mulawBuffer.length; i++) {
    const mulaw = mulawBuffer[i];
    const pcm = mulawDecode(mulaw);
    pcmBuffer.writeInt16LE(pcm, i * 2);
  }
  
  return pcmBuffer;
}

// Standard mulaw decode algorithm
function mulawDecode(mulaw: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  
  mulaw = ~mulaw;
  
  const sign = mulaw & 0x80;
  const exponent = (mulaw >> 4) & 0x07;
  const mantissa = mulaw & 0x0f;
  
  let sample = (mantissa << 3) + BIAS;
  sample <<= exponent;
  
  if (sign !== 0) {
    sample = -sample;
  }
  
  return Math.max(-CLIP, Math.min(CLIP, sample));
}


export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws) => {
    console.log('[websocket] Stream connected');
    
    let callSid: string | null = null;
    let streamSid: string | null = null;
    const audioBuffers: Buffer[] = [];
    
    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message.toString());
        
        switch (msg.event) {
          case 'connected':
            console.log('[websocket] Stream connected:', msg.protocol, msg.version);
            break;
            
          case 'start':
            callSid = msg.start.callSid;
            streamSid = msg.streamSid;
            console.log('[websocket] Stream started for call:', callSid);
            break;
            
          case 'media':
            const audioPayload = msg.media.payload;
            const audioChunk = Buffer.from(audioPayload, 'base64');
            audioBuffers.push(audioChunk);
            
            if (audioBuffers.length % 100 === 0) {
              console.log(`[websocket] Buffered ${audioBuffers.length} audio chunks`);
            }
            break;
            
          case 'stop':
            console.log('[websocket] Stream stopped');
            
            if (callSid && audioBuffers.length > 0) {
              const fullAudio = Buffer.concat(audioBuffers);
              console.log(`[websocket] Total audio: ${fullAudio.length} bytes`);
              
              processCallTranscript(callSid, fullAudio).catch(err => {
                console.error('[websocket] Transcription failed:', err);
              });
            }
            break;
        }
      } catch (error) {
        console.error('[websocket] Error parsing message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('[websocket] Stream disconnected');
      
      if (callSid && audioBuffers.length > 0) {
        const fullAudio = Buffer.concat(audioBuffers);
        processCallTranscript(callSid, fullAudio).catch(err => {
          console.error('[websocket] Transcription failed on close:', err);
        });
      }
    });

    ws.on('error', (error) => {
      console.error('[websocket] WebSocket error:', error);
    });
  });

  server.on('upgrade', (request, socket, head) => {
    console.log('[websocket] Upgrade request for:', request.url);
    
    if (request.url === '/api/voice/stream') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      console.log('[websocket] Rejected - invalid path');
      socket.destroy();
    }
  });

  console.log('[websocket] WebSocket server configured');
}

async function processCallTranscript(callSid: string, audioBuffer: Buffer) {
  try {
    console.log('[transcription] Processing call:', callSid);
    
    // Get the call record to determine speaker
    const [call] = await db
      .select()
      .from(c)
      .where(eq(c.callSid, callSid))
      .limit(1);
    
    if (!call) {
      console.error('[transcription] Call not found:', callSid);
      return;
    }
    
    // Transcribe the audio
    const transcriptText = await transcribeAudio(callSid, audioBuffer);
    
    // Convert to TranscriptMessage format
    const speaker = call.direction === 'inbound' ? 'member' : 'navigator';
    const newMessages: TranscriptMessage[] = [{
      speaker,
      text: transcriptText,
      timestamp: new Date().toISOString(),
      language: 'en',
    }];
    
    // Merge with existing transcript
    const existingTranscript = Array.isArray(call.metadata?.transcript) 
      ? call.metadata.transcript 
      : [];
    
    const mergedTranscript = mergeTranscripts(existingTranscript, newMessages);
    
    // Save back to database
    await db
      .update(c)
      .set({
        metadata: {
          ...call.metadata,
          transcript: mergedTranscript,
          transcribedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(c.callSid, callSid));
    
    console.log('[transcription] Saved transcript with', mergedTranscript.length, 'messages');
    
  } catch (error) {
    console.error('[transcription] Error processing:', error);
  }
}

export default app;
