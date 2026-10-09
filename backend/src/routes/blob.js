'use strict';
// Local-storage stand-in for R2 presigned URLs. Every request must carry a valid signature
// issued by the API, exactly like a presigned URL would.

module.exports = function blobRoutes(app, ctx) {
  const { storage } = ctx;

  app.put('/api/blob/*key', async (req, res, next) => {
    const key = req.params.key.join('/');
    const p = storage.verify(key, req.query);
    if (!p || !['put', 'part'].includes(p.op)) return res.fail(403, 'Invalid or expired upload URL.');
    if (Number(req.get('content-length')) !== Number(p.len)) return res.fail(400, 'Content-Length doesn’t match the signed length.');
    if (p.op === 'put' && p.ct && req.get('content-type') !== p.ct) return res.fail(400, 'Content-Type doesn’t match the signed type.');
    try {
      const etag = await storage.receive(p, req);
      res.setHeader('ETag', etag);
      return res.status(200).end();
    } catch (err) {
      return next(err);
    }
  });

  const serve = async (req, res, next) => {
    const key = req.params.key.join('/');
    const p = storage.verify(key, req.query);
    if (!p || p.op !== 'get') return res.status(403).end();
    const headers = {
      'Content-Type': p.ct || 'application/octet-stream',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=3600',
    };
    if (p.cd) headers['Content-Disposition'] = p.cd;
    res.sendFile(storage.abs(key), { headers, dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) { if (err.code === 'ENOENT') res.status(404).end(); else next(err); }
    });
  };
  app.get('/api/blob/*key', serve);
};
