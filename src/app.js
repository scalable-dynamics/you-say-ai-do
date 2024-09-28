// Define the necessary elements
const menuButton = document.getElementById('menuButton');
const shareButton = document.getElementById('shareButton');
const closeButton = document.getElementById('closeButton');
const previewButton = document.getElementById('previewButton');
const projectTitle = document.getElementById('projectTitle');
const sidePanelContent = document.getElementById('sidePanelContent');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const attachButton = document.getElementById('attachButton');
const audioButton = document.getElementById('audioButton');
const filePreview = document.getElementById('filePreview');
const audioVisualizer = document.getElementById('audioVisualizer');
const dynamicContent = document.getElementById('dynamicContent');
const editorContent = document.getElementById('editorContent');
const errorMessage = document.getElementById('errorMessage');
const loaderContainer = document.getElementById('loaderContainer');
const downloadContent = document.getElementById('downloadContent');
const projectList = document.getElementById('projectList');

let isRecording = false;
let mediaRecorder;
let recordingSendTimer;
let audioChunks = [];
let speechRecognition;
let selectedFiles = [];
let loaderCount = 0;
let codeEditor;
let currentProject;
let projectIsRunning;

async function monacoEditor(element, onChange) {
    return new Promise((resolve, reject) => {
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.51.0/min/vs' } });
        require(['vs/editor/editor.main'], function () {

            monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                noSemanticValidation: true,
                noSyntaxValidation: false,
            });

            monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
                target: monaco.languages.typescript.ScriptTarget.ESNext,
                allowNonTsExtensions: true,
            });

            const editor = monaco.editor.create(element, {
                value: '',
                language: 'javascript',
                theme: 'vs-dark',
            });

            window.addEventListener('resize', () => editor.layout());

            editor.onDidChangeModelContent(e => {
                onChange(editor.getValue());
            });

            let models = {};
            resolve({
                clear() {
                    for (const name in models) {
                        models[name].dispose();
                    }
                    models = {};
                },
                addFile(name, code) {
                    models[name] = monaco.editor.createModel(code, "application/javascript", monaco.Uri.parse(`file:///src/${name}`));
                    models[name].setLanguage('javascript');
                },
                setPosition(position) {
                    editor.setPosition(position);
                    editor.revealPositionInCenter(position);
                },
                openFile(name) {
                    editor.setModel(models[name]);
                },
                getValue() {
                    return editor.getValue();
                },
                setValue(name, value) {
                    models[name].setValue(value);
                },
            });
        });
    });
}

async function getProjects() {
    const file = await loadFileFromCache('projects.json');
    if (file) {
        console.log('Loaded projects from cache:', file.name);
        const text = await file.text();
        return JSON.parse(text);
    } else {
        console.log('Projects not found in cache!');
        return [];
    }
}

async function findProject(title) {
    const projects = await getProjects();
    return projects.find(p => p.title === title);
}

async function saveProject(project) {
    const projects = await getProjects();
    const index = projects.findIndex(p => p.id === project.id);
    if (index !== -1) {
        projects[index] = project;
    } else {
        projects.push(project);
    }
    project.savedOn = getFormattedTime();
    await saveToCache(new File([JSON.stringify(projects)], 'projects.json', { type: 'application/json' }));
}

async function createNewProject(instructions) {
    const id = Date.now().toString();
    const newProject = {
        id,
        title: instructions.split('\n')[0].slice(0, 50),
        description: '',
        instructions,
        html: '',
        components: [],
        messages: [],
        createdOn: getFormattedTime(),
        savedOn: getFormattedTime()
    };
    await saveProject(newProject);
    return newProject;
}

