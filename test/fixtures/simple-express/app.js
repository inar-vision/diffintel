const express = require("express");
const app = express();

app.get("/users", (req, res) => res.json([]));
app.post("/users", (req, res) => res.status(201).json({}));
app.get("/users/:id", (req, res) => res.json({}));
app.get("/health", (req, res) => res.json({ ok: true }));

module.exports = app;
