/**
 * @file backend/services/ai.service.js
 * @description Service for interacting with Google's Generative AI (e.g., Gemma) for content generation.
 */

const fetch = require('node-fetch'); 

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const AI_MODEL_NAME = process.env.GOOGLE_AI_MODEL_NAME || 'gemma-3-27b-it'; 
const GOOGLE_API_URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';


if (!GOOGLE_API_KEY) {
  console.warn(
    "Warning: GOOGLE_API_KEY is not defined in your .env file. " +
    "AI features using Google models will not work."
  );
}

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
      maxOutputTokens: 2048, // Default, can be overridden by specific generationConfig
      ...generationConfig 
    }
  };
  // Clean up responseMimeType and responseSchema if they are null or undefined,
  // as some models might error if these are present but empty.
  if (payload.generationConfig.responseMimeType === undefined || payload.generationConfig.responseMimeType === null) {
    delete payload.generationConfig.responseMimeType;
  }
  if (payload.generationConfig.responseSchema === undefined || payload.generationConfig.responseSchema === null) {
    delete payload.generationConfig.responseSchema;
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', },
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
    // Validate the expected structure of a successful response
    if (!data.candidates || data.candidates.length === 0 || 
        !data.candidates[0].content || !data.candidates[0].content.parts || 
        data.candidates[0].content.parts.length === 0 ||
        !data.candidates[0].content.parts[0].text) {
      console.error('Google AI API - Unexpected response structure:', data);
      // Check for safety reasons specifically if the structure is off
      if (data.candidates && data.candidates[0] && data.candidates[0].finishReason === 'SAFETY') {
        console.error('Google AI API - Content blocked due to safety ratings:', data.candidates[0].safetyRatings);
        throw new Error('Content generation blocked due to safety policies. Please revise your input.');
      }
      if (data.promptFeedback && data.promptFeedback.blockReason) {
        console.error('Google AI API - Prompt blocked:', data.promptFeedback.blockReason, data.promptFeedback.safetyRatings);
        throw new Error(`Prompt blocked due to ${data.promptFeedback.blockReason}. Please revise your input.`);
      }
      throw new Error('Invalid response structure from Google AI API. Missing expected text content.');
    }
    return data;
  } catch (error) {
    console.error('Error calling Google AI API:', error.message);
    // Re-throw the error so it's handled by the calling function
    throw error; 
  }
}

/**
 * Generates a concise summary for the given text.
 * @param {string} text - The input text to summarize.
 * @param {string} [lengthPreference='medium']
 * @param {string} [stylePreference='paragraph']
 * @param {string[]} [keywords=[]] - Keywords to focus on.
 * @param {string} [audiencePurpose=''] - Target audience or purpose.
 * @param {string[]} [negativeKeywords=[]] - Keywords/topics to avoid.
 * @returns {Promise<string>} The generated summary.
 */