async function openProject(id) {
    let codeEditorPromise;
    if (!codeEditor) {
        codeEditorPromise = monacoEditor(editorContent, (value, path) => {
            for (const message of currentProject.messages) {
                if (message.fileName === path) {
                    message.code = value;
                    stopProject();
                    break;
                }
            }
        }).then(editor => codeEditor = editor);
    }
    const projects = await getProjects();
    const project = projects.find(p => p.id === id);
    if (project) {
        currentProject = project;
        updateUIForProject(project);

        if (codeEditorPromise) await codeEditorPromise;

        codeEditor.clear();
        for (const component of project.components) {
            codeEditor.addFile(component.fileName, component.code);
            addMessage(component.title, false, createButton(component.fileName, () => {
                if (editorContent.classList.contains('open') && codeEditor.selectedFileName === component.fileName) {
                    togglePreview(true);
                } else {
                    codeEditor.openFile(component.fileName, component.code);
                    codeEditor.selectedFileName = component.fileName;
                    togglePreview(false);
                }
            }));
        }
    } else {
        console.error('Project not found:', id);
        alert('Project not found!\n' + id + '\n' + projects.map(p => p.id).join('\n'));
    }
}

function updateUIForProject(project) {
    projectTitle.innerText = project.title;
    projectTitle.title = project.title + (project.description ? '\n' + removeMarkdown(project.description) : '');
    sidePanelContent.innerHTML = '';
    for (const message of project.messages) {
        if (message.file) {
            addMessage(message.content, message.role === 'user', createButton(message.file, async () => {
                const file = await loadFileFromCache(message.file);
                if (file) {
                    previewFile(file);
                }
            }));
        } else {
            addMessage(message.content, message.role === 'user');
        }
    }
    for (const component of project.components) {
        addMessage(component.title, false, createButton(component.fileName, () => {
            if (editorContent.classList.contains('open') && codeEditor.selectedFileName === component.fileName) {
                togglePreview(true);
            } else {
                codeEditor.openFile(component.fileName, component.code);
                codeEditor.selectedFileName = component.fileName;
                togglePreview(false);
            }
        }));
    }
    if (project.html) {
        previewHTML(project.html);
    }
    toggleWorkspace(true);
}

