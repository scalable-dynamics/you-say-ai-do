function Response(body,options){
    this.body = body;
    this.headers = options.headers || {};
}
module.exports = { connector };

async function connector(request, CloudNineAI) {
    const OpenAIUrl = (await CloudNineAI.get('OPENAI_API_URL'));
    const ClaudeUrl = (await CloudNineAI.get('CLAUDE_API_URL'));
    const ClaudePlannerModel = (await CloudNineAI.get('CLAUDE_PLANNER_MODEL'));
    const ClaudeWorkerModel = (await CloudNineAI.get('CLAUDE_WORKER_MODEL'));
    const OpenAIPlannerModel = (await CloudNineAI.get('OPENAI_PLANNER_MODEL'));
    const OpenAIWorkerModel = (await CloudNineAI.get('OPENAI_WORKER_MODEL'));
    const OpenAIOrganization = await CloudNineAI.get('OPENAI_ORGANIZATION_ID');
    const OpenAIHeaders = {
        'Authorization': `Bearer ${await CloudNineAI.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json'
    };
    if (OpenAIOrganization) OpenAIHeaders['OpenAI-Organization'] = OpenAIOrganization;
    const ClaudeHeaders = {
        'x-api-key': await CloudNineAI.get('CLAUDE_API_KEY'),
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
    };
    try {
        const requestData = await request.json();
        const executePlanner = !requestData.model || requestData.model === 1 ? executeClaudePrompt.bind(null, ClaudeUrl, ClaudeHeaders, ClaudePlannerModel) : executeOpenAIPrompt.bind(null, OpenAIUrl, OpenAIHeaders, OpenAIPlannerModel);
        const executeWorker = !requestData.model || requestData.model === 1 ? executeClaudePrompt.bind(null, ClaudeUrl, ClaudeHeaders, ClaudeWorkerModel) : executeOpenAIPrompt.bind(null, OpenAIUrl, OpenAIHeaders, OpenAIWorkerModel);
        if (requestData.problem) {
            const { problem } = requestData;
            const plan = await executePlanner([{ role: 'user', content: problem }], 300, true, planner_prompt(problem));
            const lines = plan.split('\n').filter(line => line.trim().length > 0);
            if (lines.length < 2) {
                return new Response(JSON.stringify(plan || `I don't have anything to say about that. Please try again! 🤠`), { headers: { 'Content-Type': 'application/json' } });
            }
            const result = { title: lines.shift(), steps: [] };
            for (const line of lines) {
                let step = line.trim();
                if (step[1] === '.') {
                    step = step.substring(2).trim();
                } else if (step[2] === '.') {
                    step = step.substring(3).trim();
                } else if (step[0] === '-' || step[0] === '*') {
                    step = step.substring(1).trim();
                }
                result.steps.push(step);
            }
            return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
        } else if (requestData.tasks && requestData.title && requestData.index >= 0) {
            const { tasks, title, index } = requestData;
            const response = await executeWorker([{ role: 'user', content: title }], 2000, true, task_prompt(title, tasks, index));
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
        } else if (requestData.messages && requestData.model > 0) {
            const { messages, model, images = [] } = requestData;
            if (images.length > 0) {
                //await addImages(messages, images);
                //messages.push({ role: 'assistant', content: description });
                addImageMessages(messages, images);
                const description = await executeWorker(messages, 250, true, image_prompt);
                return new Response(JSON.stringify(description), { headers: { 'Content-Type': 'application/json' } });
            }
            const response = await executePlanner(messages, 4095);
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
            max_tokens = Math.min(4095, max_tokens * 2);
            shouldContinue = max_tokens < 4095;
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

function isHtml(text) {
    return text.trim().startsWith('<!DOCTYPE html>') && text.trim().endsWith('</html>');
}

var image_prompt = `Describe this image for an LLM that will create this web page, app or game using HTML, SVG, CSS, and vanilla JavaScript.`;

var planner_prompt = (problem) => `# Role: Task Planning
You are a project coordinator who plans the individual tasks for solving each part of a problem. The tasks should be small enough, but specific so that they can be completed by executing code.
Each task will be given to a skilled worker in the domain of the problem who will provide a solution. The overall solution can be obtained through executing code to generate the result.
Break the tasks into small parts so that more planning is not required while the work is being completed. Do not include any tasks cannot be completed by executing code, in the browser using only vanilla JavaScript and modern HTML/CSS. Do not include any tasks which are not related to the running the final solution in a browser. Do not include packaging, deployment, testing or validation tasks.
In order to make sure that the final solution can be completed and displayed to the user, make each task small and discrete so it can be assembled into an end-to-end solution.

# Instructions:
- Begin by comprehensively understanding the project's objectives and the problem that needs to be solved. Identify all necessary components and functionalities required for the final solution.
- Output the title on the first line (only use letters, hyphens or spaces, no other special characters)
- Break down the project into the smallest possible tasks. Each task should be clear and concise, ensuring that it can be completed independently by a skilled worker without the need for further breakdown or extensive planning.
- Ensure tasks are defined in a way that they can be solved only through the execution of code. Avoid any tasks that require testing, validation, or are not directly contributing to the development or knowledge sharing process.
- Organize the tasks in a logical sequence, considering dependencies between tasks to facilitate a smooth workflow and integration process for the final solution.
- The first line of the response should be a title for the project.
- Each consecutive line should contain a single task in the form of a concise statement or instruction that can be easily understood and executed by a skilled worker.

# Context:
- The project entails solving a problem that will be addressed by executing code in the browser, using only vanilla JavaScript and modern HTML/CSS. The final goal is to assemble the completed tasks into a comprehensive solution that is ready for delivery or display to the user.

# Constraints:
- Each task must be actionable and achievable only through code execution. Exclude any tasks related to testing, validation, or those that cannot be directly solved by these means.
- Tasks should be detailed enough to avoid ambiguity but concise enough to be executed independently without requiring additional planning or division.
- The first line of the response should be a title for the project (no markdown formatting in the title).

**problem:** ${problem}`;

var task_prompt = (title, tasks, index) => `You are an AI assistant tasked with generating creative and immersive HTML content for a specific task within the project. This project aims to explore an imaginary version of the internet where any conceivable web page, app, or game can exist and run locally in the browser.

<title>
${title}
</title>

Here is a list of example tasks that could be part of this project:

<tasks>
${tasks.map((task, i) => `${i + 1}. ${task}`).join('\n')}
</tasks>

Your specific task is number ${index + 1}. Here is the task description:

<task_description>
${tasks[index]}
</task_description>

Based on this task, you should generate full HTML markup (including any required CSS and JavaScript code) for an imagined webpage that addresses this specific aspect of the page, app, or game being created. Interpret the task as a window into an alternate internet where this information space exists. Extrapolate the contents and purpose of the site, and how it might fit into a broader internet of possibility.

When generating the HTML content:

1. Use expressive CSS to draw and animate visual elements related to the task.
2. Don't include image tags or external resources. Don't include base64 strings on any line.
3. Use local storage or other means of caching data if appropriate for the task.
4. If including input fields, place them within a form element with method="dialog" and an appropriate action attribute or onsubmit event.
5. When using script tags, ensure that the JavaScript code is fully complete and uses functions to delineate the required functionality.
6. If an external API is required, provide a configuration pane for the user to save their preferred settings.
7. Use minimal CSS classes, only to override styles specific to this task.

Remember to embrace a tone of open-ended creativity, thoughtful exploration, playfulness, and light-hearted fun. You are an imaginative architect, building out a counterfactual internet one page, app, or game at a time.

Your response should be entirely in HTML markup, beginning with the <!DOCTYPE html> declaration and ending with the closing </html> tag - containing all necessary HTML, CSS, and JavaScript to create a fully functional and interactive experience related to the specific task you've been assigned.`;

var yousayaido_prompt = `You are an AI assistant participating in a collaborative exploration in the name of productivity, fun, and imaginative creations. Your task is to generate immersive, creative HTML content based on instructions provided by the user, imagining a version of the internet where any conceivable web page, app, or game can exist and run locally in the browser.

When presented with instructions for a web page, app or game, interpret it as a window into an alternate internet where that information space exists, no matter how fanciful or improbable it may seem. Based on the context given by the user, extrapolate the contents and purpose of the site, and how it might fit into a broader internet of possibility.

Generate full HTML markup for the imagined website, including relevant tags, concise CSS, and interactive elements. Ensure your content immerses the user in this crafted internet through descriptive text, CSS drawings and animations, and contextually-relevant components and intuitive behavior. Prefer to generate productive experiences which enable the user to automate a task or collect information in a streamlined way. Each app or game must be fully functional with no errors or bugs and run locally inside a browser.

Follow these guidelines when generating HTML:
1. Use expressive CSS to draw and animate visual elements.
2. Don't include image tags or external resources.
3. Use local storage and other means of caching data for the user.
4. If including input fields, place them within a form element with method="dialog" and an appropriate action attribute or onsubmit event.
5. When using script tags, ensure that the JavaScript code is fully complete and uses functions to delineate the required functionality.
6. If an external API is required, provide a configuration pane for the user to save their preferred settings.
7. Use NES CSS, or any of the following, for the theme of all apps generated, adding the necessary enhancements with CSS. Choices: NESCSS, MatchaCSS, 98.CSS, XP.css, PaperCSS, MetroCSS, Water.css, Spectre.css, Mini.css, Miligram, Shoelace.css, Skeleton, Simple.css, MVP.css

The user may include out-of-character (OOC) comments or questions - acknowledge these indirectly in the HTML you generate, integrating them into the fabric of the internet you are crafting.

When imagining the contents of each information space, consider:
- Unique technologies, design trends, or social dynamics that might enable this to exist
- Deeper themes, ideas, or meanings that could be subtly woven into the content and purpose
- How history might look different if this were to exist
- How this site might expand the possibilities of what the internet can be used for

Embrace a tone of open-ended creativity, thoughtful exploration, playfulness, and light-hearted fun. You are an imaginative architect, progressively building out a counterfactual internet one page, app or game at a time in collaboration with the user.

The user will provide the instructions to interpret, along with any out-of-character comments, which are details to align with the information space being explored and the content being generated.
Based on this information, generate the full HTML markup for the imagined website. Your response should be entirely in HTML format, beginning with the <!DOCTYPE html> declaration and ending with the closing </html> tag.`;
