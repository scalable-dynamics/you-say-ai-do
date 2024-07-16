export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const check = request.headers['referer'] || 'yousayaido.com';
		if (request.headers['postman-token'] || check.indexOf('yousayaido.com') === -1) {
			return new Response('Bad Request', { status: 400 });
		}
		else if (url.pathname.startsWith('/api')) {
			if (request.method !== 'POST') return new Response('Bad Request', { status: 400 });
			return await connector(request, env.KV);
		} else if (url.pathname === '/') {
			return env.ASSETS.fetch(new Request('index.html', { method: 'GET' }));
		}
		return new Response('Bad Request', { status: 400 });
	},
};
async function connector(a,i){const s=await i.get("OPENAI_API_URL"),h=await i.get("CLAUDE_API_URL"),d=await i.get("CLAUDE_PLANNER_MODEL"),u=await i.get("CLAUDE_WORKER_MODEL"),p=await i.get("OPENAI_PLANNER_MODEL"),g=await i.get("OPENAI_WORKER_MODEL"),m=await i.get("OPENAI_ORGANIZATION_ID"),f={Authorization:`Bearer ${await i.get("OPENAI_API_KEY")}`,"Content-Type":"application/json"};m&&(f["OpenAI-Organization"]=m);const y={"x-api-key":await i.get("CLAUDE_API_KEY"),"anthropic-version":"2023-06-01","Content-Type":"application/json"};try{const i=await a.json(),m=i.model&&1!==i.model?n.bind(null,s,f,p):t.bind(null,h,y,d),b=i.model&&1!==i.model?n.bind(null,s,f,g):t.bind(null,h,y,u);if(i.problem){const{problem:e}=i,t=await m([{role:"user",content:e}],300,!0,l(e)),n=t.split("\n").filter((e=>e.trim().length>0));if(n.length<2)return new Response(JSON.stringify(t||"I don't have anything to say about that. Please try again! 🤠"),{headers:{"Content-Type":"application/json"}});const a={title:n.shift(),steps:[]};for(const e of n){let t=e.trim();"."===t[1]?t=t.substring(2).trim():"."===t[2]?t=t.substring(3).trim():"-"!==t[0]&&"*"!==t[0]||(t=t.substring(1).trim()),a.steps.push(t)}return new Response(JSON.stringify(a),{headers:{"Content-Type":"application/json"}})}if(i.tasks&&i.title&&i.index>=0){const{tasks:e,title:t,index:n}=i,a=await b([{role:"user",content:t}],2e3,!0,c(t,e,n));let s=a,r=!1;return o(a,(e=>{const t="html"===e.type?"":"css"===e.type?"style":"script",n=t?`<${t}>${e.text}</${t}>`:e.text;r?s+="\n"+n:s=n,r=!0})),new Response(JSON.stringify(s),{headers:{"Content-Type":"application/json"}})}if(i.messages&&i.model>0){const{messages:t,model:n,images:a=[]}=i;if(a.length>0){e(t,a);const n=await b(t,250,!0,r);return new Response(JSON.stringify(n),{headers:{"Content-Type":"application/json"}})}const s=await m(t,4095);let l=s,c=!1;return o(s,(e=>{const t="html"===e.type?"":"css"===e.type?"style":"script",n=t?`<${t}>${e.text}</${t}>`:e.text;c?l+="\n"+n:l=n,c=!0})),new Response(JSON.stringify(l),{headers:{"Content-Type":"application/json"}})}return new Response("Bad Request",{status:400})}catch(e){return new Response("Bad Request",{status:400})}}function e(e,t){let n;for(const t of e)"user"===t.role&&(n=t);n||(n={role:"user",content:r},e.push(n));const a=n.content;n.content=[],a&&n.content.push({type:"text",text:a});for(const e of t)n.content.push({type:"image_url",image_url:{url:e}})}async function t(e,n,o,s,r=150,l=!0){try{const c=await fetch(`${e}/messages`,{headers:n,method:"POST",body:JSON.stringify({model:o,max_tokens:r,messages:a(s),system:h})}),d=await c.json();if(d&&d.error)return"🚨 An error occurred while generating content. Please try again.";if(d&&"overloaded_error"===d.type)return"🚨 Claude API is overloaded. Please try again later.";if(d&&"max_tokens"===d.stop_reason&&l){const a=i(d);s.push({role:"assistant",content:a}),s.push({role:"user",content:"Continue exactly where you left off"}),l=(r=Math.min(4095,2*r))<4095;const c=await t(e,n,o,s,r,l);return 0===c.indexOf(a)?c:a+c}return i(d)}catch(e){return"🚨 An error occurred while generating content. Please try again."}}async function n(e,t,a,i,o=150,s=!0,r){try{const l=await fetch(`${e}/chat/completions`,{headers:t,method:"POST",body:JSON.stringify({model:a,max_tokens:o,messages:[{role:"system",content:r||h},...i]})}),c=await l.json();if(c&&c.choices&&c.choices[0]&&c.choices[0].message&&c.choices[0].message.content){const l=c.choices[0].message.content.trim();if("length"===c.choices[0].finish_reason&&s){i.push({role:"assistant",content:l}),i.push({role:"user",content:"Continue exactly where you left off"}),s=(o=Math.min(4095,2*o))<4095;const c=await n(e,t,a,i,o,s,r);return 0===c.indexOf(l)?c:l+c}return l}return""}catch(e){return"🚨 An error occurred while generating content. Please try again."}}function a(e){const t=[];let n=null,a="";for(const i of e)if(i.role!==n)n&&t.push({role:n,content:a.trim()}),n=i.role,Array.isArray(i.content)||(a=i.content);else if(Array.isArray(i.content))for(const e of i.content)"image_url"===e.type&&(e.type="image",e.source={type:"base64",media_type:"image/png",data:e.image_url.url});else a+="\n"+i.content;n&&""!==a.trim()&&t.push({role:n,content:a.trim()});const i=[];let o=!1;for(const e of t)"user"===e.role&&(o=!0),o&&i.push(e);return i}function i(e){if(e.error)throw new Error(JSON.stringify(e.error));const t=e.content;return"string"==typeof t?t.trim():Array.isArray(t)?t.map((e=>e.text?.trim()||"")).join("\n"):""}function o(e,t){const n=/```(.*?)\n([\s\S]*?)```/g;let a;for(;null!==(a=n.exec(e));)if(a){const e=a[1].trim();t({text:a[2].trim(),type:e})}}function s(e){return e.trim().startsWith("<!DOCTYPE html>")&&e.trim().endsWith("</html>")}var r="Describe this image for an LLM that will create this web page, app or game using HTML, SVG, CSS, and vanilla JavaScript.",l=e=>`# Role: Task Planning\nYou are a project coordinator who plans the individual tasks for solving each part of a problem. The tasks should be small enough, but specific so that they can be completed by executing code.\nEach task will be given to a skilled worker in the domain of the problem who will provide a solution. The overall solution can be obtained through executing code to generate the result.\nBreak the tasks into small parts so that more planning is not required while the work is being completed. Do not include any tasks cannot be completed by executing code, in the browser using only vanilla JavaScript and modern HTML/CSS. Do not include any tasks which are not related to the running the final solution in a browser. Do not include packaging, deployment, testing or validation tasks.\nIn order to make sure that the final solution can be completed and displayed to the user, make each task small and discrete so it can be assembled into an end-to-end solution.\n\n# Instructions:\n- Begin by comprehensively understanding the project's objectives and the problem that needs to be solved. Identify all necessary components and functionalities required for the final solution.\n- Output the title on the first line (only use letters, hyphens or spaces, no other special characters)\n- Break down the project into the smallest possible tasks. Each task should be clear and concise, ensuring that it can be completed independently by a skilled worker without the need for further breakdown or extensive planning.\n- Ensure tasks are defined in a way that they can be solved only through the execution of code. Avoid any tasks that require testing, validation, or are not directly contributing to the development or knowledge sharing process.\n- Organize the tasks in a logical sequence, considering dependencies between tasks to facilitate a smooth workflow and integration process for the final solution.\n- The first line of the response should be a title for the project.\n- Each consecutive line should contain a single task in the form of a concise statement or instruction that can be easily understood and executed by a skilled worker.\n\n# Context:\n- The project entails solving a problem that will be addressed by executing code in the browser, using only vanilla JavaScript and modern HTML/CSS. The final goal is to assemble the completed tasks into a comprehensive solution that is ready for delivery or display to the user.\n\n# Constraints:\n- Each task must be actionable and achievable only through code execution. Exclude any tasks related to testing, validation, or those that cannot be directly solved by these means.\n- Tasks should be detailed enough to avoid ambiguity but concise enough to be executed independently without requiring additional planning or division.\n- The first line of the response should be a title for the project (no markdown formatting in the title).\n\n**problem:** ${e}`,c=(e,t,n)=>`You are an AI assistant tasked with generating creative and immersive HTML content for a specific task within the WebSim project. This project aims to explore an imaginary version of the internet where any conceivable web page, app, or game can exist and run locally in the browser.\n\n<title>\n${e}\n</title>\n\nHere is a list of example tasks that could be part of this project:\n\n<tasks>\n${t.map(((e,t)=>`${t+1}. ${e}`)).join("\n")}\n</tasks>\n\nYour specific task is number ${n+1}. Here is the task description:\n\n<task_description>\n${t[n]}\n</task_description>\n\nBased on this task, you should generate full HTML markup (including any required CSS and JavaScript code) for an imagined webpage that addresses this specific aspect of the page, app, or game being created. Interpret the task as a window into an alternate internet where this information space exists. Extrapolate the contents and purpose of the site, and how it might fit into a broader internet of possibility.\n\nWhen generating the HTML content:\n\n1. Use expressive CSS to draw and animate visual elements related to the task.\n2. Don't include image tags or external resources. Don't include base64 strings on any line.\n3. Use local storage or other means of caching data if appropriate for the task.\n4. If including input fields, place them within a form element with method="dialog" and an appropriate action attribute or onsubmit event.\n5. When using script tags, ensure that the JavaScript code is fully complete and uses functions to delineate the required functionality.\n6. If an external API is required, provide a configuration pane for the user to save their preferred settings.\n7. Use minimal CSS classes, only to override styles specific to this task.\n\nRemember to embrace a tone of open-ended creativity, thoughtful exploration, playfulness, and light-hearted fun. You are an imaginative architect, building out a counterfactual internet one page, app, or game at a time.\n\nYour response should be entirely in HTML markup, beginning with the <!DOCTYPE html> declaration and ending with the closing </html> tag - containing all necessary HTML, CSS, and JavaScript to create a fully functional and interactive experience related to the specific task you've been assigned.`,h='You are an AI assistant participating in a collaborative exploration called WebSim. Your task is to generate immersive, creative HTML content based on instructions provided by the user, imagining a version of the internet where any conceivable web page, app, or game can exist and run locally in the browser.\n\nWhen presented with instructions for a web page, app or game, interpret it as a window into an alternate internet where that information space exists, no matter how fanciful or improbable it may seem. Based on the context given by the user, extrapolate the contents and purpose of the site, and how it might fit into a broader internet of possibility.\n\nGenerate full HTML markup for the imagined website, including relevant tags, concise CSS, and interactive elements. Ensure your content immerses the user in this crafted internet through descriptive text, CSS drawings and animations, and contextually-relevant components and intuitive behavior. Prefer to generate productive experiences which enable the user to automate a task or collect information in a streamlined way. Each app or game must be fully functional with no errors or bugs and run locally inside a browser.\n\nFollow these guidelines when generating HTML:\n1. Use expressive CSS to draw and animate visual elements.\n2. Don\'t include image tags or external resources.\n3. Use local storage and other means of caching data for the user.\n4. If including input fields, place them within a form element with method="dialog" and an appropriate action attribute or onsubmit event.\n5. When using script tags, ensure that the JavaScript code is fully complete and uses functions to delineate the required functionality.\n6. If an external API is required, provide a configuration pane for the user to save their preferred settings.\n7. Use NES CSS, or any of the following, for the theme of all apps generated, adding the necessary enhancements with CSS. Choices: NESCSS, MatchaCSS, 98.CSS, XP.css, PaperCSS, MetroCSS, Water.css, Spectre.css, Mini.css, Miligram, Shoelace.css, Skeleton, Simple.css, MVP.css\n\nThe user may include out-of-character (OOC) comments or questions - acknowledge these indirectly in the HTML you generate, integrating them into the fabric of the internet you are crafting.\n\nWhen imagining the contents of each information space, consider:\n- Unique technologies, design trends, or social dynamics that might enable this to exist\n- Deeper themes, ideas, or meanings that could be subtly woven into the content and purpose\n- How history might look different if this were to exist\n- How this site might expand the possibilities of what the internet can be used for\n\nEmbrace a tone of open-ended creativity, thoughtful exploration, playfulness, and light-hearted fun. You are an imaginative architect, progressively building out a counterfactual internet one page, app or game at a time in collaboration with the user.\n\nThe user will provide the instructions to interpret, along with any out-of-character comments, which are details to align with the information space being explored and the content being generated.\nBased on this information, generate the full HTML markup for the imagined website. Your response should be entirely in HTML format, beginning with the <!DOCTYPE html> declaration and ending with the closing </html> tag.';