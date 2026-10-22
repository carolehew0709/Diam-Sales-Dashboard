/** Runs before hydration so browser restoration and old fragments cannot scroll a reload. */
export const reloadScrollResetScript = `(function () {
  var navigation = performance.getEntriesByType("navigation")[0];
  if (!navigation || navigation.type !== "reload") return;
  var previousRestoration = history.scrollRestoration;
  history.scrollRestoration = "manual";
  if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  window.addEventListener("pagehide", function () {
    history.scrollRestoration = previousRestoration;
  }, { once: true });
})();`;
