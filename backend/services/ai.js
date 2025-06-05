/**
 * @file backend/services/ai.js
 * @description Service layer for interacting with Google AI (Gemini).
 * Handles generation of summaries, flashcards, quizzes, and interactive feedback.
 */

const fetch = require('node-fetch'); 

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const AI_MODEL_NAME = process.env.GOOGLE_AI_MODEL_NAME || 'gemini-1.5-flash-latest'; 
const GOOGLE_API_URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

if (!GOOGLE_API_KEY) {
  console.warn(
    "Warning: GOOGLE_API_KEY is not defined in your .env file. " +
    "AI features using Google models will not work."
  );
}

async function callGoogleAI(contents, generationConfig = {}, modelName = AI_MODEL_NAME) {
  if (!GOOGLE_API_KEY) {
    const error = new Error('Google API key is not configured. Please set GOOGLE_API_KEY in your .env file.');
    error.statusCode = 500;
    throw error;
  }
  const apiUrl = `${GOOGLE_API_URL_BASE}${modelName}:generateContent?key=${GOOGLE_API_KEY}`;
  
  const payload = {
    contents: contents,
    generationConfig: {
      temperature: 0.6, 
      topP: 0.95,
      maxOutputTokens: 2048, 
      ...generationConfig 
    }
  };

  // Remove schema/mimeType if they are not actually supported or if we are not using them for this call
  // This is particularly important if the model being called doesn't support JSON mode.
  if (payload.generationConfig.responseMimeType === "application/json" && (modelName.includes("gemma"))) {
    console.warn(`Attempting to use JSON mode with Gemma model (${modelName}). Removing JSON mode params as it might not be supported.`);
    delete payload.generationConfig.responseMimeType;
    delete payload.generationConfig.responseSchema;
  } else if (payload.generationConfig.responseMimeType === undefined || payload.generationConfig.responseMimeType === null) {
    delete payload.generationConfig.responseMimeType;
  }
  if (payload.generationConfig.responseSchema === undefined || payload.generationConfig.responseSchema === null) {
    delete payload.generationConfig.responseSchema;
  }


  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Google AI API Error Response:", JSON.stringify(data, null, 2));
      const errorMessage = data.error?.message || `Google AI API request failed with status ${response.status}`;
      const error = new Error(errorMessage);
      error.statusCode = response.status;
      error.details = data.error; 
      error.isGoogleAIError = true; // Custom flag
      throw error;
    }

    // Adjusted validation: Expect parts[0] to exist, but text might be in a different part or part of a function call for JSON mode.
    // If responseMimeType was application/json, the text would be the JSON string.
    // If not, it's plain text.
    if (!data.candidates || data.candidates.length === 0 || 
        !data.candidates[0].content || !data.candidates[0].content.parts || 
        data.candidates[0].content.parts.length === 0) {
          if (data.candidates && data.candidates[0] && data.candidates[0].finishReason) {
            const reason = data.candidates[0].finishReason;
            if (reason === 'SAFETY') {
              throw new Error('Content generation blocked by safety policies. Please revise your input or try a different query.');
            } else if (reason === 'MAX_TOKENS') {
               console.warn("Google AI response was truncated due to max tokens limit.");
               // If text is still undefined here, it's an issue
               if (data.candidates[0].content.parts[0].text === undefined && !payload.generationConfig.responseMimeType?.includes("json")) {
                 throw new Error('Content generation truncated and no text content returned.');
               }
            } else if (reason !== 'STOP') { 
              throw new Error(`Content generation stopped unexpectedly. Reason: ${reason}.`);
            }
          } else {
            // General invalid structure if no specific finishReason explains it
            throw new Error('Invalid response structure from Google AI API. Missing expected content parts.');
          }
    }
    // If expecting text and text is not there (and not due to MAX_TOKENS with some content)
    if (data.candidates[0].content.parts[0].text === undefined && 
        !payload.generationConfig.responseMimeType?.includes("json") && 
        data.candidates[0].finishReason !== 'MAX_TOKENS') {
       throw new Error('Invalid response structure: Missing text in response parts for non-JSON mode.');
    }

    return data; 
  } catch (error) {
    if (!error.statusCode) error.statusCode = 500;
    if (!error.isGoogleAIError) { // Don't re-log if already logged as Google AI error
        console.error("Error in callGoogleAI:", error.message, error.details || '');
    }
    throw error; 
  }
}

