require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs'); // Include the file system module

const app = express();
const PORT = process.env.PORT || 3000;
const cors = require('cors');
app.use(cors());


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

// Define the path to the log file
const logFilePath = './definitions_log.txt';

// Function to log the definition
function logDefinition(definition) {
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp}: ${definition}\n`;
  
  // Append the log entry to the file
  fs.appendFile(logFilePath, logEntry, (err) => {
    if (err) {
      console.error('Error logging definition:', err);
    }
  });
}

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
    messages.push({ role: 'user', content: 'Construct a definition or synopsis of constructivism in the context of education using only the information provided in user responses Do not add interpret or expand upon the concepts mentioned use only the user's exact wording to generate the concept Begin without a prior definition and don't include any external knowledge or descriptions not explicitly stated in the user responses.' });

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
    
    // Log the updated definition
    logDefinition(updatedDefinition); // Call this function to log the definition


    // Send the updated definition back to the client
    res.json({ updatedDefinition });
  } catch (error) {
    console.error('Error generating definition:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint to get the history of definitions
app.get('/definitions-history', (req, res) => {
  fs.readFile(logFilePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading log file:', err);
      res.status(500).send('Internal Server Error');
    } else {
      res.send(data);
    }
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
