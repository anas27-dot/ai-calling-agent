  import axios from 'axios';
  import dotenv from 'dotenv';

  dotenv.config();

  const {
    EXOTEL_ACCOUNT_SID,
    EXOTEL_API_KEY,
    EXOTEL_API_TOKEN,
    EXOTEL_FROM_NUMBER,  // Your virtual number
    TEST_RECIPIENT_NUMBER  // Test caller's number (e.g., 9307001740)
  } = process.env;

  // Validate env vars
  if (!EXOTEL_ACCOUNT_SID || !EXOTEL_API_KEY || !EXOTEL_API_TOKEN || !EXOTEL_FROM_NUMBER || !TEST_RECIPIENT_NUMBER) {
    console.error('Missing Exotel environment variables.');
    process.exit(1);
  }

  const exotelHost = 'api.exotel.com';  // Default; adjust if custom subdomain

  const main = async () => {
    try {
      const response = await axios.post(
        `https://${exotelHost}/v1/Accounts/${EXOTEL_ACCOUNT_SID}/Calls/connect.json`,
        new URLSearchParams({
          From: TEST_RECIPIENT_NUMBER,  // Caller (test number)
          To: EXOTEL_FROM_NUMBER,       // Callee (your virtual number → triggers Flow)
          CallerId: EXOTEL_FROM_NUMBER,
          CallType: 'trans',            // Transactional call
          // Url: 'https://tfg-20ng.onrender.com/exotel/answer'  // Comment out to use Flow Builder
          StatusCallback: 'https://tfg-20ng.onrender.com/exotel/status',  // Optional: Log call status
          StatusCallbackEvents: 'initiated,ringing,answered,completed'     // Track events
        }),
        {
          auth: {
            username: EXOTEL_API_KEY,
            password: EXOTEL_API_TOKEN
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('Call initiated:', response.data);
      const callSid = response.data.Call?.Sid;
      if (callSid) {
        console.log(`Monitor call: https://${exotelHost}/v1/Accounts/${EXOTEL_ACCOUNT_SID}/Calls/${callSid}.json`);
      }
    } catch (error) {
      console.error('Failed to trigger call:');
      if (error.response) {
        console.error(error.response.status, error.response.data);
      } else {
        console.error(error.message);
      }
    }
  };

  main();