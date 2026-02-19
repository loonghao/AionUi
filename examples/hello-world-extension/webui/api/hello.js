/**
 * Hello World API Route
 *
 * This module exports an Express Router that handles /api/ext/hello requests.
 * The extension system automatically mounts it under /api/ext/ prefix.
 */
const { Router } = require('express');

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    message: 'Hello from AionUI Extension!',
    timestamp: new Date().toISOString(),
    extension: 'hello-world',
    version: '1.0.0',
  });
});

router.get('/greet/:name', (req, res) => {
  const { name } = req.params;
  const greeting = process.env.GREETING_PREFIX || 'Hello';
  res.json({
    message: `${greeting}, ${name}! Welcome to AionUI.`,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
