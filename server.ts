import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("toonstyle.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS styles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    images TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    images TEXT NOT NULL
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API Routes
  
  // Styles
  app.get("/api/styles", (req, res) => {
    const styles = db.prepare("SELECT * FROM styles ORDER BY id DESC").all();
    res.json(styles.map((s: any) => ({ ...s, images: JSON.parse(s.images) })));
  });

  app.post("/api/styles", (req, res) => {
    const { id, name, images } = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO styles (id, name, images) VALUES (?, ?, ?)");
    stmt.run(id, name, JSON.stringify(images));
    res.json({ status: "ok" });
  });

  app.delete("/api/styles/:id", (req, res) => {
    db.prepare("DELETE FROM styles WHERE id = ?").run(req.params.id);
    res.json({ status: "ok" });
  });

  // Characters
  app.get("/api/characters", (req, res) => {
    const characters = db.prepare("SELECT * FROM characters ORDER BY id DESC").all();
    res.json(characters.map((c: any) => ({ ...c, images: JSON.parse(c.images) })));
  });

  app.post("/api/characters", (req, res) => {
    const { id, name, images } = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO characters (id, name, images) VALUES (?, ?, ?)");
    stmt.run(id, name, JSON.stringify(images));
    res.json({ status: "ok" });
  });

  app.delete("/api/characters/:id", (req, res) => {
    db.prepare("DELETE FROM characters WHERE id = ?").run(req.params.id);
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
