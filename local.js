const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const { connector, hosting } = require('./src/connector');
const hosted_files = {};
const envParams = {
    get: (key) => config[key]
};
const hostingParams = {
    put: async (title, readableStream, data) => {
        const httpEtag = new Date().getTime().toString();
        console.log('PUT: ' + httpEtag);
        hosted_files[httpEtag] = {
            Body: readableStream,
            Metadata: data
        };
        return { httpEtag };
    },
    get: async (httpEtag) => {
        console.log('GET: ' + httpEtag);
        if (hosted_files[httpEtag]) {
            return {
                body: hosted_files[httpEtag].Body,
                writeHttpMetadata(headers) {
                    headers['Content-Type'] = hosted_files[httpEtag].Metadata['Content-Type'];
                    headers['Content-Length'] = hosted_files[httpEtag].Metadata['Content-Length'];
                }
            };
        } else {
            console.log('etag_not_found:', hosted_files);
        }
    },
    head: async (httpEtag) => {
        console.log('HEAD: ' + httpEtag);
        return hosted_files.hasOwnProperty(httpEtag);
    }
};
const server = http.createServer(async (req, res) => {
    const apiRequest = {
        method: req.method,
        json() {
            return new Promise((resolve, reject) => {
                let body = '';
                req.on('data', (chunk) => body += chunk);
                req.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    }
                    catch (err) {
                        reject(err);
                    }
                });
            });
        }
    };
    const readFile = (filePath, fileType) => new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                res.statusCode = 500;
                res.end('Internal Server Error');
            } else {
                res.setHeader('Content-Type', fileType);
                res.end(data);
            }
            resolve();
        });
    });
    if (req.url === '/') {
        const indexPath = path.join(__dirname, 'src', 'app.html');
        await readFile(indexPath, 'text/html');
    } else if (req.url === '/nes.min.css') {
        const indexPath = path.join(__dirname, 'src', 'nes.min.css');
        await readFile(indexPath, 'text/css');
    } else if (req.url === '/app.css') {
        const indexPath = path.join(__dirname, 'src', 'app.css');
        await readFile(indexPath, 'text/css');
    } else if (req.url === '/app.js') {
        const indexPath = path.join(__dirname, 'src', 'app.js');
        await readFile(indexPath, 'text/javascript');
    } else if (req.url.startsWith('/shared/')) {
        const response = await hosting({ ...req, url: req.url.slice(8) }, hostingParams);
        if (response.status !== 200) {
            res.writeHead(response.status, { 'Content-Type': 'text/plain' });
            res.end(response.body);
            return;
        }
        for (let key in response.headers) {
            res.setHeader(key, response.headers[key]);
        }
        res.end(response.body);
    } else if (req.url === '/api') {
        const response = await connector(apiRequest, envParams, hostingParams);
        if (response.status !== 200) {
            res.writeHead(response.status, { 'Content-Type': 'text/plain' });
            res.end(response.body);
            return;
        }
        for (let key in response.headers) {
            res.setHeader(key, response.headers[key]);
        }
        res.end(response.body);
    } else {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request');
    }
});

server.listen(3000, () => {
    console.log('Server is running: http://localhost:3000');
});

server.on('error', (err) => {
    console.error('Server error:', err.message);
});