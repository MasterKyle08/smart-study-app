/**
 * @file backend/services/ai.service.js
 * @description Service for interacting with Google's Generative AI (e.g., Gemma) for content generation.
 * This version uses prompt engineering for JSON output if native JSON mode is not supported by the model.
 */

const fetch = require('node-fetch'); // Using node-fetch v2

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
// IMPORTANT: Replace 'gemma-3-27b-it' with the actual model identifier you intend to use.
// Check Google AI documentation for available Gemma models and their identifiers.
const AI_MODEL_NAME = process.env.GOOGLE_AI_MODEL_NAME || 'gemma-3-27b-it'; // User specified this model
const GOOGLE_API_URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';


if (!GOOGLE_API_KEY) {
  console.warn(
    "Warning: GOOGLE_API_KEY is not defined in your .env file. " +
    "AI features using Google models will not work."
  );
}

/**
 * Helper function to make requests to Google's Generative AI API.
 * @param {Array<object>} contents - The contents array for the generateContent request.
 * @param {object} [generationConfig={}] - Generation configuration.
 * @param {string} [modelName=AI_MODEL_NAME] - The model to use.
 * @returns {Promise<object>} The JSON response from Google AI.
 * @throws {Error} If API request fails or returns an error.
 */
async function callGoogleAI(contents, generationConfig = {}, modelName = AI_MODEL_NAME) {
  if (!GOOGLE_API_KEY) {
    throw new Error('Google API key is not configured. Please set GOOGLE_API_KEY in your .env file.');
  }

  const apiUrl = `${GOOGLE_API_URL_BASE}${modelName}:generateContent?key=${GOOGLE_API_KEY}`;

  const payload = {
    contents: contents,
    generationConfig: {
      temperature: 0.7,
      topP: 1.0,
      maxOutputTokens: 2048, // Default, adjust per task
      ...generationConfig // Merge custom generationConfig
    }
  };

  // Remove responseMimeType and responseSchema if they are empty or not applicable
  if (payload.generationConfig.responseMimeType === undefined || payload.generationConfig.responseMimeType === null) {
    delete payload.generationConfig.responseMimeType;
  }
  if (payload.generationConfig.responseSchema === undefined || payload.generationConfig.responseSchema === null) {
    delete payload.generationConfig.responseSchema;
  }


  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Google AI API Error Response:', data);
      const errorMessage = data.error?.message || `Google AI API request failed with status ${response.status}`;
      const error = new Error(errorMessage);
      error.statusCode = response.status;
      error.details = data.error;
      throw error;
    }
    
    if (!data.candidates || data.candidates.length === 0 || 
        !data.candidates[0].content || !data.candidates[0].content.parts || 
        data.candidates[0].content.parts.length === 0 ||
        !data.candidates[0].content.parts[0].text) {
      console.error('Google AI API - Unexpected response structure:', data);
      if (data.candidates && data.candidates[0] && data.candidates[0].finishReason === 'SAFETY') {
        console.error('Google AI API - Content blocked due to safety ratings:', data.candidates[0].safetyRatings);
        throw new Error('Content generation blocked due to safety policies. Please revise your input.');
      }
      if (data.promptFeedback && data.promptFeedback.blockReason) {
        console.error('Google AI API - Prompt blocked:', data.promptFeedback.blockReason, data.promptFeedback.safetyRatings);
        throw new Error(`Prompt blocked due to ${data.promptFeedback.blockReason}. Please revise your input.`);
      }
      throw new Error('Invalid response structure from Google AI API.');
    }

    return data;
  } catch (error) {
    console.error('Error calling Google AI API:', error.message);
    throw error; 
  }
}

/**
 * Generates a concise summary for the given text.
 * @param {string} text - The input text to summarize.
 * @returns {Promise<string>} The generated summary.
 */
async function generateSummary(text) {
  const contents = [
    {
      role: "user",
      parts: [
        { text: `You are a helpful assistant skilled in summarizing academic texts. Generate a concise summary of the provided text, focusing on key concepts and main ideas. The summary should be between 200 and 300 words. Text to summarize:\n\n${text}` }
      ]
    }
  ];
  
  const generationConfig = {
    maxOutputTokens: 500 // Allow more tokens for summary
    // No responseMimeType or responseSchema needed for plain text summary
  };

  const data = await callGoogleAI(contents, generationConfig);
  return data.candidates[0].content.parts[0].text.trim();
}

/**
 * Attempts to extract a JSON string from a larger text block.
 * Handles cases where the JSON might be wrapped in markdown-like code blocks.
 * @param {string} text - The text potentially containing a JSON string.
 * @returns {string|null} The extracted JSON string, or null if not found.
 */