function extractJsonFromString(text) {
    if (!text || typeof text !== 'string') return null;
    const markdownJsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownJsonMatch && markdownJsonMatch[1]) {
        try { JSON.parse(markdownJsonMatch[1].trim()); return markdownJsonMatch[1].trim(); } catch (e) { /* Ignore */ }
    }
    const trimmedText = text.trim();
    let startIndex = -1; let firstChar = '';
    for (let i = 0; i < trimmedText.length; i++) { if (trimmedText[i] === '{' || trimmedText[i] === '[') { startIndex = i; firstChar = trimmedText[i]; break; } }
    if (startIndex === -1) return null; 
    const expectedCloser = firstChar === '{' ? '}' : ']';
    let openBrackets = 0;
    for (let i = startIndex; i < trimmedText.length; i++) {
        if (trimmedText[i] === firstChar) openBrackets++;
        if (trimmedText[i] === expectedCloser) openBrackets--;
        if (openBrackets === 0) {
            const potentialJson = trimmedText.substring(startIndex, i + 1);
            try { JSON.parse(potentialJson); return potentialJson; } catch (e) { /* Continue */ }
        }
    }
    if ((trimmedText.startsWith('{') && trimmedText.endsWith('}')) || (trimmedText.startsWith('[') && trimmedText.endsWith(']'))) {
        try { JSON.parse(trimmedText); return trimmedText; } catch (e) { /* ignore */ }
    }
    console.warn("Failed to extract valid JSON from string:", text.substring(0, 200) + "...");
    return null;
}

