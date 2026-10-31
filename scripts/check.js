"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((item) =>
      item.isDirectory()
        ? walk(path.join(dir, item.name))
        : [path.join(dir, item.name)],
    );
}
const files = [
  "server.js",
  ...["api", "src", "scripts", "tests", "public/assets/js"].flatMap(walk),
].filter((file) => file.endsWith(".js"));
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stderr);
    process.exit(1);
  }
}
console.log("Syntax checks passed: " + files.length + " JavaScript files");
