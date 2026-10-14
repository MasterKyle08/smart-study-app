document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("librarySearchForm");
  if (!form) return;
  const results = document.getElementById("libraryResults");
  let next = null,
    requestVersion = 0;
  const more = document.getElementById("libraryMore");
  async function load(append = false) {
    const version = ++requestVersion;
    const params = new URLSearchParams({
      search: form.search.value,
      folder: form.folder.value,
      offset: append ? next || 0 : 0,
    });
    const data = await request("/library?" + params, "GET", null, true);
    if (version !== requestVersion) return;
    if (!append) results.replaceChildren();
    next = data.nextOffset;
    more.classList.toggle("hidden", next === null);
    for (const item of data.items) {
      const row = document.createElement("div");
      row.className = "surface-card flex flex-wrap items-center gap-3";
      const name = document.createElement("span");
      name.textContent = `${item.title} · ${item.kind}${item.folder ? " · " + item.folder : ""}`;
      const open = document.createElement("button");
      open.className = "btn-secondary";
      open.textContent = "Open";
      open.onclick = () =>
        item.kind === "quiz"
          ? location.assign("/quiz/" + encodeURIComponent(item.slug))
          : window.openSavedSession(item.id, open);
      const organize = document.createElement("button");
      organize.className = "btn-secondary";
      organize.textContent = "Folder / tags";
      organize.onclick = () => edit(item);
      row.append(name, open, organize);
      results.append(row);
    }
    if (!append && data.items.length === 0)
      results.textContent = "No matching study materials.";
    const selected = form.folder.value;
    form.folder.replaceChildren(
      new Option("All folders", ""),
      ...data.folders.map((folder) => new Option(folder, folder)),
    );
    form.folder.value = selected;
  }
  function edit(item) {
    const dialog = document.getElementById("organizationDialog");
    const editForm = document.getElementById("organizationForm");
    editForm.folder.value = item.folder || "";
    try {
      editForm.tags.value = JSON.parse(item.tags || "[]").join(", ");
    } catch {
      editForm.tags.value = "";
    }
    document.getElementById("organizationStatus").textContent = "";
    dialog.showModal();
    editForm.onsubmit = async (event) => {
      event.preventDefault();
      try {
        await request(
          `/library/${item.kind}/${item.id}`,
          "PUT",
          {
            folder: editForm.folder.value,
            tags: editForm.tags.value
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          },
          true,
        );
        dialog.close();
        await load();
      } catch (error) {
        document.getElementById("organizationStatus").textContent =
          error.message;
      }
    };
  }
  form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      await load();
    } catch (error) {
      results.textContent = error.message;
    }
  };
  more.onclick = () =>
    load(true).catch((error) => (results.textContent = error.message));
  document.getElementById("organizationCancel").onclick = () =>
    document.getElementById("organizationDialog").close();
});
