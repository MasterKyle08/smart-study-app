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
      maxOutputTokens: 2048, 
      ...generationConfig 
    }
  };
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
      if (data.candidates && data.candidates[0] && data.candidates[0].finishReason === 'SAFETY') {
        throw new Error('Content generation blocked due to safety policies. Please revise your input.');
      }
      if (data.promptFeedback && data.promptFeedback.blockReason) {
        throw new Error(`Prompt blocked due to ${data.promptFeedback.blockReason}. Please revise your input.`);
      }
      throw new Error('Invalid response structure from Google AI API. Missing expected text content.');
    }
    return data;
  } catch (error) {
    throw error; 
  }
}

function extractJsonFromString(text) {
    if (!text || typeof text !== 'string') return null;
    const markdownJsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (markdownJsonMatch && markdownJsonMatch[1]) {
        return markdownJsonMatch[1].trim();
    }
    const markdownMatch = text.match(/```\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
        const potentialJson = markdownMatch[1].trim();
        if ((potentialJson.startsWith('{') && potentialJson.endsWith('}')) || (potentialJson.startsWith('[') && potentialJson.endsWith(']'))) {
            return potentialJson;
        }
    }
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
        endIndex = trimmedText.lastIndexOf(expectedCloser);
        if (endIndex > startIndex) {
            try {
                JSON.parse(trimmedText.substring(startIndex, endIndex + 1));
                return trimmedText.substring(startIndex, endIndex + 1);
            } catch (e) {
                // Not valid
            }
        }
    }
    if ((trimmedText.startsWith('{') && trimmedText.endsWith('}')) || (trimmedText.startsWith('[') && trimmedText.endsWith(']'))) {
        try {
            JSON.parse(trimmedText);
            return trimmedText;
        } catch(e) {
            // Not valid
        }
    }
    return null;
}

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

async function generateFlashcards(text) {
  const prompt = `You are a helpful assistant. Based on the provided text, generate 10-15 flashcards.
Each flashcard should have a 'term' (a concise key concept or keyword, often suitable as a question) and a 'definition' (a clear explanation or answer to the term/question).
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
  const generationConfig = { maxOutputTokens: 1500 };
  const data = await callGoogleAI(contents, generationConfig);
  try {
    const rawTextOutput = data.candidates[0].content.parts[0].text;
    const jsonString = extractJsonFromString(rawTextOutput);
    if (!jsonString) {
        throw new Error("AI response for flashcards was not in the expected JSON format or was missing.");
    }
    const flashcardsArray = JSON.parse(jsonString);
    if (!Array.isArray(flashcardsArray) || !flashcardsArray.every(fc => 
        typeof fc === 'object' && fc !== null &&
        typeof fc.term === 'string' && fc.term.trim() !== '' &&
        typeof fc.definition === 'string' && fc.definition.trim() !== ''
    )) {
        throw new Error("Generated flashcards JSON is not in the expected array of {term, definition} objects with non-empty strings.");
    }
    return flashcardsArray;
  } catch (e) {
    const message = e.message.includes("JSON at position") 
        ? `Failed to parse flashcards from AI response: ${e.message}`
        : e.message; 
    throw new Error(message);
  }
}

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
  const generationConfig = { maxOutputTokens: 2000 };
  const data = await callGoogleAI(contents, generationConfig);
  try {
    const rawTextOutput = data.candidates[0].content.parts[0].text;
    const jsonString = extractJsonFromString(rawTextOutput);
    if (!jsonString) {
        throw new Error("AI response for quiz was not in the expected JSON format or was missing.");
    }
    const quizArray = JSON.parse(jsonString);
    if (!Array.isArray(quizArray) || !quizArray.every(q => 
        typeof q === 'object' && q !== null &&
        typeof q.question === 'string' && q.question.trim() !== '' &&
        Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4 &&
        q.options.every(opt => typeof opt === 'string' && opt.trim() !== '') &&
        typeof q.correctAnswer === 'string' && q.correctAnswer.trim() !== '' &&
        q.options.includes(q.correctAnswer)
    )) {
        throw new Error("Generated quiz JSON is not in the expected format, has empty fields, or correctAnswer is invalid.");
    }
    return quizArray;
  } catch (e) {
    const message = e.message.includes("JSON at position")
        ? `Failed to parse quiz from AI response: ${e.message}`
        : e.message;
    throw new Error(message);
  }
}

