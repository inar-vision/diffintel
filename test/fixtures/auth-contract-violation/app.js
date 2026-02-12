const express = require("express");
const app = express();

app.get("/public", (req, res) => res.json({ ok: true }));
app.get("/admin", (req, res) => res.json({ secret: true }));
