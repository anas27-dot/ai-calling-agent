// server.js
import express from 'express';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Log all incoming requests (middleware - must be before routes)
app.use((req, res, next) => {
  if (req.path !== '/') {
    console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const sessions = new Map(); // CallSid → history

// Helper function to handle initial call (both GET and POST)
const handleInitialCall = (req, res) => {
  const timestamp = new Date().toISOString();
  // Try multiple possible CallSid sources from query, body, or headers
  const callSid = req.query.CallSid || req.query.callSid || req.body.CallSid || req.body.callSid || 
                  req.query.From || req.body.From || req.query.CallFrom || req.body.CallFrom || 
                  `call-${Date.now()}`;
  
  console.log(`\n========== ${req.method} REQUEST (INITIAL CALL) ==========`);
  console.log('Timestamp:', timestamp);
  console.log('CallSid:', callSid);
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query Params:', JSON.stringify(req.query, null, 2));
  if (req.method === 'POST') {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  console.log('IP:', req.ip);
  
  // Check if this is a transcription callback (has Transcription or SpeechResult)
  if (req.body.Transcription || req.body.SpeechResult) {
    console.log('⚠️  This looks like a transcription callback, not initial call');
    console.log('Redirecting to POST handler...');
    // Don't handle here, let POST handler take it
    return;
  }
  
  // Initialize session
  sessions.set(callSid, []);
  console.log('✅ Session initialized for CallSid:', callSid);
  
  // Build callback URL for transcription
  const host = req.get('host');
  const callbackUrl = `https://${host}/exotel/voicebot?callSid=${encodeURIComponent(callSid)}`;
  
  // Simplified TwiML - Exotel Voicebot might need simpler structure
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN">बोलिए...</Say>
  <Record maxLength="30" transcriptionEnabled="true" callbackUrl="${callbackUrl}" method="POST" />
</Response>`;

  console.log('Callback URL (raw):', callbackUrl);
  console.log('CallSid value:', callSid);
  console.log('CallSid type:', typeof callSid);
  console.log('Full Response XML:', xml);
  console.log('Response Status: 200');
  console.log('Response Content-Type: application/xml');
  console.log(`========== ${req.method} RESPONSE SENT (INITIAL CALL) ==========\n`);

  res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
};

// GET: Call starts → Greeting + Record
app.get('/exotel/voicebot', handleInitialCall);

// Alternative endpoint for Connect applet (if Voicebot doesn't work)
app.get('/exotel/connect', handleInitialCall);
app.post('/exotel/connect', async (req, res) => {
  // Same as voicebot POST handler
  if (req.body.Transcription || req.body.SpeechResult) {
    const callSid = req.body.CallSid || req.query.callSid;
    const text = req.body.Transcription || req.body.SpeechResult || '';
    
    if (!text.trim()) {
      const host = req.get('host');
      const callbackUrl = `https://${host}/exotel/connect?callSid=${encodeURIComponent(callSid)}`;
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN">क्षमा करें, मैं समझ नहीं पाया। कृपया दोबारा बोलें।</Say>
  <Record maxLength="30" transcriptionEnabled="true" callbackUrl="${callbackUrl}" method="POST" />
</Response>`;
      return res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
    }

    const history = sessions.get(callSid) || [];
    history.push({ role: 'user', content: text });

    try {
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

      const host = req.get('host');
      const callbackUrl = `https://${host}/exotel/connect?callSid=${encodeURIComponent(callSid)}`;
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN">${reply}</Say>
  <Record maxLength="30" transcriptionEnabled="true" callbackUrl="${callbackUrl}" method="POST" />
</Response>`;

      res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
    } catch (err) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN">क्षमा करें, त्रुटि हुई।</Say>
  <Hangup/>
</Response>`;
      res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
    }
  } else {
    handleInitialCall(req, res);
  }
});

// POST: Can be initial call OR transcription callback
app.post('/exotel/voicebot', async (req, res) => {
  // Check if this is a transcription callback
  if (req.body.Transcription || req.body.SpeechResult) {
    // This is a transcription callback - handle it
    const timestamp = new Date().toISOString();
    const callSid = req.body.CallSid || req.query.callSid;
    const text = req.body.Transcription || req.body.SpeechResult || '';
    
    console.log('\n========== POST REQUEST (TRANSCRIPTION CALLBACK) ==========');
    console.log('Timestamp:', timestamp);
    console.log('CallSid:', callSid);
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Query Params:', JSON.stringify(req.query, null, 2));
    console.log('Transcription Text:', text);
    console.log('Text Length:', text.length);
    console.log('IP:', req.ip);

    if (!text.trim()) {
      console.log('⚠️  WARNING: No transcription text received');
      console.log('Sending reprompt response...');
      const host = req.get('host');
      const callbackUrl = `https://${host}/exotel/voicebot?callSid=${encodeURIComponent(callSid)}`;
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="Manvi">क्षमा करें, मैं समझ नहीं पाया। कृपया दोबारा बोलें।</Say>
  <Record maxLength="30" finishOnKey="#" transcriptionEnabled="true" callbackUrl="${callbackUrl}" method="POST" />
</Response>`;
      console.log('Reprompt XML:', xml);
      console.log('========== POST RESPONSE (REPROMPT) ==========\n');
      return res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
    }

    // AI Reply
    console.log('✅ Transcription received, processing AI reply...');
    const history = sessions.get(callSid) || [];
    console.log('Session History Length:', history.length);
    history.push({ role: 'user', content: text });

    try {
      console.log('🤖 Calling OpenAI API...');
      const startTime = Date.now();
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful Hindi assistant. Reply in short Hindi.' },
          ...history.slice(-5)
        ]
      });
      const apiTime = Date.now() - startTime;
      console.log(`✅ OpenAI API responded in ${apiTime}ms`);

      const reply = completion.choices[0].message.content.trim();
      console.log('AI Reply:', reply);
      history.push({ role: 'assistant', content: reply });

      sessions.set(callSid, history);
      console.log('Session updated. History length:', history.length);

      const host = req.get('host');
      const callbackUrl = `https://${host}/exotel/voicebot?callSid=${encodeURIComponent(callSid)}`;
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="Manvi">${reply}</Say>
  <Record maxLength="30" finishOnKey="#" transcriptionEnabled="true" callbackUrl="${callbackUrl}" method="POST" />
</Response>`;

      console.log('Response XML:', xml);
      console.log('Callback URL:', callbackUrl);
      console.log('CallSid in callback:', callSid);
      console.log('========== POST RESPONSE (AI REPLY) ==========\n');
      res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
    } catch (err) {
      console.error('❌ ERROR in AI processing:');
      console.error('Error Type:', err.constructor.name);
      console.error('Error Message:', err.message);
      console.error('Error Stack:', err.stack);
      console.log('========== POST RESPONSE (ERROR) ==========\n');
      
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="hi-IN" voice="Manvi">क्षमा करें, त्रुटि हुई।</Say>
  <Hangup/>
</Response>`;
      res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
    }
  } else {
    // This is an initial call via POST - handle it like GET
    console.log('📞 POST request detected as initial call (no transcription)');
    handleInitialCall(req, res);
  }
});

// Health Check
app.get('/', (req, res) => {
  console.log('Health check requested');
  res.send('Bot LIVE');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 ========== SERVER STARTED ==========');
  console.log('Port:', PORT);
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('OpenAI API Key:', process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('Server URL: https://tfg-20ng.onrender.com');
  console.log('========================================\n');
});