function removeMarkdown(text) {
    text = text.replace(/`/g, '');
    text = text.replace(/\*\*/g, '');
    text = text.replace(/_/g, '');
    text = text.replace(/#/g, '');
    text = text.replace(/\//g, '');
    return text;
}

function removeLines(text) {
    return text.replace(/\n/g, ' ');
}

function removeQuotes(text) {
    return text.replace(/"/g, '');
}

function previewFile(file) {
    const modal = document.createElement('div');
    modal.classList.add('modal');
    modal.onclick = () => modal.remove();
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.classList.add('modal-content');
    modal.appendChild(img);
    document.body.appendChild(modal);
}

async function loadProject(id) {
    await openProject(id);
    await runProject(currentProject);
}

async function listProjects() {
    projectList.innerHTML = '';
    const projects = await getProjects();
    for (const project of projects) {
        const item = document.createElement('div');
        item.classList.add('project-item');
        const button = createButton(project.title, () => loadProject(project.id));
        item.appendChild(button);
        const remove = createButton('X', async () => {
            if (confirm('Are you sure you want to delete this project?')) {
                const projects = await getProjects();
                const index = projects.findIndex(p => p.id === project.id);
                if (index !== -1) {
                    projects.splice(index, 1);
                    await saveToCache(new File([JSON.stringify(projects)], 'projects.json', { type: 'application/json' }));
                    listProjects();
                }
            }
        });
        remove.title = 'Delete Project';
        remove.classList.add('remove');
        item.appendChild(remove);
        projectList.appendChild(item);
    }
}

function getFormattedTime() {
    return new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: true
    });
}

function getFileName(title) {
    return `${title.replace(/[^a-z0-9- ]/ig, '')}-${Date.now()}.html`;
}

function getHtmlTitle(html) {
    const match = html.match(/<title>(.*?)<\/title>/);
    return match ? match[1] : '';
}

function autoSizeTextarea(e) {
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

// Function to trim text to 100 characters
function trimText(text) {
    return text.length > 100 ? text.slice(0, 100) + '...' : text;
}

function createButton(text, onClick) {
    const button = document.createElement('button');
    button.textContent = text;
    button.classList.add('btn');
    button.onclick = onClick;
    return button;
}

// Function to create download button for files
function createDownloadButton(file) {
    const button = document.createElement('a');
    button.dataset.file = file.name;
    button.textContent = 'Download';
    button.classList.add('btn', 'is-primary');
    button.href = URL.createObjectURL(file);
    button.download = file.name;
    button.onclick = () => {
        setTimeout(() => {
            URL.revokeObjectURL(button.href);
            button.href = '';
        }, 1000);
    };
    return button;
}

// Function to add a message to the chat
function addMessage(content, isSent, ...children) {
    if (content.length > 500) {
        const file = new File([content], `message-${new Date().getTime()}.txt`, { type: "text/plain" });
        content = `<p>File attached: ${file.name} (${file.size} bytes)</p><p>${trimText(content)}</p>`;
        children.push(createDownloadButton(file));
    }
    const message = { role: isSent ? 'user' : 'assistant', content };
    const messageElement = document.createElement('div');
    messageElement.title = content;
    const modifier = isSent ? 'left' : 'right';
    messageElement.classList.add('message', modifier);
    messageElement.innerHTML = `<div class="balloon is-dark from-${modifier}"><p>${content.replace(/\n/g, '<br>')}</p></div>`;
    sidePanelContent.appendChild(messageElement);
    sidePanelContent.scrollTop = sidePanelContent.scrollHeight;
    if (children && children.length > 0) {
        for (const child of children) {
            if (!child) continue;
            messageElement.firstElementChild.appendChild(child);
            if (child.dataset.file) {
                message.file = child.dataset.file;
            }
        }
    }
    return message;
}

// Function to preview a file
function previewFile(file) {
    const url = URL.createObjectURL(file);
    const win = window.open(url, '_blank');
    win.focus();
    win.addEventListener('load', () => {
        URL.revokeObjectURL(url);
    });
    return () => win.close();
}

function parseCodeOutput(outputText) {
    const files = [];
    const codeBlockRegex = /```(.*?)\n([\s\S]*?)```/gm;
    let match;

    while ((match = codeBlockRegex.exec(outputText)) !== null) {
        const language = match[1].trim();
        const content = match[2].trim();
        if(!content) continue;
        const filenameMatch = content.match(/^(?:\/\/|<!--|#)\s*File\s*:\s*(.*)$/m);
        const filename = filenameMatch ? filenameMatch[1].trim() : 'unknown.txt';

        files.push({
            filename: filename,
            language: language,
            content: content,
        });
    }

    return files;
}

function findComponentByFileName(fileName) {
    return currentProject.components.find(c => c.fileName === fileName);
}

async function updateContent(prompt, context = []) {
    if (!currentProject) {
        currentProject = await createNewProject(prompt);
        toggleWorkspace(true);
    }
    let fileName, code, instructions, isComponent;
    if (editorContent.classList.contains('open')) {
        instructions = `Component ${codeEditor.selectedFileName} for ${currentProject.title}`;
        code = codeEditor.getValue();
        fileName = codeEditor.selectedFileName;
        isComponent = true;
    } else {
        instructions = `Project ${currentProject.title}\n${currentProject.instructions}`;
        code = getProjectHtml(currentProject);
        fileName = getFileName(currentProject.title);
    }
    if (!code || !fileName) return;
    currentProject.messages.push(addMessage(prompt, true));
    const content = await executePrompt('Improving Content...', prompt, [
        ...context.map(c => `Additional Context: ${c}`),
        `Project: ${currentProject.title}`,
        `Focus Area: ${instructions}`,
        `Code: ${code}`,
    ]);
    if (isComponent) {
        for (const component of currentProject.components) {
            if (component.fileName === fileName) {
                component.code = content;
                break;
            }
        }
        codeEditor.setValue(fileName, content);
    } else {
        const files = parseCodeOutput(content);
        if (files.length === 0) {
            currentProject.html = content;
        } else {
            files.forEach(file => {
                const component = findComponentByFileName(file.filename);
                if (component) {
                    component.code = file.content;
                } else {
                    currentProject.components.push({
                        fileName: file.filename,
                        title: file.filename,
                        code: file.content,
                    });
                }
            });
        }
        updateUIForProject(currentProject);
        saveProject(currentProject);
        runProject(currentProject);
    }
    if (currentProject.shared) {
        if (!currentProject.history) currentProject.history = [];
        currentProject.history.push(currentProject.shared);
        currentProject.shared = undefined;
    }
    await saveProject(currentProject);
}

// Function to send a message
async function sendMessage(user = false) {
    const loadImages = [];
    if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
            const fileText = `File attached: ${file.name} (${file.size} bytes)`;
            const downloadButton = createDownloadButton(file);
            currentProject.messages.push(addMessage(fileText, true, downloadButton));
            if (file.type.indexOf('image') === 0) {
                const reader = new FileReader();
                loadImages.push(new Promise((resolve) => {
                    reader.onload = () => {
                        resolve(reader.result);
                    };
                    reader.readAsDataURL(file);
                }));
            }
        }
        filePreview.style.display = 'none';
        filePreview.textContent = '';
        selectedFiles = [];
    }
    let value = messageInput.value.trim();
    const context = [];
    if (loadImages.length > 0) {
        const images = await Promise.all(loadImages);
        const description = await executePrompt('Analyzing Images...', value, [], images);
        context.push(description);
    }
    if (value) {
        messageInput.value = '';
        messageInput.style.height = 'auto';
        await updateContent(value, context);
    }
}

// Function to visualize audio input
function visualizeAudio(stream) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    source.connect(analyser);
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        if (!isRecording) return;
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        let sum = dataArray.reduce((a, b) => a + b, 0);
        let average = sum / bufferLength;
        audioVisualizer.style.height = `${average}px`;
        audioVisualizer.style.backgroundColor = `hsl(${average}, 100%, 50%)`;
    }
    draw();
}

// Function to get HTML content from text
function getHtml(text, currentHtml = '') {
    const html = getHtmlTag(text, '!DOCTYPE html', 'html');
    if (html) return html;
    const body = getHtmlTag(text, 'script') + getHtmlTag(text, 'style') + getHtmlTag(text, 'div');
    if (body && currentHtml) return currentHtml.replace('</body>', body + '</body>');
    return '';
}

function removeContinuation(text) {
    if (text && text.includes('Certainly')) {
        const lines = text.split('\n');
        const index = lines.findIndex(line => line.includes('Certainly'));
        if (index > -1) {
            lines.splice(index, 1);
            text = lines.join('\n');
        }
    }
    return text;
}

// Function to get HTML tag content
function getHtmlTag(text, startTag, endTag) {
    text = removeContinuation(text);
    const start = text.indexOf(`<${startTag}>`);
    const end = text.lastIndexOf(`</${endTag || startTag}>`) + 7;
    if (start === -1 || end === -1) return '';
    return text.slice(start, end);
}

function injectScriptTag(html, script) {
    const index = html.indexOf('<body');
    if (index !== -1) {
        html = html.slice(0, index) + "<script>" + script + "</" + "script>" + html.slice(index);
    }
    return html;
}

function handleError(e, source, lineno, colno, err) {
    console.warn('An error occurred:', e);
    const error = err || (e && e.message) || e?.toString() || 'An error occurred while rendering the content.';
    errorMessage.textContent = error;
    const link = document.createElement('a');
    link.textContent = `🔍 Locate Error`;
    link.href = 'javascript:void(0)';
    errorMessage.appendChild(link);
    link.onclick = () => {
        if (lineno > -1) {
            const html = getProjectHtml(currentProject);
            const lineNumber = lineno - 1;
            const lines = html.split('\n');
            let currentLine = 0;
            for (const component of currentProject.components) {
                currentLine += component.code.split('\n').length;
                if (currentLine > lineNumber) {
                    const index = lineNumber - (currentLine - component.code.split('\n').length);
                    const errorLine = component.code.split('\n')[index];
                    const errorIndex = lines.findIndex(line => line.includes(errorLine));
                    if (errorIndex !== -1) {
                        codeEditor.openFile(component.fileName);
                        codeEditor.setPosition({ lineNumber: errorIndex + 1, column: errorLine.indexOf(')') + 1 });
                        togglePreview(false);
                        break;
                    }
                }
            }
        } else {
            codeEditor.openFile(currentProject.components[0].fileName);
            togglePreview(false);
        }
    };
    const button = document.createElement('button');
    button.textContent = '🛠️ Fix it';
    button.classList.add('btn', 'is-error');
    button.onclick = () => {
        messageInput.value = error;
        errorMessage.style.display = 'none';
        sendMessage();
    };
    errorMessage.appendChild(button);
    errorMessage.style.display = 'block';
};

// Function to execute a prompt
async function executePrompt(description, prompt, messages, images) {
    toggleLoader(description);
    let content = '';
    try {
        const response = await fetch('/api', {
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify({
                prompt,
                messages,
                images
            })
        });
        content = await response.json();
    } catch (e) {
        console.error('Error executing prompt:', e);
        content = 'Oops! Something went wrong. Please reload the page and try again! 🥹';
    } finally {
        toggleLoader(false);
    }
    return content;
}

// Function to toggle loader display
function toggleLoader(show = true, text) {
    loaderCount += show ? 1 : -1;
    if (loaderCount < 0) loaderCount = 0;
    if (loaderCount === 0) {
        loaderContainer.style.display = 'none';
    } else {
        loaderContainer.style.display = 'flex';
    }
    if (text) {
        loaderContainer.dataset.status = text.replace(/\n/g, '<br>');
    }
}

// Function to toggle workspace display
function toggleWorkspace(show = true) {
    projectList.style.display = show ? 'none' : 'block';
    document.body.classList.toggle('workspace', show);
    toggleSidePanel(show && document.body.clientWidth > 768);
}

function toggleSidePanel(show = true) {
    sidePanelContent.style.display = show ? 'flex' : 'none';
    sidePanelContent.classList.toggle('collapsed', !show);
}

// Cache management functions
async function saveToCache(file) {
    try {
        const cache = await caches.open('fileCache');
        await cache.put(file.name, new Response(file));
    } catch (error) {
        console.error('Error saving file to cache:', error);
    }
}

async function removeFileFromCache(fileName) {
    try {
        const cache = await caches.open('fileCache');
        await cache.delete(fileName);
    } catch (error) {
        console.error('Error removing file from cache:', error);
    }
}

async function loadFileFromCache(fileName) {
    try {
        const cache = await caches.open('fileCache');
        const response = await cache.match(fileName);
        if (!response) return null;
        return new File([await response.blob()], fileName);
    } catch (error) {
        console.error('Error loading file from cache:', error);
    }
    return null;
}

function togglePreview(isPreviewVisible) {
    closeButton.style.display = isPreviewVisible ? 'none' : 'block';
    editorContent.classList.toggle('open', !isPreviewVisible);
}

function getProjectHtml(project) {
    if (project.html) return project.html;

    const elements = { main: 'div' };
    const styles = [];
    const scripts = [];

    console.log('Running project:', project.components);

    project.components.forEach(c => {
        if (c.type === 'css') {
            styles.push(c.code);
        } else if (c.type === 'javascript') {
            scripts.push(c.code);
        } else {
            const lines = c.code.split('\n');
            lines.forEach((line, i) => {
                if (line.includes('document.getElementById')) {
                    const next = lines[i + 1];
                    let id = (line.split('(')[1] || '').split(')')[0];
                    if (id[0] === "'") {
                        id = id.slice(1, -1);
                        elements[id] = next && next.includes('getContext') ? 'canvas' : 'div';
                    }
                }
            });
        }
    });

    const description = project.description ? removeMarkdown(removeLines(removeQuotes(project.description))) : project.title;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="generator" content="YouSayAIDo.com">
    <title>${project.title}</title>
    <meta name="description" content="${description}">
    <style>
        ${styles.join('\n')}
    </style>
</head>
<body>
    ${Object.keys(elements).map(id => `<${elements[id]} id="${id}"></${elements[id]}>`).join('\n    ')}
    <script>
        ${scripts.join('\n\n')}
    </script>
</body>
</html>`;
}

function previewHTML(htmlContent, showPreview = true) {
    console.log('Previewing HTML:', htmlContent);
    dynamicContent.innerHTML = '';
    errorMessage.style.display = 'none';
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    dynamicContent.appendChild(iframe);
    if (showPreview) togglePreview(true);
    toggleLoader('Loading Preview...');

    const iframeDoc = iframe.contentWindow.document;
    iframeDoc.open();

    const injectedScript = `
        window.onerror = (message, source, lineno, colno, error) => {
            console.error('An error occurred:', message, source, lineno, colno, error);
            parent.postMessage({ type: 'error', message }, '*');
            return true;
        };
        document.addEventListener('DOMContentLoaded', () => {
            const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
            parent.postMessage({ type: 'loaded', title: document.title, height }, '*');
        });
    `;

    const injectedStyle = `
        <style>
            html, body { 
                margin: 0; 
                min-height: 100vh; 
            }
            canvas { 
                width: 100%; 
                min-height: calc(100vh - 20px);
            }
        </style>
    `;

    iframeDoc.write(injectScriptTag(htmlContent, injectedScript) + injectedStyle);
    iframeDoc.close();

    window.addEventListener('message', (e) => {
        console.log('Message received:', e.data);
        if (e.data.type === 'loaded') {
            toggleLoader(false);
            const title = trimText(e.data.title);
            const height = e.data.height;
            iframe.style.height = height + 'px';
            dynamicContent.style.height = height + 'px';
            projectTitle.innerText = title;
            projectTitle.title = title;
        } else if (e.data.type === 'resume') {
            runProject(currentProject);
        } else if (e.data.type === 'error') {
            handleError(e.data.message);
        }
    });
}

async function runProject(project) {
    togglePreview(true);
    previewHTML(getProjectHtml(project));
    projectIsRunning = true;
    previewButton.innerText = '⏹️';
}

function stopProject() {
    previewHTML(`<!DOCTYPE html><html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="generator" content="YouSayAIDo.com">
    <style>
        body { display: flex; justify-content: center; align-items: center; height: 100vh; }
        button { font-size: 2rem; padding: 1rem 2rem; background-color: #108de0; color: white; border: none; border-radius: 5px; cursor: pointer; }
    </style>
</head>
<body>
    <button onclick="parent.postMessage({ type: 'resume' });">Resume</button>
</body></html>`, false);
    projectIsRunning = false;
    previewButton.innerText = '▶️';
}

// Initialize event listeners and functions
function init() {
    listProjects();
}

// Event listeners
messageInput.addEventListener('input', autoSizeTextarea);

menuButton.addEventListener('click', toggleSidePanel);

closeButton.addEventListener('click', () => {
    if (editorContent.classList.contains('open')) {
        togglePreview(true);
    } else {
        togglePreview(false);
    }
});

previewButton.addEventListener('click', () => {
    if (!projectIsRunning) {
        runProject(currentProject);
    } else {
        stopProject();
    }
});

shareButton.addEventListener('click', async () => {
    if (!currentProject.shared) {
        const response = await fetch('/api', {
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify({
                project: currentProject
            })
        });
        const etag = response.headers.get('etag');
        currentProject.shared = `/shared/${etag}`;
        saveProject(currentProject);
    }
    const win = window.open(currentProject.shared, '_blank');
    win.focus();
});

sendButton.addEventListener('click', () => {
    if (!messageInput.value.trim()) {
        messageInput.value = 'improvements, bug fixes, and/or additional features...';
    }
    sendMessage(true);
});

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(true);
    }
});

