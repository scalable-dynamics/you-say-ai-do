const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const { connector } = require('./src/connector');

const server = http.createServer(async (req, res) => {
    const envParams = { get: (key) => config[key] };
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
    } else if (req.url === '/api') {
        const response = await connector(apiRequest, envParams);
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