async function generateSummary(
    text, 
    lengthPreference = 'medium', 
    stylePreference = 'paragraph', 
    keywords = [], 
    audiencePurpose = '',
    negativeKeywords = [] 
) {
  let lengthInstruction = "The summary should be concise and around 150-250 words.";
  let maxTokens = 500; 
  if (lengthPreference === 'short') {
    lengthInstruction = "The summary should be very brief, around 50-100 words.";
    maxTokens = 200;
  } else if (lengthPreference === 'long') {
    lengthInstruction = "The summary should be detailed, around 300-400 words.";
    maxTokens = 800; 
  }

  let styleInstruction = "";
  let sectionInstruction = "";

  if (stylePreference === 'paragraph') {
    styleInstruction = "Present the summary as well-structured paragraphs.";
    if (lengthPreference === 'long') {
      styleInstruction += " Ensure sentences flow naturally within paragraphs. Use standard paragraph separation (double newlines in the source text if generating markdown internally) only between distinct paragraphs, not after every sentence.";
      sectionInstruction = "If the content is extensive, you may structure the paragraph-based summary with clear subheadings (e.g., using '### Subheading Title' markdown) where appropriate for readability.";
    }
  } else if (stylePreference === 'bullets') {
    let bulletCountInstruction = "5-7 key bullet points";
    if (lengthPreference === 'short') bulletCountInstruction = "3-5 key bullet points";
    else if (lengthPreference === 'long') bulletCountInstruction = "a detailed list of 7-10 key bullet points, which can have brief explanations if necessary for clarity";
    
    styleInstruction = `Present the summary primarily as ${bulletCountInstruction}. Each bullet point MUST start with '*' or '-' followed by a space. Do NOT include any introductory phrases or sentences before the bullet points. Start directly with the first bullet point.`;
    
    if (lengthPreference === 'long') {
      sectionInstruction = "If the content is extensive and warrants structure, you MUST organize the bullet points under relevant subheadings (e.g., '### Subheading Title' markdown). ALL content, including that under any subheadings, MUST be formatted as bullet points starting with '*' or '-'. Do not use plain paragraph sentences for any points.";
    }
  }
  
  let keywordInstruction = "";
  if (keywords && keywords.length > 0) {
    keywordInstruction = `Pay special attention to the following keywords and ensure they are well-represented: ${keywords.join(', ')}.`;
  }

  let audienceInstruction = "";
  if (audiencePurpose) {
    audienceInstruction = `Tailor this summary for the following audience or purpose: ${audiencePurpose}.`;
  }

  let negativeKeywordInstruction = "";
  if (negativeKeywords && negativeKeywords.length > 0) {
    negativeKeywordInstruction = `Avoid discussing or emphasizing the following topics/keywords: ${negativeKeywords.join(', ')}.`;
  }

  const prompt = `You are a helpful assistant skilled in summarizing academic texts. 
Focus on key concepts and main ideas.
${lengthInstruction}
${styleInstruction}
${keywordInstruction}
${audienceInstruction}
${negativeKeywordInstruction}
${sectionInstruction} 
Do not add any conversational filler before or after the summary content itself.
Text to summarize:
${text}`;

  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  const generationConfig = { maxOutputTokens: maxTokens };
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

    // Look for JSON starting with ``` and ending with ``` (generic code block)
    const markdownMatch = text.match(/```\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
        // Basic check if it looks like JSON before returning
        const potentialJson = markdownMatch[1].trim();
        if ((potentialJson.startsWith('{') && potentialJson.endsWith('}')) || (potentialJson.startsWith('[') && potentialJson.endsWith(']'))) {
            return potentialJson;
        }
    }

    // If no markdown blocks, try to find JSON by looking for the first '{' or '['
    // and the corresponding last '}' or ']'. This is more aggressive.
    const trimmedText = text.trim();
    let startIndex = -1;
    let endIndex = -1;
    let expectedCloser;

    if (trimmedText.startsWith('{')) {
        startIndex = 0;
        expectedCloser = '}';
    } else if (trimmedText.startsWith('[')) {
        startIndex = 0;
        expectedCloser = ']';
    }

    if (startIndex === 0) {
        // Attempt to find the matching closing bracket/brace
        // This simple lastIndexOf is not a robust parser but can work for well-formed LLM outputs
        // where JSON is the main content.
        endIndex = trimmedText.lastIndexOf(expectedCloser);
        if (endIndex > startIndex) {
            // Try to parse to ensure it's valid JSON
            try {
                JSON.parse(trimmedText.substring(startIndex, endIndex + 1));
                return trimmedText.substring(startIndex, endIndex + 1);
            } catch (e) {
                // Not valid JSON, so this substring isn't what we want
            }
        }
    }
    
    // If all else fails, and the entire trimmed text looks like JSON, return it.
    if ((trimmedText.startsWith('{') && trimmedText.endsWith('}')) || (trimmedText.startsWith('[') && trimmedText.endsWith(']'))) {
        try {
            JSON.parse(trimmedText);
            return trimmedText;
        } catch(e) {
            // Not valid
        }
    }

    return null; // No clearly identifiable JSON found
}

/**
 * Generates flashcards from the given text by instructing the model to output JSON.
 * @param {string} text - The input text.
 * @returns {Promise<Array<object>>} An array of flashcard objects (e.g., { term: string, definition: string }).
 */
async function generateFlashcards(text) {
  const prompt = `You are a helpful assistant. Based on the provided text, generate 10-15 flashcards.
Each flashcard should have a 'term' (a concise key concept or keyword) and a 'definition' (a clear explanation of the term).
Respond ONLY with a valid JSON array of objects in the following format, and nothing else:
[
  {"term": "Example Term 1", "definition": "Example Definition 1"},
  {"term": "Example Term 2", "definition": "Example Definition 2"}
]

Do NOT include any explanatory text, comments, or markdown formatting before or after the JSON array.
The JSON array should be the only content in your response.

Text to process:
${text}`;

  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  const generationConfig = { 
    maxOutputTokens: 1500, // Allow ample tokens for JSON structure
    // Consider temperature if creativity in term/definition is desired, but for strict JSON, lower might be better.
    // temperature: 0.5 
  };

  const data = await callGoogleAI(contents, generationConfig);
  
  try {
    const rawTextOutput = data.candidates[0].content.parts[0].text;
    const jsonString = extractJsonFromString(rawTextOutput);

    if (!jsonString) {
        console.error("Could not extract a valid JSON string from AI response for flashcards.");
        console.error("Raw AI response for flashcards:", rawTextOutput);
        throw new Error("AI response for flashcards was not in the expected JSON format or was missing.");
    }
        
    const flashcardsArray = JSON.parse(jsonString);
    
    // Validate structure of the parsed array
    if (!Array.isArray(flashcardsArray) || !flashcardsArray.every(fc => 
        typeof fc === 'object' && fc !== null &&
        typeof fc.term === 'string' && fc.term.trim() !== '' &&
        typeof fc.definition === 'string' && fc.definition.trim() !== ''
    )) {
        console.error("Parsed flashcards JSON does not match expected structure [{term, definition}]:", flashcardsArray);
        throw new Error("Generated flashcards JSON is not in the expected array of {term, definition} objects with non-empty strings.");
    }
    return flashcardsArray;

  } catch (e) {
    // Log specific parsing errors if they occur
    if (e instanceof SyntaxError) {
        console.error("SyntaxError parsing flashcards JSON from Google AI:", e.message);
    } else {
        console.error("Error processing flashcards from Google AI:", e.message);
    }
    console.error("Raw AI response for flashcards (if not already logged):", data.candidates[0].content.parts[0].text);
    // Provide a more specific error message if it's a known issue
    const message = e.message.includes("JSON at position") 
        ? `Failed to parse flashcards from AI response: ${e.message}`
        : e.message; 
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

Do NOT include any explanatory text, comments, or markdown formatting before or after the JSON array.
The JSON array should be the only content in your response.

Text to process:
${text}`;

  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  const generationConfig = { 
    maxOutputTokens: 2000, // Allow ample tokens for JSON structure
    // temperature: 0.5
  };

  const data = await callGoogleAI(contents, generationConfig);

  try {
    const rawTextOutput = data.candidates[0].content.parts[0].text;
    const jsonString = extractJsonFromString(rawTextOutput);

    if (!jsonString) {
        console.error("Could not extract a valid JSON string from AI response for quiz.");
        console.error("Raw AI response for quiz:", rawTextOutput);
        throw new Error("AI response for quiz was not in the expected JSON format or was missing.");
    }

    const quizArray = JSON.parse(jsonString);

    // Validate structure of the parsed array
    if (!Array.isArray(quizArray) || !quizArray.every(q => 
        typeof q === 'object' && q !== null &&
        typeof q.question === 'string' && q.question.trim() !== '' &&
        Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4 &&
        q.options.every(opt => typeof opt === 'string' && opt.trim() !== '') &&
        typeof q.correctAnswer === 'string' && q.correctAnswer.trim() !== '' &&
        q.options.includes(q.correctAnswer)
    )) {
        console.error("Parsed quiz JSON does not match expected structure:", quizArray);
        throw new Error("Generated quiz JSON is not in the expected format, has empty fields, or correctAnswer is invalid.");
    }
    return quizArray;

  } catch (e) {
    if (e instanceof SyntaxError) {
        console.error("SyntaxError parsing quiz JSON from Google AI:", e.message);
    } else {
        console.error("Error processing quiz from Google AI:", e.message);
    }
    console.error("Raw AI response for quiz (if not already logged):", data.candidates[0].content.parts[0].text);
    const message = e.message.includes("JSON at position")
        ? `Failed to parse quiz from AI response: ${e.message}`
        : e.message;
    throw new Error(message);
  }
}

/**
 * Generates an explanation for a given text snippet.
 * @param {string} snippet - The text snippet to explain.
 * @returns {Promise<string>} The generated explanation.
 */
async function explainTextSnippet(snippet) {
  if (!snippet || snippet.trim() === "") {
    throw new Error("Snippet to explain cannot be empty.");
  }
  const prompt = `You are a helpful assistant. Briefly explain the following concept, term, or phrase in simple and clear language. Focus on providing a concise definition or explanation suitable for a student seeking quick clarification. Do not add any conversational filler like "Okay, here's an explanation...". Just provide the explanation directly.

Concept/Term/Phrase to explain:
"${snippet}"

Explanation:`;
  
  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  const generationConfig = {
    maxOutputTokens: 300, // Increased slightly for potentially more nuanced short explanations
    temperature: 0.5 
  };
  const data = await callGoogleAI(contents, generationConfig);
  return data.candidates[0].content.parts[0].text.trim();
}


module.exports = {
  generateSummary,
  generateFlashcards,
  generateQuiz,
  explainTextSnippet,
};