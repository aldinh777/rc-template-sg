const { parseReactiveCML } = require('@aldinh777/reactive-cml/parser');
const {
    readdirSync,
    statSync,
    readFileSync,
    writeFileSync,
    rmSync,
    cpSync,
    existsSync
} = require('fs');
const { join, extname, relative, basename } = require('path');

function recursiveRead(path, handler) {
    const dir = statSync(path);
    if (dir.isDirectory()) {
        const contents = readdirSync(path);
        for (const content of contents) {
            recursiveRead(join(path, content), handler);
        }
    } else {
        handler?.(path);
    }
}

function parseRC(path) {
    const source = readFileSync(path, 'utf-8');
    const output = parseReactiveCML(source, {
        mode: 'require',
        trimCML: false,
        relativeImports: {
            filename: path,
            forceJSImportExtension: true
        }
    });
    return output;
}

const webdir = join(__dirname, 'web');
const outdir = join(__dirname, 'dist');
const outputs = [];

if (existsSync(outdir)) {
    rmSync(outdir, { recursive: true });
}

/** build web components */
recursiveRead(webdir, (path) => {
    if (extname(path) === '.rc') {
        const srcOutput = parseRC(path);
        const isComponent = basename(path).match(/^[A-Z]/);
        const fileOut = path.replace(/\.rc$/, isComponent ? '.js' : '.html.js');
        writeFileSync(fileOut, srcOutput, 'utf-8');
        outputs.push(fileOut);
    }
});

function buildProps(props) {
    let propsText = '';
    for (const key in props) {
        propsText += ` ${key}="${props[key]}"`;
    }
    return propsText;
}

function buildHtml(rendered) {
    let htmlText = '';
    for (const item of rendered) {
        if (typeof item === 'string') {
            htmlText += item;
        } else if (item.length === 1) {
            const [value] = item;
            htmlText += value;
        } else if (item.tag) {
            const textChildren = buildHtml(item.children);
            const propsText = buildProps(item.props);
            if (textChildren || item.tag === 'script') {
                htmlText += `<${item.tag}${propsText}>${textChildren}</${item.tag}>`;
            } else {
                htmlText += `<${item.tag}${propsText}/>`;
            }
        } else {
            htmlText += buildHtml(item.items);
        }
    }
    return htmlText;
}

/** output dist */
recursiveRead(webdir, async (path) => {
    const relpath = relative(webdir, path);
    const outpath = join(outdir, relpath);
    if (extname(path) === '.rc') {
        return;
    } else if (extname(path) === '.js') {
        // Check is it a component
        if (existsSync(path.replace(/\.js$/, '.rc'))) {
            return;
        }
        // Check is it a html component
        if (path.match(/\.html\.js$/) && existsSync(path.replace(/\.html\.js$/, '.rc'))) {
            const importpath = './' + relative(__dirname, path);
            const htmlComponent = await import(importpath);
            const rendered = await htmlComponent.default();
            const htmlOutput = buildHtml(rendered);
            const htmlFilePath = outpath.replace(/\.html\.js$/, '.html');
            writeFileSync(htmlFilePath, htmlOutput, 'utf-8');
            return;
        }
    }
    cpSync(path, outpath, { recursive: true });
});

process.on('exit', () => {
    for (const file of outputs) {
        rmSync(file);
    }
});
