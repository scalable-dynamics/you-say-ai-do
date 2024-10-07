// Define the necessary elements
const menuButton = document.getElementById('menuButton');
const editButton = document.getElementById('editButton');
const shareButton = document.getElementById('shareButton');
const previewButton = document.getElementById('previewButton');
const projectTitle = document.getElementById('projectTitle');
const sidePanel = document.getElementById('sidePanel');
const sidePanelButtons = sidePanel.querySelector('.control-buttons');
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

let selectedFiles = [];
let loaderCount = 0;
let codeEditor;
let currentProject;
let projectIsRunning;
let autoSendSpeechTimer;

// window.onerror = (message, source, lineno, colno, error) => {
//     alert('An error occurred:\n' + message + '\n' + source + '\n' + lineno + '\n' + colno + '\n' + error);
// };

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
                addFile(name, code, language = 'javascript', mimeType = 'application/javascript') {
                    models[name] = monaco.editor.createModel(code, mimeType, monaco.Uri.parse(`file:///src/${name}`));
                    models[name].setLanguage(language);
                },
                setPosition(position) {
                    editor.setPosition(position);
                    editor.revealPositionInCenter(position);
                },
                openFile(name) {
                    editor.setModel(models[name]);
                    editor.layout();
                },
                getValue() {
                    return editor.getValue();
                },
                setValue(name, value) {
                    models[name].setValue(value);
                },
                resize() {
                    editor.layout();
                }
            });
        });
    });
}

async function getProjects() {
    const file = await loadFileFromCache('YouSayAIDo.json');
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
    await saveToCache(new File([JSON.stringify(projects)], 'YouSayAIDo.json', { type: 'application/json' }));
}

