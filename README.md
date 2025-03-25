# Gemini Assistant Chrome Extension

A Chrome extension that integrates with Google's Gemini Flash 2.0 AI model, providing a chat interface with persistent history.

## Features

- Chat interface with Gemini Flash 2.0 AI
- Persistent chat history using Chrome's storage
- Customizable system prompt
- Modern, responsive UI
- Easy setup process

## Prerequisites

- Python 3.8 or higher
- Google Chrome browser
- Gemini API key (get it from [Google AI Studio](https://makersuite.google.com/app/apikey))

## Quick Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/extension_boilerplate.git
   cd extension_boilerplate
   ```

2. Run the setup script:
   ```bash
   python setup.py
   ```
   This will:
   - Install required Python packages
   - Create the .env file for your API key
   - Generate extension icons

3. Start the backend server:
   ```bash
   cd backend
   python services/app.py
   ```

4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `extension` folder from this project

## Manual Setup (if needed)

If you prefer to set up manually:

1. Install Python requirements:
   ```bash
   pip install -r backend/requirements.txt
   ```

2. Create a `.env` file in the `backend` directory:
   ```
   GOOGLE_API_KEY=your_gemini_api_key_here
   ```

3. Generate extension icons:
   ```bash
   python generate_icons.py
   ```

4. Start the backend server:
   ```bash
   cd backend
   python services/app.py
   ```

5. Load the extension in Chrome as described above.

## Usage

1. Click the extension icon in Chrome to open the popup
2. (Optional) Modify the system prompt in the top text area
3. Type your message in the input field
4. Click "Send to Gemini" to get a response
5. Your chat history will be saved automatically
6. Use the "Clear History" button to reset the chat

## Project Structure

```
extension_boilerplate/
├── extension/              # Chrome extension files
│   ├── popup/             # Extension popup UI
│   ├── background/        # Background scripts
│   ├── content/          # Content scripts
│   └── icons/            # Extension icons
├── backend/              # Python backend
│   └── services/        # Flask server
├── setup.py             # Setup script
├── generate_icons.py    # Icon generation script
└── README.md           # This file
```

## Contributing

Feel free to submit issues and enhancement requests!

## License

This project is licensed under the MIT License - see the LICENSE file for details. 