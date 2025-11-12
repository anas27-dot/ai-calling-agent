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

// GET handler for testing/debugging (browser access)
app.get('/exotel/answer', (req, res) => {
  res.status(200).json({
    message: 'This endpoint accepts POST requests only. Exotel will call this with POST method.',
    endpoint: '/exotel/answer',
    method: 'POST',
    expected: 'TwiML XML response with <Response>, <Say>, and <Record> tags'
  });
});

// Exotel answers calls by requesting this URL to get TwiML-ish instructions.
app.post('/exotel/answer', async (req, res) => {
  const callSid = req.body.CallSid || `call-${Date.now()}`;
  
  // Log all incoming parameters including passthrough data
  console.log('=== Incoming Call ===');
  console.log('CallSid:', callSid);
  console.log('All body params:', JSON.stringify(req.body, null, 2));
  console.log('All query params:', JSON.stringify(req.query, null, 2));
  
  // Extract passthrough parameters (any custom params you send from Exotel)
  const passthroughParams = { ...req.body, ...req.query };
  delete passthroughParams.CallSid; // Remove standard Exotel params if needed
  console.log('Passthrough params:', passthroughParams);
  
  callSessions.set(callSid, [
    { role: 'assistant', content: 'नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?' }
  ]);

  res.type('application/xml');
  res.send(`
<Response>
  <Say language="hi-IN">नमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?</Say>
  <Record transcriptionType="auto" transcriptionEnabled="true" playBeep="false" callbackUrl="${req.protocol}://${req.get('host')}/exotel/recording?callSid=${callSid}" />
</Response>
  `.trim());
});

// Exotel posts recording / transcription details to this URL.
app.post('/exotel/recording', async (req, res) => {
  const sessionId = req.query.callSid;
  const transcription = req.body.Transcription ?? req.body.SpeechResult ?? '';

  if (!sessionId || !transcription) {
    return res.status(200).send('OK');
  }

  const history = callSessions.get(sessionId) || [];
  if (history.length >= 6) {
    callSessions.delete(sessionId);
    return res.type('application/xml').send(`
<Response>
  <Say language="hi-IN">धन्यवाद! आपका दिन शुभ हो।</Say>
  <Hangup/>
</Response>
    `.trim());
  }

  try {
    const reply = await getReply(sessionId, transcription);
    res.type('application/xml').send(`
<Response>
  <Say language="hi-IN">${reply}</Say>
  <Record transcriptionType="auto" transcriptionEnabled="true" playBeep="false" callbackUrl="${req.protocol}://${req.get('host')}/exotel/recording?callSid=${sessionId}" />
</Response>
    `.trim());
  } catch (err) {
    console.error(err);
    res.type('application/xml').send(`
<Response>
  <Say language="hi-IN">क्षमा करें, कुछ समस्या आ गई है। कृपया बाद में पुनः प्रयास करें।</Say>
  <Hangup/>
</Response>
    `.trim());
  }
});

// Basic health check
app.get('/', (_, res) => {
  res.send('AI calling agent MVP is running.');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});

