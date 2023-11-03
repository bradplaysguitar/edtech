const express = require('express');
const axios = require('axios');
const app = express();
const PORT = 3000;

app.use(express.json());

app.post('/generate-definition', async (req, res) => {
  try {
    // Fetch responses from Google Spreadsheet
    // (Implement this according to your setup)
    const responses = await fetchResponsesFromSpreadsheet();

    // Prepare the prompt for ChatGPT
    const prompt = `Given the following user responses, provide an updated definition of constructivism:\n\n${responses.join('\n')}`;

    // Send the prompt to OpenAI API
    const openAIResponse = await axios.post('https://api.openai.com/v1/engines/davinci-codex/completions', {
      prompt: prompt,
      max_tokens: 150
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer YOUR_OPENAI_API_KEY`
      }
    });

    // Extract the updated definition from the OpenAI response
    const updatedDefinition = openAIResponse.data.choices[0].text.trim();

    // Send the updated definition back to the website
    res.json({ updatedDefinition });
  } catch (error) {
    console.error('Error generating definition:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

async function fetchResponsesFromSpreadsheet() {
  // Implement the logic to fetch responses from your Google Spreadsheet
  // This could involve using Google Sheets API or any other method you prefer
  // Return the responses as an array of strings
}
