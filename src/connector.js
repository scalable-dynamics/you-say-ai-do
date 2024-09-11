function Response(body, options) {
    this.body = body;
    this.headers = options.headers || {};
}
module.exports = { connector };

async function connector(request, CF) {
    const OpenAIUrl = (await CF.get('OPENAI_API_URL'));
    const ClaudeUrl = (await CF.get('CLAUDE_API_URL'));
    const ClaudeModel = (await CF.get('CLAUDE_MODEL'));
    const OpenAIModel = (await CF.get('OPENAI_MODEL'));
    const OpenAIOrganization = await CF.get('OPENAI_ORGANIZATION_ID');
    const OpenAIHeaders = {
        'Authorization': `Bearer ${await CF.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json'
    };
    if (OpenAIOrganization) OpenAIHeaders['OpenAI-Organization'] = OpenAIOrganization;
    const ClaudeHeaders = {
        'x-api-key': await CF.get('CLAUDE_API_KEY'),
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15',
        'Content-Type': 'application/json'
    };
    try {
        const requestData = await request.json();
        const executePrompt = executeClaudePrompt.bind(null, ClaudeUrl, ClaudeHeaders, ClaudeModel);
        if (requestData.messages) {
            const { messages, images = [] } = requestData;
            if (images.length > 0) {
                addImageMessages(messages, images);
                const description = await executeOpenAIPrompt(OpenAIUrl, OpenAIHeaders, OpenAIModel, messages, 250, true, image_prompt);
                return new Response(JSON.stringify(description), { headers: { 'Content-Type': 'application/json' } });
            }
            const response = await executePrompt(messages, 4095);
            let generatedHTML = response;
            let hasCodeBlock = false;
            extractCode(response, (codeBlock) => {
                const tag = codeBlock.type === 'html' ? '' : codeBlock.type === 'css' ? 'style' : 'script';
                const code = tag ? `<${tag}>${codeBlock.text}</${tag}>` : codeBlock.text;
                if (hasCodeBlock) {
                    generatedHTML += '\n' + code;
                } else {
                    generatedHTML = code;
                }
                hasCodeBlock = true;
            });
            return new Response(JSON.stringify(generatedHTML), { headers: { 'Content-Type': 'application/json' } });
        } else {
            return new Response('Bad Request', { status: 400 });
        }
    } catch (error) {
        console.error(error);
        return new Response('Bad Request', { status: 400 });
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

async function executeClaudePrompt(url, headers, model, messages, max_tokens = 150, shouldContinue = true) {
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
            console.error(data.error);
            return '🚨 An error occurred while generating content. Please try again.';
        } else if (data && data.type === 'overloaded_error') {
            console.error(data.error);
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
        console.error(e);
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
        console.error(e);
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

var yousayaido_prompt = `You are an AI assistant participating in a collaborative exploration in the name of productivity, fun, and imaginative creations. Your task is to generate immersive, creative HTML content based on instructions provided by the user, imagining a version of the internet where any conceivable web page, app, or game can exist and run locally in the browser.

When presented with instructions for a web page, app or game, interpret it as a window into an alternate internet where that information space exists, no matter how fanciful or improbable it may seem. Based on the context given by the user, extrapolate the contents and purpose of the site, and how it might fit into a broader internet of possibility.

Generate full HTML markup for the imagined website, including relevant tags, concise CSS, and interactive elements. Ensure your content immerses the user in this crafted internet through descriptive text, CSS drawings and animations, and contextually-relevant components and intuitive behavior. Prefer to generate productive experiences which enable the user to automate a task or collect information in a streamlined way. Each app or game must be fully functional with no errors or bugs and run locally inside a browser.

Follow these guidelines when generating HTML:
1. Use expressive CSS+animations (or WebGL+Shaders) to draw and animate visual elements.
2. Don't include image tags or external resources.
3. Use local storage and other means of caching data for the user.
4. If including input fields, place them within a form element with method="dialog" and an appropriate action attribute or onsubmit event.
5. When using script tags, ensure that the JavaScript code is fully complete and uses functions to delineate the required functionality.
6. If an external API is required, provide a configuration pane for the user to save their preferred settings.
7. Use any of the following for the theme of all apps generated, adding the necessary enhancements with CSS. Choices: Spectre.css, MatchaCSS, 98.CSS, XP.css, PaperCSS, MetroCSS, Water.css, Mini.css, Miligram, Shoelace.css, Skeleton, Simple.css, MVP.css

The user may include out-of-character (OOC) comments or questions - acknowledge these indirectly in the HTML you generate, integrating them into the fabric of the internet you are crafting.

When imagining the contents of each information space, consider:
- Unique technologies, design trends, or social dynamics that might enable this to exist
- Deeper themes, ideas, or meanings that could be subtly woven into the content and purpose
- How history might look different if this were to exist
- How this site might expand the possibilities of what the internet can be used for
- How the user might interact with the site, and what they might learn or experience
- How the site might be discovered by other users, and what they might think of it

Embrace a tone of open-ended creativity, thoughtful exploration, playfulness, and light-hearted fun. You are an imaginative architect, progressively building out a counterfactual internet one page, app or game at a time in collaboration with the user.

The user will provide the instructions to interpret, along with any out-of-character comments, which are details to align with the information space being explored and the content being generated.
Based on this information, generate the full HTML markup for the imagined website. Your response should be entirely in HTML format, beginning with the <!DOCTYPE html> declaration and ending with the closing </html> tag.`;
