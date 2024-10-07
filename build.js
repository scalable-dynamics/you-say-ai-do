const fs = require('fs');
const path = require('path');
const iconPath = path.join(__dirname, 'src', 'images', 'yousayaido.png');
const cssPath = path.join(__dirname, 'src', 'app.css');
const jsPath = path.join(__dirname, 'src', 'app.js');
const htmlPath = path.join(__dirname, 'src', 'app.html');
const connectorPath = path.join(__dirname, 'src', 'connector.js');
const apiPath = path.join(__dirname, 'src', 'api.js');
const CSS = MINIFYCSS(fs.readFileSync(cssPath, 'utf-8'));
const JS = MINIFYJS(fs.readFileSync(jsPath, 'utf-8'), 'init');
const HTML = fs.readFileSync(htmlPath, 'utf-8');
const CONNECTOR = fs.readFileSync(connectorPath, 'utf-8');
const API = fs.readFileSync(apiPath, 'utf-8');
Promise.all([CSS, JS]).then(([minifiedCSS, minifiedJS]) => {
    const minifiedHTML = HTML
        .replace('<link rel="stylesheet" href="app.css">', `<style>${minifiedCSS}</style>`)
        .replace('<script src="app.js"></script>', `<script>${minifiedJS}</script>`);
    fs.writeFileSync(path.join(__dirname, 'public', 'index.html'), minifiedHTML);
    console.log('Build complete!');
});
const start = CONNECTOR.indexOf('async function connector(');
MINIFYJS(CONNECTOR.slice(start), 'connector', 'hosting').then(connector => {
    fs.writeFileSync(path.join(__dirname, 'public', '_worker.js'), `${API}\n${connector}`);
    console.log('Build complete!');
});
const imagesPath = path.join(__dirname, 'public', 'images');
if (!fs.existsSync(imagesPath)) {
    fs.mkdirSync(imagesPath);
}
fs.copyFileSync(iconPath, path.join(imagesPath, 'yousayaido.png'));

function MINIFYCSS(css) {
    const postcss = require('postcss');
    const cssnano = require('cssnano');
    const autoprefixer = require('autoprefixer');
    return postcss([cssnano, autoprefixer]).process(css).then(result => result.css);
}

function MINIFYJS(code, ...reserved) {
    const Terser = require('terser');
    return Terser.minify(code, {
        compress: {
            dead_code: true,
            drop_debugger: true,
            drop_console: false,
            unused: true,
        },
        mangle: {
            toplevel: true,
            reserved
        },
        output: {
            comments: false,
        },
    }).then(result => {
        if (result.error) {
            console.error(`Error minifying JS:`, result.error);
            return;
        }
        return result.code;
    });
}
