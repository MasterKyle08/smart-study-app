/**
 * @file backend/services/ai.service.js
 * @description Service for interacting with AI (OpenAI GPT) for content generation.
 */

const fetch = require('node-fetch'); // Using node-fetch v2

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'; // Updated for chat models
const AI_MODEL = 'gpt-3.5-turbo'; // Or specify another model like 'gpt-4' if available

if (!OPENAI_API_KEY) {
  console.warn("Warning: OPENAI_API_KEY is not defined. AI features will not work.");
}

/**
 * Helper function to make requests to OpenAI API.
 * @param {Array<object>} messages - The messages array for the chat completion.
 * @param {object} [options={}] - Additional options for the OpenAI API call.
 * @returns {Promise<object>} The JSON response from OpenAI.
 * @throws {Error} If API request fails or returns an error.
 */
async function callOpenAI(messages, options = {}) {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured.');
  }

  const body = {
    model: AI_MODEL,
    messages: messages,
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 1024, // Adjust as needed
    // top_p: options.top_p || 1,
    // frequency_penalty: options.frequency_penalty || 0,
    // presence_penalty: options.presence_penalty || 0,
    ...options // Allow overriding model, temperature, etc.
  };

  if (options.response_format) { // For features like JSON mode if supported by model
      body.response_format = options.response_format;
  }


  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenAI API Error:', data);
      const errorMessage = data.error?.message || `OpenAI API request failed with status ${response.status}`;
      const error = new Error(errorMessage);
      error.statusCode = response.status;
      error.details = data.error;
      throw error;
    }
    
    if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) {
        console.error('OpenAI API - Unexpected response structure:', data);
        throw new Error('Invalid response structure from OpenAI API.');
    }

    return data;
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    // Re-throw the error so it can be caught by the route handler
    throw error; 
  }
}

/**
 * Generates a concise summary for the given text.
 * @param {string} text - The input text to summarize.
 * @returns {Promise<string>} The generated summary.
 */
async function generateSummary(text) {
  const messages = [
    {
      role: "system",
      content: "You are a helpful assistant skilled in summarizing academic texts. Generate a concise summary of the provided text, focusing on key concepts and main ideas. The summary should be between 200 and 300 words."
    },
    {
      role: "user",
      content: `Please summarize the following text:\n\n${text}`
    }
  ];

  const data = await callOpenAI(messages, { max_tokens: 400 }); // Allow more tokens for summary
  return data.choices[0].message.content.trim();
}

/**
 * Generates flashcards from the given text.
 * @param {string} text - The input text.
 * @returns {Promise<Array<object>>} An array of flashcard objects (e.g., { term: string, definition: string }).
 */
