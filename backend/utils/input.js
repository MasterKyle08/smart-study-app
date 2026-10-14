function bad(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}
function text(value, name, max, { optional = true } = {}) {
  if (value == null && optional) return "";
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!optional && !value.trim())
  )
    throw bad(
      `${name} must be text${optional ? "" : " and cannot be empty"}, up to ${max.toLocaleString()} characters.`,
    );
  return value;
}
function history(value = []) {
  if (!Array.isArray(value) || value.length > 16)
    throw bad("Chat history must contain at most 16 messages.");
  let chars = 0;
  return value.map((message) => {
    if (
      !message ||
      !["user", "model"].includes(message.role) ||
      !Array.isArray(message.parts) ||
      message.parts.length !== 1
    )
      throw bad("Invalid chat history.");
    const content = text(message.parts[0]?.text, "Chat message", 4000, {
      optional: false,
    });
    chars += content.length;
    if (chars > 16000)
      throw bad("Chat history is too long. Start a new conversation.");
    return { role: message.role, parts: [{ text: content }] };
  });
}
function validateAiBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw bad("A JSON object is required.");
  for (const [name, max] of Object.entries({
    extractedText: 120000,
    sourceText: 120000,
    textContext: 120000,
    originalFilename: 255,
    originalContentType: 100,
    topic: 500,
    subject: 100,
    mode: 100,
    difficulty: 20,
    difficultyHint: 20,
    interactionType: 30,
    summaryLengthPreference: 20,
    summaryStylePreference: 20,
    userQuery: 2000,
    snippet: 1000,
    summaryKeywords: 500,
    summaryNegativeKeywords: 500,
    summaryAudiencePurpose: 500,
    title: 200,
    description: 2000,
    customInstructions: 2000,
  })) {
    if (body[name] !== undefined) text(body[name], name, max);
  }
  if (body.userAnswer != null) {
    if (Array.isArray(body.userAnswer)) {
      if (body.userAnswer.length > 10) throw bad("Too many answer choices.");
      body.userAnswer.forEach((answer) =>
        text(answer, "Answer", 2000, { optional: false }),
      );
    } else text(body.userAnswer, "Answer", 4000);
  }
  if (body.chatHistory !== undefined)
    body.chatHistory = history(body.chatHistory);
  if (body.isPublic !== undefined && typeof body.isPublic !== "boolean")
    throw bad("Publication must be true or false.");
  if (body.tags !== undefined) {
    if (typeof body.tags === "string") text(body.tags, "Tags", 500);
    else if (
      !Array.isArray(body.tags) ||
      body.tags.length > 10 ||
      body.tags.some((tag) => typeof tag !== "string" || tag.length > 50)
    )
      throw bad("Invalid tags.");
  }
  if (
    body.outputFormats !== undefined &&
    (!Array.isArray(body.outputFormats) ||
      body.outputFormats.length > 4 ||
      body.outputFormats.some(
        (format) => !["summary", "flashcards", "quiz", "all"].includes(format),
      ))
  )
    throw bad("Invalid output formats.");
  for (const key of ["card", "question", "originalQuestion"])
    if (body[key] !== undefined) {
      const item = body[key];
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        JSON.stringify(item).length > 12000
      )
        throw bad(`Invalid ${key}.`);
      for (const name of [
        "term",
        "definition",
        "questionText",
        "briefExplanation",
        "codeSnippet",
      ])
        if (item[name] !== undefined) text(item[name], name, 4000);
      if (
        item.options !== undefined &&
        (!Array.isArray(item.options) ||
          item.options.length > 10 ||
          item.options.some(
            (option) => typeof option !== "string" || option.length > 2000,
          ))
      )
        throw bad("Invalid question options.");
      if (
        item.correctAnswer !== undefined &&
        !(
          typeof item.correctAnswer === "string" &&
          item.correctAnswer.length <= 4000
        ) &&
        !(
          typeof item.correctAnswer === "number" &&
          Number.isFinite(item.correctAnswer)
        ) &&
        !(
          Array.isArray(item.correctAnswer) &&
          item.correctAnswer.length <= 10 &&
          item.correctAnswer.every(
            (answer) => typeof answer === "string" && answer.length <= 2000,
          )
        )
      )
        throw bad("Invalid correct answer.");
      if (
        item.numericTolerance != null &&
        (typeof item.numericTolerance !== "number" ||
          !Number.isFinite(item.numericTolerance) ||
          item.numericTolerance < 0 ||
          item.numericTolerance > 1000)
      )
        throw bad("Invalid numeric tolerance.");
      if (item.questionType !== undefined)
        text(item.questionType, "Question type", 40);
      if (item.language !== undefined) text(item.language, "Language", 40);
    }
  if (
    body.numQuestions !== undefined &&
    ![
      "ai_choice",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
    ].includes(String(body.numQuestions))
  )
    throw bad("Invalid question count.");
  if (body.quizOptions !== undefined) {
    const options = body.quizOptions;
    if (
      !options ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      JSON.stringify(options).length > 2000
    )
      throw bad("Invalid quiz options.");
    if (
      options.questionTypes !== undefined &&
      (!Array.isArray(options.questionTypes) ||
        options.questionTypes.length > 6 ||
        options.questionTypes.some(
          (type) => typeof type !== "string" || type.length > 40,
        ))
    )
      throw bad("Invalid question types.");
    if (
      options.difficulty !== undefined &&
      !["easy", "medium", "hard"].includes(options.difficulty)
    )
      throw bad("Invalid quiz difficulty.");
    if (
      options.numQuestions !== undefined &&
      ![
        "ai_choice",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "11",
        "12",
        "13",
        "14",
        "15",
      ].includes(String(options.numQuestions))
    )
      throw bad("Invalid question count.");
  }
  if (body.visionImages !== undefined) {
    if (!Array.isArray(body.visionImages) || body.visionImages.length > 3)
      throw bad("At most three images are supported.");
    for (const image of body.visionImages) {
      if (
        !image ||
        !["image/png", "image/jpeg", "image/webp"].includes(image.mimeType) ||
        typeof image.data !== "string" ||
        image.data.length > 3000000 ||
        !/^[A-Za-z0-9+/=\r\n]+$/.test(image.data)
      )
        throw bad("Invalid or oversized image.");
    }
  }
}
function aiInput(req, res, next) {
  try {
    if (["POST", "PUT"].includes(req.method)) validateAiBody(req.body);
    next();
  } catch (error) {
    res.status(error.statusCode || 400).json({ message: error.message });
  }
}
module.exports = { text, history, validateAiBody, aiInput, bad };