// aiPrompt.addEventListener('paste', (e) => {
//     const text = e.clipboardData.getData('text');
//     if (text) {
//         const html = getHtml(text);
//         if (html) {
//             e.preventDefault();
//             toggleWorkspace();
//             previewHTML(html);
//         }
//     }
// });

// Event listener to handle file attachments
attachButton.addEventListener('change', (e) => {
    const files = e.target.files;
    for (const file of files) {
        if (file) {
            const filePreviewItem = document.createElement('div');
            filePreviewItem.innerHTML = `<p>File attached: ${file.name} (${file.size} bytes)</p>`;
            if (file.type.indexOf('image') === 0) {
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.classList.add('pixelated');
                img.style.maxWidth = '150px';
                img.style.maxHeight = '150px';
                filePreviewItem.appendChild(img);
            }
            const removeButton = document.createElement('button');
            removeButton.textContent = 'Remove';
            removeButton.addEventListener('click', () => {
                filePreviewItem.remove();
            });
            filePreviewItem.appendChild(removeButton);
            filePreview.appendChild(filePreviewItem);
            filePreview.style.display = 'block';
            selectedFiles.push(file);
        }
    }
});

// Event listener for audio recording button
audioButton.addEventListener('click', () => {
    if (!isRecording) {
        clearTimeout(recordingSendTimer);
        if (!speechRecognition) {
            speechRecognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            speechRecognition.lang = 'en-US';
            speechRecognition.interimResults = false;
            speechRecognition.maxAlternatives = 1;
            speechRecognition.onresult = (event) => {
                const message = event.results[0][0].transcript.trim();
                const newPrompt = messageInput.value + ' ' + message;
                messageInput.value = newPrompt.trim();
                recordingSendTimer = setTimeout(() => {
                    sendMessage(true);
                }, 300);
            };
            speechRecognition.onend = () => {
                mediaRecorder?.stop();
                isRecording = false;
                audioButton.textContent = '🎙️';
                audioVisualizer.style.display = 'none';
            };
        }
        speechRecognition.start();
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();
            audioChunks = [];
            isRecording = true;
            audioButton.textContent = '⏹️';
            audioVisualizer.style.display = 'block';
            visualizeAudio(stream);

            mediaRecorder.addEventListener("stop", () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                const audioFile = new File([audioBlob], "recorded_audio.wav", { type: 'audio/wav' });
                const audioElement = document.createElement('audio');
                audioElement.controls = true;
                audioElement.src = URL.createObjectURL(audioFile);
                if (!currentProject) return;
                currentProject.messages.push(addMessage(`Audio recorded: recorded_audio.wav (${audioFile.size} bytes)`, true, audioElement, createDownloadButton(audioFile)));
                saveProject(currentProject);
            });

            mediaRecorder.addEventListener("dataavailable", event => {
                audioChunks.push(event.data);
            });
        });
    } else {
        speechRecognition?.stop();
        mediaRecorder?.stop();
        isRecording = false;
        audioButton.textContent = '🎙️';
        audioVisualizer.style.display = 'none';
    }
});

downloadContent.addEventListener('click', () => {
    let fileName, code;
    if (editorContent.classList.contains('open')) {
        code = codeEditor.getValue();
        fileName = codeEditor.selectedFileName;
    } else {
        code = getProjectHtml(currentProject);
        fileName = getFileName(currentProject.title);
    }
    if (!code || !fileName) return;
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Initialize the application
init();