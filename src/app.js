// Define the necessary elements
const togglePanel = document.querySelector('.toggle-panel');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const attachButton = document.getElementById('attachButton');
const audioButton = document.getElementById('audioButton');
const emojiButton = document.getElementById('emojiButton');
const filePreview = document.getElementById('filePreview');
const audioVisualizer = document.getElementById('audioVisualizer');
const emojiPicker = document.getElementById('emojiPicker');
const dynamicContent = document.getElementById('dynamicContent');
const errorMessage = document.getElementById('errorMessage');
const aiPrompt = document.getElementById('aiPrompt');
const generateContent = document.getElementById('generateContent');
const usePlanner = document.getElementById('usePlanner');
const useClaude = document.getElementById('useClaude');
const loaderContainer = document.getElementById('loaderContainer');
const startContent = document.getElementById('startContent');
const sidePanel = document.getElementById('sidePanel');
const mainContent = document.getElementById('mainContent');
const downloadContent = document.getElementById('downloadContent');
const improveContent = document.getElementById('improveContent');
const continueButton = document.getElementById('continueButton');

let isRecording = false;
let mediaRecorder;
let recordingSendTimer;
let audioChunks = [];
let currentMessages = [];
let currentPlan = [];
let currentInstructions = '';
let currentTitle = '';
let currentHTML = '';
let speechRecognition;
let selectedFiles = [];
let loaderCount = 0;

