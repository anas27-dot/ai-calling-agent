# AI Calling Agent MVP

Minimal proof of concept using Express, Exotel, and OpenAI GPT-4 (Hindi + English).

## Setup

1. `npm install`
2. Create `.env` from `env.example` (rename to `.env.example` if permitted) and fill in:
   - `EXOTEL_SID`, `EXOTEL_TOKEN`, `EXOTEL_FROM_NUMBER`, `TEST_RECIPIENT_NUMBER`
   - `OPENAI_API_KEY`
   - `PORT` (optional)

## Run

- Start server: `npm start`
- Expose port 3000 via ngrok or similar and update the Exotel app URL to `https://<public-host>/exotel/answer`.
- Trigger test call: `npm run test-call`

Server logs show conversation state. Conversation gracefully ends after 2–3 back-and-forth exchanges.
