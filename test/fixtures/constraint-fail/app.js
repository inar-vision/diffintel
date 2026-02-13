const express = require("express");
const app = express();
const authenticate = require("./auth");

app.get("/api/users", (req, res) => res.json([]));
app.get("/api/orders", authenticate, (req, res) => res.json([]));
app.get("/health", (req, res) => res.json({ ok: true }));
