const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { env } = require('../config/env');

const uploadBaseDir = path.resolve(env.UPLOAD_DIR);

['images', 'documents', 'temporary'].forEach((sub) => {
  const dir = path.join(uploadBaseDir, sub);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subfolder = 'temporary';
    if (file.mimetype.startsWith('image/')) {
      subfolder = 'images';
    } else if (
      file.mimetype === 'application/pdf' ||
      file.mimetype.includes('document')
    ) {
      subfolder = 'documents';
    }
    cb(null, path.join(uploadBaseDir, subfolder));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

module.exports = { upload };
