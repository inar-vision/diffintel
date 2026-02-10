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

// Implemented: get-user
app.get("/users/:id", (req, res) => {
  res.json({ id: Number(req.params.id), name: "Alice" });
});

// Implemented: health-check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// NOT implemented: create-user (POST /users)
// NOT implemented: delete-user (DELETE /users/:id)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
