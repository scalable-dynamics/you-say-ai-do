# You Say AI Do - [created by Greg DeCarlo - @mrinreality1 on X](https://linktr.ee/mrinreality)

You Say AI Do is an innovative platform that allows users to create any web page, app, or game from a simple prompt. Users can add images, audio, speech-to-text, text-based files, and emojis to the conversation to iterate on the design and behavior.

## Features

- **Easy Prompt-based Creation**: Simply describe what you want to create, and the platform will generate it for you.
- **Multimedia Support**: Integrate images, audio, and text files into your project effortlessly.
- **Speech-to-Text Integration**: Use speech-to-text to input prompts and make changes.
- **Emojis Support**: Enhance your conversation and project with emojis.
- **Iterative Design**: Continuously refine your project with ongoing inputs and adjustments.

## Installation

To install and run You Say AI Do locally, follow these steps:

1. **Clone the repository**
    ```bash
    git clone https://github.com/your-username/you-say-ai-do.git
    ```
2. **Navigate to the project directory**
    ```bash
    cd you-say-ai-do
    ```
3. **Install dependencies**
    ```bash
    npm install
    ```
4. **Create `config.json` file at the root**
> Fill in the details for the model(s) that you want to use
    ```json
{
    "CLAUDE_API_KEY": "sk-XXX-XXXXXXXX",
    "OPENAI_API_KEY": "sk-XXXXXXXX",
    "OPENAI_ORGANIZATION_ID": "org-XXXXXXXX",
    "OPENAI_API_URL": "https://api.openai.com/v1",
    "CLAUDE_API_URL": "https://api.anthropic.com/v1",
    "CLAUDE_MODEL": "claude-3-5-sonnet-20240620",
    "OPENAI_MODEL": "gpt-4o"
}
    ```
4. **Run the application**
    ```bash
    node ./local.js
    ```

## Usage

1. **Start the application**:
    Open your browser and go to `http://localhost:3000`.

2. **Create a project**:
    - Enter a prompt describing what you want to create (e.g., "Create a personal blog page with a gallery").
    - Add any images, audio, text files, or emojis to the conversation to refine your project.
    - Click Improve or Download to continue the iteration process.
    - Paste the HTML from __any__ web page, from the `<!DOCTYPE html>` to the `</html>` tag. (only works on desktop for now)

3. **Iterate and refine**:
    - Use additional prompts and multimedia inputs to iterate on the design and behavior.
    - View real-time updates as you make changes.

## Deployment to CloudFlare workers and R2 storage

```bash
node ./build.js
npx wrangler pages deploy ./public
```

> Note: Configuration KV and R2 Storage must be configured.

## Contributing

We welcome contributions from the community! To contribute:

1. **Fork the repository**
2. **Create a new branch**
    ```bash
    git checkout -b feature/your-feature-name
    ```
3. **Make your changes**
4. **Commit your changes**
    ```bash
    git commit -m 'Add some feature'
    ```
5. **Push to the branch**
    ```bash
    git push origin feature/your-feature-name
    ```
6. **Open a pull request**

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

For any questions or suggestions, feel free to open an issue or contact us at cloud@scalabledynamicsllc.com

---

Thank you for using You Say AI Do! We hope you enjoy creating amazing projects with ease.

