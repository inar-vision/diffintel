const express = require("express");
const router = express.Router();

router.get("/", (req, res) => res.json([]));
router.post("/", (req, res) => res.status(201).json({}));
router.get("/:id", (req, res) => res.json({}));
router.delete("/:id", (req, res) => res.sendStatus(204));

module.exports = router;
