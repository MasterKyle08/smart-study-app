function stripMarkdownFence(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function recoverJson(text) {
  const cleaned = stripMarkdownFence(text);
  if (!cleaned) return null;

  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch (_err) {
      return null;
    }
  };

  const direct = tryParse(cleaned);
  if (direct !== null) return direct;

  const arrayStart = cleaned.indexOf("[");
  const objectStart = cleaned.indexOf("{");
  const start =
    arrayStart === -1
      ? objectStart
      : objectStart === -1
        ? arrayStart
        : Math.min(arrayStart, objectStart);
  if (start === -1) return null;

  const sliced = cleaned.slice(start);
  const slicedParsed = tryParse(sliced);
  if (slicedParsed !== null) return slicedParsed;

  if (sliced.startsWith("[")) {
    const lastComplete = sliced.lastIndexOf("}");
    if (lastComplete > 0) {
      let candidate = sliced.slice(0, lastComplete + 1).trim();
      if (!candidate.endsWith("]")) candidate += "]";
      const recovered = tryParse(candidate);
      if (Array.isArray(recovered) && recovered.length > 0) {
        Object.defineProperty(recovered, "__partial", { value: true });
        return recovered;
      }
    }
  }

  if (sliced.startsWith("{")) {
    const lastBrace = sliced.lastIndexOf("}");
    if (lastBrace > 0) {
      const recovered = tryParse(sliced.slice(0, lastBrace + 1));
      if (recovered && typeof recovered === "object") return recovered;
    }
  }

  // Recover complete values only. Never invent the remainder of a string.
  const stack = [],
    boundaries = [];
  let quoted = false,
    escape = false;
  for (let i = 0; i < sliced.length; i++) {
    const c = sliced[i];
    if (quoted) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') {
        quoted = false;
        boundaries.push({ end: i + 1, stack: [...stack] });
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
      continue;
    }
    if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") {
      stack.pop();
      boundaries.push({ end: i + 1, stack: [...stack] });
    }
  }
  for (const point of boundaries.slice(-64).reverse()) {
    const suffix = point.stack
      .slice()
      .reverse()
      .map((c) => (c === "{" ? "}" : "]"))
      .join("");
    const recovered = tryParse(sliced.slice(0, point.end) + suffix);
    if (recovered && typeof recovered === "object") {
      Object.defineProperty(recovered, "__partial", { value: true });
      return recovered;
    }
  }
  return null;
}

function asStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === "string" || typeof item === "number")
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,;|/]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeFlashcards(raw) {
  const list = Array.isArray(raw)
    ? raw
    : raw && Array.isArray(raw.flashcards)
      ? raw.flashcards
      : [];
  return list
    .map((card) => {
      if (!card || typeof card !== "object") return null;
      const term = String(
        card.term || card.front || card.question || card.prompt || "",
      ).trim();
      const definition = String(
        card.definition || card.back || card.answer || card.explanation || "",
      ).trim();
      if (!term || !definition) return null;
      if (term.length > 4000 || definition.length > 4000) return null;
      return {
        term,
        definition,
        ...(card.sourceQuote
          ? { sourceQuote: String(card.sourceQuote).slice(0, 500) }
          : {}),
      };
    })
    .filter(Boolean)
    .filter(
      (card, index, list) =>
        list.findIndex(
          (other) => other.term.toLowerCase() === card.term.toLowerCase(),
        ) === index,
    );
}

function selectAnswers(value, options = []) {
  if (Array.isArray(value)) return asStringArray(value);
  const raw = String(value || "").trim();
  if (!raw) return [];
  if (options.includes(raw)) return [raw];
  const piped = raw
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
  if (piped.length > 1) return piped;
  const legacy = raw
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return legacy.length > 1 && legacy.every((item) => options.includes(item))
    ? legacy
    : [raw];
}

