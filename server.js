import express from 'express';
import morgan from 'morgan';
import dotenv from 'dotenv';
import axios from 'axios';
import { OpenAI } from 'openai';

dotenv.config();

const {
  PORT = 3000,
  EXOTEL_SID,
  EXOTEL_TOKEN,
  OPENAI_API_KEY
} = process.env;

if (!EXOTEL_SID || !EXOTEL_TOKEN || !OPENAI_API_KEY) {
  console.warn('Missing required environment variables. Check your .env file.');
}

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan('dev'));

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Simple in-memory state to keep the short conversation
const callSessions = new Map();

const getReply = async (sessionId, userUtterance) => {
  const history = callSessions.get(sessionId) || [];
  history.push({ role: 'user', content: userUtterance });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.6,
    messages: [
      {
        role: 'system',
        content:
          'You are a friendly AI call agent speaking primarily in Hindi, but can use English if needed. Keep answers short and polite.'
      },
      ...history
    ]
  });

  const aiMessage = response.choices[0]?.message?.content?.trim() ?? 'धन्यवाद।';
  history.push({ role: 'assistant', content: aiMessage });
  callSessions.set(sessionId, history);
  return aiMessage;
};

// Common handler function for both GET and POST requests
const handleExotelAnswer = async (req, res) => {
  // Exotel can send CallSid in body (POST) or query params (GET)
  const callSid = req.body?.CallSid || req.query?.CallSid || `call-${Date.now()}`;
  
  console.log('=== Incoming Call ===');
  console.log('Method:', req.method);
  console.log('CallSid:', callSid);
  
  callSessions.set(callSid, [
    { role: 'assistant', content: 'नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?' }
  ]);

  // Force HTTPS for callback URL (Render uses HTTPS)
  const host = req.get('host');
  const callbackUrl = `https://${host}/exotel/recording?callSid=${callSid}`;
  
  // CRITICAL: Set proper content type and send clean XML
  res.set('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="woman">नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?</Say>
  <Record maxLength="30" finishOnKey="#" transcriptionType="auto" transcriptionEnabled="true" playBeep="false" callbackUrl="${callbackUrl}" />
</Response>`);
};

// GET handler (Exotel Connect applet uses GET by default)
app.get('/exotel/answer', handleExotelAnswer);

// POST handler (for other Exotel integrations)
app.post('/exotel/answer', handleExotelAnswer);

// Exotel posts recording / transcription details to this URL.
app.post('/exotel/recording', async (req, res) => {
  const sessionId = req.query.callSid;
  const transcription = req.body.Transcription ?? req.body.SpeechResult ?? '';

  console.log('=== Recording Callback ===');
  console.log('SessionId:', sessionId);
  console.log('Transcription:', transcription);

  if (!sessionId || !transcription) {
    return res.status(200).send('OK');
  }

  const history = callSessions.get(sessionId) || [];
  if (history.length >= 6) {
    callSessions.delete(sessionId);
    res.set('Content-Type', 'application/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="woman">धन्यवाद! आपका दिन शुभ हो।</Say>
  <Hangup/>
</Response>`);
  }

  try {
    const reply = await getReply(sessionId, transcription);
    // Force HTTPS for callback URL
    const host = req.get('host');
    const callbackUrl = `https://${host}/exotel/recording?callSid=${sessionId}`;
    
    res.set('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="woman">${reply}</Say>
  <Record maxLength="30" finishOnKey="#" transcriptionType="auto" transcriptionEnabled="true" playBeep="false" callbackUrl="${callbackUrl}" />
</Response>`);
  } catch (err) {
    console.error('Error:', err);
    res.set('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="woman">क्षमा करें, कुछ समस्या आ गई है। कृपया बाद में पुनः प्रयास करें।</Say>
  <Hangup/>
</Response>`);
  }
});

// Exotel Voicebot applet endpoint - handles all conversation flow through code
app.get('/exotel/voicebot', async (req, res) => {
  // Handle GET requests (Voicebot might use GET for initial call)
  const callSid = req.query.CallSid || req.query.callSid || req.query.From || `call-${Date.now()}`;
  
  console.log('=== Voicebot Initial Call (GET) ===');
  console.log('CallSid:', callSid);
  console.log('All query params:', JSON.stringify(req.query, null, 2));
  
  callSessions.set(callSid, [
    { role: 'assistant', content: 'नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?' }
  ]);
  
  // Exotel Voicebot - use Record instead of Gather for better compatibility
  const host = req.get('host');
  const callbackUrl = `https://${host}/exotel/voicebot?callSid=${callSid}`;
  
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="woman">नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?</Say>
  <Record maxLength="30" finishOnKey="#" transcriptionType="auto" transcriptionEnabled="true" playBeep="false" callbackUrl="${callbackUrl}" method="POST" />
</Response>`;
  
  console.log('Sending TwiML response:', twimlResponse);
  
  res.set('Content-Type', 'application/xml');
  res.send(twimlResponse);
});

app.post('/exotel/voicebot', async (req, res) => {
  const callSid = req.query.callSid || req.body.CallSid || req.body.callSid || req.body.From || `call-${Date.now()}`;
  const userSpeech = req.body.Transcription || req.body.SpeechResult || req.body.text || '';

  console.log('=== Voicebot Callback (POST) ===');
  console.log('CallSid:', callSid);
  console.log('User Speech:', userSpeech);
  console.log('All body params:', JSON.stringify(req.body, null, 2));
  console.log('All query params:', JSON.stringify(req.query, null, 2));

  // If no transcription, just acknowledge
  if (!userSpeech) {
    const host = req.get('host');
    const callbackUrl = `https://${host}/exotel/voicebot?callSid=${callSid}`;
    
    res.set('Content-Type', 'application/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="woman">क्षमा करें, मैं आपकी बात नहीं सुन पाया। कृपया दोबारा बोलें।</Say>
  <Record maxLength="30" finishOnKey="#" transcriptionType="auto" transcriptionEnabled="true" playBeep="false" callbackUrl="${callbackUrl}" method="POST" />
</Response>`);
  }

  // Initialize session if not exists
  if (!callSessions.has(callSid)) {
    callSessions.set(callSid, [
      { role: 'assistant', content: 'नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?' }
    ]);
  }

  // Check if conversation limit reached
  const history = callSessions.get(callSid) || [];
  if (history.length >= 6) {
    callSessions.delete(callSid);
    res.set('Content-Type', 'application/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="woman">धन्यवाद! आपका दिन शुभ हो।</Say>
  <Hangup/>
</Response>`);
  }

  try {
    const reply = await getReply(callSid, userSpeech);
    const host = req.get('host');
    const callbackUrl = `https://${host}/exotel/voicebot?callSid=${callSid}`;
    
    res.set('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="woman">${reply}</Say>
  <Record maxLength="30" finishOnKey="#" transcriptionType="auto" transcriptionEnabled="true" playBeep="false" callbackUrl="${callbackUrl}" method="POST" />
</Response>`);
  } catch (err) {
    console.error('Error in voicebot:', err);
    res.set('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="woman">क्षमा करें, कुछ समस्या आ गई है। कृपया बाद में पुनः प्रयास करें।</Say>
  <Hangup/>
</Response>`);
  }
});

// Basic health check
app.get('/', (_, res) => {
  res.send('AI calling agent MVP is running.');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});

