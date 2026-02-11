const express = require("express");
const app = express();

app.get("/users", (req, res) => res.json([]));
app.post("/users", (req, res) => res.status(201).json({}));
app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/debug", (req, res) => res.json({ debug: true }));
app.get("/metrics", (req, res) => res.json({ uptime: 0 }));

module.exports = app;
