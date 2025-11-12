import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const {
  EXOTEL_ACCOUNT_SID,
  EXOTEL_API_KEY,
  EXOTEL_API_TOKEN,
  EXOTEL_FROM_NUMBER,
  TEST_RECIPIENT_NUMBER,
  EXOTEL_REGION
} = process.env;

if (
  !EXOTEL_ACCOUNT_SID ||
  !EXOTEL_API_KEY ||
  !EXOTEL_API_TOKEN ||
  !EXOTEL_FROM_NUMBER ||
  !TEST_RECIPIENT_NUMBER
) {
  console.error('Missing Exotel environment variables. Check your .env file.');
  process.exit(1);
}

const exotelHost = `${EXOTEL_REGION || 'api'}.exotel.com`;

const main = async () => {
  try {
    const response = await axios.post(
      `https://${exotelHost}/v1/Accounts/${EXOTEL_ACCOUNT_SID}/Calls/connect.json`,
      new URLSearchParams({
        From: TEST_RECIPIENT_NUMBER,
        To: EXOTEL_FROM_NUMBER,
        CallerId: EXOTEL_FROM_NUMBER,
        CallType: 'trans',
        Url: 'https://ai-calling-agent-jyce.onrender.com/exotel/answer'
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

    console.log('Call triggered:', response.data);
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