async function generateSummary( text, lengthPreference = 'medium', stylePreference = 'paragraph', keywords = [], audiencePurpose = '', negativeKeywords = []) {
  let lengthInstruction = "The summary should be concise and around 150-250 words.";
  if (lengthPreference === 'short') lengthInstruction = "The summary should be very brief, around 50-100 words.";
  else if (lengthPreference === 'long') lengthInstruction = "The summary should be detailed, around 300-400 words.";
  let styleInstruction = (stylePreference === 'paragraph') 
    ? "Present the summary as well-structured paragraphs." 
    : `Present the summary primarily as ${lengthPreference === 'short' ? '3-5' : (lengthPreference === 'long' ? 'a detailed list of 7-10' : '5-7')} key bullet points. Each bullet point MUST start with '*' or '-' followed by a space.`;
  let keywordInstruction = keywords && keywords.length > 0 ? `Pay special attention to these keywords: ${keywords.join(', ')}.` : "";
  let audienceInstruction = audiencePurpose ? `Tailor this summary for: ${audiencePurpose}.` : "";
  let negativeKeywordInstruction = negativeKeywords && negativeKeywords.length > 0 ? `Avoid discussing: ${negativeKeywords.join(', ')}.` : "";
  let sectionInstruction = (stylePreference === 'paragraph' && lengthPreference === 'long') || (stylePreference === 'bullets' && lengthPreference === 'long') 
    ? "If the content is extensive, structure the summary with clear subheadings (e.g., '### Subheading Title' markdown) where appropriate for readability. For bullets, ALL content, including under subheadings, MUST be bullet points." : "";
  const prompt = `You are an expert academic summarizer. 
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
  const generationConfigForSummary = { temperature: 0.7 }; // No maxOutputTokens here, relies on callGoogleAI default
  const data = await callGoogleAI(contents, generationConfigForSummary); 
  return data.candidates[0].content.parts[0].text.trim();
}

async function generateFlashcards(text) {
  const prompt = `You are an AI assistant. Based on the provided text, generate 10-15 flashcards.
Each flashcard must have a 'term' (a concise key concept or question) and a 'definition' (a clear explanation or answer).
Respond ONLY with a valid JSON array of objects in the format: [{"term": "Term 1", "definition": "Definition 1"}, ...].
Do NOT include any text, comments, or markdown formatting before or after the JSON array.
Text:
${text}`;
  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  // For tasks expecting JSON, we will not specify responseMimeType if model doesn't support it.
  // We will rely on prompt engineering and extractJsonFromString.
  const data = await callGoogleAI(contents, { maxOutputTokens: 1500 }); 
  try {
    const rawTextOutput = data.candidates[0].content.parts[0].text;
    const jsonString = extractJsonFromString(rawTextOutput);
    if (!jsonString) throw new Error("AI response for flashcards was not valid JSON or was missing.");
    const flashcardsArray = JSON.parse(jsonString);
    if (!Array.isArray(flashcardsArray) || !flashcardsArray.every(fc => fc && typeof fc.term === 'string' && fc.term.trim() !== '' && typeof fc.definition === 'string' && fc.definition.trim() !== '')) {
        throw new Error("Flashcards JSON is not an array of {term, definition} objects with non-empty strings.");
    }
    return flashcardsArray;
  } catch (e) { throw new Error(`Failed to parse flashcards from AI: ${e.message}. Raw output: ${data.candidates[0].content.parts[0].text.substring(0,100)}`); }
}

async function generateQuizWithOptions(text, options) {
  const { questionTypes, numQuestions, difficulty } = options;
  let numQuestionsPrompt = (numQuestions && numQuestions !== 'ai_choice') ? `${numQuestions} questions` : "around 7-10 questions";
  let questionTypesPrompt = questionTypes && questionTypes.length > 0 
    ? questionTypes.map(type => ({ "multiple_choice": "multiple_choice (single correct answer, 3-4 options)", "select_all": "select_all_that_apply (multiple correct answers from 3-5 options)", "short_answer": "short_answer (brief typed response)" }[type] || type)).join(', and ')
    : "multiple_choice (single correct answer)";
  const difficultyPrompt = difficulty ? `The difficulty level should be ${difficulty}.` : "medium difficulty.";
  const prompt = `Create a quiz with ${numQuestionsPrompt} of type(s): ${questionTypesPrompt}. Difficulty: ${difficultyPrompt}.
For each question, provide: "id" (unique string), "questionText" (string), "questionType" ("multiple_choice", "select_all", "short_answer"), "options" (array of strings; empty for short_answer if no hints), "correctAnswer" (string for MC, array of strings for SA, string for short_answer), "briefExplanation" (1-2 sentences).
Respond ONLY with a valid JSON array of these question objects. No extra text or markdown.
Text:
${text}`;
  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  const data = await callGoogleAI(contents, { maxOutputTokens: 3500 });
  try {
    const rawTextOutput = data.candidates[0].content.parts[0].text;
    const jsonString = extractJsonFromString(rawTextOutput);
    if (!jsonString) throw new Error("AI response for quiz was not valid JSON or was missing.");
    const quizArray = JSON.parse(jsonString);
    if (!Array.isArray(quizArray) || !quizArray.every(q => q.id && q.questionText && q.questionType && Array.isArray(q.options) && q.correctAnswer && q.briefExplanation)) {
        throw new Error("Quiz JSON is not in the expected format or is missing required fields.");
    }
    return quizArray;
  } catch (e) { throw new Error(`Failed to parse quiz from AI: ${e.message}. Raw output: ${data.candidates[0].content.parts[0].text.substring(0,100)}`); }
}

async function explainTextSnippet(snippet) {
  if (!snippet || snippet.trim() === "") throw new Error("Snippet to explain cannot be empty.");
  const prompt = `Explain the following concept concisely for a student: "${snippet}". Provide the explanation directly.`;
  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  const data = await callGoogleAI(contents, { maxOutputTokens: 300, temperature: 0.5 });
  return data.candidates[0].content.parts[0].text.trim();
}

async function getFlashcardInteractionResponse(card, interactionType, userAnswer, userQuery, chatHistory = []) {
    let prompt = "";
    let localMaxTokens = 200; // Renamed from maxTokens to avoid confusion with the parameter name
    let generationConfig = { temperature: 0.5 }; 
    const { term, definition } = card;

    if (interactionType === "submit_answer") {
        if (!userAnswer || userAnswer.trim() === "") {
            return { feedback: "It looks like you didn't provide an answer. The correct definition is shown. Try again or ask for help!", correctness: "incorrect" };
        }
        prompt = `Flashcard Term: "${term}"
Correct Definition: "${definition}"
User's Answer: "${userAnswer}"
Analyze the user's answer. 
1. Determine correctness: Is it "correct", "incorrect", or "partial"?
2. Provide concise feedback (max 50 words): If incorrect/partial, explain the key missing points or misunderstandings. If correct, briefly affirm.
Respond ONLY with a JSON object with two keys: "correctness" (string: "correct", "incorrect", or "partial") and "feedback" (string). Example: {"correctness": "partial", "feedback": "You're on the right track, but missed mentioning X."}
No other text or markdown.`;
        // Do not set responseMimeType for Gemma if it's not supported. Rely on extractJsonFromString.
        localMaxTokens = 250;
    } else if (interactionType === "request_explanation") {
        prompt = `Flashcard Term: "${term}"
Definition: "${definition}"
User requests a more detailed explanation of this flashcard. 
Provide a clear, slightly more in-depth explanation (max 100 words).
Explanation:`;
        localMaxTokens = 200;
    } else if (interactionType === "chat_message") {
        if (!userQuery || userQuery.trim() === "") {
            return { chatResponse: "What would you like to discuss about this flashcard?", updatedChatHistory: chatHistory };
        }
        let historyString = "Previous conversation (if any):\n";
        chatHistory.forEach(msg => { historyString += `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.parts[0].text}\n`; });
        prompt = `You are an AI tutor discussing a flashcard.
