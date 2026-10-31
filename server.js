"use strict";
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const config = require("./src/config");
const { PUBLIC, HOST, PREFERRED_PORT } = config;
let activePort = PREFERRED_PORT;
let triedFallbackPort = false;
async function start() {
  const application = await require("./src/app")();
  const server = http.createServer(application.handler);
  server.on("error", async (err) => {
    if (
      err.code === "EADDRINUSE" &&
      !triedFallbackPort &&
      !process.env.PORT &&
      PREFERRED_PORT === 8001
    ) {
      triedFallbackPort = true;
      activePort = 8002;
      console.warn(
        "พอร์ต 8001 ไม่ว่าง กำลังลองพอร์ตสำรอง 8002 โดยไม่ปิดโปรแกรมอื่น",
      );
      server.listen(activePort, HOST);
      return;
    }
    if (err.code === "EADDRINUSE")
      console.error(
        `พอร์ต ${activePort} ถูกใช้งานอยู่ กรุณาปิดโปรแกรมที่ใช้อยู่ หรือกำหนด PORT เป็นพอร์ตว่าง`,
      );
    else console.error(err.message);
    await application.close();
    process.exitCode = 1;
  });
  function onListening() {
    activePort = server.address().port;
    console.log(
      `BSRU Workshop server พร้อมใช้งาน: http://${HOST}:${activePort}`,
    );
    console.log(`โฟลเดอร์เว็บ: ${PUBLIC}`);
    console.log("ฐานข้อมูล: Supabase / PostgreSQL");
    if (
      process.platform === "win32" &&
      process.env.NODE_ENV !== "production" &&
      process.env.NO_BROWSER !== "1"
    ) {
      const opener = spawn(
        "cmd.exe",
        ["/c", "start", "", `http://${HOST}:${activePort}`],
        { detached: true, stdio: "ignore", windowsHide: true },
      );
      opener.on("error", (error) =>
        console.warn("Browser could not be opened:", error.message),
      );
      opener.unref();
    }
  }
  server.once("listening", onListening);
  server.listen(activePort, HOST);
  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    server.close(async () => {
      await application.close();
      process.exit(0);
    });
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
if (process.env.VERCEL) module.exports = require("./api");
else
  start().catch((error) => {
    console.error("Server initialization failed:", error.code || error.name);
    process.exitCode = 1;
  });
