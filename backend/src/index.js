require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const imagesRouter = require('./routes/images');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/images', imagesRouter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
