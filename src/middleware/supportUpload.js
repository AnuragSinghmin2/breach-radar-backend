const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadRoot = process.env.SUPPORT_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'support-tickets');
fs.mkdirSync(uploadRoot, { recursive: true });

const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.pdf', '.txt', '.zip']);
const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadRoot),
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const safeBase = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    cb(null, `${safeBase}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase();

    if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(file.mimetype)) {
      const error = new Error('Attachment must be one of: JPG, JPEG, PNG, PDF, TXT, ZIP.');
      error.statusCode = 400;
      return cb(error);
    }

    return cb(null, true);
  },
});

function handleSupportAttachmentUpload(req, res, next) {
  upload.single('attachment')(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Attachment must be 10 MB or smaller.' });
      }
      return res.status(400).json({ message: error.message });
    }
    if (error) {
      return res.status(error.statusCode || 400).json({ message: error.message });
    }
    return next();
  });
}

module.exports = { handleSupportAttachmentUpload, uploadRoot };