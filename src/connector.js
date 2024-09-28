function Response(body, options) {
    this.body = body;
    this.headers = options.headers || {};
    this.status = options.status || 200;
}
module.exports = { connector, hosting };

async function connector(request, KV, R2) {
    const OpenAIUrl = (await KV.get('OPENAI_API_URL'));
    const ClaudeUrl = (await KV.get('CLAUDE_API_URL'));
    const ClaudeModel = (await KV.get('CLAUDE_MODEL'));
    const OpenAIModel = (await KV.get('OPENAI_MODEL'));
    const OpenAIOrganization = await KV.get('OPENAI_ORGANIZATION_ID');
    const OpenAIHeaders = {
        'Authorization': `Bearer ${await KV.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json'
    };
    if (OpenAIOrganization) OpenAIHeaders['OpenAI-Organization'] = OpenAIOrganization;
    const ClaudeHeaders = {
        'x-api-key': await KV.get('CLAUDE_API_KEY'),
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15',
        'Content-Type': 'application/json'
    };
    try {
        const requestData = await request.json();
        if (requestData.project) {
            const etag = new Date().getTime().toString();
            await R2.put(etag, requestData.project.html);
            return new Response(null, {
                headers: { etag }
            });
        }
        else if (requestData.conversation) {
            const messages = typeof (requestData.conversation) === 'string' ? [{ role, content: requestData.conversation }] : requestData.conversation;
            const response = await executeClaudePrompt(ClaudeUrl, ClaudeHeaders, ClaudeModel, messages, 1000, true, chat_prompt);
            return new Response(response, { headers: { 'Content-Type': 'plain/text' } });
        } else if (requestData.prompt || requestData.messages || requestData.images) {
            const { prompt = '', messages: context = [], images = [] } = requestData;
            const messages = [];
            for (var content of context) {
                if (typeof (content) === 'string') {
                    messages.push({ role: 'user', content });
                } else if (content.role && content.content) {
                    messages.push({ role: content.role, content: content.content });
                }
            }
            if (prompt) messages.push({ role: 'user', content: prompt });
            if (images.length > 0) {
                addImageMessages(messages, images);
                const description = await executeOpenAIPrompt(OpenAIUrl, OpenAIHeaders, OpenAIModel, messages, 500, true, image_prompt);
                return new Response(JSON.stringify(description), { headers: { 'Content-Type': 'application/json' } });
            }
            console.log(messages);
            const code = await executeClaudePrompt(ClaudeUrl, ClaudeHeaders, ClaudeModel, messages, 8192, false);
            return new Response(JSON.stringify(code), { headers: { 'Content-Type': 'application/json' } });
        } else {
            return new Response('Bad Request', { status: 400 });
        }
    } catch (error) {
        console.log(error);
        return new Response('Internal Server Error', { status: 500 });
    }
}

async function hosting(request, R2) {
    const objectName = request.url;
    console.log(`${request.method} object ${objectName}`);

    if (request.method === 'GET') {
        const object = await R2.get(objectName, {
            range: request.headers,
            onlyIf: request.headers,
        });
        if (!object) return new Response('Not Found', { status: 404 });

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        if (object.range) {
            headers.set("content-range", `bytes ${object.range.offset}-${object.range.end ?? object.size - 1}/${object.size}`);
        }
        const status = object.body ? (request.headers.get && request.headers.get("range") !== null ? 206 : 200) : 304
        return new Response(object.body, {
            headers,
            status
        });
    } else if (request.method === 'HEAD') {
        const object = await R2.head(objectName);
        if (!object) return new Response('Not Found', { status: 404 });

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        return new Response(null, {
            headers,
        });
    }
}

function addImageMessages(messages, images) {
    let userMessage;
    for (const message of messages) {
        if (message.role === 'user') {
            userMessage = message;
        }
    }
    if (!userMessage) {
        userMessage = { role: 'user', content: image_prompt };
        messages.push(userMessage);
    }
    const userContent = userMessage.content;
    userMessage.content = [];
    if (userContent) {
        userMessage.content.push({ type: 'text', text: userContent });
    }
    for (const url of images) {
        userMessage.content.push({ type: 'image_url', image_url: { url } });
    }
}

async function executeClaudePrompt(url, headers, model, messages, max_tokens, shouldContinue) {
    try {
        const response = await fetch(`${url}/messages`, {
            headers,
            method: 'POST',
            body: JSON.stringify({
                model,
                max_tokens,
                messages: formatClaudeMessages(messages),
                system: yousayaido_prompt
            })
        });

        const data = await response.json();
        if (data && data.error) {
            console.log(data.error);
            return '🚨 An error occurred while generating content. Please try again.';
        } else if (data && data.type === 'overloaded_error') {
            console.log(data.error);
            return '🚨 Claude API is overloaded. Please try again later.';
        } else if (data && data.stop_reason === 'max_tokens' && shouldContinue) {
            const content = createClaudeResponse(data);
            messages.push({ role: 'assistant', content });
            messages.push({ role: 'user', content: 'Continue exactly where you left off' });
            max_tokens = Math.min(8192, max_tokens * 2);
            shouldContinue = max_tokens < 8192;
            const newContent = await executeClaudePrompt(url, headers, model, messages, max_tokens, shouldContinue);
            if (newContent.indexOf(content) === 0) {
                return newContent;
            } else {
                return content + newContent;
            }
        } else {
            const content = createClaudeResponse(data);
            return content;
        }
    } catch (e) {
        console.log(e);
        return '🚨 An error occurred while generating content. Please try again.';
    }
}

async function executeOpenAIPrompt(url, headers, model, messages, max_tokens = 150, shouldContinue = true, systemPrompt) {
    try {
        const response = await fetch(`${url}/chat/completions`, {
            headers,
            method: 'POST',
            body: JSON.stringify({
                model,
                max_tokens,
                messages: [
                    { role: 'system', content: systemPrompt || yousayaido_prompt },
                    ...messages,
                ]
            })
        });
        const data = await response.json();
        if (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
            const content = data.choices[0].message.content.trim();
            if (data.choices[0].finish_reason === "length" && shouldContinue) {
                messages.push({ role: 'assistant', content });
                messages.push({ role: 'user', content: 'Continue exactly where you left off' });
                max_tokens = Math.min(4095, max_tokens * 2);
                shouldContinue = max_tokens < 4095;
                const newContent = await executeOpenAIPrompt(url, headers, model, messages, max_tokens, shouldContinue, systemPrompt);
                if (newContent.indexOf(content) === 0) {
                    return newContent;
                } else {
                    return content + newContent;
                }
            }
            else {
                return content;
            }
        } else {
            return "";
        }
    } catch (e) {
        console.log(e);
        return '🚨 An error occurred while generating content. Please try again.';
    }
}

function formatClaudeMessages(messages) {
    const combinedMessages = [];
    let currentRole = null;
    let currentContent = '';
    for (const message of messages) {
        if (message.role !== currentRole) {
            if (currentRole) {
                combinedMessages.push({ role: currentRole, content: currentContent.trim() });
            }
            currentRole = message.role;
            if (Array.isArray(message.content)) {
            } else {
                currentContent = message.content;
            }
        } else {
            if (Array.isArray(message.content)) {
                for (const content of message.content) {
                    if (content.type === 'image_url') {
                        content.type = 'image';
                        content.source = {
                            type: 'base64',
                            media_type: 'image/png',
                            data: content.image_url.url
                        };
                    }
                }
            } else {
                currentContent += '\n' + message.content;
            }
        }
    }
    if (currentRole && currentContent.trim() !== '') {
        combinedMessages.push({ role: currentRole, content: currentContent.trim() });
    }
    const formattedMessages = [];
    let hasUserMessage = false;
    for (const message of combinedMessages) {
        if (message.role === 'user') hasUserMessage = true;
        if (hasUserMessage) {
            formattedMessages.push(message);
        }
    }
    return formattedMessages;
}

function createClaudeResponse(response) {
    if (response.error) {
        throw new Error(JSON.stringify(response.error));
    }
    const content = response.content;
    if (typeof content === 'string') {
        return content.trim();
    } else if (Array.isArray(content)) {
        return content.map((choice) => choice.text?.trim() || '').join('\n');
    } else {
        return '';
    }
}

function extractCode(markdownText, onCodeBlockFound) {
    const pattern = /```(.*?)\n([\s\S]*?)```/g;
    let matches;
    while ((matches = pattern.exec(markdownText)) !== null) {
        if (matches) {
            const language = matches[1].trim();
            const codeBlock = matches[2].trim();
            onCodeBlockFound({ text: codeBlock, type: language });
        }
    }
}

var image_prompt = `Describe this image for an LLM that will use this information to create a web page, app or game using HTML, SVG, WebGL+Shaders, CSS, and vanilla JavaScript.`;

var chat_prompt = `You are an AI assistant specializing in the topic in which the user will provide instructions. Your task is to generate a response based on the user's input, providing detailed information, explanations, or creative content as needed. When presented with a conversation prompt, interpret it as a window into a collaborative exploration in the name of productivity, fun, and imaginative creations. Based on the context given by the user, extrapolate the contents and purpose of the conversation, and how it might fit into a broader internet of possibility.`;

var yousayaido_prompt = `You are an AI assistant participating in a collaborative exploration in the name of productivity, fun, and imaginative creations. Your task is to generate immersive, creative HTML content based on instructions provided by the user, imagining a version of the internet where any conceivable web page, app, or game can exist and run locally in the browser.

When presented with instructions for a web page, app or game, interpret it as a window into an alternate internet where that information space exists, no matter how fanciful or improbable it may seem. Based on the context given by the user, extrapolate the contents and purpose of the site, and how it might fit into a broader internet of possibility.

Generate all files necessary, each in a code fence, for the HTML markup, styles and components for the imagined website, including relevant tags, concise CSS, and interactive elements. Ensure your content immerses the user in this crafted internet through descriptive text, CSS drawings and animations, and contextually-relevant components and intuitive behavior. Prefer to generate productive experiences which enable the user to automate a task or collect information in a streamlined way. Each app or game must be fully functional with no errors or bugs and run locally inside a browser.

Follow these guidelines when generating HTML:
1. Use expressive CSS+animations (or WebGL+Shaders) to draw and animate visual elements.
2. Don't include image tags or external resources.
3. Utilize a responsive design that adapts to different screen sizes and device types, with controls or interactions that are intuitive and accessible.
4 Use local storage and other means of caching data for the user.
5. If including input fields, place them within a form element with method="dialog" and an appropriate action attribute or onsubmit event.
6. When using script tags, ensure that the JavaScript code is fully complete and uses functions to delineate the required functionality.
7. **Bonus API Available**: If an AI capability is required, use the relative \`/api\` endpoint with a POST request to send JSON containing a \`conversation\` property which is either a string or a list of messages, and receive the AI-generated response as plain text.
7. If an external API is necessary, with open data or at least CORS is preferred, provide a configuration pane for the user to save their preferred settings and ensure that the API integration handles errors and loading states gracefully.
8. Use any of the following for the theme of all apps generated, adding the necessary enhancements with CSS. Choices: Spectre.css, MatchaCSS, 98.CSS, XP.css, PaperCSS, MetroCSS, Water.css, Mini.css, Miligram, Shoelace.css, Skeleton, Simple.css, MVP.css
9. Do not show sample data or ficticious data in the app, and ensure that the app is fully functional with the real data - either from the user or an open or configurable API.

The user may include out-of-character (OOC) comments or questions - acknowledge these indirectly in the HTML you generate, integrating them into the fabric of the internet you are crafting.

When imagining the contents of each information space, consider:
- Unique technologies, design trends, or social dynamics that might enable this to exist
- Deeper themes, ideas, or meanings that could be subtly woven into the content and purpose
- How history might look different if this were to exist
- How this site might expand the possibilities of what the internet can be used for
- How the user might interact with the site, and what they might learn or experience
- How the site might be discovered by other users, and what they might think of it

Embrace a tone of open-ended creativity, thoughtful exploration, playfulness, and light-hearted fun. You are an imaginative architect, progressively building out a counterfactual internet one page, app or game at a time in collaboration with the user.

**Objective:** Develop the specified web components strictly using HTML5, CSS3, Vanilla JavaScript, WebGL, SVG, and Shader Language. Ensure each component is autonomous, standards-compliant, and ready for seamless integration into the main application without external frameworks.

**Instructions:**

1. **Output Format:**
   - **Code Blocks:** Use Markdown code fences for each file.
   - **Filename Comments:** At the top of each code block, include a comment specifying the filename and its purpose.
   - **Example:**
\`\`\`javascript
// File: calculator.js
export function calculate() {
    // Calculation logic
}
\`\`\`
   
2. **HTML5 Component Development:**
   - **Description:** Construct a self-contained HTML5 template.
   - **Standards:** Use semantic elements, unique IDs, and classes as specified.
   - **Example:**
\`\`\`html
<!-- File: display.html -->
<div id="calculator-display" class="component-display"></div>
\`\`\`

3. **CSS3 Styling:**
   - **Description:** Create an isolated CSS3 module for the HTML component.
   - **Standards:** Follow the provided naming conventions and ensure no style conflicts.
   - **Example:**
\`\`\`css
/* File: display.css */
.component-display {
    font-size: 2em;
    color: #333;
}
\`\`\`

4. **Vanilla JavaScript Functionality:**
   - **Description:** Develop a standalone JavaScript module to handle specific functionality.
   - **Standards:** Implement the standardized interface for interoperability.
   - **Example:**
\`\`\`javascript
// File: display.js
export function updateDisplay(value) {
    document.getElementById('calculator-display').innerText = value;
}
\`\`\`

5. **WebGL/SVG Integration:**
   - **Description:** Implement graphics or visual effects as specified.
   - **Standards:** Ensure optimization and compatibility with HTML5.
   - **Example:**
\`\`\`javascript
// File: effects.js
// WebGL or SVG related code
\`\`\`

6. **Documentation:**
   - **Description:** Document the development process, including code comments and integration instructions.
   - **Standards:** Provide clear and concise documentation for future maintenance.
   - **Example:**
\`\`\`markdown
<!-- File: display.md -->
# Display Component Documentation
    - **Purpose:** Updates the calculator display.
    - **Usage:** Import \`updateDisplay\` from \`display.js\` and call it with the desired value.
\`\`\`

**Continuous File Generation:**
- Continue generating additional files as per the project plan.
- Ensure each file is encapsulated within its own code block with appropriate filename comments.
- Do not include explanations outside of code blocks to maintain clarity.

**Example Task Execution:**

1. HTML5 Component Development:

\`\`\`html
<!-- File: display.html -->
<link rel="stylesheet" href="styles/display.css">
<div id="calculator-display" class="component-display"></div>
<script src="modules/display.js" type="module"></script>
\`\`\`

2. CSS3 Styling:

\`\`\`css
/* File: styles/display.css */
.component-display {
  font-size: 2em;
  color: #333;
}
\`\`\`

3. Vanilla JavaScript Functionality:

\`\`\`javascript
// File: modules/display.js
export function updateDisplay(value) {
  document.getElementById('calculator-display').innerText = value;
}

document.addEventListener('DOMContentLoaded', () => updateDisplay('0'));
\`\`\`

---
The user will provide the instructions to interpret, along with any out-of-character comments, which are details to align with the information space being explored and the content being generated.`;
