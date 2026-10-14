document.addEventListener("DOMContentLoaded", async () => {
  const status = document.getElementById("accountStatus");
  const message = (value) => {
    status.textContent = value;
  };
  const submit = (id, action) =>
    document.getElementById(id)?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.target.querySelector("button");
      button.disabled = true;
      try {
        await action(event.target);
      } catch (error) {
        message(error.message);
      } finally {
        button.disabled = false;
      }
    });
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("reset");
  history.replaceState(null, "", location.pathname);
  if (token) {
    document.getElementById("resetSection").classList.remove("hidden");
    submit("resetForm", async (form) => {
      const result = await request("/account/reset", "POST", {
        token,
        password: form.password.value,
      });
      window.StudyState.signOutCleanup();
      message(result.message);
      document.getElementById("accountTools").classList.add("hidden");
      form.reset();
    });
  }
  submit("recoveryForm", async (form) =>
    message(
      (await request("/account/recovery", "POST", { email: form.email.value }))
        .message,
    ),
  );
  let user;
  try {
    user = (await apiGetCurrentUser()).user;
    if (!user) throw new Error("Sign in to manage your account.");
  } catch {
    document.getElementById("signedOutNotice").classList.remove("hidden");
    return;
  }
  document.getElementById("accountTools").classList.remove("hidden");
  document.getElementById("accountEmail").textContent = user.email;
  if (user.isAdmin)
    document.getElementById("adminAccountNote").classList.remove("hidden");
  submit("passwordForm", async (form) => {
    message(
      (
        await request(
          "/account/password",
          "POST",
          {
            currentPassword: form.currentPassword.value,
            password: form.password.value,
          },
          true,
        )
      ).message,
    );
    window.StudyState.signOutCleanup();
    document.getElementById("accountTools").classList.add("hidden");
    form.reset();
  });
  submit("deleteAccountForm", async (form) => {
    message(
      (
        await request(
          "/account",
          "DELETE",
          { password: form.password.value, confirm: form.confirm.value },
          true,
        )
      ).message,
    );
    window.StudyState.signOutCleanup();
    for (const name of ["userEmail", "userPlan", "userIsAdmin"])
      localStorage.removeItem(name);
    document.getElementById("accountTools").classList.add("hidden");
    form.reset();
  });
  document.getElementById("exportAccount").onclick = async () => {
    try {
      const data = await request("/account/export", "GET", null, true);
      window.StudyExports.download(
        "smart-study-account.json",
        JSON.stringify(data, null, 2),
        "application/json",
      );
    } catch (error) {
      message(error.message);
    }
  };
  document.getElementById("manageSubscription").onclick = async () => {
    try {
      const data = await request("/billing/portal", "POST", {}, true);
      location.href = data.url;
    } catch (error) {
      message(error.message);
    }
  };
  async function refresh() {
    const data = await request("/account/sessions", "GET", null, true);
    const list = document.getElementById("activeSessions");
    list.replaceChildren(
      ...data.sessions.map((session) => {
        const row = document.createElement("div");
        row.className = "flex flex-wrap gap-3 items-center py-2";
        const label = document.createElement("span");
        label.textContent = `${session.label || "Browser"} · ${session.created_at}${session.current ? " · this device" : ""}`;
        const button = document.createElement("button");
        button.className = "btn-secondary";
        button.textContent = "Sign out";
        button.onclick = async () => {
          try {
            await request(
              "/account/sessions/" + encodeURIComponent(session.id),
              "DELETE",
              null,
              true,
            );
            if (session.current) {
              window.StudyState.signOutCleanup();
              location.reload();
            } else await refresh();
          } catch (error) {
            message(error.message);
          }
        };
        row.append(label, button);
        return row;
      }),
    );
  }
  try {
    await refresh();
  } catch (error) {
    message(error.message);
  }
});