async function explainTextSnippet(snippet) {
  if (!snippet || snippet.trim() === "") {
    throw new Error("Snippet to explain cannot be empty.");
  }
  const prompt = `You are a helpful assistant. Briefly explain the following concept, term, or phrase in simple and clear language. Focus on providing a concise definition or explanation suitable for a student seeking quick clarification. Do not add any conversational filler like "Okay, here's an explanation...". Just provide the explanation directly.
Concept/Term/Phrase to explain:
"${snippet}"
Explanation:`;
  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  const generationConfig = { maxOutputTokens: 300, temperature: 0.5 };
  const data = await callGoogleAI(contents, generationConfig);
  return data.candidates[0].content.parts[0].text.trim();
}

async function getFlashcardInteractionResponse(card, interactionType, userAnswer, userQuery, chatHistory = []) {
    let prompt = "";
    let maxTokens = 500;
    const term = card.term;
    const definition = card.definition;

    if (interactionType === "submit_answer") {
        if (!userAnswer || userAnswer.trim() === "") {
            return { feedback: "Please provide an answer to get feedback." };
        }
        prompt = `Flashcard Term/Question: "${term}"
Correct Answer/Definition: "${definition}"
User's Answer: "${userAnswer}"

You are an AI tutor. Provide concise, constructive feedback on the user's answer compared to the correct answer. 
Indicate if the user's answer is correct, partially correct, or incorrect. 
If incorrect or partially correct, briefly explain why and highlight the key differences or missing points. 
Keep the feedback focused and under 75 words. Do not repeat the question or the correct answer unless necessary for clarity in the feedback.
Feedback:`;
        maxTokens = 150;
    } else if (interactionType === "request_explanation") {
        prompt = `Flashcard Term/Question: "${term}"
Correct Answer/Definition: "${definition}"
The user has requested a more detailed explanation for this flashcard. 
Provide a clear, slightly more in-depth explanation of the term/question and its answer/definition. 
Aim for clarity and conciseness, suitable for someone who needs a bit more help understanding. 
Keep the explanation under 100 words.
Explanation:`;
        maxTokens = 200;
    } else if (interactionType === "chat_message") {
        if (!userQuery || userQuery.trim() === "") {
            return { chatResponse: "What would you like to discuss or ask about this flashcard?", updatedChatHistory: chatHistory };
        }
        let historyString = "Previous conversation:\n";
        chatHistory.forEach(msg => {
            historyString += `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.parts[0].text}\n`;
        });

        prompt = `You are a helpful AI tutor assisting with a flashcard.
Flashcard Term/Question: "${term}"
Correct Answer/Definition: "${definition}"

${chatHistory.length > 0 ? historyString : ''}
User's new question/message: "${userQuery}"

Respond to the user's new question/message concisely and helpfully, staying on the topic of the flashcard. 
Keep your response under 75 words.
AI Response:`;
        maxTokens = 150;
    } else {
        throw new Error("Invalid flashcard interaction type.");
    }

    const contents = [{ role: "user", parts: [{ text: prompt }] }];
    const generationConfig = { maxOutputTokens: maxTokens, temperature: 0.6 };
    const data = await callGoogleAI(contents, generationConfig);
    const aiTextResponse = data.candidates[0].content.parts[0].text.trim();

    if (interactionType === "submit_answer") {
        return { feedback: aiTextResponse };
    } else if (interactionType === "request_explanation") {
        return { explanation: aiTextResponse };
    } else if (interactionType === "chat_message") {
        const newChatHistory = [...chatHistory, { role: "user", parts: [{ text: userQuery }] }, { role: "model", parts: [{ text: aiTextResponse }] }];
        return { chatResponse: aiTextResponse, updatedChatHistory: newChatHistory };
    }
    return {};
}

module.exports = {
  generateSummary,
  generateFlashcards,
  generateQuiz,
  explainTextSnippet,
  getFlashcardInteractionResponse,
};