Flashcard Term: "${term}"
Definition: "${definition}"
${chatHistory.length > 0 ? historyString : ''}
User's new message: "${userQuery}"
Respond helpfully and concisely (max 75 words), staying on the topic of the flashcard.
AI Response:`;
        localMaxTokens = 150;
    } else {
        throw new Error("Invalid flashcard interaction type.");
    }

    const contents = [{ role: "user", parts: [{ text: prompt }] }];
    // Pass localMaxTokens as maxOutputTokens in the generationConfig for this call
    const data = await callGoogleAI(contents, { ...generationConfig, maxOutputTokens: localMaxTokens }); 
    const aiTextResponse = data.candidates[0].content.parts[0].text.trim();

    if (interactionType === "submit_answer") {
        try {
            const jsonString = extractJsonFromString(aiTextResponse);
            if (!jsonString) { 
                console.warn("AI response for flashcard feedback was not valid JSON, attempting fallback analysis.", aiTextResponse);
                let correctness = "partial"; 
                if (aiTextResponse.toLowerCase().includes("correct")) correctness = "correct";
                else if (aiTextResponse.toLowerCase().includes("incorrect") || aiTextResponse.toLowerCase().includes("not quite right")) correctness = "incorrect";
                return { feedback: aiTextResponse, correctness };
            }
            const jsonResponse = JSON.parse(jsonString);
            if (typeof jsonResponse.correctness !== 'string' || typeof jsonResponse.feedback !== 'string') {
                 console.warn("Parsed JSON for flashcard feedback has incorrect structure.", jsonResponse);
                let correctness = "partial";
                if (jsonResponse.feedback && jsonResponse.feedback.toLowerCase().includes("correct")) correctness = "correct";
                else if (jsonResponse.feedback && (jsonResponse.feedback.toLowerCase().includes("incorrect") || jsonResponse.feedback.toLowerCase().includes("not quite"))) correctness = "incorrect";
                return { feedback: jsonResponse.feedback || aiTextResponse, correctness };
            }
            return jsonResponse;
        } catch (e) {
            console.error("Error parsing flashcard feedback JSON from AI:", e, "Raw response:", aiTextResponse);
            let correctness = "partial"; 
             if (aiTextResponse.toLowerCase().includes("correct")) correctness = "correct";
             else if (aiTextResponse.toLowerCase().includes("incorrect")) correctness = "incorrect";
            return { feedback: `AI provided feedback: "${aiTextResponse}" (Could not fully determine correctness structure).`, correctness };
        }
    } else if (interactionType === "request_explanation") {
        return { explanation: aiTextResponse };
    } else if (interactionType === "chat_message") {
        const newChatHistory = [...chatHistory, { role: "user", parts: [{ text: userQuery }] }, { role: "model", parts: [{ text: aiTextResponse }] }];
        return { chatResponse: aiTextResponse, updatedChatHistory: newChatHistory };
    }
    return {};
}

async function getQuizAnswerFeedback(question, userAnswer) {
    const userAnswerString = Array.isArray(userAnswer) ? userAnswer.join('; ') : userAnswer;
    const correctAnswerString = Array.isArray(question.correctAnswer) ? question.correctAnswer.join('; ') : question.correctAnswer;
    const prompt = `Quiz Question: "${question.questionText}"
