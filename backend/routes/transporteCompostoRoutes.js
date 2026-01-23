const express = require('express');
const router = express.Router();
const controller = require('../controllers/transporteCompostoController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuração de Upload temporário
const uploadDir = path.join(__dirname, '../uploads/temp');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ storage });

// Rotas
router.get('/', controller.index);
router.post('/', controller.store);
router.post('/importar-pdf', upload.single('file'), controller.importarPdf);

module.exports = router;
