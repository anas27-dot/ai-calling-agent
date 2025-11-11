import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const {
  EXOTEL_SID,
  EXOTEL_TOKEN,
  EXOTEL_FROM_NUMBER,
  TEST_RECIPIENT_NUMBER
} = process.env;

if (!EXOTEL_SID || !EXOTEL_TOKEN || !EXOTEL_FROM_NUMBER || !TEST_RECIPIENT_NUMBER) {
  console.error('Missing Exotel environment variables. Check your .env file.');
  process.exit(1);
}

const main = async () => {
  try {
    const response = await axios.post(
      `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/Calls/connect.json`,
      new URLSearchParams({
        From: TEST_RECIPIENT_NUMBER,
        To: EXOTEL_FROM_NUMBER,
        CallerId: EXOTEL_FROM_NUMBER,
        CallType: 'trans',
        Url: 'http://your-public-url/exotel/answer'
      }),
      {
        auth: {
          username: EXOTEL_SID,
          password: EXOTEL_TOKEN
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

