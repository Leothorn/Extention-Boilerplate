import os
import pytest
import google.generativeai as genai
from pathlib import Path

def test_files_create_pdf():
    # Configure Gemini API
    api_key = os.getenv('GOOGLE_API_KEY')
    if not api_key:
        pytest.skip("GOOGLE_API_KEY not found in environment variables")
    
    genai.configure(api_key=api_key)
    
    # Use existing PDF file
    test_pdf_path = Path("C:/Users/ashwi/OneDrive/Desktop/NwSTbNri3Q.pdf")
    if not test_pdf_path.exists():
        pytest.skip(f"Test PDF file not found at {test_pdf_path}")
    
    try:
        # Initialize model
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        # Read the PDF file
        with open(test_pdf_path, 'rb') as f:
            pdf_data = f.read()
        
        print("\nProcessing PDF file:", test_pdf_path)
        print("PDF size:", len(pdf_data), "bytes")
        
        # Generate content
        response = model.generate_content([
            "Give me a summary of this pdf file.",
            {"mime_type": "application/pdf", "data": pdf_data}
        ])
        
        print("\nResponse from Gemini API:")
        print("=" * 50)
        print(response.text)
        print("=" * 50)
        
        # Print any additional response metadata if available
        if hasattr(response, 'prompt_feedback'):
            print("\nPrompt Feedback:", response.prompt_feedback)
        
        assert response.text is not None
        
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        raise

if __name__ == "__main__":
    test_files_create_pdf() 