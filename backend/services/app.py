from fastapi import FastAPI, UploadFile, File, HTTPException, Form
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
import logging
import sys
import uuid
from io import BytesIO
import json
import pdb
import traceback

# Configure logging with more detailed format
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

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
    allow_origins=["chrome-extension://*", "http://localhost:5001"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600
)

# Add request logging middleware
@app.middleware("http")
async def log_requests(request, call_next):
    """Log all incoming requests and responses"""
    logger.info(f"=== INCOMING REQUEST ===")
    logger.info(f"Method: {request.method}")
    logger.info(f"URL: {request.url}")
    logger.info(f"Headers: {dict(request.headers)}")
    logger.info(f"Client Host: {request.client.host if request.client else 'Unknown'}")
    
    response = await call_next(request)
    
    logger.info(f"=== RESPONSE ===")
    logger.info(f"Status: {response.status_code}")
    logger.info(f"Headers: {dict(response.headers)}")
    
    return response

# Configure Gemini API
try:
    logger.info("""
=== GEMINI API CONFIGURATION ===
API Key: {} (first 8 chars)
Model: gemini-2.0-flash
Base URL: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
""".format(GOOGLE_API_KEY[:8] + '...'))
    
    genai.configure(api_key=GOOGLE_API_KEY)
    # Initialize the model
    model = genai.GenerativeModel('gemini-2.0-flash')
    # Test the API key with a simple request
    logger.info("Testing Gemini API connection...")
    response = model.generate_content("Test connection")
    logger.info(f"Gemini API test response: {response.text}")
    logger.info("Successfully configured Gemini API")
except Exception as e:
    logger.error(f"""
=== GEMINI API CONFIGURATION ERROR ===
Error Type: {type(e).__name__}
Error Message: {str(e)}
Stack Trace: {traceback.format_exc()}
""")
    raise ValueError(f"Failed to configure Gemini API: {str(e)}. Please check your API key and try again.")

# Constants
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {'.pdf', '.csv', '.jpg', '.jpeg', '.png', '.gif', '.txt', '.mp3', '.mp4'}

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
                # Determine mime type based on file extension
                extension = Path(file_name).suffix.lower()
                mime_type = {
                    '.pdf': 'application/pdf',
                    '.txt': 'text/plain',
                    '.csv': 'text/csv',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.png': 'image/png',
                    '.gif': 'image/gif',
                    '.mp3': 'audio/mpeg',
                    '.mp4': 'video/mp4'
                }.get(extension, 'application/octet-stream')

                # Create a prompt for analysis
                prompt = f"""Please analyze this file '{file_name}' and provide a detailed summary:

Please provide:
1. A brief overview
2. Key points or findings
3. Any notable patterns or insights
4. Recommendations if applicable"""

                # For images and PDFs, read the file and pass directly
                with open(temp_file_path, 'rb') as f:
                    file_data = f.read()

                # Generate content using the file data
                response = model.generate_content([
                    prompt,
                    {"mime_type": mime_type, "data": base64.b64encode(file_data).decode()}
                ])
                
                # Extract response properties safely
                response_dict = {}
                
                # Get text content
                try:
                    response_dict['text'] = response.text
                except (AttributeError, TypeError):
                    response_dict['text'] = None
                
                # Get prompt feedback if available
                try:
                    response_dict['prompt_feedback'] = str(response.prompt_feedback)
                except (AttributeError, TypeError):
                    response_dict['prompt_feedback'] = None
                
                # Get candidates if available
                try:
                    response_dict['candidates'] = [str(c) for c in response.candidates]
                except (AttributeError, TypeError):
                    response_dict['candidates'] = None
                
                # Add file info
                response_dict['file_info'] = {
                    'name': file_name,
                    'mime_type': mime_type,
                    'size': len(file_data),
                    'state': 'ACTIVE'
                }
                
                return response_dict
                
            finally:
                # Clean up the temporary file
                os.unlink(temp_file_path)
                
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Error analyzing content with Gemini Flash 2.0: {str(e)}"
            )

    return await asyncio.get_event_loop().run_in_executor(thread_pool, _generate)

