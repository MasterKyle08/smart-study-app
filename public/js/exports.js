window.StudyExports = {
  download(name, text, type = "text/plain") {
    const blob = new Blob([text], { type: type + ";charset=utf-8" }),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  csv(cards) {
    const cell = (value) => {
      let text = String(value ?? "");
      if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    return [
      ["Front", "Back"],
      ...cards.map((card) => [card.term, card.definition]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n");
  },
  anki(cards) {
    const escape = (value) =>
      String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replace(/\r?\n/g, "<br>")
        .replaceAll("\t", " ");
    return (
      "#separator:Tab\n#html:true\n" +
      cards
        .map((card) => escape(card.term) + "\t" + escape(card.definition))
        .join("\n")
    );
  },
};
document.addEventListener("DOMContentLoaded", () => {
  const host = document.getElementById("sessionExportTools");
  if (!host) return;
  for (const [label, kind] of [
    ["Flashcards CSV", "csv"],
    ["Anki TSV", "anki"],
    ["Study set JSON", "json"],
    ["Print quiz", "print"],
  ]) {
    const button = document.createElement("button");
    button.className = "btn-secondary";
    button.textContent = label;
    button.onclick = () => {
      const record = window.currentDashboardSessionData;
      if (!record) return;
      const cards = Array.isArray(record.flashcards) ? record.flashcards : [];
      if (kind === "print") {
        // Pass data without relying on opener/sessionStorage inheritance.
        const key = crypto.randomUUID();
        localStorage.setItem(
          "study-private:print:" + key,
          JSON.stringify({ original_filename:record.original_filename, quiz:record.quiz, expires: Date.now() + 60000 }),
        );
        setTimeout(()=>localStorage.removeItem("study-private:print:"+key),60000);
        window.open("/print.html#" + key, "_blank", "noopener");
        return;
      }
      window.StudyExports.download(
        "study-set." +
          (kind === "json" ? "json" : kind === "csv" ? "csv" : "tsv"),
        kind === "json"
          ? JSON.stringify(record, null, 2)
          : kind === "csv"
            ? window.StudyExports.csv(cards)
            : window.StudyExports.anki(cards),
        kind === "json" ? "application/json" : "text/plain",
      );
    };
    host.append(button);
  }
});
