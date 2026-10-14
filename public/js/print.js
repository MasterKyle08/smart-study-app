const key = location.hash.slice(1);
history.replaceState(null, "", location.pathname);
try {
  const raw = localStorage.getItem("study-private:print:" + key);
  localStorage.removeItem("study-private:print:" + key);
  const data = JSON.parse(raw);
  if (!data || data.expires < Date.now())
    throw new Error(
      "This print preview expired. Open it from your saved upload.",
    );
  document.getElementById("printTitle").textContent =
    data.original_filename || "Study quiz";
  for (const [index, q] of (data.quiz || []).entries()) {
    const block = document.createElement("section");
    block.className = "mb-6";
    block.dataset.printQuestion = "true";
    const question = document.createElement("h2");
    question.textContent = `${index + 1}. ${q.questionText}`;
    block.append(question);
    if (q.codeSnippet) {
      const code = document.createElement("pre");
      code.textContent = q.codeSnippet;
      code.className = "whitespace-pre-wrap my-3";
      block.append(code);
    }
    for (const option of q.options || []) {
      const p = document.createElement("p");
      p.textContent = "□ " + option;
      block.append(p);
    }
    if (!q.options?.length) {
      const blank = document.createElement("p");
      blank.textContent = "Answer: __________________________________";
      block.append(blank);
    }
    document.getElementById("printQuestions").append(block);
    const answer = document.createElement("p");
    answer.textContent = `${index + 1}. ${Array.isArray(q.correctAnswer) ? q.correctAnswer.join("; ") : q.correctAnswer}`;
    document.getElementById("answerKey").append(answer);
  }
} catch (error) {
  document.getElementById("printTitle").textContent = error.message;
}
document.getElementById("printButton").onclick = () => window.print();
