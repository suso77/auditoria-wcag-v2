const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const PORT = 5050; // Puedes cambiarlo

// Cambia esta URL por la que estás auditando
const TARGET = process.env.TARGET || "https://www.suntransfers.com";

const app = express();

app.use(
  "/",
  createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,

    // 🔥 La clave: NO reescribir ni bloquear /__cypress/**
    ws: true,
    onProxyReq(proxyReq) {
      proxyReq.removeHeader("sec-fetch-site");
      proxyReq.removeHeader("origin");
      proxyReq.removeHeader("referer");
    },
    onProxyRes(proxyRes) {
      delete proxyRes.headers["content-security-policy"];
      delete proxyRes.headers["x-frame-options"];
      delete proxyRes.headers["cross-origin-opener-policy"];
      delete proxyRes.headers["cross-origin-resource-policy"];
    },
  })
);

app.listen(PORT, () =>
  console.log(`🚀 Proxy IAAP activo en http://localhost:${PORT}`)
);
