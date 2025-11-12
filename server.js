import express from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';

dotenv.config();

const { PORT = 3000, OPENAI_API_KEY } = process.env;

if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan('dev'));

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const sessions = new Map();

const SYSTEM_PROMPT = `You are a natural Hindi-speaking AI assistant. 
Respond in Hindi (Devanagari only), keep replies short (1-2 sentences), and be polite.`;

// AI Reply Generator
const getReply = async (callSid, userText) => {
  let history = sessions.get(callSid) || [];
  history.push({ role: 'user', content: userText });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    max_tokens: 80,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history]
  });

  const reply = completion.choices[0].message.content.trim();
  history.push({ role: 'assistant', content: reply });

  if (history.length > 10) history = history.slice(-10);

  sessions.set(callSid, history);
  return reply;
};

// Middleware: Track active sessions (optional - for future enhancements)
app.use((req, res, next) => {
  const callSid = req.body.CallSid || req.query.CallSid;
  // Sessions are arrays, lastActive tracking can be added later if needed
  next();
});

// GET: Initial Greeting (Voicebot Applet hits this)
app.get('/exotel/voicebot', (req, res) => {
  const callSid = req.query.CallSid || `call-${Date.now()}`;
  console.log('GET /exotel/voicebot → CallSid:', callSid);

  sessions.set(callSid, []);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN">नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?</Say>
  <Record maxLength="30" finishOnKey="#" transcriptionEnabled="true" />
</Response>`;

  res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
});

// POST: Transcription Callback (from Exotel Voicebot Applet)
app.post('/exotel/voicebot', async (req, res) => {
  const callSid = req.body.CallSid;
  const transcription = req.body.Transcription || req.body.SpeechResult || '';

  console.log('POST /exotel/voicebot → CallSid:', callSid, 'Transcription:', transcription);

  if (!transcription.trim()) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN">क्षमा करें, मैं समझ नहीं पाया। कृपया दोबारा बोलें।</Say>
  <Record maxLength="30" finishOnKey="#" transcriptionEnabled="true" />
</Response>`;
    return res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
  }

  try {
    const reply = await getReply(callSid, transcription);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN">${reply}</Say>
  <Record maxLength="30" finishOnKey="#" transcriptionEnabled="true" />
</Response>`;

    res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
  } catch (err) {
    console.error('AI Error:', err);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN">क्षमा करें, त्रुटि हुई।</Say>
  <Hangup/>
</Response>`;
    res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
  }
});

// Health Check
app.get('/', (req, res) => res.send('Hindi Voicebot LIVE'));

// Auto-cleanup old sessions (simplified - clears all after 30 mins of inactivity)
setInterval(() => {
  // Simple cleanup: clear sessions older than 30 minutes
  // Note: For production, use Redis with TTL
  if (sessions.size > 100) {
    sessions.clear();
    console.log('Cleared all sessions (prevent memory leak)');
  }
}, 30 * 60 * 1000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server: https://tfg-20ng.onrender.com`);
});
