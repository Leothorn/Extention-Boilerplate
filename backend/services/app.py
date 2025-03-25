from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configure Gemini
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
if not GOOGLE_API_KEY:
    raise ValueError("No API key found. Please set GOOGLE_API_KEY in .env file")

genai.configure(api_key=GOOGLE_API_KEY)

# Initialize the model - using Gemini Flash 2.0
model = genai.GenerativeModel('models/gemini-2.0-flash')

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        message = data.get('message', '')
        system_prompt = data.get('system_prompt', 'You are a helpful AI assistant.')
        
        # Combine system prompt and user message
        full_prompt = f"{system_prompt}\n\nUser: {message}\nAssistant:"
        
        # Generate response using Gemini with Flash-specific configurations
        response = model.generate_content(
            full_prompt,
            generation_config={
                'temperature': 0.7,
                'top_p': 0.8,
                'top_k': 40,
                'candidate_count': 1,
                'max_output_tokens': 2048
            }
        )
        
        return jsonify({
            'success': True,
            'response': response.text
        })
    except Exception as e:
        print(f"Error: {str(e)}")  # Add logging for debugging
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    print(f"Available models: {[m.name for m in genai.list_models()]}")
    app.run(debug=True) 