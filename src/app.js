// Define the necessary elements
const togglePanel = document.getElementById('toggleConversation');
const shareButton = document.getElementById('shareButton');
const backButton = document.getElementById('backButton');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const attachButton = document.getElementById('attachButton');
const audioButton = document.getElementById('audioButton');
const filePreview = document.getElementById('filePreview');
const audioVisualizer = document.getElementById('audioVisualizer');
const dynamicContent = document.getElementById('dynamicContent');
const errorMessage = document.getElementById('errorMessage');
const aiPrompt = document.getElementById('aiPrompt');
const generateContent = document.getElementById('generateContent');
const loaderContainer = document.getElementById('loaderContainer');
const startContent = document.getElementById('startContent');
const sidePanel = document.getElementById('sidePanel');
const mainContent = document.getElementById('mainContent');
const downloadContent = document.getElementById('downloadContent');
const improveContent = document.getElementById('improveContent');
const projectList = document.getElementById('projectList');

let isRecording = false;
let mediaRecorder;
let recordingSendTimer;
let audioChunks = [];
let speechRecognition;
let selectedFiles = [];
let loaderCount = 0;

// Project management
let currentProject = { messages: [] };

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

async function saveProject(project) {
    const projects = await getProjects();
    const index = projects.findIndex(p => p.id === project.id);
    if (index !== -1) {
        projects[index] = project;
    } else {
        projects.push(project);
    }
    await saveToCache(new File([JSON.stringify(projects)], 'projects.json', { type: 'application/json' }));
}

async function createNewProject(title) {
    const id = Date.now().toString();
    const newProject = {
        id,
        title,
        html: '',
        messages: [],
        createdOn: getFormattedTime(),
        savedOn: getFormattedTime()
    };
    await saveProject(newProject);
    return newProject;
}

async function openProject(id) {
    const projects = await getProjects();
    const project = projects.find(p => p.id === id);
    if (project) {
        currentProject = project;
        updateUIForProject(project);
    } else {
        console.error('Project not found:', id);
        alert('Project not found!');
    }
}

function updateUIForProject(project) {
    toggleWorkspace(true);
    chatMessages.innerHTML = '';
    for (const message of project.messages) {
        addMessage(message.content, message.role === 'user');
    }
    if (project.html) {
        previewHTML(project.html);
    }
    aiPrompt.value = project.instructions || '';
}