Question Type: ${question.questionType}
Options (if any): ${question.options.join('; ')}
Correct Answer(s): "${correctAnswerString}"
Brief Explanation for Correct Answer: "${question.briefExplanation}"
User's Answer: "${userAnswerString}"
Analyze the user's answer.
1. Determine correctness: Is it "correct", "incorrect", or "partial" (for 'select_all' or sometimes 'short_answer')?
2. Provide concise feedback (max 60 words) based on correctness, referencing the key concepts or why it's wrong/partially right.
Respond ONLY with a JSON object with two keys: "correctness" (string: "correct", "incorrect", or "partial") and "feedback" (string). Example: {"correctness": "correct", "feedback": "That's right!"}
No other text or markdown.`;
    const contents = [{ role: "user", parts: [{ text: prompt }] }];
    // Do not set responseMimeType for Gemma if it's not supported. Rely on extractJsonFromString.
    const generationConfig = { maxOutputTokens: 200, temperature: 0.4 };
    try {
        const data = await callGoogleAI(contents, generationConfig);
        const rawTextOutput = data.candidates[0].content.parts[0].text;
        const jsonString = extractJsonFromString(rawTextOutput);
        if(!jsonString) {
            console.warn("AI response for quiz feedback was not valid JSON or was missing, attempting fallback.", rawTextOutput);
            let correctness = "partial";
            if (rawTextOutput.toLowerCase().includes("correct")) correctness = "correct";
            else if (rawTextOutput.toLowerCase().includes("incorrect")) correctness = "incorrect";
            return { feedback: rawTextOutput, correctness };
        }
        const jsonResponse = JSON.parse(jsonString);
        if (typeof jsonResponse.correctness !== 'string' || typeof jsonResponse.feedback !== 'string') {
             console.warn("Parsed JSON for quiz feedback has incorrect structure.", jsonResponse);
             let correctness = "partial";
             if (jsonResponse.feedback && jsonResponse.feedback.toLowerCase().includes("correct")) correctness = "correct";
             else if (jsonResponse.feedback && (jsonResponse.feedback.toLowerCase().includes("incorrect") || jsonResponse.feedback.toLowerCase().includes("not quite"))) correctness = "incorrect";
             return { feedback: jsonResponse.feedback || rawTextOutput, correctness };
        }
        return jsonResponse;
    } catch (error) {
        console.error("Error getting or parsing quiz answer feedback:", error);
        let correctness = "partial"; 
        if (userAnswerString.toLowerCase() === correctAnswerString.toLowerCase()) correctness = "correct";
        return { feedback: `Could not get detailed AI feedback. Correct: ${correctAnswerString}`, correctness };
    }
}

async function getQuizQuestionDetailedExplanation(question) {
    const prompt = `Quiz Question: "${question.questionText}"