async def process_single_pdf(file: UploadFile, prompt: str, file_id: str) -> str:
    try:
        # Validate file
        if not file.filename.lower().endswith('.pdf'):
            raise ValueError("File must be a PDF")
        
        # Read file content
        content = await file.read()
        if not content:
            raise ValueError("File is empty")
        
        logger.info(f"""
=== STARTING PDF PROCESSING ===
File: {file.filename}
Size: {len(content)} bytes
Prompt: {prompt}
""")
        
        # Log complete request details
        logger.info("""
=== COMPLETE GEMINI API REQUEST ===
File Details:
- Name: {}
- ID: {}
- Size: {} bytes
- Content Type: {}

Prompt: {}

API Configuration:
- Model: gemini-2.0-flash
- API Key: {} (first 8 chars)
- Base URL: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent

Request Body:
{}
""".format(
            file.filename,
            file_id,
            len(content),
            file.content_type,
            prompt,
            GOOGLE_API_KEY[:8] + '...',
            json.dumps({
                "contents": [
                    prompt,
                    {
                        "mime_type": "application/pdf",
                        "data": base64.b64encode(content).decode()[:100] + '...'  # Show first 100 chars of base64
                    }
                ]
            }, indent=2)
        ))
        
        # Generate content with the custom prompt
        logger.info("Making Gemini API call...")
        try:
            response = model.generate_content(
                contents=[
                    prompt,
                    {"mime_type": "application/pdf", "data": base64.b64encode(content).decode()}
                ]
            )
            logger.info("Gemini API call successful")
        except Exception as api_error:
            logger.error(f"""
=== GEMINI API CALL ERROR ===
Error Type: {type(api_error).__name__}
Error Message: {str(api_error)}
Stack Trace: {traceback.format_exc()}
""")
            raise
        
        # Log complete response details
        logger.info("""
=== COMPLETE GEMINI API RESPONSE ===
File: {}
Response Type: {}
Response Properties:
- Text Length: {}
- First 200 chars: {}
- Has Candidates: {}
- Has Prompt Feedback: {}
- Response Status: {}
""".format(
            file.filename,
            type(response),
            len(response.text) if hasattr(response, 'text') else 'N/A',
            response.text[:200] if hasattr(response, 'text') else 'N/A',
            hasattr(response, 'candidates'),
            hasattr(response, 'prompt_feedback'),
            getattr(response, 'status', 'N/A')
        ))
        
        return {
            "text": response.text,
            "prompt": prompt,
            "status": "completed"
        }
    except Exception as e:
        logger.error("""
=== GEMINI API ERROR ===
File: {}
Error Type: {}
Error Message: {}
Stack Trace:
{}
""".format(
            file.filename,
            type(e).__name__,
            str(e),
            traceback.format_exc()
        ))
        raise ValueError(f"Error processing file {file.filename}: {str(e)}")

@app.options("/process-multiple-pdfs")
async def options_process_multiple_pdfs():
    """Handle preflight requests for process-multiple-pdfs endpoint"""
    logger.info("=== PREFLIGHT REQUEST RECEIVED ===")
    return {
        "status": "ok",
        "message": "Preflight request successful"
    }

@app.post("/process-multiple-pdfs")
async def process_multiple_pdfs(files: List[UploadFile], prompts: str = Form(...)):
    """Process multiple PDF files with custom prompts"""
    try:
        logger.info("""
=== PROCESS MULTIPLE PDFS REQUEST RECEIVED ===
Number of files: {}
File names: {}
Raw prompts string: {}
Headers: {}
""".format(
            len(files),
            [f.filename for f in files],
            prompts,
            dict(request.headers)
        ))
        
        # Parse prompts from JSON string
        prompts_dict = json.loads(prompts)
        logger.info(f"Parsed prompts: {json.dumps(prompts_dict, indent=2)}")
        
        results = []
        errors = []
        
        for file in files:
            try:
                file_id = file.filename
                prompt = prompts_dict.get(file_id, "Give me a summary of this pdf file.")
                logger.info(f"""
=== PROCESSING FILE ===
File ID: {file_id}
Prompt: {prompt}
File Size: {file.size if hasattr(file, 'size') else 'Unknown'}
Content Type: {file.content_type if hasattr(file, 'content_type') else 'Unknown'}
""")
                
                # Read file content first to verify
                content = await file.read()
                logger.info(f"File content read successfully. Size: {len(content)} bytes")
                
                # Reset file pointer for next read
                await file.seek(0)
                
                # Process the file
                result = await process_single_pdf(file, prompt, file_id)
                logger.info(f"""
=== FILE PROCESSING RESULT ===
File: {file_id}
Success: True
Response Length: {len(result.get('text', '')) if result else 'N/A'}
First 200 chars: {result.get('text', '')[:200] if result else 'N/A'}
""")
                
                results.append({
                    "file_id": file_id,
                    "success": True,
                    "summary": result
                })
                logger.info(f"Successfully processed file: {file_id}")
                
            except Exception as e:
                error_msg = str(e)
                logger.error(f"""
=== ERROR PROCESSING FILE ===
File ID: {file_id}
Error Type: {type(e).__name__}
Error Message: {error_msg}
Stack Trace: {traceback.format_exc()}
""")
                errors.append({
                    "file_id": file_id,
                    "error": error_msg
                })
        
        response_data = {
            "success": len(errors) == 0,
            "results": results,
            "errors": errors
        }
        logger.info(f"Sending response: {json.dumps(response_data, indent=2)}")
        return response_data
        
    except Exception as e:
        logger.error(f"""
=== ENDPOINT ERROR ===
Error Type: {type(e).__name__}
Error Message: {str(e)}
Stack Trace: {traceback.format_exc()}
""")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process_file")
async def process_file(file: UploadFile = File(...), prompt: str = Form(None)):
    try:
        # Validate file
        validate_file(file)
        
        # Read file content
        file_content = await file.read()
        
        # Use provided prompt or default if none provided
        custom_prompt = prompt
        if not custom_prompt:
            # Default prompt based on file type
            extension = Path(file.filename).suffix.lower()
            if extension in ['.pdf', '.docx', '.doc', '.txt']:
                custom_prompt = f"""Please analyze this file '{file.filename}' and provide a detailed summary:

Please provide:
1. A brief overview
2. Key points or findings
3. Any notable patterns or insights
4. Recommendations if applicable"""
            elif extension in ['.csv', '.xlsx', '.xls']:
                custom_prompt = f"""Analyze this data file '{file.filename}' and provide key insights:
                
1. Data structure overview
2. Key statistics and trends
3. Notable patterns or anomalies
4. Potential actionable insights"""
            elif extension in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
                custom_prompt = f"""Describe in detail what you see in this image '{file.filename}':
                
1. Main subjects or elements
2. Visual characteristics
3. Context or setting
4. Any notable details or unique features"""
            else:
                custom_prompt = f"Please analyze this file '{file.filename}' and provide a comprehensive summary."
        
        # Log the prompt being used
        logger.info(f"""
=== PROCESSING FILE WITH PROMPT ===
File: {file.filename}
Prompt: {custom_prompt}
""")
        
        # Analyze with Gemini Flash 2.0 using the custom prompt
        analysis = await analyze_with_gemini_custom_prompt(file_content, file.filename, custom_prompt)

        return {
            'success': True,
            'fileName': file.filename,
            'analysis': analysis
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error processing file: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error processing file: {str(e)}"
        )

