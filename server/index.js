const cors = require('cors');
const express = require('express');

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