function normalizeQuestionType(value) {
  const raw = String(value || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (
    raw.includes("select") ||
    raw.includes("all_that") ||
    raw === "multi_select"
  )
    return "select_all";
  if (
    raw.includes("numeric") ||
    raw.includes("number") ||
    raw.includes("calculation")
  )
    return "numeric";
  if (raw.includes("code") || raw.includes("trace") || raw.includes("output"))
    return "coding_trace";
  if (raw.includes("worked") || raw.includes("step")) return "worked_problem";
  if (raw.includes("short") || raw.includes("fill") || raw.includes("open"))
    return "short_answer";
  return "multiple_choice";
}

function normalizeQuizQuestions(raw, fallbackType = "multiple_choice") {
  const list = Array.isArray(raw)
    ? raw
    : raw && Array.isArray(raw.questions)
      ? raw.questions
      : [];
  return list
    .map((question, index) => {
      if (!question || typeof question !== "object") return null;
      const questionText = String(
        question.questionText ||
          question.question ||
          question.prompt ||
          question.text ||
          "",
      ).trim();
      if (!questionText) return null;

      const questionType = normalizeQuestionType(
        question.questionType || question.type || fallbackType,
      );
      if (questionText.length > 4000) return null;
      let options = asStringArray(question.options || question.choices)
        .filter((option) => option.length <= 2000)
        .slice(0, 10);
      let correctAnswer =
        question.correctAnswer != null
          ? question.correctAnswer
          : question.correctAnswers;
      if (correctAnswer == null) correctAnswer = question.answer;
      if (
        correctAnswer &&
        typeof correctAnswer === "object" &&
        !Array.isArray(correctAnswer)
      )
        return null;
      if (String(correctAnswer ?? "").length > 4000) return null;

      if (questionType === "select_all") {
        correctAnswer = selectAnswers(correctAnswer, options);
        if (
          correctAnswer.length === 0 ||
          correctAnswer.length > 10 ||
          correctAnswer.some((answer) => answer.length > 2000)
        )
          return null;
        options = Array.from(new Set([...correctAnswer, ...options])).slice(
          0,
          10,
        );
      } else if (
        questionType === "short_answer" ||
        questionType === "worked_problem" ||
        questionType === "coding_trace" ||
        questionType === "numeric"
      ) {
        correctAnswer = Array.isArray(correctAnswer)
          ? String(correctAnswer[0] ?? "").trim()
          : String(correctAnswer ?? "").trim();
        if (!correctAnswer) return null;
        if (
          questionType !== "coding_trace" &&
          questionType !== "worked_problem"
        ) {
          if (
            questionType === "numeric" &&
            !Number.isFinite(Number(correctAnswer.replace(/,/g, "")))
          )
            return null;
          if (questionType === "numeric") options = [];
        }
      } else {
        correctAnswer = Array.isArray(correctAnswer)
          ? String(correctAnswer[0] ?? "").trim()
          : String(correctAnswer ?? "").trim();
        if (!options.length || !correctAnswer) return null;
        if (!options.includes(correctAnswer))
          options = [...options, correctAnswer];
        options = Array.from(new Set(options));
        if (options.length > 6)
          options = [
            ...options.filter((option) => option !== correctAnswer).slice(0, 5),
            correctAnswer,
          ];
        if (options.length < 2) return null;
      }

      const numericTolerance = Number(question.numericTolerance);
      return {
        id: `q${index + 1}`,
        questionText,
        questionType,
        options,
        correctAnswer,
        briefExplanation: String(
          question.briefExplanation ||
            question.explanation ||
            question.rationale ||
            "",
        )
          .trim()
          .slice(0, 4000),
        codeSnippet: question.codeSnippet
          ? String(question.codeSnippet).slice(0, 4000)
          : "",
        language: question.language
          ? String(question.language).slice(0, 40)
          : "",
        numericTolerance:
          Number.isFinite(numericTolerance) &&
          numericTolerance >= 0 &&
          numericTolerance <= 1000
            ? numericTolerance
            : questionType === "numeric"
              ? 0.01
              : null,
        ...(question.sourceQuote
          ? { sourceQuote: String(question.sourceQuote).slice(0, 500) }
          : {}),
      };
    })
    .filter(Boolean)
    .filter(
      (question, index, list) =>
        list.findIndex(
          (other) =>
            other.questionText.toLowerCase() ===
            question.questionText.toLowerCase(),
        ) === index,
    );
}

function scoreLocally(question, userAnswer) {
  const type = normalizeQuestionType(question.questionType);
  if (type === "select_all") {
    const correct = selectAnswers(
      question.correctAnswer,
      question.options || [],
    ).map((item) => item.toLowerCase());
    const given = selectAnswers(userAnswer, question.options || []).map(
      (item) => item.toLowerCase(),
    );
    const correctSet = new Set(correct);
    const givenSet = new Set(given);
    const matched = correct.filter((item) => givenSet.has(item)).length;
    const extras = given.filter((item) => !correctSet.has(item)).length;
    if (matched === correct.length && extras === 0 && correct.length > 0) {
      return {
        correctness: "correct",
        feedback: "Every correct option was selected.",
      };
    }
    if (matched > 0) {
      return {
        correctness: "partial",
        feedback: `You found ${matched} of ${correct.length} correct option(s).`,
      };
    }
    return {
      correctness: "incorrect",
      feedback: "None of the required options were selected.",
    };
  }

  if (type === "numeric") {
    const parseNumber = (value) => {
      const raw = String(value ?? "")
        .trim()
        .replace(/,/g, "");
      return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)
        ? Number(raw)
        : NaN;
    };
    const expected = parseNumber(question.correctAnswer);
    const given = parseNumber(userAnswer);
    const tolerance = Number(question.numericTolerance);
    const allowed = Number.isFinite(tolerance) ? Math.abs(tolerance) : 0.01;
    if (!Number.isFinite(expected) || !Number.isFinite(given)) {
      return { correctness: "incorrect", feedback: "Enter a numeric answer." };
    }
    if (
      Math.abs(expected - given) <=
      allowed + Number.EPSILON * Math.max(1, Math.abs(expected))
    ) {
      return {
        correctness: "correct",
        feedback: "That numeric answer is within the accepted range.",
      };
    }
    return {
      correctness: "incorrect",
      feedback: `Expected about ${question.correctAnswer}.`,
    };
  }

  const correct = String(
    Array.isArray(question.correctAnswer)
      ? question.correctAnswer[0]
      : question.correctAnswer || "",
  )
    .trim()
    .toLowerCase();
  const given = String(
    Array.isArray(userAnswer) ? userAnswer.join(" ") : userAnswer || "",
  )
    .trim()
    .toLowerCase();
  if (!given)
    return { correctness: "incorrect", feedback: "No answer was provided." };
  if (given === correct)
    return {
      correctness: "correct",
      feedback: "That matches the expected answer.",
    };
  if (
    (type === "short_answer" ||
      type === "worked_problem" ||
      type === "coding_trace") &&
    (correct.includes(given) || given.includes(correct)) &&
    given.length > 2
  ) {
    return {
      correctness: "partial",
      feedback: "Close — you captured part of the expected idea.",
    };
  }
  return {
    correctness: "incorrect",
    feedback: `The expected answer is "${Array.isArray(question.correctAnswer) ? question.correctAnswer[0] : question.correctAnswer}".`,
  };
}

function assertOwnsRecord(recordUserId, requesterId) {
  if (
    recordUserId == null ||
    requesterId == null ||
    Number(recordUserId) !== Number(requesterId)
  ) {
    const error = new Error("Access denied.");
    error.statusCode = 403;
    throw error;
  }
  return true;
}

module.exports = {
  stripMarkdownFence,
  recoverJson,
  asStringArray,
  normalizeFlashcards,
  normalizeQuestionType,
  normalizeQuizQuestions,
  scoreLocally,
  assertOwnsRecord,
};
