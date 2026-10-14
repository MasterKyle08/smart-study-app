window.StudyState = {
  appendCitations(container, citations = []) {
    if (!container || !citations.length) return;
    const details = document.createElement("details");
    details.className = "source-evidence mt-4 text-sm";
    const title = document.createElement("summary");
    title.textContent = "Supporting source excerpts";
    details.append(title);
    for (const item of citations.slice(0, 12)) {
      const block = document.createElement("blockquote");
      block.className = "p-3 my-2 border-l-2";
      const label = document.createElement("p");
      label.textContent = `${item.related ? "Related summary excerpt" : item.kind === "question" ? "Question " + (item.index + 1) : item.kind === "flashcard" ? "Flashcard " + (item.index + 1) : "Source"}${item.file ? " · " + item.file : ""}${item.page ? " · page " + item.page : ""}`;
      const quote = document.createElement("p");
      quote.textContent = item.quote;
      block.append(label, quote);
      details.append(block);
    }
    container.append(details);
  },
  reference(quiz) {
    return (
      quiz.sourceText ||
      (quiz.quiz || [])
        .map(
          (question) =>
            `${question.questionText}\nAnswer: ${Array.isArray(question.correctAnswer) ? question.correctAnswer.join("; ") : question.correctAnswer}\nExplanation: ${question.briefExplanation || ""}`,
        )
        .join("\n\n")
    );
  },
  question(value) {
    const clean = {};
    for (const key of [
      "id",
      "questionText",
      "questionType",
      "options",
      "correctAnswer",
      "briefExplanation",
      "codeSnippet",
      "language",
      "numericTolerance",
    ])
      if (value?.[key] !== undefined) clean[key] = value[key];
    return clean;
  },
  history(messages = []) {
    const selected = [];
    let chars = 0;
    for (const message of messages.slice(-8).reverse()) {
      const text = String(message.parts?.[0]?.text || "").slice(0, 4000);
      if (chars + text.length > 12000) break;
      if (["user", "model"].includes(message.role) && text) {
        selected.unshift({ role: message.role, parts: [{ text }] });
        chars += text.length;
      }
    }
    while (selected[0]?.role === "model") selected.shift();
    return selected;
  },
  clearPrivateStorage() {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("srs:") || key.startsWith("study-private:"))
        localStorage.removeItem(key);
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith("study-private:")) sessionStorage.removeItem(key);
  },
  signOutCleanup() {
    this.clearPrivateStorage();
    for (const key of ["authToken", "userEmail", "userPlan", "userIsAdmin"])
      localStorage.removeItem(key);
  },
};
