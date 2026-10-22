import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { reloadScrollResetScript } from "../lib/reload-scroll";

function browser(type: string, hash = "#business-units") {
  const state = { nextRouter: "preserve" };
  const replacements: unknown[][] = [];
  const scrolls: unknown[] = [];
  const events: { name: string; callback: () => void; options: unknown }[] = [];
  const history = {
    state,
    scrollRestoration: "auto",
    replaceState: (...args: unknown[]) => replacements.push(args),
  };
  vm.runInNewContext(reloadScrollResetScript, {
    performance: { getEntriesByType: () => [{ type }] },
    history,
    location: { pathname: "/zh-CN/overview", search: "?view=china", hash },
    window: {
      scrollTo: (options: unknown) =>
        scrolls.push(JSON.parse(JSON.stringify(options))),
      addEventListener: (
        name: string,
        callback: () => void,
        options: unknown,
      ) => events.push({ name, callback, options }),
    },
  });
  return { state, history, replacements, scrolls, events };
}

test("hard reload starts at the top and removes stale section fragments before hydration", () => {
  const b = browser("reload");
  assert.equal(b.history.scrollRestoration, "manual");
  assert.deepEqual(b.replacements, [
    [b.state, "", "/zh-CN/overview?view=china"],
  ]);
  assert.deepEqual(b.scrolls, [{ top: 0, left: 0, behavior: "instant" }]);
  assert.equal(b.events[0].name, "pagehide");
  b.events[0].callback();
  assert.equal(b.history.scrollRestoration, "auto");
});

test("reload without a fragment also suppresses browser scroll restoration", () => {
  const b = browser("reload", "");
  assert.equal(b.history.scrollRestoration, "manual");
  assert.equal(b.replacements.length, 0);
  assert.equal(b.scrolls.length, 1);
});

test("normal deep links and browser back/forward retain their navigation behavior", () => {
  for (const type of ["navigate", "back_forward", "prerender"]) {
    const b = browser(type);
    assert.equal(b.history.scrollRestoration, "auto");
    assert.equal(b.replacements.length, 0);
    assert.equal(b.scrolls.length, 0);
    assert.equal(b.events.length, 0);
  }
});