async function generateFlashcards(text) {
  const messages = [
    {
      role: "system",
      content: `You are a helpful assistant skilled in creating educational flashcards. Based on the provided text, generate 10-15 flashcards. Each flashcard should have a 'term' and a 'definition'.
      Provide the output STRICTLY as a JSON array of objects, where each object has a 'term' (string) and a 'definition' (string) key.
      Example: [{"term": "Photosynthesis", "definition": "The process by which green plants use sunlight, water, and carbon dioxide to create their own food."}]`
    },
    {
      role: "user",
      content: `Generate flashcards from this text:\n\n${text}`
    }
  ];
  
  // Forcing JSON output might require specific model versions or parameters.
  // gpt-3.5-turbo and later models support JSON mode with response_format.
  const data = await callOpenAI(messages, { 
    max_tokens: 1500, // Allow more tokens for JSON structure
    response_format: { type: "json_object" } // Request JSON output
  });

  try {
    // The response content should be a string that is a JSON object containing the array.
    // Or, if the model directly outputs the array as the root object in content.
    let flashcardsArray;
    const content = data.choices[0].message.content;
    const parsedContent = JSON.parse(content);

    // Check if the parsed content is an object with a key (e.g., "flashcards") that holds the array
    // or if it's the array directly. Adjust based on typical model behavior.
    if (Array.isArray(parsedContent)) {
        flashcardsArray = parsedContent;
    } else if (typeof parsedContent === 'object' && parsedContent !== null) {
        // Try to find an array within the object, e.g. if model wraps it like { "flashcards": [...] }
        const keyWithArray = Object.keys(parsedContent).find(k => Array.isArray(parsedContent[k]));
        if (keyWithArray) {
            flashcardsArray = parsedContent[keyWithArray];
        } else {
            throw new Error("JSON output from AI is not in the expected array format, nor an object containing the array.");
        }
    } else {
        throw new Error("JSON output from AI is not in the expected array format.");
    }
    
    // Validate structure
    if (!flashcardsArray.every(fc => typeof fc.term === 'string' && typeof fc.definition === 'string')) {
        throw new Error("Generated flashcards do not match the required term/definition structure.");
    }
    return flashcardsArray;

  } catch (e) {
    console.error("Error parsing flashcards JSON from AI:", e);
    console.error("Raw AI response for flashcards:", data.choices[0].message.content);
    // Fallback or re-throw:
    // For now, re-throw. Could implement a retry or a simpler parsing attempt.
    throw new Error(`Failed to parse flashcards from AI response. ${e.message}`);
  }
}

/**
 * Generates a multiple-choice quiz from the given text.
 * @param {string} text - The input text.
 * @returns {Promise<Array<object>>} An array of quiz question objects.
 * (e.g., { question: string, options: Array<string>, correctAnswer: string })
 */
async function generateQuiz(text) {
  const messages = [
    {
      role: "system",
      content: `You are a helpful assistant skilled in creating multiple-choice quizzes. Based on the provided text, generate 5-10 quiz questions.
      Each question must have:
      1. A 'question' (string).
      2. An 'options' array of 3-4 strings representing possible answers.
      3. A 'correctAnswer' (string) which MUST be one of the strings from the 'options' array.
      Provide the output STRICTLY as a JSON array of objects adhering to this structure.
      Example: [{"question": "What is the capital of France?", "options": ["Berlin", "Madrid", "Paris", "Rome"], "correctAnswer": "Paris"}]`
    },
    {
      role: "user",
      content: `Generate a quiz from this text:\n\n${text}`
    }
  ];

  const data = await callOpenAI(messages, { 
    max_tokens: 2000, // Allow more tokens for complex JSON
    response_format: { type: "json_object" } // Request JSON output
  });
  
  try {
    let quizArray;
    const content = data.choices[0].message.content;
    const parsedContent = JSON.parse(content);

    if (Array.isArray(parsedContent)) {
        quizArray = parsedContent;
    } else if (typeof parsedContent === 'object' && parsedContent !== null) {
        const keyWithArray = Object.keys(parsedContent).find(k => Array.isArray(parsedContent[k]));
        if (keyWithArray) {
            quizArray = parsedContent[keyWithArray];
        } else {
            throw new Error("JSON output from AI is not in the expected array format for quiz, nor an object containing the array.");
        }
    } else {
        throw new Error("JSON output from AI is not in the expected array format for quiz.");
    }

    // Validate structure
    if (!quizArray.every(q => 
        typeof q.question === 'string' &&
        Array.isArray(q.options) &&
        q.options.every(opt => typeof opt === 'string') &&
        typeof q.correctAnswer === 'string' &&
        q.options.includes(q.correctAnswer)
    )) {
        throw new Error("Generated quiz questions do not match the required structure or correctAnswer is invalid.");
    }
    return quizArray;

  } catch (e) {
    console.error("Error parsing quiz JSON from AI:", e);
    console.error("Raw AI response for quiz:", data.choices[0].message.content);
    throw new Error(`Failed to parse quiz from AI response. ${e.message}`);
  }
}

module.exports = {
  generateSummary,
  generateFlashcards,
  generateQuiz,
};
