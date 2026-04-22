const {
    proxyToPwaBackend,
    readRequestBody,
    cors
} = require('./pwa-admin-proxy');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        cors(res);
        return res.status(204).end();
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            message: 'Method not allowed'
        });
    }

    let body = null;
    if (req.method === 'POST') {
        try {
            body = await readRequestBody(req);
        } catch (e) {
            return res.status(400).json({
                success: false,
                message: 'Invalid body'
            });
        }
    }

    return proxyToPwaBackend(req, res, {
        method: req.method,
        path: '/api/admin/users',
        body,
        apiKeyEnv: 'ADMIN_API_KEY'
    });
};

