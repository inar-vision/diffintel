const express = require("express");
const app = express();
const authenticate = require("./auth");

app.get("/public", (req, res) => res.json({ ok: true }));
app.get("/admin", authenticate, (req, res) => res.json({ secret: true }));
app.post("/admin/action", authenticate, authorize, (req, res) => res.json({}));
app.get("/health", (req, res) => res.json({ ok: true }));
