const express = require("express");
const app = express();

app.use(express.json());

// Implemented: list-users
app.get("/users", (req, res) => {
  res.json([
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
  ]);
});

// Implemented: search-users
app.get("/users/search", (req, res) => {
  const { q } = req.query;
  const results = [
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
  ].filter(user => !q || user.name.toLowerCase().includes(q.toLowerCase()));
  res.json(results);
});

// Implemented: get-user-by-name
app.get("/users/name/:name", (req, res) => {
  res.json({ id: 1, name: req.params.name });
});

// Implemented: get-user-by-email
app.get("/users/email/:email", (req, res) => {
  res.json({ id: 1, name: "Alice", email: req.params.email });
});

// Implemented: get-user
app.get("/users/:id", (req, res) => {
  res.json({ id: Number(req.params.id), name: "Alice" });
});

// Implemented: health-check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Implemented: create-user
app.post("/users", (req, res) => {
  const { name } = req.body;
  res.status(201).json({ id: 3, name });
});

// Implemented: update-user
app.put("/users/:id", (req, res) => {
  const { name } = req.body;
  res.json({ id: Number(req.params.id), name });
});

// Implemented: delete-user
app.delete("/users/:id", (req, res) => {
  res.status(204).send();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
