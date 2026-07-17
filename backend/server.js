// Local development entry point — runs the Express app on localhost:3001
// On Vercel production, api/index.js is used instead (no listen needed).
const app = require("./app");

const PORT = process.env.PORT || 3001;
app.listen(PORT, "127.0.0.1", () =>
  console.log(`API server running on http://127.0.0.1:${PORT}`)
);