async function createNewProject(instructions) {
    const id = Date.now().toString();
    const newProject = {
        id,
        title: instructions.split('\n')[0].split(':')[0].split('.')[0].trim(),
        instructions,
        files: [],
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
                if (message.filename === path) {
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
        for (const component of project.files) {
            codeEditor.addFile(component.filename, component.content, component.language, component.mimeType);
            addMessage(component.filename, false, createButton(component.filename, () => {
                if (editorContent.classList.contains('open') && codeEditor.selectedFileName === component.filename) {
                    togglePreview(true);
                } else {
                    codeEditor.openFile(component.filename, component.content);
                    codeEditor.selectedFileName = component.filename;
                    togglePreview(false);
                    toggleSidePanel(false);
                }
            }));
        }
    } else {
        console.error('Project not found:', id);
        alert('Project not found!\n' + id + '\n' + projects.map(p => p.id).join('\n'));
    }
    runProject(project);
}

function updateUIForProject(project) {
    projectTitle.innerText = project.title;
    projectTitle.title = project.title + (project.description ? '\n' + removeMarkdown(project.description) : '');
    sidePanelContent.innerHTML = '<h2>Messages</h2>';
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

async function listProjects() {
    const projects = await getProjects();
    if (projects.length === 0) return;
    projectList.innerHTML = `<h2>Projects</h2>`;
    for (const project of projects) {
        const item = document.createElement('div');
        item.classList.add('project-item');
        const open = async () => {
            await openProject(project.id);
        };
        const button = createButton('▶️', open);
        item.appendChild(button);
        const title = document.createElement('h2');
        title.textContent = project.title;
        title.addEventListener('click', open);
        item.appendChild(title);
        const remove = createButton('❌', async () => {
            if (confirm('Are you sure you want to delete this project?')) {
                const projects = await getProjects();
                const index = projects.findIndex(p => p.id === project.id);
                if (index !== -1) {
                    projects.splice(index, 1);
                    await saveToCache(new File([JSON.stringify(projects)], 'YouSayAIDo.json', { type: 'application/json' }));
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
    button.onclick = onClick;
    return button;
}

// Function to create download button for files
function createDownloadButton(file) {
    const button = document.createElement('a');
    button.dataset.file = file.name;
    button.textContent = 'Download';
    button.classList.add('is-primary');
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

async function updateContent(prompt, context = []) {
    if (!prompt) return;
    if (!currentProject) {
        currentProject = await createNewProject(prompt);
        toggleWorkspace(true);
    }
    let fileName, code, instructions, isComponent;
    if (editorContent.classList.contains('open')) {
        instructions = `Component ${codeEditor.selectedFileName} for ${currentProject.instructions}`;
        code = codeEditor.getValue();
        fileName = codeEditor.selectedFileName;
        isComponent = true;
    } else {
        instructions = currentProject.instructions;
    }
    currentProject.messages.push(addMessage(prompt, true));
    const outputs = await executePrompt('Improving Content...', instructions, context, undefined, code && fileName ? [
        {
            filename: fileName,
            extension: fileName.split('.').pop(),
            language: fileName.split('.').pop(),
            content: code
        }
    ] : currentProject.files, instructions.includes(prompt) ? 'This will be the first version.' : prompt);
    for (const output of outputs) {
        const existing = currentProject.files.find(({ filename }) => filename === output.filename);
        if (existing) {
            existing.content = output.content;
        } else {
            currentProject.files.push(output);
        }
        if (isComponent && output.filename === fileName) {
            codeEditor.setValue(fileName, output.content);
        }
    }
    if (currentProject.shared) {
        if (!currentProject.history) currentProject.history = [];
        currentProject.history.push(currentProject.shared);
        currentProject.shared = undefined;
    }
    await saveProject(currentProject);
    if (!isComponent) {
        await openProject(currentProject.id);
    }
}

// Function to send a message
async function sendMessage(user = false) {
    let value = messageInput.value.trim();
    messageInput.value = '';
    messageInput.style.height = 'auto';
    clearTimeout(autoSendSpeechTimer);
    const images = [], context = [];
    if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
            const fileText = `File attached: ${file.name}`;
            let previewElement;
            if (file.url) {
                previewElement = document.createElement('img');
                previewElement.src = file.url;
                previewElement.style.maxWidth = '100%';
                previewElement.style.height = 'auto';
                images.push(file.url);
            } else if (file.text) {
                previewElement = document.createElement('pre');
                previewElement.textContent = file.text.slice(0, 1000);
                previewElement.title = file.text;
                previewElement.style.maxWidth = '100%';
                previewElement.style.overflow = 'auto';
                context.push(`## Attached File: ${file.name}\n\`\`\`\n${file.text}\n\`\`\``);
            }
            currentProject.messages.push(addMessage(fileText, true, previewElement));
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
    if (images.length > 0) {
        const description = await executePrompt('Analyzing Images...', value, undefined, images);
        context.push(description);
    }
    await updateContent(value || 'Updates and improvements', context);
}

// Function to create a speech to text converter
function speechToTextarea(textarea, visualizationElement, onStart, onStop) {
    let isRecording = false;
    let mediaStream = null;
    let audioContext = null;
    let animationId = null;
    let speechRecognition = null;

    const handleSpeechResult = (event) => {
        const transcript = Array.from(event.results)
            .map((result) => result[0].transcript)
            .join('');

        textarea.value = transcript;
    };

    const handleSpeechEnd = () => {
        // Stop visualization and cleanup
        stop();
    };

    const initSpeechRecognition = () => {
        const SpeechRecognition =
            window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Speech recognition is not supported in this browser.');
            return;
        }

        speechRecognition = new SpeechRecognition();
        speechRecognition.lang = 'en-US';
        speechRecognition.interimResults = true;
        speechRecognition.maxAlternatives = 1;

        speechRecognition.addEventListener('result', handleSpeechResult);
        speechRecognition.addEventListener('end', handleSpeechEnd);
        speechRecognition.addEventListener('error', (event) => {
            console.error('Speech recognition error:', event.error);
            stop();
        });
    };

    const initAudioVisualization = async () => {
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(mediaStream);
            const analyser = audioContext.createAnalyser();
            source.connect(analyser);

            analyser.fftSize = 2048;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const canvas = visualizationElement;
            const canvasCtx = canvas.getContext('2d');

            canvas.style.display = 'block';

            const draw = () => {
                if (!isRecording) return;

                animationId = requestAnimationFrame(draw);

                analyser.getByteTimeDomainData(dataArray);

                canvasCtx.fillStyle = 'rgb(255, 255, 255)';
                canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

                canvasCtx.lineWidth = 2;
                canvasCtx.strokeStyle = 'rgb(0, 0, 0)';

                canvasCtx.beginPath();

                const sliceWidth = (canvas.width * 1.0) / bufferLength;
                let x = 0;

                for (let i = 0; i < bufferLength; i++) {
                    const v = dataArray[i] / 128.0;
                    const y = (v * canvas.height) / 2;

                    if (i === 0) {
                        canvasCtx.moveTo(x, y);
                    } else {
                        canvasCtx.lineTo(x, y);
                    }

                    x += sliceWidth;
                }

                canvasCtx.lineTo(canvas.width, canvas.height / 2);
                canvasCtx.stroke();
            };

            draw();
        } catch (error) {
            console.error('Error initializing audio visualization:', error);
            stop();
        }
    };

    const stopAudioVisualization = () => {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }

        const canvasCtx = visualizationElement.getContext('2d');
        canvasCtx.clearRect(
            0,
            0,
            visualizationElement.width,
            visualizationElement.height
        );
        visualizationElement.style.display = 'none';
    };

    const start = () => {
        if (isRecording) return;

        isRecording = true;

        // Initialize speech recognition
        initSpeechRecognition();

        // Start speech recognition
        speechRecognition.start();

        // Initialize audio visualization
        initAudioVisualization();

        if (onStart) onStart();
    };

    const stop = () => {
        if (!isRecording) return;

        isRecording = false;

        // Stop speech recognition
        speechRecognition.stop();

        // Stop audio visualization
        stopAudioVisualization();

        if (onStop) onStop();

        // Cleanup media stream
        if (mediaStream) {
            mediaStream.getTracks().forEach((track) => track.stop());
            mediaStream = null;
        }

        // Cleanup audio context
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }

        // Remove event listeners
        speechRecognition.removeEventListener('result', handleSpeechResult);
        speechRecognition.removeEventListener('end', handleSpeechEnd);
        speechRecognition = null;
    };

    return { start, stop };
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
            for (const component of currentProject.files) {
                const componentLines = component.content.split('\n');
                const index = lineNumber - currentLine;
                currentLine += componentLines.length;
                if (currentLine > lineNumber && index > -1 && index < componentLines.length) {
                    const errorLine = componentLines[index];
                    const errorIndex = componentLines.findIndex(line => line.includes(errorLine));
                    if (errorIndex !== -1) {
                        codeEditor.openFile(component.filename);
                        codeEditor.setPosition({ lineNumber: errorIndex + 1, column: errorLine.indexOf(')') + 1 });
                        break;
                    }
                }
            }
        } else {
            codeEditor.openFile(currentProject.files[0].filename);
        }
        errorMessage.style.display = 'none';
        togglePreview(false);
        toggleSidePanel(false);
    };
    const button = document.createElement('button');
    button.textContent = '🛠️ Fix it';
    button.classList.add('is-primary');
    button.style.padding = '0.5rem 1rem';
    button.onclick = () => {
        messageInput.value = error;
        errorMessage.style.display = 'none';
        sendMessage();
    };
    errorMessage.appendChild(button);
    errorMessage.style.display = 'block';
};

// Function to execute a prompt
async function executePrompt(description, prompt, messages, images, files, input) {
    toggleLoader(true, description);
    let content = '';
    try {
        const response = await fetch('/api', {
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify(files ? {
                title: prompt,
                input,
                files,
                context: messages,
            } : {
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
        document.querySelectorAll('.control-buttons button').forEach(button => button.disabled = false);
    } else {
        loaderContainer.style.display = 'flex';
        document.querySelectorAll('.control-buttons button').forEach(button => button.disabled = true);
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
    if (!show) {
        currentProject = undefined;
        codeEditor?.clear();
        codeEditor = undefined;
        projectTitle.innerText = 'YouSayAIDo.com';
        projectTitle.title = 'YouSayAIDo.com';
        sidePanelContent.innerHTML = '';
        dynamicContent.innerHTML = '';
        errorMessage.style.display = 'none';
        loaderContainer.style.display = 'none';
    }
}

function toggleSidePanel(show) {
    if (show === undefined) {
        show = sidePanel.style.display === 'none';
    }
    sidePanel.style.display = show ? 'flex' : 'none';
    sidePanel.classList.toggle('collapsed', !show);
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
    editorContent.classList.toggle('open', !isPreviewVisible);
    toggleSidePanel(!isPreviewVisible);
    if (!isPreviewVisible) {
        stopProject();
    }
}

function getProjectHtml(project) {
    console.log('getProjectHtml(project)', project);

    const elements = { main: 'div' }, html = [];
    const styles = [];
    const scripts = [];

    console.log('Running project:', project.files);

    project.files.forEach(c => {
        if (c.language === 'css') {
            styles.push(c.content);
        } else if (c.language === 'javascript') {
            const newLines = [];
            const lines = c.content.split('\n');
            lines.forEach((line, i) => {
                if (line.includes('document.getElementById')) {
                    const next = lines[i + 1];
                    let id = (line.split('(')[1] || '').split(')')[0];
                    if (id[0] === "'") {
                        id = id.slice(1, -1);
                        elements[id] = line.includes('getContext') || (next && next.includes('getContext')) ? 'canvas' : 'div';
                    }
                    newLines.push(line);
                } else if (line.includes('import')) {
                    newLines.push(`// ${line}`);
                } else if (line.includes('export')) {
                    newLines.push(line.replace('export default ', '').replace('export ', ''));
                } else if (line.startsWith('const ')) {
                    newLines.push(line.replace('const ', 'var '));
                } else {
                    newLines.push(line);
                }
            });
            scripts.unshift(newLines.join('\n'));
        } else if (c.language === 'html') {
            const body = getHtmlTag(c.content, 'body');
            if (body) {
                html.push(body.replace('<body>', '').replace('</body>', ''));
            } else {
                html.push(c.content);
            }
        } else {
            console.log('Unsupported file type:', c.language, c);
        }
    });

    const projectHtml = html.join('\n');
    if (projectHtml && styles.length === 0 && scripts.length === 0) {
        return projectHtml;
    }

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
    ${projectHtml}
    ${Object.keys(elements).filter(id => !projectHtml.includes(`id="${id}"`)).map(id => `<${elements[id]} id="${id}"></${elements[id]}>`).join('\n    ')}
    <script>
        ${scripts.join('\n\n')}
    </script>
</body>
</html>`;
}

function previewHTML(htmlContent, showPreview = true) {
    console.log('Previewing HTML:', htmlContent);
    dynamicContent.innerHTML = '';
    dynamicContent.style.height = (window.innerHeight - 275) + 'px';
    errorMessage.style.display = 'none';
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    dynamicContent.appendChild(iframe);
    if (showPreview) togglePreview(true);
    toggleLoader(true, 'Loading Preview...');

    const iframeDoc = iframe.contentWindow.document;
    iframeDoc.open();

    const injectedScript = `
        window.onerror = (message, source, lineno, colno, error) => {
            console.error('An error occurred:', message, source, lineno, colno, error);
            parent.postMessage({ type: 'error', message, source, lineno, colno, error }, '*');
            return true;
        };
        document.addEventListener('DOMContentLoaded', () => {
            const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) + 42;
            parent.postMessage({ type: 'loaded', title: document.title, height }, '*');
        });
    `;

    iframeDoc.write(injectScriptTag(htmlContent, injectedScript));
    iframeDoc.close();

    window.addEventListener('message', (e) => {
        console.log('Message received:', e.data);
        if (e.data.type === 'loaded') {
            toggleLoader(false);
            const title = e.data.title;
            const height = Math.max(e.data.height, window.innerHeight - 275);
            dynamicContent.style.height = height + 'px';
            projectTitle.innerText = title;
            projectTitle.title = title;
        } else if (e.data.type === 'resume') {
            runProject(currentProject);
        } else if (e.data.type === 'error') {
            handleError(e.data.message, e.data.source, e.data.lineno, e.data.colno, e.data.error);
        }
    });
}

function runProject(project) {
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
        html, body { margin: 0; font-family: Arial, sans-serif; background-color: #f0f0f0; }
        body { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 50%; }
        button { font-size: 2rem; padding: 1rem 2rem; background-color: #108de0; color: white; border: none; border-radius: 5px; cursor: pointer; }
    </style>
</head>
<body>
    <h2>
        <img src="images/yousayaido.png" alt="YouSayAIDo.com" style="height: 1.5em; vertical-align: middle;">
        <span>You say, AI do!</span>
    </h2>
    <button onclick="parent.postMessage({ type: 'resume' });">▶️ Start Application</button>
</body></html>`, false);
    projectIsRunning = false;
    previewButton.innerText = '▶️';
}

function attachFile(onFileReceived) {
    console.log('Attaching file...');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.txt,.md,.jpg,.jpeg,.png,.html,.css,.js,.json,.csv';
    fileInput.multiple = true;
    fileInput.onchange = async (event) => {
        const files = event.target.files;
        for (const file of files) {
            if (file.type.indexOf('image') === 0) {
                const url = await getImageDataUrl(file);
                onFileReceived({ name: file.name, type: 'image', url });
            // } else if (file.type === 'application/pdf') {
            //     const text = await extractTextFromPDF(file);
            //     onFileReceived({ name: file.name, type: 'pdf', text });
            } else {
                const text = await file.text();
                const extension = file.name.split('.').pop().replace('.', '');
                onFileReceived({ name: file.name, type: extension, text });
            }
        }
    };
    fileInput.click();
}

async function getImageDataUrl(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });
}

async function extractTextFromPDF(file) {
    const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.14.305/pdf.min.js');
    console.log('Extracting text from PDF:', pdfjsLib);
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let pdfText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        pdfText += pageText + '\n';
    }

    return pdfText;
}

// Initialize event listeners and functions
function init() {
    const speech = speechToTextarea(messageInput, audioVisualizer, () => {
        audioButton.classList.add('active');
    }, () => {
        audioButton.classList.remove('active');
        if (messageInput.value.trim()) {
            autoSendSpeechTimer = setTimeout(() => {
                sendButton.click();
            }, 300);
        }
    });
    audioButton.addEventListener('click', () => {
        if (!audioButton.classList.contains('active')) {
            speech.start();
        } else {
            speech.stop();
        }
    });
    listProjects();
    messageInput.focus();
    if (window.innerWidth < 768) {
        sidePanelButtons.appendChild(downloadContent);
        sidePanelButtons.appendChild(shareButton);
    }
}

// Event listeners
messageInput.addEventListener('input', autoSizeTextarea);

menuButton.addEventListener('click', () => toggleSidePanel());

editButton.addEventListener('click', () => {
    messageInput.scrollIntoView();
    messageInput.focus();
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
    if (!messageInput.value.trim() && currentProject) {
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

// Event listener to handle file attachments
attachButton.addEventListener('click', attachFile.bind(null, ({ name, type, url = '', text = '' }) => {
    const filePreviewItem = document.createElement('div');
    filePreviewItem.classList.add('file-preview-item');
    filePreviewItem.innerHTML = `<p>File attached: ${name}</p>`;
    if (type === 'image' && url) {
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '150px';
        img.style.maxHeight = '150px';
        filePreviewItem.appendChild(img);
    }
    const removeButton = document.createElement('button');
    removeButton.textContent = '❌';
    removeButton.classList.add('remove');
    removeButton.addEventListener('click', () => {
        filePreviewItem.remove();
        const index = selectedFiles.findIndex(file => file.name === name);
        if (index !== -1) {
            selectedFiles.splice(index, 1);
        }
    });
    filePreviewItem.appendChild(removeButton);
    filePreview.appendChild(filePreviewItem);
    filePreview.style.display = 'block';
    selectedFiles.push({ name, type, text, url });
}));

// Event listener for download button
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