// Function to auto resize textarea
function autoSizeTextarea(e) {
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

// Function to trim text to 100 characters
function trimText(text) {
    return text.length > 100 ? text.slice(0, 100) + '...' : text;
}

// Function to create download button for files
function createDownloadButton(file) {
    const button = document.createElement('a');
    button.dataset.file = file.name;
    button.textContent = 'Download';
    button.classList.add('nes-btn', 'is-primary');
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
    currentMessages.push(message);
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', isSent ? 'sent' : 'received');
    messageElement.innerHTML = `<p>${content.replace(/\n/g, '<br>')}</p>`;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    for (const child of children) {
        if (!child) continue;
        messageElement.appendChild(child);
        if (child.dataset.file) {
            message.file = child.dataset.file;
        }
    }
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
            addMessage(fileText, true, downloadButton);
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
        const description = await executePrompt('Analyzing Images...', currentMessages, 2, images);
        value += description;
    }
    if (value) {
        messageInput.value = '';
        const content = await executePrompt('Generating Content...', [
            ...currentMessages,
            { role: 'user', content: currentInstructions },
            { role: 'assistant', content: currentHTML },
            { role: 'user', content: value }
        ]);
        if (user) {
            addMessage(value, true);
        }
        const message = content.split('<')[0].trim();
        if (message) {
            addMessage(message);
        }
        const html = getHtml(content);
        if (html) {
            previewHTML(html);
        }
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
function getHtml(text) {
    const html = getHtmlTag(text, '!DOCTYPE html', 'html');
    if (html) return html;
    const body = getHtmlTag(text, 'script') + getHtmlTag(text, 'style') + getHtmlTag(text, 'div');
    if (body) return currentHTML.replace('</body>', body + '</body>');
    return '';
}

// Function to get HTML tag content
function getHtmlTag(text, startTag, endTag) {
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
        button.classList.add('nes-btn', 'is-error');
        button.onclick = () => {
            messageInput.value = error;
            errorMessage.style.display = 'none';
            sendMessage();
        };
        errorMessage.appendChild(button);
        errorMessage.style.display = 'block';
    };
    iframeDoc.write(htmlContent);
    currentTitle = iframeDoc.querySelector('title')?.textContent || 'Generated Content';
    if (!currentInstructions) currentInstructions = currentTitle;
    iframeDoc.close();
    setTimeout(() => {
        const frameHeight = iframeDoc.documentElement.scrollHeight;
        const contentHeight = dynamicContent.clientHeight;
        if (frameHeight > contentHeight) {
            const scale = (contentHeight / frameHeight);
            iframeDoc.documentElement.style.zoom = scale;
        }
    }, 100);
    currentHTML = htmlContent;
    saveToCache(new File([htmlContent], 'current.html', { type: 'text/html' }));
    const messagesJson = JSON.stringify(currentMessages);
    saveToCache(new File([messagesJson], 'current.json', { type: 'application/json' }));
}

// Function to execute a prompt
async function executePrompt(description, messages, model = 1, images) {
    toggleLoader(description);
    let content = '';
    try {
        const response = await fetch('/api', {
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify({
                model: model === 1 && useClaude.checked ? 1 : 2,
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

// Function to generate a plan
async function generatePlan(prompt) {
    const plan = await getPlan(prompt);
    if (plan.steps.length === 0) {
        alert('I am sorry, I could not find a plan for this problem. Please try again with a different prompt.');
        return;
    }
    toggleWorkspace();
    addMessage(prompt, true);
    aiPrompt.value = '';
    currentPlan = plan.steps;
    if (!currentTitle) currentTitle = plan.title;
    const stepResults = [];
    for (let index = 0; index < currentPlan.length; index++) {
        stepResults.push(getTask(currentTitle, currentPlan, index));
    }
    const results = await Promise.all(stepResults);
    const content = await executePrompt('Combining all steps...', [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '```html\n<title>' + currentTitle + '</title>\n<plan>\n' + currentPlan.map((step, index) => `${index + 1}. ${step}`).join('\n\t') + '\n</plan>\n```' },
        ...results.flatMap((result, index) => ([
            { role: 'user', content: `**Step ${index + 1}:** ${currentPlan[index]}` },
            { role: 'assistant', content: isHtml(result) ? '```html\n' + result + '\n```' : result },
        ])),
        { role: 'user', content: `Great! Now combine all of these solutions into a single HTML page which contains 100% of the desired functionality, behavior, design, and capabilities. Take this step-by-step, this is going to be epic!` }
    ], 2);
    const message = content.split('<')[0].trim();
    if (message) {
        addMessage(message);
    }
    const html = getHtml(content);
    if (html) {
        previewHTML(html);
    }
}

function isHtml(text) {
    return text.trim().startsWith('<') && text.trim().endsWith('</html>');
}

// Function to get a plan from the server
async function getPlan(problem) {
    toggleLoader(true, 'Creating a plan...');
    let plan = { title: problem, steps: [] };
    try {
        const response = await fetch('/api', {
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify({ problem })
        });
        plan = await response.json();
        loaderContainer.dataset.status = `${plan.title}\n\n${plan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`;
        console.log('Plan:', plan);
    } catch (e) {
        console.error('Error getting plan:', e);
    } finally {
        toggleLoader(false);
    }
    return plan;
}

// Function to get a task from the server
async function getTask(title, tasks, index) {
    toggleLoader(true, `${title}\n\n${tasks.map((step, i) => index === i ? `**${i + 1}. ${step}**` : `${i + 1}. ${step}`).join('\n')}`);
    let content = '';
    try {
        const response = await fetch('/api', {
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify({ title, tasks, index })
        });
        content = await response.json();
    } catch (e) {
        console.error('Error executing prompt:', e);
        content = 'Oops! Something went wrong. 🥹';
    } finally {
        toggleLoader(false);
    }
    return content;
}

// Function to save files to cache
async function saveToCache(file) {
    try {
        const cache = await caches.open('fileCache');
        await cache.put(file.name, new Response(file));
    } catch (error) {
        console.error('Error saving file to cache:', error);
    }
}

// Function to remove a file from cache
async function removeFileFromCache(fileName) {
    try {
        const cache = await caches.open('fileCache');
        await cache.delete(fileName);
    } catch (error) {
        console.error('Error removing file from cache:', error);
    }
}

// Function to load a file from cache
async function loadFileFromCache(fileName) {
    try {
        const cache = await caches.open('fileCache');
        const response = await cache.match(fileName);
        if (!response) return '';
        return new File([await response.blob()], fileName);
    } catch (error) {
        console.error('Error loading file from cache:', error);
    }
    return '';
}

// Function to load text from cache
async function loadTextFromCache(fileName) {
    try {
        const cache = await caches.open('fileCache');
        const response = await cache.match(fileName);
        if (response) {
            const text = await response.text();
            return text;
        }
    } catch (error) {
        console.error('Error loading file from cache:', error);
    }
    return '';
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
}

// Function to get a sanitized filename based on title
function getFileName(title) {
    return `${title.replace(/[^a-z0-9- ]/ig, '')}-${new Date().getTime()}.html`;
}

// Initialize event listeners and functions
function init() {
    aiPrompt.focus();
    loadTextFromCache('current.html').then(content => {
        if (content) {
            const title = content.match(/<title>(.*?)<\/title>/)[1] || '';
            continueButton.textContent = `▶️ Continue with ${title}`;
            continueButton.style.display = 'inline';
            continueButton.addEventListener('click', async () => {
                toggleLoader(true, `Loading ${title}...`);
                await loadTextFromCache('current.json').then(json => {
                    if (json) {
                        const messages = JSON.parse(json);
                        const unique = {};
                        messages.forEach(async message => {
                            if (unique[message.content]) return;
                            unique[message.content] = true;
                            const file = message.file ? await loadFileFromCache(message.file) : null;
                            addMessage(message.content, message.role === 'user', file && createDownloadButton(file));
                        });
                    }
                });
                previewHTML(content);
                toggleLoader(false);
                toggleWorkspace();
            });
        }
    });
}

aiPrompt.addEventListener('input', autoSizeTextarea);
messageInput.addEventListener('input', autoSizeTextarea);

// Event listener to toggle panel
togglePanel.addEventListener('click', () => {
    sidePanel.classList.toggle('collapsed');
});

// Event listener to send message
sendButton.addEventListener('click', () => sendMessage(true));

// Event listener to send message on enter key press
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(true);
    }
});

downloadContent.addEventListener('click', () => {
    const blob = new Blob([currentHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getFileName(currentTitle);
    a.click();
    a.onclick = () => {
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);
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
                addMessage(`Audio recorded: recorded_audio.wav (${audioFile.size} bytes)`, true, audioElement, createDownloadButton(audioFile));
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
        currentInstructions = prompt;
        if (usePlanner.checked) {
            await generatePlan(prompt);
        } else {
            toggleWorkspace();
            addMessage(prompt, true);
            aiPrompt.value = '';
            const content = await executePrompt('Making something cool...', [{ role: 'user', content: prompt }]);
            const message = content.split('<')[0].trim();
            if (message) {
                addMessage(message);
            }
            const html = getHtml(content);
            if (html) {
                previewHTML(html);
            }
        }
    }
});

// Event listener to improve content
improveContent.addEventListener('click', async () => {
    const improve = `improvements, bug fixes, and/or additional features...`;
    if (usePlanner.checked) {
        generatePlan(`${currentTitle} - ${improve}\n\n## Current HTML:\n${currentHTML}`);
    } else {
        const content = await executePrompt('Improving Content...', [
            { role: 'user', content: currentTitle },
            { role: 'assistant', content: currentHTML },
            { role: 'user', content: improve },
        ]);
        const message = content.split('<')[0].trim();
        if (message) {
            addMessage(improve, true);
            addMessage(message);
        }
        const html = getHtml(content);
        if (html) {
            previewHTML(html);
        }
    }
});

// Event listener for emoji button
emojiButton.addEventListener('click', () => {
    emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'block' : 'none';
});

// Load emoji buttons
const emojis = ['😊', '😂', '❤️', '👍', '🎉', '🌟', '🤔', '😎'];
emojis.forEach(emoji => {
    const button = document.createElement('span');
    button.textContent = emoji;
    button.classList.add('emoji-button');
    button.addEventListener('click', () => {
        messageInput.value += emoji;
        emojiPicker.style.display = 'none';
    });
    emojiPicker.appendChild(button);
});

// Initialize the application
init();
