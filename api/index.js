"use strict";

// Vercel invokes a request handler; it does not start the local port listener.
let application;
module.exports = async function handler(req, res) {
  try {
    application ||= require("../src/app")();
    return await (await application).handler(req, res);
  } catch (error) {
    application = undefined;
    console.error("Application initialization failed:", error);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(
      JSON.stringify({
        code: [
          "DATABASE_URL_MISSING",
          "DATABASE_URL_INVALID",
          "DATABASE_CA_INVALID",
        ].includes(error.code)
          ? error.code
          : "APPLICATION_INITIALIZATION_FAILED",
        error:
          "Database initialization failed. Check the deployment database configuration and function logs.",
      }),
    );
  }
};
