from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
import os
from dotenv import load_dotenv
import pandas as pd
import io
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Dict, List
from pathlib import Path
from pydantic import BaseModel
import base64
import tempfile

# Get the absolute path to the .env file
ENV_PATH = Path(__file__).parent.parent / '.env'

# Load environment variables
if not ENV_PATH.exists():
    raise ValueError(f"Environment file not found at {ENV_PATH}. Please create a .env file with your GOOGLE_API_KEY.")

load_dotenv(ENV_PATH)

# Validate required environment variables
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
if not GOOGLE_API_KEY:
    raise ValueError(f"GOOGLE_API_KEY not found in {ENV_PATH}. Please add your Gemini API key to the .env file.")
elif GOOGLE_API_KEY == 'your_gemini_api_key_here':
    raise ValueError("Please replace the placeholder API key in the .env file with your actual Gemini API key.")

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini API
try:
    genai.configure(api_key=GOOGLE_API_KEY)
    model = genai.GenerativeModel('gemini-2.0-flash')
    # Test the API key with a simple request
    model.generate_content("Test connection")
except Exception as e:
    raise ValueError(f"Failed to configure Gemini API: {str(e)}. Please check your API key and try again.")

# Constants
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {'.pdf', '.csv', '.jpg', '.jpeg', '.png', '.gif'}

# Create a thread pool for CPU-bound tasks
thread_pool = ThreadPoolExecutor(max_workers=4)

# Pydantic models for request/response
class ChatRequest(BaseModel):
    message: str
    system_prompt: Optional[str] = None

class ChatResponse(BaseModel):
    success: bool
    response: str
    error: Optional[str] = None

def validate_file(file: UploadFile) -> None:
    """Validate file type and size"""
    # Check file size
    if file.size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds maximum limit of {MAX_FILE_SIZE/1024/1024}MB"
        )
    
    # Check file extension
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )

async def analyze_with_gemini(file_content: bytes, file_name: str) -> str:
    """Analyze file content with Gemini Flash 2.0 API asynchronously"""
    def _generate():
        try:
            # Create a temporary file to store the uploaded content
            with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file_name).suffix) as temp_file:
                temp_file.write(file_content)
                temp_file_path = temp_file.name

            try:
                # Create a prompt for analysis
                prompt = f"""Please analyze this file '{file_name}' and provide a detailed summary:

Please provide:
1. A brief overview
2. Key points or findings
3. Any notable patterns or insights
4. Recommendations if applicable"""

                # For images, use the vision model
                if file_name.lower().endswith(('.jpg', '.jpeg', '.png', '.gif')):
                    with open(temp_file_path, 'rb') as f:
                        image_data = f.read()
                    response = model.generate_content([prompt, image_data])
                else:
                    # For text-based files (PDF, CSV)
                    with open(temp_file_path, 'rb') as f:  # Changed to 'rb' for binary reading
                        binary_content = f.read()  # Changed variable name to avoid conflict
                    response = model.generate_content([
                        {"text": prompt},
                        {"inlineData": {
                            "mimeType": "application/pdf" if file_name.lower().endswith('.pdf') else "text/plain",
                            "data": base64.b64encode(binary_content).decode('utf-8')
                        }}
                    ])
                
                # Return all available response properties
                return {
                    'text': response.text if hasattr(response, 'text') else None,
                    'prompt_feedback': response.prompt_feedback if hasattr(response, 'prompt_feedback') else None,
                    'candidates': [str(c) for c in response.candidates] if hasattr(response, 'candidates') else None,
                    'raw_response': str(response)
                }
            finally:
                # Clean up the temporary file
                os.unlink(temp_file_path)
                
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Error analyzing content with Gemini Flash 2.0: {str(e)}"
            )

    return await asyncio.get_event_loop().run_in_executor(thread_pool, _generate)

@app.post("/process_file")
async def process_file(file: UploadFile = File(...)):
    try:
        # Validate file
        validate_file(file)
        
        # Read file content
        file_content = await file.read()
        
        # Analyze with Gemini Flash 2.0
        analysis = await analyze_with_gemini(file_content, file.filename)

        return {
            'success': True,
            'fileName': file.filename,
            'analysis': analysis
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error processing file: {str(e)}"
        )

@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        # Prepare the prompt
        prompt = request.system_prompt if request.system_prompt else "You are a helpful AI assistant. Please provide clear and concise responses."
        full_prompt = f"{prompt}\n\nUser: {request.message}\nAssistant:"

        # Run Gemini API call in thread pool since it's not async
        def _generate():
            try:
                response = model.generate_content(full_prompt)
                return response.text
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Error generating response with Gemini Flash 2.0: {str(e)}"
                )

        response_text = await asyncio.get_event_loop().run_in_executor(thread_pool, _generate)
        
        return ChatResponse(
            success=True,
            response=response_text
        )

    except HTTPException as he:
        return ChatResponse(
            success=False,
            response="",
            error=str(he.detail)
        )
    except Exception as e:
        return ChatResponse(
            success=False,
            response="",
            error=f"Unexpected error: {str(e)}"
        )

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup thread pool on shutdown"""
    thread_pool.shutdown(wait=True)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001) 