async def analyze_with_gemini_custom_prompt(file_content: bytes, file_name: str, prompt: str) -> str:
    """Analyze file content with Gemini Flash 2.0 API asynchronously using a custom prompt"""
    def _generate():
        try:
            # Create a temporary file to store the uploaded content
            with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file_name).suffix) as temp_file:
                temp_file.write(file_content)
                temp_file_path = temp_file.name

            try:
                # Determine mime type based on file extension
                extension = Path(file_name).suffix.lower()
                mime_type = {
                    '.pdf': 'application/pdf',
                    '.txt': 'text/plain',
                    '.csv': 'text/csv',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.png': 'image/png',
                    '.gif': 'image/gif',
                    '.mp3': 'audio/mpeg',
                    '.mp4': 'video/mp4'
                }.get(extension, 'application/octet-stream')

                # For images and PDFs, read the file and pass directly
                with open(temp_file_path, 'rb') as f:
                    file_data = f.read()

                # Generate content using the file data and custom prompt
                response = model.generate_content([
                    prompt,
                    {"mime_type": mime_type, "data": base64.b64encode(file_data).decode()}
                ])
                
                # Extract response properties safely
                response_dict = {}
                
                # Get text content
                try:
                    response_dict['text'] = response.text
                except (AttributeError, TypeError):
                    response_dict['text'] = None
                
                # Get prompt feedback if available
                try:
                    response_dict['prompt_feedback'] = str(response.prompt_feedback)
                except (AttributeError, TypeError):
                    response_dict['prompt_feedback'] = None
                
                # Get candidates if available
                try:
                    response_dict['candidates'] = [str(c) for c in response.candidates]
                except (AttributeError, TypeError):
                    response_dict['candidates'] = None
                
                # Add file info
                response_dict['file_info'] = {
                    'name': file_name,
                    'mime_type': mime_type,
                    'size': len(file_data),
                    'state': 'ACTIVE'
                }
                
                # Add the prompt that was used
                response_dict['prompt'] = prompt
                
                return response_dict
                
            finally:
                # Clean up the temporary file
                os.unlink(temp_file_path)
                
        except Exception as e:
            logger.error(f"Error in analyze_with_gemini_custom_prompt: {str(e)}\n{traceback.format_exc()}")
            raise HTTPException(
                status_code=500,
                detail=f"Error analyzing content with Gemini Flash 2.0: {str(e)}"
            )

    return await asyncio.get_event_loop().run_in_executor(thread_pool, _generate)

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

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test Gemini API connection
        response = model.generate_content("Test connection")
        return {
            "status": "healthy",
            "gemini_api": "connected",
            "timestamp": pd.Timestamp.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail=f"Service unhealthy: {str(e)}"
        )

@app.get("/test-connection")
async def test_connection():
    """Test endpoint to verify connection from extension"""
    print("\n=== TEST CONNECTION REQUEST RECEIVED ===", flush=True)
    logger.info("=== TEST CONNECTION REQUEST RECEIVED ===")
    return {"status": "connected", "message": "Backend is reachable"}

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001) 