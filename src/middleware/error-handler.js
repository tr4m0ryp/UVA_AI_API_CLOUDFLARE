function errorHandler(err, req, res, _next) {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: { message: 'Internal server error' } });
}

module.exports = errorHandler;
