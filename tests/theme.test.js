"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { parseHTML } = require("linkedom");
const names = ["base", "components", "management", "records", "theme"];
const sheets = names.map((name) =>
  fs.readFileSync(`public/assets/css/${name}.css`, "utf8"),
);
const tokens = Object.fromEntries(
  sheets.flatMap((css) =>
    [...css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  ),
);
const references = (value) =>
  [...value.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]);
function resolve(name, seen = []) {
  assert.ok(
    !seen.includes(name),
    `Cyclic theme token: ${[...seen, name].join(" -> ")}`,
  );
  const value = tokens[name];
  assert.ok(value, `Undefined theme token: ${name}`);
  return value.replace(/var\((--[\w-]+)\)/g, (_, ref) =>
    resolve(ref, [...seen, name]),
  );
}
function rgba(hex) {
  let value = hex.slice(1);
  if (value.length < 5) value = [...value].map((part) => part + part).join("");
  return [0, 2, 4, 6].map((offset) =>
    offset === 6 && value.length === 6
      ? 1
      : parseInt(value.slice(offset, offset + 2), 16) / 255,
  );
}
function luminance(rgb) {
  return rgb
    .slice(0, 3)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
      0,
    );
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("one shared theme loads for all pages, keeps Prompt and has no dangling or circular palette references", () => {
  const { document } = parseHTML(fs.readFileSync("public/index.html", "utf8"));
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map(
    (link) => link.getAttribute("href"),
  );
  assert.equal(links.at(-1), "/assets/css/theme.css");
  assert.ok(
    links.some((href) => href.includes("family=Prompt:")),
    "keep the existing font",
  );
  for (const ref of references(sheets.join("\n"))) {
    // Existing chart dimensions are supplied inline or have a CSS fallback.
    if (["--stat-color", "--trend-count"].includes(ref)) continue;
    assert.ok(ref in tokens, `Undefined shared property: ${ref}`);
    resolve(ref);
  }
  assert.equal(resolve("--purple"), resolve("--color-accent"));
  assert.equal(resolve("--dropdown-accent"), resolve("--color-accent"));
});

test("declared glass palette keeps text, semantic statuses, focus and input edges distinguishable", () => {
  const color = (name) => rgba(resolve(name));
  const pairs = [
    ["--color-text", "--color-page", 4.5],
    ["--color-text-secondary", "--color-page", 4.5],
    ["--color-text-muted", "--color-page", 4.5],
    ["--color-on-dark", "--color-accent", 4.5],
    ["--color-on-dark", "--color-accent-hover", 4.5],
    ["--color-success", "--color-success-soft", 4.5],
    ["--color-warning", "--color-warning-soft", 4.5],
    ["--color-danger", "--color-danger-soft", 4.5],
    ["--color-input-border", "--color-surface-solid", 3],
    ["--color-focus", "--color-surface-solid", 3],
  ];
  for (const [fg, bg, minimum] of pairs) {
    const value = contrast(color(fg), color(bg));
    assert.ok(
      value >= minimum,
      `${fg} / ${bg}: ${value.toFixed(2)} < ${minimum}`,
    );
  }
  // Declared/composited stops are a conservative palette check, not a browser-render claim.
  const body = sheets.at(-1).match(/\nbody\s*\{([^}]+)\}/)[1];
  const stops = [...body.matchAll(/#[\da-f]{6}(?:[\da-f]{2})?\b/gi)]
    .map((match) => rgba(match[0]))
    .filter((stop) => stop[3] === 1);
  for (const background of stops) {
    for (const name of [
      "--color-text",
      "--color-text-secondary",
      "--color-text-muted",
    ])
      assert.ok(
        contrast(color(name), background) >= 4.5,
        `${name} must stay readable on the page gradient`,
      );
    for (const stop of tokens["--glass-fill"].match(/#[\da-f]{8}\b/gi)) {
      const glass = rgba(stop);
      const composite = glass
        .slice(0, 3)
        .map(
          (channel, index) =>
            channel * glass[3] + background[index] * (1 - glass[3]),
        );
      assert.ok(
        contrast(color("--color-text-muted"), composite) >= 4.5,
        "secondary text must survive the translucent surface",
      );
    }
  }
});