function extractJsonFromString(text) {
    if (!text || typeof text !== 'string') return null;
    // Look for JSON starting with ```json and ending with ```
    const markdownJsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (markdownJsonMatch && markdownJsonMatch[1]) {
        return markdownJsonMatch[1].trim();
    }
    // Look for JSON starting with ``` and ending with ```
    const markdownMatch = text.match(/```\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
        // Basic check if it looks like JSON
        if ((markdownMatch[1].startsWith('{') && markdownMatch[1].endsWith('}')) || (markdownMatch[1].startsWith('[') && markdownMatch[1].endsWith(']'))) {
            return markdownMatch[1].trim();
        }
    }
    // Look for the first '{' or '[' and the last '}' or ']'
    // This is a more aggressive and potentially error-prone method.
    const firstBracket = text.indexOf('[');
    const firstBrace = text.indexOf('{');
    let startIndex = -1;

    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
        startIndex = firstBracket;
    } else if (firstBrace !== -1) {
        startIndex = firstBrace;
    }

    if (startIndex === -1) return null; // No JSON structure found

    // Try to find the matching end bracket/brace
    // This simplified version just takes the substring from the first opening to the last closing
    // A proper parser would be needed for perfect matching, but this is often good enough for LLM outputs
    const lastBracket = text.lastIndexOf(']');
    const lastBrace = text.lastIndexOf('}');
    let endIndex = -1;

    if (startIndex === firstBracket && lastBracket !== -1) {
        endIndex = lastBracket;
    } else if (startIndex === firstBrace && lastBrace !== -1) {
        endIndex = lastBrace;
    }
    
    if (endIndex > startIndex) {
        return text.substring(startIndex, endIndex + 1).trim();
    }
    
    // If all else fails, return the trimmed text if it looks like JSON
    const trimmedText = text.trim();
    if ((trimmedText.startsWith('{') && trimmedText.endsWith('}')) || (trimmedText.startsWith('[') && trimmedText.endsWith(']'))) {
        return trimmedText;
    }

    return null;
}


/**
 * Generates flashcards from the given text by instructing the model to output JSON.
 * @param {string} text - The input text.
 * @returns {Promise<Array<object>>} An array of flashcard objects (e.g., { term: string, definition: string }).
 */
async function generateFlashcards(text) {
  const prompt = `You are a helpful assistant. Based on the provided text, generate 10-15 flashcards.
Each flashcard should have a 'term' and a 'definition'.
Respond ONLY with a valid JSON array of objects in the following format, and nothing else:
[
  {"term": "Example Term 1", "definition": "Example Definition 1"},
  {"term": "Example Term 2", "definition": "Example Definition 2"}
]

Do NOT include any explanatory text before or after the JSON array.
The JSON should be the only content in your response.

Text to process:
${text}`;

  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  
  const generationConfig = {
    maxOutputTokens: 1500, // Allow ample tokens for JSON structure
    // No responseMimeType or responseSchema, relying on prompt
  };

  const data = await callGoogleAI(contents, generationConfig);
  
  try {
    const rawTextOutput = data.candidates[0].content.parts[0].text;
    const jsonString = extractJsonFromString(rawTextOutput);

    if (!jsonString) {
        console.error("Could not extract a valid JSON string from AI response for flashcards.");
        console.error("Raw AI response for flashcards:", rawTextOutput);
        throw new Error("AI response for flashcards was not in the expected JSON format.");
    }
        
    const flashcardsArray = JSON.parse(jsonString);
    
    if (!Array.isArray(flashcardsArray) || !flashcardsArray.every(fc => typeof fc.term === 'string' && typeof fc.definition === 'string')) {
        console.error("Parsed flashcards JSON does not match expected structure:", flashcardsArray);
        throw new Error("Generated flashcards JSON is not in the expected array of {term, definition} objects.");
    }
    return flashcardsArray;

  } catch (e) {
    console.error("Error parsing flashcards JSON from Google AI:", e);
    console.error("Raw AI response for flashcards (if not already logged):", data.candidates[0].content.parts[0].text);
    // Append original error message if it's a parsing error
    const message = e.message.includes("JSON at position") 
        ? `Failed to parse flashcards from AI response: ${e.message}`
        : e.message; // Use the error message from extractJsonFromString or validation
    throw new Error(message);
  }
}

/**
 * Generates a multiple-choice quiz from the given text by instructing the model to output JSON.
 * @param {string} text - The input text.
 * @returns {Promise<Array<object>>} An array of quiz question objects.
 */
async function generateQuiz(text) {
  const prompt = `You are a helpful assistant. Based on the provided text, generate 5-10 multiple-choice quiz questions.
Each question must have:
1. A 'question' (string).
2. An 'options' array of 3-4 strings representing possible answers.
3. A 'correctAnswer' (string) which MUST be one of the strings from the 'options' array.
Respond ONLY with a valid JSON array of objects in the following format, and nothing else:
[
  {
    "question": "Example Question 1?",
    "options": ["Option A", "Option B", "Correct Option C"],
    "correctAnswer": "Correct Option C"
  }
]

Do NOT include any explanatory text before or after the JSON array.
The JSON should be the only content in your response.

Text to process:
${text}`;

  const contents = [{ role: "user", parts: [{ text: prompt }] }];

  const generationConfig = {
    maxOutputTokens: 2000, // Allow ample tokens for JSON structure
    // No responseMimeType or responseSchema, relying on prompt
  };

  const data = await callGoogleAI(contents, generationConfig);

  try {
    const rawTextOutput = data.candidates[0].content.parts[0].text;
    const jsonString = extractJsonFromString(rawTextOutput);

    if (!jsonString) {
        console.error("Could not extract a valid JSON string from AI response for quiz.");
        console.error("Raw AI response for quiz:", rawTextOutput);
        throw new Error("AI response for quiz was not in the expected JSON format.");
    }

    const quizArray = JSON.parse(jsonString);

    if (!Array.isArray(quizArray) || !quizArray.every(q => 
        typeof q.question === 'string' &&
        Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4 &&
        q.options.every(opt => typeof opt === 'string') &&
        typeof q.correctAnswer === 'string' &&
        q.options.includes(q.correctAnswer)
    )) {
        console.error("Parsed quiz JSON does not match expected structure:", quizArray);
        throw new Error("Generated quiz JSON is not in the expected format or correctAnswer is invalid.");
    }
    return quizArray;

  } catch (e) {
    console.error("Error parsing quiz JSON from Google AI:", e);
    console.error("Raw AI response for quiz (if not already logged):", data.candidates[0].content.parts[0].text);
    const message = e.message.includes("JSON at position")
        ? `Failed to parse quiz from AI response: ${e.message}`
        : e.message;
    throw new Error(message);
  }
}

module.exports = {
  generateSummary,
  generateFlashcards,
  generateQuiz,
};
