const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pipeline = require('../pipeline/processImage');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const id = uuidv4();
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${id}${ext}`);
  }
});

const upload = multer({ storage });

// In-memory results store (for demo). For production use DB.
const results = new Map();

router.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const id = path.parse(req.file.filename).name;
  const filePath = req.file.path;
  // Initialize status
  results.set(id, { status: 'queued', steps: [] });

  // Process asynchronously
  pipeline.processImage(filePath, id)
    .then((result) => results.set(id, { status: 'done', result }))
    .catch((err) => results.set(id, { status: 'error', error: err.message }));

  res.json({ id, filename: req.file.filename });
});

router.get('/status/:id', (req, res) => {
  const id = req.params.id;
  if (!results.has(id)) return res.status(404).json({ error: 'Not found' });
  res.json(results.get(id));
});

module.exports = router;
