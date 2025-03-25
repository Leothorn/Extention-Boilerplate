from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
import os
from dotenv import load_dotenv
import pandas as pd
import PyPDF2
import io

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configure Gemini API
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel('gemini-pro')

def process_pdf(file_content):
    """Process PDF file and extract text"""
    pdf_file = io.BytesIO(file_content)
    pdf_reader = PyPDF2.PdfReader(pdf_file)
    text = ""
    for page in pdf_reader.pages:
        text += page.extract_text() + "\n"
    return text

def process_csv(file_content):
    """Process CSV file and convert to text representation"""
    df = pd.read_csv(io.BytesIO(file_content))
    return df.to_string()

@app.route('/process_file', methods=['POST'])
def process_file():
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['file']
        file_name = file.filename
        file_content = file.read()

        # Process file based on type
        if file_name.lower().endswith('.pdf'):
            text_content = process_pdf(file_content)
        elif file_name.lower().endswith('.csv'):
            text_content = process_csv(file_content)
        else:
            return jsonify({'success': False, 'error': 'Unsupported file type'}), 400

        # Generate prompt for Gemini
        prompt = f"""Please analyze the following content from {file_name} and provide a detailed summary:

{text_content[:8000]}  # Limit content length for API

Please provide:
1. A brief overview
2. Key points or findings
3. Any notable patterns or insights
4. Recommendations if applicable"""

        # Get response from Gemini
        response = model.generate_content(prompt)
        analysis = response.text

        return jsonify({
            'success': True,
            'fileName': file_name,
            'analysis': analysis
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True) 