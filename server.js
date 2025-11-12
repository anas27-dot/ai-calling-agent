// server.js
import express from 'express';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const sessions = new Map(); // CallSid → history

// GET: Call starts → Greeting + Record
app.get('/exotel/voicebot', (req, res) => {
  const callSid = req.query.CallSid || 'unknown';
  console.log('STEP 1: GET /exotel/voicebot → CallSid:', callSid);
  console.log('All query params:', JSON.stringify(req.query, null, 2));

  sessions.set(callSid, []); // Start session

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="Manvi">नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?</Say>
  <Record maxLength="30" finishOnKey="#" transcriptionEnabled="true" />
</Response>`;

  console.log('STEP 2: Sending XML → Greeting + Start recording');
  console.log('XML Response:', xml);
  res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
});

// POST: Transcription received → AI reply
app.post('/exotel/voicebot', async (req, res) => {
  const callSid = req.body.CallSid;
  const text = req.body.Transcription || '';

  console.log('STEP 3: POST → CallSid:', callSid, 'Text:', text);

  if (!text.trim()) {
    console.log('No speech → Reprompt');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="Manvi">क्षमा करें, मैं समझ नहीं पाया। कृपया दोबारा बोलें।</Say>
  <Record maxLength="30" finishOnKey="#" transcriptionEnabled="true" />
</Response>`;
    return res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
  }

  // AI Reply
  const history = sessions.get(callSid) || [];
  history.push({ role: 'user', content: text });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a helpful Hindi assistant. Reply in short Hindi.' },
      ...history.slice(-5)
    ]
  });

  const reply = completion.choices[0].message.content.trim();
  history.push({ role: 'assistant', content: reply });

  sessions.set(callSid, history);

  console.log('STEP 4: AI Reply →', reply);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="Manvi">${reply}</Say>
  <Record maxLength="30" finishOnKey="#" transcriptionEnabled="true" />
</Response>`;

  console.log('STEP 5: Bot speaks → Loop');
  res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
});

// Health Check
app.get('/', (req, res) => res.send('Bot LIVE'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('Server ready'));