async function listProjects() {
    projectList.innerHTML = '';
    const projects = await getProjects();
    for (const project of projects) {
        const item = document.createElement('div');
        item.classList.add('project-item');
        const button = createButton(project.title, () => openProject(project.id));
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
    messageElement.classList.add('message', isSent ? 'sent' : 'received');
    messageElement.innerHTML = `<p>${content.replace(/\n/g, '<br>')}</p>`;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (children && children.length > 0) {
        console.log('message children:', children);
        for (const child of children) {
            if (!child) continue;
            messageElement.appendChild(child);
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

// Function to send a message
async function sendMessage(user = false) {
    const loadImages = [];
    if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
            const fileText = `File attached: ${file.name} (${file.size} bytes)`;
            const downloadButton = createDownloadButton(file);
            saveProject(currentProject);
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
    if (loadImages.length > 0) {
        if (value) value += '\n---\n';
        value += 'Make it like this:\n';
        const images = await Promise.all(loadImages);
        const description = await executePrompt('Analyzing Images...', currentProject.messages, images);
        value += description;
    }
    if (value) {
        messageInput.value = '';
        const content = await executePrompt('Generating Content...', [
            ...currentProject.messages,
            { role: 'user', content: currentProject.instructions },
            { role: 'assistant', content: currentProject.html },
            { role: 'user', content: value }
        ]);
        if (user) {
            currentProject.messages.push(addMessage(value, true));
        }
        const message = content.split('<')[0].trim();
        if (message) {
            currentProject.messages.push(addMessage(message));
        }
        const html = getHtml(content);
        if (html) {
            previewHTML(html);
        }
    }
    saveProject(currentProject);
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
function getHtml(text) {
    const html = getHtmlTag(text, '!DOCTYPE html', 'html');
    if (html) return html;
    const body = getHtmlTag(text, 'script') + getHtmlTag(text, 'style') + getHtmlTag(text, 'div');
    if (body && currentProject.html) return currentProject.html.replace('</body>', body + '</body>');
    return '';
}

function removeContinuation(text) {
    if (text && text.includes('Certainly!')) {
        const lines = text.split('\n');
        const index = lines.findIndex(line => line.includes('Certainly!'));
        if (index > -1) {
            lines.splice(index, 1);
            text = lines.join('\n');
            console.log('Removed line with Certainly!');
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

// Function to preview HTML content
function previewHTML(htmlContent) {
    dynamicContent.innerHTML = '';
    errorMessage.style.display = 'none';
    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    dynamicContent.appendChild(iframe);
    const iframeDoc = iframe.contentWindow.document;
    iframeDoc.open();
    iframeDoc.onerror = (e) => {
        const error = (e && e.message) || e?.toString() || 'An error occurred while rendering the content.';
        errorMessage.textContent = error;
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
    iframeDoc.write(htmlContent);
    iframeDoc.close();
    currentProject.html = htmlContent;
    currentProject.title = getHtmlTitle(htmlContent) || currentProject.title;
    saveProject(currentProject);
}

// Function to execute a prompt
async function executePrompt(description, messages, images) {
    toggleLoader(description);
    let content = '';
    try {
        const response = await fetch('/api', {
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify({
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
    startContent.style.display = show ? 'none' : 'flex';
    sidePanel.style.display = show ? 'flex' : 'none';
    mainContent.style.display = show ? 'flex' : 'none';
    if (document.body.clientWidth < 768) {
        sidePanel.classList.add('collapsed');
    }
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

// Initialize event listeners and functions
function init() {
    aiPrompt.focus();
    listProjects();
}

// Event listeners
aiPrompt.addEventListener('input', autoSizeTextarea);
messageInput.addEventListener('input', autoSizeTextarea);

togglePanel.addEventListener('click', () => {
    sidePanel.classList.toggle('collapsed');
});

backButton.addEventListener('click', () => {
    toggleWorkspace(false);
});

sendButton.addEventListener('click', () => sendMessage(true));

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(true);
    }
});

aiPrompt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        generateContent.click();
    }
});

aiPrompt.addEventListener('paste', (e) => {
    const text = e.clipboardData.getData('text');
    if (text) {
        const html = getHtml(text);
        if (html) {
            e.preventDefault();
            toggleWorkspace();
            previewHTML(html);
        }
    }
});

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

// Event listener to generate content
generateContent.addEventListener('click', async () => {
    const prompt = aiPrompt.value.trim();
    if (prompt) {
        if (!currentProject.id) {
            currentProject = await createNewProject(prompt);
        }
        currentProject.instructions = prompt;
        toggleWorkspace(true);
        currentProject.messages.push(addMessage(prompt, true));
        aiPrompt.value = '';
        const content = await executePrompt('Making something cool...', [{ role: 'user', content: prompt }]);
        const message = content.split('<')[0].trim();
        if (message) {
            currentProject.messages.push(addMessage(message));
        }
        const html = getHtml(content);
        if (html) {
            previewHTML(html);
            currentProject.html = html;
        }
        saveProject(currentProject);
    }
});

downloadContent.addEventListener('click', () => {
    if (currentProject.html) {
        const blob = new Blob([currentProject.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = getFileName(currentProject.title);
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
});

improveContent.addEventListener('click', async () => {
    if (currentProject.html) {
        const improve = `improvements, bug fixes, and/or additional features...`;
        currentProject.messages.push(addMessage(improve, true));
        const content = await executePrompt('Improving Content...', [
            { role: 'user', content: currentProject.title },
            { role: 'assistant', content: currentProject.html },
            { role: 'user', content: improve },
        ]);
        const message = content.split('<')[0].trim();
        if (message) {
            currentProject.messages.push(addMessage(message));
        }
        const html = getHtml(content);
        if (html) {
            previewHTML(html);
        }
        saveProject(currentProject);
    }
});

// Initialize the application
init();