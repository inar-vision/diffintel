const express = require("express");
const app = express();
const userRoutes = require("./routes/users");

app.use("/users", userRoutes);
app.get("/health", (req, res) => res.json({ ok: true }));

module.exports = app;