Correct Answer(s): "${Array.isArray(question.correctAnswer) ? question.correctAnswer.join('; ') : question.correctAnswer}"
The user requested a detailed explanation. Provide a clear, in-depth explanation (max 150 words) of the concept and why the answer is correct.
Explanation:`;
    const contents = [{ role: "user", parts: [{ text: prompt }] }];
    const data = await callGoogleAI(contents, { maxOutputTokens: 250, temperature: 0.5 });
    return { explanation: data.candidates[0].content.parts[0].text.trim() };
}

async function chatAboutQuizQuestion(question, chatHistory, userQuery) {
    let historyString = "Previous conversation (if any):\n";
    chatHistory.forEach(msg => { historyString += `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.parts[0].text}\n`; });
    const prompt = `You are an AI tutor helping with a quiz question.
Quiz Question: "${question.questionText}"
Correct Answer(s): "${Array.isArray(question.correctAnswer) ? question.correctAnswer.join('; ') : question.correctAnswer}"
${chatHistory.length > 0 ? historyString : ''}
User's new message: "${userQuery}"
Respond concisely and helpfully (max 75 words), staying on topic.
AI Response:`;
    const contents = [{ role: "user", parts: [{ text: prompt }] }];
    const data = await callGoogleAI(contents, { maxOutputTokens: 150 });
    const aiTextResponse = data.candidates[0].content.parts[0].text.trim();
    const newChatHistory = [...chatHistory, { role: "user", parts: [{ text: userQuery }] }, { role: "model", parts: [{ text: aiTextResponse }] }];
    return { chatResponse: aiTextResponse, updatedChatHistory: newChatHistory };
}

async function regenerateQuizQuestion(originalQuestion, textContext, difficultyHint) {
    const prompt = `Original Question: "${originalQuestion.questionText}" (Type: ${originalQuestion.questionType}).
Text Context: """${textContext}"""
Generate ONE NEW, DIFFERENT question testing a similar/related concept from the text.
New question type: "${originalQuestion.questionType}". Difficulty: "${difficultyHint || 'medium'}".
Respond ONLY with a single valid JSON object for the new question (id, questionText, questionType, options, correctAnswer, briefExplanation). No extra text.
New Question JSON:`;
    const contents = [{ role: "user", parts: [{ text: prompt }] }];
    // For Gemma, we will not specify responseMimeType and rely on extractJsonFromString for JSON.
    const generationConfig = { maxOutputTokens: 500 };
    try {
        const data = await callGoogleAI(contents, generationConfig);
        const rawTextOutput = data.candidates[0].content.parts[0].text;
        const jsonString = extractJsonFromString(rawTextOutput);
        if (!jsonString) throw new Error("AI response for regenerated question was not valid JSON or was missing.");
        const newQuestion = JSON.parse(jsonString);
        if (!newQuestion.id || !newQuestion.questionText || !newQuestion.questionType || !Array.isArray(newQuestion.options) || newQuestion.correctAnswer === undefined || newQuestion.briefExplanation === undefined) {
            throw new Error("Regenerated question JSON is missing required fields or is invalid.");
        }
        return newQuestion;
    } catch (e) {
        console.error("Error regenerating or parsing quiz question:", e);
        // If parsing fails, we don't have a structured fallback generation here, just throw the error.
        throw new Error(`Failed to regenerate quiz question: ${e.message}`);
    }
}

module.exports = {
  generateSummary,
  generateFlashcards,
  generateQuizWithOptions,
  explainTextSnippet,
  getFlashcardInteractionResponse,
  getQuizAnswerFeedback,
  getQuizQuestionDetailedExplanation,
  chatAboutQuizQuestion,
  regenerateQuizQuestion
};
