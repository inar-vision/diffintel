import express, { Request, Response } from "express";

const app = express();

app.get("/users", (req: Request, res: Response) => {
  res.json([]);
});

app.get("/users/:id", (req: Request, res: Response) => {
  res.json({ id: req.params.id });
});

app.post("/users", (req: Request, res: Response) => {
  res.status(201).json(req.body);
});

app.get("/health", (req: Request, res: Response) => {
  res.json({ ok: true });
});

export default app;
