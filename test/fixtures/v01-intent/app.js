const express = require("express");
const app = express();

app.get("/users", (req, res) => res.json([]));
app.post("/users", (req, res) => res.status(201).json({}));

module.exports = app;
