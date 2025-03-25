from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
import os
from dotenv import load_dotenv
import pandas as pd
import PyPDF2
import io
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from pathlib import Path
from pydantic import BaseModel

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
    model = genai.GenerativeModel('gemini-2.0-flash')  # Using Gemini Flash 2.0 specifically
    # Test the API key with a simple request
    model.generate_content("Test connection")
except Exception as e:
    raise ValueError(f"Failed to configure Gemini API: {str(e)}. Please check your API key and try again.")

# Constants
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {'.pdf', '.csv'}

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

async def process_pdf(file_content: bytes) -> str:
    """Process PDF file and extract text asynchronously"""
    def _process():
        try:
            pdf_file = io.BytesIO(file_content)
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
            return text
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Error processing PDF: {str(e)}"
            )

    # Run CPU-bound PDF processing in thread pool
    return await asyncio.get_event_loop().run_in_executor(thread_pool, _process)

async def process_csv(file_content: bytes) -> str:
    """Process CSV file and convert to text representation asynchronously"""
    def _process():
        try:
            df = pd.read_csv(io.BytesIO(file_content))
            return df.to_string()
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Error processing CSV: {str(e)}"
            )

    # Run CPU-bound CSV processing in thread pool
    return await asyncio.get_event_loop().run_in_executor(thread_pool, _process)

async def analyze_with_gemini(text_content: str, file_name: str) -> str:
    """Analyze content with Gemini Flash 2.0 API asynchronously"""
    prompt = f"""Please analyze the following content from {file_name} and provide a detailed summary:

{text_content[:8000]}  # Limit content length for API

Please provide:
1. A brief overview
2. Key points or findings
3. Any notable patterns or insights
4. Recommendations if applicable"""

    # Run Gemini API call in thread pool since it's not async
    def _generate():
        try:
            response = model.generate_content(prompt)
            return response.text
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
        
        # Process file based on type
        file_extension = os.path.splitext(file.filename)[1].lower()
        if file_extension == '.pdf':
            text_content = await process_pdf(file_content)
        elif file_extension == '.csv':
            text_content = await process_csv(file_content)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")

        # Analyze with Gemini Flash 2.0
        analysis = await analyze_with_gemini(text_content, file.filename)

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
    uvicorn.run(app, host="0.0.0.0", port=5000) 