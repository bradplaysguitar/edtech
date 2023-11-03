require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static('public'));

// Load client secrets from a local file.
const serviceAccount = require('./fresh-sequence-403917-cd91d53c0136.json');

// Configure a JWT auth client
const jwtClient = new google.auth.JWT(
  serviceAccount.client_email,
  null,
  serviceAccount.private_key,
  ['https://www.googleapis.com/auth/spreadsheets']
);

// Authorize the client
jwtClient.authorize((err, tokens) => {
  if (err) {
    console.log(err);
    return;
  } else {
    console.log('Successfully connected to Google Sheets!');
  }
});

// Google Sheets API setup
const sheets = google.sheets({ version: 'v4', auth: jwtClient });

// Middleware to parse JSON bodies
app.use(express.json());

// Function to perform exponential back-off
const exponentialBackoff = (fn, delay = 1000, retries = 5) => {
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        if (retries === 0) {
          console.log('Axios error:', error.response ? error.response.data : error.message);
          reject(error);
        } else {
          console.log(`Retrying in ${delay}ms...`);
          setTimeout(() => {
            exponentialBackoff(fn, delay * 2, retries - 1).then(resolve, reject);
          }, delay);
        }
      }
    };
    attempt();
  });
};

app.post('/generate-definition', async (req, res) => {
  try {
    // Fetch responses from Google Spreadsheet
    const spreadsheetId = process.env.SPREADSHEET_ID; // Ensure your .env file has SPREADSHEET_ID set
    const range = 'Sheet1!B2:B500'; // Adjust based on your sheet's name and range

    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const responses = sheetResponse.data.values.flat();
    console.log('Responses from Google Sheets:', responses);

    // Prepare the messages for ChatGPT
    const messages = responses.map(response => ({ role: 'user', content: response }));
    console.log('Sending the following messages to OpenAI:', messages);

    // Add the specific prompt as the last message
    messages.push({ role: 'user', content: 'Using strictly only the content provided by the user, provide an answer to the question, What is constructivism? Do not elaborate or provide more deatails. The answer must be only constructed using the words and details provided by the user' });

    // Function to send the messages to OpenAI API
    const sendToOpenAI = async () => {
      return axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4', // Replace with the model you're using
        messages: messages,
        max_tokens: 150
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` // Ensure your .env file has OPENAI_API_KEY set
        }
      });
    };

    // Use exponential backoff when sending the messages to OpenAI API
    const openAIResponse = await exponentialBackoff(sendToOpenAI);

    // Extract the updated definition from the OpenAI response
    const updatedDefinition = openAIResponse.data.choices[0].message.content.trim();

    // Send the updated definition back to the client
    res.json({ updatedDefinition });
  } catch (error) {
    console.error('Error generating definition:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
