try {
  const theme = localStorage.getItem("ss-theme");
  if (theme) document.documentElement.setAttribute("data-theme", theme);
} catch {
  /* storage unavailable */
}
